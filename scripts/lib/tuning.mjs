// EVIDENCE: raw the model is only ever shown approach traces built from plugin telemetry.
// ACCESS: open only. Reads datasets/splits2/dev-*.jsonl and nothing else. See datasets/ACCESS.md.
//
// Shared machinery for searching over questions, trace shapes and call structures on the open
// development split. Everything here exists so that a large number of variants can be tried
// cheaply and recorded honestly: a pool for concurrency, a retrying backend call, a trace
// builder with the knobs worth turning, and threshold-free scoring.
import fs from "node:fs";
import { createTypeSafeBackend } from "../../packages/jev-evaluator/src/typesafe-backend.ts";

export const noul = (instructions, criteria) => ({ type: "noul", instructions, criteria });
export const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });
export const score = (instructions, criteria) => ({ type: "score", instructions, criteria });

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

export function loadDev() {
  const labels = new Map(
    rows("datasets/splits2/dev-labels.jsonl")
      .filter((l) => l.label !== "unknown")
      .map((l) => [l.sessionId, l]),
  );
  const sessions = rows("datasets/splits2/dev-features.jsonl").filter((f) =>
    labels.has(f.sessionId),
  );
  return { sessions, labels };
}

export function loadTelemetry(dirs) {
  const telemetry = new Map();
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      for (const line of fs.readFileSync(`${dir}/${name}`, "utf8").split("\n")) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (!telemetry.has(e.sessionId)) telemetry.set(e.sessionId, []);
        telemetry.get(e.sessionId).push(e);
      }
    }
  }
  for (const list of telemetry.values()) {
    list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  }
  return telemetry;
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Approach traces, straight from the recorded samples. The options select and sample; none of
 * them computes a statistic for the model.
 *
 *   points         movement samples kept per approach, evenly strided
 *   windowSec      how far back from the reveal the approach reaches
 *   maxApproaches  how many reveals are shown, earliest first
 *   frame          "offset" gives positions relative to the ore; "absolute" gives world
 *                  coordinates and states the ore's position once
 *   materials      include what each broken block was
 *   breaks         block breaks kept per approach
 */
export function makeTraceBuilder(telemetry) {
  return (sessionId, opts = {}) => {
    const {
      points = 24,
      windowSec = 60,
      maxApproaches = 3,
      frame = "offset",
      materials = false,
      breaks: breakCount = 8,
      view = true,
      revealMarker = false,
    } = opts;
    const all = telemetry.get(sessionId.split(":")[0]) ?? [];
    const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal").slice(0, maxApproaches);
    const samples = all.filter((e) => e.eventType === "movement_sample");
    const broken = all.filter((e) => e.eventType === "block_break");
    return reveals.map((rev, i) => {
      const t1 = Date.parse(rev.occurredAt);
      const t0 = t1 - windowSec * 1000;
      const ore = rev.position;
      const inWin = (e) => {
        const t = Date.parse(e.occurredAt);
        return t >= t0 && t <= t1;
      };
      const pos = (p) =>
        frame === "absolute"
          ? { x: r1(p.x), y: r1(p.y), z: r1(p.z) }
          : { dx: r1(p.x - ore.x), dy: r1(p.y - ore.y), dz: r1(p.z - ore.z) };
      const win = samples.filter(inWin);
      const step = Math.max(1, Math.ceil(win.length / points));
      const wb = broken.filter(inWin);
      const bStep = Math.max(1, Math.ceil(wb.length / Math.max(1, breakCount)));
      const out = {
        approach: i + 1,
        // The earlier bench carried this field and scored higher with the same wording, so it is
        // kept as a switch to find out whether stating the obvious helps the model anchor on it.
        ...(revealMarker ? { oreRevealedAtSecond: 0 } : {}),
        ...(frame === "absolute" ? { ore: { x: ore.x, y: ore.y, z: ore.z } } : {}),
        path: win
          .filter((_, k) => k % step === 0)
          .map((x) => ({
            t: Math.round((Date.parse(x.occurredAt) - t1) / 1000),
            ...pos(x.position),
            ...(view
              ? {
                  yaw: Math.round(x.rotation?.yaw ?? 0),
                  pitch: Math.round(x.rotation?.pitch ?? 0),
                }
              : {}),
          })),
      };
      if (breakCount > 0) {
        out.blockBreaks = wb
          .filter((_, k) => k % bStep === 0)
          .map((b) => ({
            t: Math.round((Date.parse(b.occurredAt) - t1) / 1000),
            ...pos(b.position),
            ...(materials && b.block?.material ? { block: b.block.material } : {}),
          }));
      }
      return out;
    });
  };
}

/** What the trace is, in words, matched to how it was built. */
export function traceNote(opts = {}) {
  const {
    windowSec = 60,
    frame = "offset",
    materials = false,
    breaks: breakCount = 8,
    view = true,
  } = opts;
  const what = view ? "position and view" : "position";
  const where =
    frame === "absolute"
      ? "in world coordinates, with the ore's own position given once per approach"
      : "as offsets from that ore in blocks";
  const broke =
    breakCount > 0
      ? `, with the blocks they broke${materials ? " and what each block was" : ""}`
      : "";
  return `Each approach gives the player's ${what} over the ${windowSec} seconds before a hidden ore became visible, ${where}${broke}. Second 0 is the moment the ore was exposed.`;
}

/** A backend call that survives rate limits and transient failures. */
export function createAsk() {
  const backend = createTypeSafeBackend({ apiKey: process.env.TYPESAFE_API_KEY });
  let calls = 0;
  const ask = async (state, questions) => {
    let delay = 1000;
    for (let attempt = 0; ; attempt++) {
      try {
        calls++;
        return await backend.systemOne({ state, questions, model: "jev-latest" });
      } catch (e) {
        const status = e?.status ?? 0;
        const retryable = status === 429 || status >= 500 || status === 0;
        if (!retryable || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  };
  ask.calls = () => calls;
  return ask;
}

/** Runs fn over items, n at a time, keeping input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export { aboveEveryLegit, auc, mean, median, perStyle, sd } from "./tuning-score.mjs";
