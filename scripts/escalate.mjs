#!/usr/bin/env node
// EVIDENCE: both the ladder is the experiment: it starts from session totals and hands over more
// only when the model asks, so the summarised stages are stages, not the evidence relied on.
// ACCESS: spent-ok exploratory, and it should have run on the open development split instead.
// The confirmation set was already spent, so these numbers are a reason to design a real test,
// never a result. Recorded as a rule violation in datasets/access.json.
// Ask with little. If the model says it cannot decide, give it more and ask again.
//
// Everything else in this repository hands the model the whole feature object at once and then
// applies a threshold to what comes back. That is why `evidence_sufficiency` is always about 0.94:
// the model was already given everything it was designed to get, so of course it says the evidence
// is enough. The branch never fires because nothing was ever withheld.
//
// Here the state starts small and grows only when the model asks for it, by answering
// `insufficient_evidence`. No threshold is chosen by us anywhere: escalation is the model's own
// categorical answer, and the final verdict is the model's own categorical answer.
//
//   1  session totals only        duration, blocks broken, ore reveals, ore mined
//   2  + rate and rhythm          efficiency, timing, exploration
//   3  + approach summary         hiddenOreApproach, the six numbers a rule would read
//   4  + raw approach traces      position and view before each reveal, from the telemetry
//
// This is exploratory. It is the first run of a design that came out of a conversation, not a
// pre-registered test, and it reuses sessions the project has already looked at many times. Treat
// the numbers as a reason to run a real test or not, never as a result.
//
// usage: node scripts/escalate.mjs --raw <plugin data dir> [--set holdout|confirm] [--max-stage 4]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createTypeSafeBackend } from "../packages/jev-evaluator/src/typesafe-backend.ts";

const { values } = parseArgs({
  options: {
    raw: { type: "string" },
    set: { type: "string", default: "confirm" },
    "max-stage": { type: "string", default: "4" },
    out: { type: "string", default: "reports/escalate.json" },
  },
});
if (!values.raw) {
  console.error("usage: node scripts/escalate.mjs --raw <plugin data dir> [--set holdout|confirm]");
  process.exit(1);
}
const MAX_STAGE = Number(values["max-stage"]);
const noul = (instructions, criteria) => ({ type: "noul", instructions, criteria });
const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const SOURCES = {
  confirm: ["datasets/features/confirm.jsonl", "datasets/labels/confirm.jsonl"],
  holdout: ["datasets/splits2/holdout-features.jsonl", "datasets/splits2/holdout-labels.jsonl"],
};
const [featurePath, labelPath] = SOURCES[values.set] ?? SOURCES.confirm;
const labels = new Map(
  rows(labelPath)
    .filter((l) => l.label !== "unknown")
    .map((l) => [l.sessionId, l]),
);
const features = rows(featurePath).filter((f) => labels.has(f.sessionId));

/* raw traces, built only for the sessions that reach stage 4 */
const APPROACH_WINDOW_MS = 60_000;
const r1 = (v) => Math.round(v * 10) / 10;
const events = new Map();
for (const name of fs.readdirSync(values.raw)) {
  if (!name.endsWith(".jsonl")) continue;
  for (const line of fs.readFileSync(path.join(values.raw, name), "utf8").split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line);
    if (!events.has(e.sessionId)) events.set(e.sessionId, []);
    events.get(e.sessionId).push(e);
  }
}
const buildTrace = (sessionId) => {
  const all = (events.get(sessionId.split(":")[0]) ?? []).sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal").slice(0, 3);
  const samples = all.filter((e) => e.eventType === "movement_sample");
  return reveals.map((rev, i) => {
    const t1 = Date.parse(rev.occurredAt);
    const ore = rev.position;
    const win = samples.filter((s) => {
      const t = Date.parse(s.occurredAt);
      return t >= t1 - APPROACH_WINDOW_MS && t <= t1;
    });
    const step = Math.max(1, Math.ceil(win.length / 20));
    return {
      approach: i + 1,
      path: win
        .filter((_, k) => k % step === 0)
        .map((s) => ({
          t: Math.round((Date.parse(s.occurredAt) - t1) / 1000),
          dx: r1(s.position.x - ore.x),
          dy: r1(s.position.y - ore.y),
          dz: r1(s.position.z - ore.z),
          yaw: Math.round(s.rotation?.yaw ?? 0),
          pitch: Math.round(s.rotation?.pitch ?? 0),
        })),
    };
  });
};

