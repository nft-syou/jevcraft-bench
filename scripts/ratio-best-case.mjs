#!/usr/bin/env node
// Gives the ore-ratio detector every advantage — its threshold tuned directly on the evaluation
// set — and reports what it costs to catch ratio-throttled X-Ray. Answers the objection that the
// baseline was simply given a bad cut-off.
// usage: node scripts/ratio-best-case.mjs --features <jsonl> --labels <jsonl> --evasive-labels <jsonl>
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    features: { type: "string" },
    labels: { type: "string" },
    "evasive-labels": { type: "string" },
  },
});
for (const key of ["features", "labels", "evasive-labels"]) {
  if (!values[key]) {
    console.error(`missing --${key}`);
    process.exit(1);
  }
}

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const labels = new Map(rows(values.labels).map((l) => [l.sessionId, l]));
const evasive = new Set(
  rows(values["evasive-labels"])
    .filter((l) => l.label !== "unknown")
    .map((l) => l.sessionId),
);
const features = rows(values.features).filter((f) => labels.has(f.sessionId));
const ratio = (f) =>
  (f.session.valuableOreBlocksBroken * 100) / Math.max(1, f.session.blocksBroken);

const legit = features.filter((f) => labels.get(f.sessionId)?.label === "legit");
const throttled = features.filter((f) => evasive.has(f.sessionId));
console.log(`legit ${legit.length}, ratio-throttled X-Ray ${throttled.length}`);
console.log("threshold | caught | false positives | FPR");
for (const t of [0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]) {
  const caught = throttled.filter((f) => ratio(f) >= t).length;
  const fp = legit.filter((f) => ratio(f) >= t).length;
  console.log(
    `${t.toFixed(2).padStart(9)} | ${String(caught).padStart(2)}/${throttled.length} | ${String(fp).padStart(2)}/${legit.length} | ${(fp / legit.length).toFixed(3)}`,
  );
}
