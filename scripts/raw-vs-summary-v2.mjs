#!/usr/bin/env node
// EVIDENCE: both same comparison as the pre-registered version, with the approach cap removed;
// the summary arm is the control it is measured against.
// ACCESS: spent-ok development estimate on already-spent data; its numbers size the real test
// and are not reportable. Should have used the open split. See datasets/access.json.
// Raw approach traces against the summarised features, second attempt.
//
// WHY THERE IS A SECOND ONE. scripts/raw-vs-summary.mjs is left exactly as it was pre-registered
// and as it ran. Its raw condition capped each session at three approaches, and measurement
// afterwards showed that cap discarded 217 of the 271 approaches in the detour sessions: 17 of 18
// have more than three. What gives a detour bot away is precisely that many wandering paths all
// terminate on ore, so the first run threw away four fifths of the evidence it was testing. Its
// null result is therefore weak evidence about representation and strong evidence about the cap.
//
// This version sends every approach, spending a fixed total point budget across them rather than
// a fixed number of points each.
//
// WHAT THIS RUN IS. Development, not a result. It reuses the same 42 sessions the first run used,
// so its numbers cannot test anything; they exist to estimate the effect size with the cap fixed,
// which is what decides how many fresh sessions the real test needs. Reporting this run's AUC as
// a finding would repeat the mistake documented in docs/evasion.md.
//
// usage: node scripts/raw-vs-summary-v2.mjs --raw <plugin data dir> [--point-budget 300]

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
// Imported by path: scripts/ is not a workspace package, so bare specifiers do not resolve here.
import { createTypeSafeBackend } from "../packages/jev-evaluator/src/typesafe-backend.ts";

// The SDK helper is a plain object literal; inlined to avoid another unresolvable specifier.
const noul = (instructions, criteria) => ({ type: "noul", instructions, criteria });

const { values } = parseArgs({
  options: {
    raw: { type: "string" },
    "limit-legit": { type: "string", default: "24" },
    "point-budget": { type: "string", default: "160" },
    out: { type: "string", default: "reports/raw-vs-summary-v2.json" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!values.raw) {
  console.error("usage: node scripts/raw-vs-summary-v2.mjs --raw <plugin data dir>");
  process.exit(1);
}
const POINT_BUDGET = Number(values["point-budget"]);
const APPROACH_WINDOW_MS = 60_000;

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

/* ---------------------------------------------------------------- sessions */

const labels = new Map(
  [...rows("datasets/labels/all2.jsonl"), ...rows("datasets/labels/confirm.jsonl")]
    .filter((l) => l.label !== "unknown")
    .map((l) => [l.sessionId, l]),
);
const features = [
  ...rows("datasets/features/all2.jsonl"),
  ...rows("datasets/features/confirm.jsonl"),
].filter((f) => labels.has(f.sessionId) && f.hiddenOreApproach.sampleCount > 0);

const detour = features.filter((f) => labels.get(f.sessionId).subtype === "detour_xray");
// Deterministic pick so a rerun asks about the same sessions.
const legit = features
  .filter((f) => labels.get(f.sessionId).label === "legit")
  .sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1))
  .slice(0, Number(values["limit-legit"]));
const selected = [
  ...detour.map((f) => ({ f, positive: true })),
  ...legit.map((f) => ({ f, positive: false })),
];

/* ------------------------------------------------------------ raw traces */

// Only the windows the feature extractor already summarises: the 60 s before each reveal.
const wanted = new Set(selected.map((s) => s.f.sessionId.split(":")[0]));
const events = new Map();
for (const name of fs.readdirSync(values.raw)) {
  if (!name.endsWith(".jsonl")) continue;
  for (const line of fs.readFileSync(path.join(values.raw, name), "utf8").split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line);
    if (!wanted.has(e.sessionId)) continue;
    if (!events.has(e.sessionId)) events.set(e.sessionId, []);
    events.get(e.sessionId).push(e);
  }
}

const r1 = (v) => Math.round(v * 10) / 10;
const buildTrace = (sessionId) => {
  const all = (events.get(sessionId.split(":")[0]) ?? []).sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal");
  const samples = all.filter((e) => e.eventType === "movement_sample");
  const breaks = all.filter((e) => e.eventType === "block_break");
  return reveals.map((rev, i) => {
    const t1 = Date.parse(rev.occurredAt);
    const t0 = t1 - APPROACH_WINDOW_MS;
    const ore = rev.position;
    const inWindow = samples.filter((s) => {
      const t = Date.parse(s.occurredAt);
      return t >= t0 && t <= t1;
    });
    // Every approach is sent; the budget is shared between them, floored so a path stays a
    // path and capped so a session with two approaches does not become enormous.
    const perApproach = Math.min(
      24,
      Math.max(4, Math.floor(POINT_BUDGET / Math.max(1, reveals.length))),
    );
    const step = Math.max(1, Math.ceil(inWindow.length / perApproach));
    const pathPoints = inWindow
      .filter((_, k) => k % step === 0)
      .map((s) => ({
        t: Math.round((Date.parse(s.occurredAt) - t1) / 1000),
        dx: r1(s.position.x - ore.x),
        dy: r1(s.position.y - ore.y),
        dz: r1(s.position.z - ore.z),
        yaw: Math.round(s.rotation?.yaw ?? 0),
        pitch: Math.round(s.rotation?.pitch ?? 0),
      }));
    const inBreaks = breaks.filter((b) => {
      const t = Date.parse(b.occurredAt);
      return t >= t0 && t <= t1;
    });
    // Strided like the path. An unbounded break list is what exceeded the model's context on a
    // session with 28 approaches.
    const bStep = Math.max(1, Math.ceil(inBreaks.length / 6));
    const brk = inBreaks
      .filter((_, k) => k % bStep === 0)
      .map((b) => ({
        t: Math.round((Date.parse(b.occurredAt) - t1) / 1000),
        dx: r1(b.position.x - ore.x),
        dy: r1(b.position.y - ore.y),
        dz: r1(b.position.z - ore.z),
      }));
    return { approach: i + 1, oreRevealedAtSecond: 0, path: pathPoints, blockBreaks: brk };
  });
};