/* the ladder */
const stateForStage = (f, stage) => {
  const s = { session: f.session };
  if (stage >= 2) {
    s.efficiency = f.efficiency;
    s.timing = f.timing;
    s.exploration = f.exploration;
  }
  if (stage >= 3) s.hiddenOreApproach = f.hiddenOreApproach;
  if (stage >= 4) {
    const t = buildTrace(f.sessionId);
    if (t.length > 0) s.approachTraces = t;
  }
  return s;
};
const STAGE_NAME = ["", "totals", "+rates", "+approach summary", "+raw traces"];

const TASK =
  "A Minecraft player mined underground. Decide whether they were using X-Ray, which means acting on the position of ore they could not legitimately see. Judge only from the evidence given. If the evidence in front of you is not enough to tell, answer insufficient_evidence rather than guessing: you will be shown more.";

const questions = {
  behavior_class: choice("From the evidence given, how would you classify this mining session?", {
    legit: "Consistent with ordinary exploration, cave mining, branch mining, or plausible luck.",
    suspicious: "Contains meaningful anomalies but not enough for likely hidden ore knowledge.",
    likely_xray:
      "Strongly consistent with acting on locations of ores that were not yet legitimately visible.",
    insufficient_evidence:
      "What you have been shown is not enough to tell these apart. Say this rather than guessing.",
  }),
  what_would_help: noul(
    "If you answered insufficient_evidence, would more detail about the player's movement before ore was exposed change your answer?",
    {
      true: "Yes, the movement before each reveal is what would settle it.",
      false: "No, more movement detail would not help.",
    },
  ),
};

const backend = createTypeSafeBackend({ apiKey: process.env.TYPESAFE_API_KEY });
const results = [];
for (const [i, f] of features.entries()) {
  const label = labels.get(f.sessionId);
  let stage = 1;
  let answer = null;
  const path = [];
  while (stage <= MAX_STAGE) {
    const res = await backend.systemOne({
      state: { task: TASK, evidence: stateForStage(f, stage) },
      questions,
      model: "jev-latest",
    });
    answer = res.answers.behavior_class.choice;
    path.push(`${stage}:${answer}`);
    if (answer !== "insufficient_evidence") break;
    stage++;
  }
  results.push({
    sessionId: f.sessionId,
    positive: label.label !== "legit",
    subtype: label.subtype,
    finalStage: Math.min(stage, MAX_STAGE),
    answer,
    path: path.join(" -> "),
  });
  process.stdout.write(`\r  ${i + 1}/${features.length}  ${path.join(" -> ")}                    `);
}
console.log();

const pos = results.filter((r) => r.positive);
const neg = results.filter((r) => !r.positive);
const flags = (r) => r.answer === "likely_xray" || r.answer === "suspicious";
console.log(`\nset: ${values.set}   ${pos.length} X-Ray, ${neg.length} legitimate`);
console.log("\nwhere sessions stopped asking:");
for (let s = 1; s <= MAX_STAGE; s++) {
  const at = results.filter((r) => r.finalStage === s);
  if (!at.length) continue;
  console.log(
    `  stage ${s} (${STAGE_NAME[s]}): ${at.length} sessions, ${at.filter((r) => r.positive).length} X-Ray`,
  );
}
console.log(`\nverdict, using the model's own answer and no threshold:`);
console.log(
  `  likely_xray or suspicious   recall ${pos.filter(flags).length}/${pos.length}   FP ${neg.filter(flags).length}/${neg.length}`,
);
console.log(
  `  likely_xray only            recall ${pos.filter((r) => r.answer === "likely_xray").length}/${pos.length}   FP ${neg.filter((r) => r.answer === "likely_xray").length}/${neg.length}`,
);
const calls = results.reduce((a, r) => a + r.finalStage, 0);
console.log(
  `\ncalls: ${calls} for ${results.length} sessions (${(calls / results.length).toFixed(2)} each)`,
);

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
console.log(`wrote ${values.out}`);
