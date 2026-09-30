#!/usr/bin/env node
// EVIDENCE: raw approach traces built from plugin telemetry, as decision D1 defines raw.
// ACCESS: spend Do the questions frozen after round 8 rank X-Ray sessions above both branch mining and cave mining on sessions that shaped nothing?
//
// The second frozen measurement. The first (scripts/confirm-frozen.mjs) held on bot sessions and
// failed on a person, whose cave mining was scored as X-Ray. Rounds 7 and 8 tuned, on bot cave
// sessions in the open pool, wording that says what a cave looks like and a trace that carries
// the recorded open-face count of each break. This file freezes that and measures it once on
// sessions recorded afterwards. It was committed before any of them was read.
//
// Registered in advance
//
//   Scored sessions   labelled sessions with at least one hidden-ore reveal.
//   Primary           configuration D, the judge's answer: AUC with a 95% bootstrap interval,
//                     and AUC of every cheat against cave mining alone.
//   Secondary         configuration A, the previous leader, for the comparison.
//                     Configuration C, the plain single question.
//                     AUC per evasion style and per kind of legitimate play.
//   Control           the number of approaches shown, with no model involved; paired bootstrap
//                     of D minus the control.
//   Supported if      D reaches AUC 0.90, cave mining alone reaches 0.85 under D, every style
//                     reaches 0.80 under D, and the interval of D minus the control excludes
//                     zero. Sessions played by a person are reported in the same tables and,
//                     being few, do not enter the conditions.
//
// Each configuration is asked once per session. No threshold is chosen anywhere (decision D2).
//
// usage: node --import tsx scripts/confirm-frozen-v2.mjs --raw <dir>[,<dir>] --labels <file> --name <name>
import fs from "node:fs";
import { parseArgs } from "node:util";
import {
  aboveEveryLegit,
  auc,
  createAsk,
  loadTelemetry,
  makeTraceBuilder,
  mean,
  noul,
  perLegit,
  perStyle,
  pool,
  traceNote,
} from "./lib/tuning.mjs";

const { values } = parseArgs({
  options: {
    raw: { type: "string" },
    labels: { type: "string" },
    name: { type: "string" },
    concurrency: { type: "string", default: "8" },
  },
});

/* ------------------------------------------------------------------ frozen */
const TASK =
  "A Minecraft player mined underground. Decide whether their movement before hidden ores became visible looked like deliberate approaches toward ores whose position they already knew, rather than ordinary tunnelling that happened to meet them.";
const EVASION =
  "Two things are not evidence of innocence. A cheat can dig ordinary tunnel between targets until its ore-per-block rate looks unremarkable, and a cheat can wander on the way to ore it already knows about so its paths are not straight. Both are produced on purpose. Judge on whether the movement and the view anticipate the ore.";
const DETOUR =
  "A wandering route says nothing either way. What matters is how the approach ends: whether the last part of the path and the view turn onto the position of the ore while it is still buried.";
const CAVE =
  "A player in a cave walks toward ore they can see in the wall and then digs into the wall around it, which exposes ore that was hidden behind. Their position and view converge on that hidden ore before it appears, but they were following ore they could see. That is ordinary play. Anticipation means converging on ore that was buried in solid rock with nothing visible to lead there.";
const ASK_ANTICIPATES = "Does the movement anticipate the ore?";
const YES_ANTICIPATES = "Position and view converge on the ore before it could have been seen.";
const NO_ANTICIPATES =
  "Nothing anticipates it. The player was going where they were going and the ore happened to be there.";
const JUDGE = {
  text: "Each approach in this session was judged separately for whether it anticipated the ore; the values are in approachesJudgedOneAtATime, from 0 for no anticipation to 1 for clear anticipation. A single approach that meets ore proves nothing. Taken together, do they show a player who knew where the ore was?",
  yes: "Anticipation recurs across the approaches rather than appearing once.",
  no: "Anticipation is absent, or appears once among approaches that show none.",
};
const PLAIN = {
  text: "Did this movement look like deliberate approaches toward ore whose position the player already knew, rather than ordinary tunnelling that happened to meet it?",
  yes: "The path goes to the ore and the view settles on it before it is exposed.",
  no: "The path would have gone where it went regardless; the ore lies along it and the view does not anticipate it.",
};

const CONFIGS = {
  // The leader of rounds 7 and 8: the cave paragraph, and open-face counts in the trace.
  D: {
    structure: "per-approach",
    task: `${TASK}\n\n${EVASION}\n\n${DETOUR}\n\n${CAVE}`,
    trace: { points: 8, windowSec: 45, maxApproaches: 12, breaks: 0, context: true },
  },
  // The leader of rounds 5 and 6, measured in confirm-frozen.mjs.
  A: {
    structure: "per-approach",
    task: `${TASK}\n\n${EVASION}\n\n${DETOUR}`,
    trace: { points: 8, windowSec: 45, maxApproaches: 12, breaks: 0 },
  },
  // One call, the plain question, the trace as round 1 started with it.
  C: {
    structure: "single",
    task: TASK,
    trace: { points: 24, windowSec: 60, maxApproaches: 3, breaks: 8 },
  },
};
const CONTROL_CAP = 12;
const BOOTSTRAP = 2000;
const SEED = 20260930;

