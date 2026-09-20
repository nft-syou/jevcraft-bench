#!/usr/bin/env node
// Offline sweep of the approach-targeting review gate over archived decisions (no API calls).
// A `review` stays a review only if approachTargeting >= t, or P(likely_xray) >= bypass.
// usage: node scripts/gate-sweep.mjs --decisions <jsonl> --labels <jsonl> [--bypass 0.6]
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    decisions: { type: "string" },
    labels: { type: "string" },
    bypass: { type: "string", default: "0.6" },
  },
});
if (!values.decisions || !values.labels) {
  console.error(
    "usage: node scripts/gate-sweep.mjs --decisions <jsonl> --labels <jsonl> [--bypass 0.6]",
  );
  process.exit(1);
}
const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const labels = new Map(
  rows(values.labels)
    .filter((l) => l.label !== "unknown")
    .map((l) => [l.sessionId, l]),
);
const decisions = rows(values.decisions).filter((d) => labels.has(d.sessionId));
const positive = (l) => l.label === "simulated_xray" || l.label === "known_cheat";
const bypass = Number(values.bypass);

// The stored outcome may already be gated; start from the ungated review rule.
const ungatedReview = (d) => {
  if (!d.answers) return false;
  if (d.policyOutcome === "review" || d.policyOutcome === "high_priority_review") return true;
  if (d.policyOutcome !== "no_action") return false;
  const p = d.answers.behaviorClass.probabilities;
  return p.likely_xray + p.suspicious >= 0.75;
};

console.log(`sessions: ${decisions.length} (bypass P(likely_xray) >= ${bypass})`);
console.log("t    | TP | FP | TN | FN | recall | FPR");
for (const t of [0, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  const cm = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const d of decisions) {
    const a = d.answers;
    const targeting = a?.approachTargeting;
    const p = a?.behaviorClass.probabilities.likely_xray ?? 0;
    const passesGate = targeting === undefined || targeting >= t || p >= bypass;
    const predicted =
      d.policyOutcome === "high_priority_review" || (ungatedReview(d) && passesGate);
    const truth = positive(labels.get(d.sessionId));
    if (truth && predicted) cm.tp++;
    else if (!truth && predicted) cm.fp++;
    else if (truth) cm.fn++;
    else cm.tn++;
  }
  const recall = cm.tp + cm.fn === 0 ? "n/a" : (cm.tp / (cm.tp + cm.fn)).toFixed(3);
  const fpr = cm.fp + cm.tn === 0 ? "n/a" : (cm.fp / (cm.fp + cm.tn)).toFixed(3);
  console.log(`${t.toFixed(2)} | ${cm.tp} | ${cm.fp} | ${cm.tn} | ${cm.fn} | ${recall} | ${fpr}`);
}
