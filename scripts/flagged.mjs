#!/usr/bin/env node
// Lists the sessions a decision file marked for review, which is what an operator wants from a
// live server. `jevcraft report` cannot do this: it requires labels, and a real server has none.
//
// usage: node scripts/flagged.mjs <decisions.jsonl>... [--min-probability 0]
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: { "min-probability": { type: "string", default: "0" } },
  allowPositionals: true,
});
if (positionals.length === 0) {
  console.error("usage: node scripts/flagged.mjs <decisions.jsonl>... [--min-probability 0]");
  process.exit(1);
}
const floor = Number(values["min-probability"]);

const rows = positionals.flatMap((p) =>
  fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l)),
);
const flagged = rows
  .filter((d) => d.policyOutcome === "review" || d.policyOutcome === "high_priority_review")
  .map((d) => ({
    outcome: d.policyOutcome,
    sessionId: d.sessionId,
    at: d.evaluatedAt,
    xray: d.answers?.behaviorClass?.probabilities?.likely_xray ?? null,
    hidden: d.answers?.hiddenInformationUse ?? null,
    approach: d.answers?.approachTargeting ?? null,
  }))
  .filter((r) => (r.xray ?? 0) >= floor)
  // Highest suspicion first, because a shortlist is read from the top.
  .sort((a, b) => (b.xray ?? 0) - (a.xray ?? 0));

if (flagged.length === 0) {
  console.log(`no sessions flagged out of ${rows.length}`);
  process.exit(0);
}
console.log(`${flagged.length} flagged of ${rows.length} scored session windows`);
console.log("outcome\tP(xray)\thidden\tapproach\tsession");
for (const r of flagged) {
  const n = (v) => (v === null ? "-" : v.toFixed(2));
  console.log(`${r.outcome}\t${n(r.xray)}\t${n(r.hidden)}\t${n(r.approach)}\t${r.sessionId}`);
}
console.log(
  "\nSession ids are pseudonymous. Matching one to an account needs your own record of who was online.",
);