/* ------------------------------------------------------------- questions */

const SHARED_TASK =
  "A Minecraft player mined underground. Decide whether their movement before hidden ores became visible looked like deliberate approaches toward ores they already knew the position of, rather than ordinary tunnelling that happened to run into them.";

const summaryQuestion = {
  approach_targeting: noul(
    "Looking only at hiddenOreApproach (meanDirectness, medianDetourRatio, aimAlignmentBeforeRevealRatio, turnsTowardHiddenOre, directionChangesNearOre, sampleCount): did the miner's movement before hidden ores were exposed look like deliberate approaches toward those ores rather than ordinary tunnelling that happened to meet them?",
    {
      true: "Approaches are close to straight lines to the ore (directness near 1, detour ratio near 1), the view was often already on the ore before it was exposed, and there were several such approaches.",
      false:
        "Approaches look like the tunnel itself: low directness or high detour ratio, little aim alignment, few or no approaches, or reveals that simply lie along an existing straight tunnel.",
    },
  ),
};

const rawQuestion = {
  approach_targeting: noul(
    "Each approach gives the player's position and view over the 60 seconds before a hidden ore became visible, as offsets from that ore in blocks, with the blocks they broke. Second 0 is the moment the ore was exposed. Did this movement look like deliberate approaches toward ores the player already knew the position of, rather than ordinary tunnelling that happened to meet them?",
    {
      true: "The path ends on the ore whatever route it takes, the view settles on the ore before it is exposed, digging turns toward it, and this repeats across approaches.",
      false:
        "The path would have gone where it went regardless of the ore, the ore lies along a tunnel already being dug, the view does not anticipate it, or the endings look incidental.",
    },
  ),
};

/* ------------------------------------------------------------------ run */

const traces = new Map();
for (const s of selected) traces.set(s.f.sessionId, buildTrace(s.f.sessionId));
const usable = selected.filter((s) => (traces.get(s.f.sessionId) ?? []).length > 0);
console.log(
  `${usable.length} sessions with a usable raw trace: ${usable.filter((s) => s.positive).length} detour, ${usable.filter((s) => !s.positive).length} legitimate`,
);
if (values["dry-run"]) {
  const sample = usable[0];
  console.log(`\nexample state for ${sample.positive ? "a detour" : "a legitimate"} session:`);
  console.log(JSON.stringify(traces.get(sample.f.sessionId)[0], null, 1).slice(0, 1200));
  process.exit(0);
}

const backend = createTypeSafeBackend({ apiKey: process.env.TYPESAFE_API_KEY });
const ask = async (questions, state) => {
  const res = await backend.systemOne({ state, questions, model: "jev-latest" });
  return { value: res.answers.approach_targeting.noul, tokens: res.usage?.inputTokens ?? null };
};

const results = [];
for (const [i, s] of usable.entries()) {
  const { hiddenOreApproach } = s.f;
  const summary = await ask(summaryQuestion, {
    task: SHARED_TASK,
    features: { hiddenOreApproach },
  });
  const raw = await ask(rawQuestion, {
    task: SHARED_TASK,
    approaches: traces.get(s.f.sessionId),
  });
  results.push({
    sessionId: s.f.sessionId,
    positive: s.positive,
    summary: summary.value,
    raw: raw.value,
    summaryTokens: summary.tokens,
    rawTokens: raw.tokens,
  });
  process.stdout.write(
    `\r  asked ${i + 1}/${usable.length}  (summary ${summary.value}, raw ${raw.value})        `,
  );
}
console.log();

// Mann-Whitney AUC with ties, the same estimator the benchmark uses.
const auc = (key) => {
  const pos = results.filter((r) => r.positive).map((r) => r[key]);
  const neg = results.filter((r) => !r.positive).map((r) => r[key]);
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
};
const span = (key, positive) => {
  const v = results.filter((r) => r.positive === positive).map((r) => r[key]);
  return `${Math.min(...v).toFixed(2)}-${Math.max(...v).toFixed(2)}`;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const summaryAuc = auc("summary");
const rawAuc = auc("raw");
console.log(`\n            AUC    detour range   legit range`);
console.log(
  `  summary   ${summaryAuc.toFixed(3)}  ${span("summary", true).padEnd(13)}  ${span("summary", false)}`,
);
console.log(
  `  raw       ${rawAuc.toFixed(3)}  ${span("raw", true).padEnd(13)}  ${span("raw", false)}`,
);
const delta = rawAuc - summaryAuc;
console.log(
  `\n  raw - summary = ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}  ->  ` +
    (delta >= 0.1
      ? "the summary is discarding usable signal"
      : delta <= -0.1
        ? "the summary helps the model"
        : "no improvement from raw traces"),
);
console.log(
  `  mean input tokens: summary ${Math.round(mean(results.map((r) => r.summaryTokens ?? 0)))}, raw ${Math.round(mean(results.map((r) => r.rawTokens ?? 0)))}`,
);

fs.mkdirSync(path.dirname(values.out), { recursive: true });
fs.writeFileSync(
  values.out,
  `${JSON.stringify({ summaryAuc, rawAuc, delta, results }, null, 2)}\n`,
);
console.log(`\n  wrote ${values.out}`);
