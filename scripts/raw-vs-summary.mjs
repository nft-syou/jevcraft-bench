#!/usr/bin/env node
// EVIDENCE: both measuring what the summary costs is the entire experiment, so both arms are
// required; the summary arm is the thing being tested, not the evidence being relied on.
// ACCESS: spent-ok exploratory, and it should have used the open development split, which holds
// 14 detour sessions of its own. Recorded as a rule violation in datasets/access.json.
// Does the feature extractor throw away the thing that matters?
//
// Every comparison in this repository has fed the model the same eight numbers a threshold rule
// reads. That guarantees the model cannot win: it is looking at the rule's own summary. This asks
// the same question twice about the same sessions, once from the summary and once from the raw
// approach trace, and reports which one separates the classes.
//
// The target is detour X-Ray on purpose. It is where the summary demonstrably fails: the shipped
// approach answer gives detour 0.12-0.27 and legitimate mining 0.07-0.33, so the distributions
// overlap completely and legitimate play scores higher at the top. A bot that wanders on its way
// to ore it already knows about has a low mean directness, which is exactly what the summary
// reports, and the fact that every wander terminates on ore is what the summary destroys.
//
// PRE-REGISTERED. Committed before either condition was run.
//   Hypothesis: the raw trace separates detour from legitimate better than the summary does.
//   Metric: AUC of the approach answer over detour (positive) vs legitimate (negative).
//   Reading, fixed in advance:
//     raw AUC - summary AUC >= +0.10  -> the summary is discarding usable signal
//     |difference| < 0.10             -> no improvement from raw traces
//     <= -0.10                        -> the summary helps the model
//   Both conditions run in the same session against the same model, so drift cannot explain a gap.
//
// usage: node scripts/raw-vs-summary.mjs --raw <plugin data dir> [--limit-legit 24] [--dry-run]
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
    "max-reveals": { type: "string", default: "3" },
    "trace-points": { type: "string", default: "24" },
    out: { type: "string", default: "reports/raw-vs-summary.json" },
    "dry-run": { type: "boolean", default: false },
  },
});
if (!values.raw) {
  console.error("usage: node scripts/raw-vs-summary.mjs --raw <plugin data dir>");
  process.exit(1);
}
const MAX_REVEALS = Number(values["max-reveals"]);
const TRACE_POINTS = Number(values["trace-points"]);
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
  const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal").slice(0, MAX_REVEALS);
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
    // Even stride, so the shape of the path survives rather than its last few seconds.
    const step = Math.max(1, Math.ceil(inWindow.length / TRACE_POINTS));
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
    const brk = breaks
      .filter((b) => {
        const t = Date.parse(b.occurredAt);
        return t >= t0 && t <= t1;
      })
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