/* -------------------------------------------------------------------- data */
const labels = fs
  .readFileSync(values.labels, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((l) => l.label !== "unknown");
const build = makeTraceBuilder(loadTelemetry(values.raw.split(",")));
const scored = labels.filter((l) => build(l.sessionId, { maxApproaches: 1 }).length > 0);
const unscored = labels.filter((l) => build(l.sessionId, { maxApproaches: 1 }).length === 0);
const ask = createAsk();

async function run(cfg) {
  const note = traceNote(cfg.trace);
  return pool(scored, Number(values.concurrency), async (l) => {
    const base = { sessionId: l.sessionId, subtype: l.subtype, positive: l.label !== "legit" };
    const approaches = build(l.sessionId, cfg.trace);
    if (cfg.structure === "single") {
      const res = await ask(
        { task: cfg.task, approaches },
        { q: noul(`${note} ${PLAIN.text}`, { true: PLAIN.yes, false: PLAIN.no }) },
      );
      return { ...base, scores: { main: res.answers.q.noul } };
    }
    const oneNote = note.replace(/^Each approach gives/, "This is one approach. It gives");
    const each = [];
    for (const a of approaches) {
      const res = await ask(
        { task: cfg.task, approach: a },
        {
          q: noul(`${oneNote} ${ASK_ANTICIPATES}`, {
            true: YES_ANTICIPATES,
            false: NO_ANTICIPATES,
          }),
        },
      );
      each.push(res.answers.q.noul);
    }
    const judged = await ask(
      {
        task: cfg.task,
        approachesJudgedOneAtATime: each.map((v, i) => ({ approach: i + 1, anticipatesOre: v })),
      },
      { q: noul(JUDGE.text, { true: JUDGE.yes, false: JUDGE.no }) },
    );
    return {
      ...base,
      each,
      scores: { main: judged.answers.q.noul, first3: mean(each.slice(0, 3)) },
    };
  });
}

/* ------------------------------------------------------------------- stats */
// mulberry32: a fixed seed so the intervals are the same on every run of this file.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
};
// Resamples cheats and legitimate sessions separately, so every resample has both.
function bootstrap(rows, stat) {
  const next = rng(SEED);
  const pos = rows.filter((r) => r.positive);
  const neg = rows.filter((r) => !r.positive);
  const draw = (xs) => xs.map(() => xs[Math.floor(next() * xs.length)]);
  const out = [];
  for (let i = 0; i < BOOTSTRAP; i++) out.push(stat([...draw(pos), ...draw(neg)]));
  return [quantile(out, 0.025), quantile(out, 0.975)];
}
const withScore = (rows, key) => rows.map((r) => ({ ...r, score: r.scores[key] }));

/* --------------------------------------------------------------------- run */
const count = (rows) =>
  rows.reduce((o, l) => {
    const k = l.label === "legit" ? "legit" : l.subtype;
    o[k] = (o[k] ?? 0) + 1;
    return o;
  }, {});
console.log(`labelled ${labels.length}, scored ${scored.length}, no reveal ${unscored.length}`);
console.log("scored:", count(scored), "\nno reveal:", count(unscored), "\n");

const results = {};
for (const [name, cfg] of Object.entries(CONFIGS)) {
  const before = ask.calls();
  results[name] = await run(cfg);
  console.log(`configuration ${name}: ${ask.calls() - before} calls`);
}
const control = scored.map((l) => ({
  sessionId: l.sessionId,
  subtype: l.subtype,
  positive: l.label !== "legit",
  scores: { main: build(l.sessionId, { maxApproaches: CONTROL_CAP }).length },
}));

const readings = [
  ["D judge (primary)", withScore(results.D, "main")],
  ["D first three approaches", withScore(results.D, "first3")],
  ["A judge (previous leader)", withScore(results.A, "main")],
  ["A first three approaches", withScore(results.A, "first3")],
  ["C plain single question", withScore(results.C, "main")],
  ["control: count of approaches", withScore(control, "main")],
];
const table = readings.map(([name, rows]) => ({
  name,
  auc: auc(rows),
  interval: bootstrap(rows, auc),
  perStyle: perStyle(rows),
  perLegit: perLegit(rows),
  aboveEveryLegit: aboveEveryLegit(rows),
}));

// A minus the control on the same resampled sessions.
const byId = new Map(control.map((r) => [r.sessionId, r.scores.main]));
const paired = withScore(results.D, "main").map((r) => ({ ...r, control: byId.get(r.sessionId) }));
const diff = (rows) => auc(rows) - auc(rows.map((r) => ({ ...r, score: r.control })));
const difference = { value: diff(paired), interval: bootstrap(paired, diff) };

const primary = table[0];
const styles = Object.values(primary.perStyle);
const verdict = {
  aucAtLeast090: primary.auc >= 0.9,
  caveAtLeast085: (primary.perLegit.cave_mining ?? 0) >= 0.85,
  everyStyleAtLeast080: styles.every((v) => v >= 0.8),
  beatsControl: difference.interval[0] > 0,
};
verdict.supported = Object.values(verdict).every(Boolean);

const f = (v) => v.toFixed(3);
for (const t of table) {
  console.log(
    `${t.name.padEnd(32)} ${f(t.auc)} [${f(t.interval[0])}, ${f(t.interval[1])}]  ${Object.entries(
      t.perStyle,
    )
      .map(([k, v]) => `${k.replace("_xray", "")} ${v.toFixed(2)}`)
      .join("  ")}  ${Object.entries(t.perLegit)
      .map(([k, v]) => `vs ${k.replace("_mining", "")} ${v.toFixed(2)}`)
      .join("  ")}  top ${t.aboveEveryLegit}`,
  );
}
console.log(
  `\nD minus control: ${f(difference.value)} [${f(difference.interval[0])}, ${f(difference.interval[1])}]`,
);
console.log("verdict:", verdict);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
  `reports/${values.name}-frozen.json`,
  `${JSON.stringify(
    {
      at: new Date().toISOString(),
      labels: values.labels,
      labelled: labels.length,
      scored: count(scored),
      noReveal: count(unscored),
      configs: CONFIGS,
      table,
      difference,
      verdict,
      calls: ask.calls(),
      sessions: results,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n${ask.calls()} calls. reports/${values.name}-frozen.json`);
