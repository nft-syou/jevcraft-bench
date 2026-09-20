#!/usr/bin/env node
// Prints one line per labelled session: key features next to Jev's answers and the policy outcome.
// usage: node scripts/session-table.mjs --features <jsonl> --labels <jsonl> --decisions <jsonl>
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    features: { type: "string" },
    labels: { type: "string" },
    decisions: { type: "string" },
  },
});
if (!values.features || !values.labels || !values.decisions) {
  console.error(
    "usage: node scripts/session-table.mjs --features <jsonl> --labels <jsonl> --decisions <jsonl>",
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
const labels = new Map(rows(values.labels).map((l) => [l.sessionId, l]));
const decisions = new Map(rows(values.decisions).map((d) => [d.sessionId, d]));
const r2 = (v) => (v === null || v === undefined ? "-" : typeof v === "number" ? +v.toFixed(2) : v);

console.log(
  "subtype | dur | brk | rev | appr | direct | detour | aim | cave | pct | enough | P(xray) | susp | targeting | suff | outcome",
);
for (const f of rows(values.features)) {
  const label = labels.get(f.sessionId);
  if (!label || label.label === "unknown") continue;
  const d = decisions.get(f.sessionId);
  const a = d?.answers;
  console.log(
    [
      label.subtype ?? label.label,
      r2(f.session.durationSec),
      f.session.blocksBroken,
      f.session.valuableOreReveals,
      f.hiddenOreApproach.sampleCount,
      r2(f.hiddenOreApproach.meanDirectness),
      r2(f.hiddenOreApproach.medianDetourRatio),
      r2(f.hiddenOreApproach.aimAlignmentBeforeRevealRatio),
      r2(f.exploration.caveExposureRatio),
      r2(f.efficiency.baselinePercentile),
      f.quality.enoughEvidence,
      r2(a?.behaviorClass.probabilities.likely_xray),
      r2(a?.behaviorClass.probabilities.suspicious),
      r2(a?.approachTargeting),
      r2(a?.evidenceSufficiency),
      d?.policyOutcome ?? "-",
    ].join(" | "),
  );
}
