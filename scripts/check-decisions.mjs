#!/usr/bin/env node
// Enforces the parts of docs/decisions.md that can be enforced.
//
// It exists because a decision made in conversation does not survive into the next script on its
// own. Three times in one session work was built that contradicted a direction settled a few
// messages earlier, and each time the person who made the decision had to catch it. The same
// pattern as datasets/ACCESS.md: a rule nobody can forget has to be checked by something other
// than the person who would forget it.
//
// D1. Evidence sent to the model is raw, not summarised.
//     Any script that calls the Jev backend declares what it sends:
//
//       // EVIDENCE: raw
//       // EVIDENCE: summary <why this experiment needs the summarised features>
//       // EVIDENCE: both <why>
//
//     `raw` needs no reason. `summary` and `both` do, because that is the decision being
//     deviated from. A script that sends `hiddenOreApproach` while declaring `raw` is the exact
//     mistake this catches.
//
// usage: node scripts/check-decisions.mjs
import fs from "node:fs";
import path from "node:path";

const walk = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(mjs|ts)$/.test(e.name)) out.push(p);
  }
  return out;
};

// Scripts are where experiments live; packages are the library the experiments call.
const files = walk("scripts").filter((f) => !/check-decisions\.mjs$/.test(f));

// Sending a request to the model, however the backend was obtained.
const CALLS_MODEL = /\.systemOne\s*\(|createTypeSafeBackend|runEvaluate\s*\(/;
// The pre-computed approach summary: the six numbers a threshold rule reads.
const SENDS_SUMMARY = /hiddenOreApproach/;

const problems = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!CALLS_MODEL.test(text)) continue;

  const marker = text.match(/\/\/\s*EVIDENCE:\s*(raw|summary|both)\b([^\n]*)/);
  if (!marker) {
    problems.push(
      `${file} sends evidence to the model with no "// EVIDENCE:" marker (D1, docs/decisions.md)`,
    );
    continue;
  }
  const [, mode, rest] = marker;
  if (mode !== "raw" && rest.trim().length < 12) {
    problems.push(
      `${file} declares "// EVIDENCE: ${mode}" without a reason; deviating from D1 needs one`,
    );
  }
  if (mode === "raw" && SENDS_SUMMARY.test(text)) {
    problems.push(
      `${file} declares "// EVIDENCE: raw" but references hiddenOreApproach; that is the summary D1 rules out`,
    );
  }
}

if (problems.length > 0) {
  console.error("settled decisions violated:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nSee docs/decisions.md. Changing a decision means editing that file in a commit that says why.",
  );
  process.exit(1);
}
console.log(`settled decisions ok: ${files.length} scripts checked`);
