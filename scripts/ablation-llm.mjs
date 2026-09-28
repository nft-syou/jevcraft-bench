#!/usr/bin/env node
// ACCESS: spent-ok reporting the pre-registered ablation this data was read for; the result
// is recorded in docs/evasion.md and nothing here decides anything new.
// Does the language model earn its place?
//
// The shipped policy reads Jev's answers. Every detector it beats so far is a SINGLE
// hand-written rule, which is not a fair opponent: the policy combines evidence and they do not.
// This isolates the model by giving the feature-only side the same freedom the policy had —
// a combination whose thresholds are fitted on the development split — and then comparing on
// data neither side was tuned on.
//
// PRE-REGISTERED PROCEDURE. Committed before the held-out and confirmation numbers were looked
// at, because this repository has twice produced a headline by choosing a threshold after seeing
// the evaluation data (see docs/evasion.md). Nothing below may be edited to improve a result;
// if the procedure turns out to be wrong, the fix is a new script and a new commit that says so.
//
//   Baseline F (feature-only): flag when ore-ratio >= a OR directness >= b OR reveal-pace >= c.
//     (a, b, c) are grid-searched on the 77 development sessions to maximise recall subject to
//     development FPR <= the ceiling. Each threshold may be +inf, so the search may choose to
//     ignore a feature entirely and degenerate to a single rule.
//     Tie-break, in order: higher recall, then lower FPR, then the lexicographically smallest
//     threshold triple, so the choice is deterministic.
//   System P (shipped policy): Jev's answers plus the policy in packages/jev-evaluator.
//
//   Both are then measured on the 57 held-out sessions and on the 22 confirmation sessions.
//   Sessions a detector cannot score count as not flagged, as they would in production.
//
//   Reading the outcome, decided in advance:
//     P - F >= +3 positives at no worse FPR on the held-out set  -> the model contributes
//     |P - F| <= 2                                               -> no contribution demonstrated
//     F - P >= +3                                                -> the model costs detections
//   Two positives is inside the noise of a 29-positive set, which is why the band is +-2.
//
// usage: node scripts/ablation-llm.mjs [--splits datasets/splits2] [--max-fpr 0.072]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    splits: { type: "string", default: "datasets/splits2" },
    "confirm-features": { type: "string", default: "datasets/features/confirm.jsonl" },
    "confirm-labels": { type: "string", default: "datasets/labels/confirm.jsonl" },
    "confirm-decisions": { type: "string", default: "datasets/decisions/confirm-gated.jsonl" },
    "max-fpr": { type: "string", default: "0.072" },
  },
});
const CEILING = Number(values["max-fpr"]);
const INF = Number.POSITIVE_INFINITY;

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const load = (featurePath, labelPath, decisionPath) => {
  const labels = new Map(
    rows(labelPath)
      .filter((l) => l.label !== "unknown")
      .map((l) => [l.sessionId, l]),
  );
  const decisions = new Map(rows(decisionPath).map((d) => [d.sessionId, d]));
  return rows(featurePath)
    .filter((f) => labels.has(f.sessionId))
    .map((f) => {
      const d = decisions.get(f.sessionId);
      const blocks = Math.max(1, f.session.blocksBroken);
      return {
        id: f.sessionId,
        positive: labels.get(f.sessionId).label !== "legit",
        subtype: labels.get(f.sessionId).subtype,
        oreRatio: (f.session.valuableOreBlocksBroken * 100) / blocks,
        // A session with no reveal has no approach geometry at all; it can never be flagged
        // by the directness term, which is exactly the coverage gap being tested.
        directness: f.hiddenOreApproach.meanDirectness ?? -1,
        revealPace: (f.session.valuableOreReveals * 600) / Math.max(1, f.session.durationSec),
        policyFlag: d?.policyOutcome === "review" || d?.policyOutcome === "high_priority_review",
      };
    });
};

const dev = load(
  path.join(values.splits, "dev-features.jsonl"),
  path.join(values.splits, "dev-labels.jsonl"),
  path.join(values.splits, "dev-decisions.jsonl"),
);
const holdout = load(
  path.join(values.splits, "holdout-features.jsonl"),
  path.join(values.splits, "holdout-labels.jsonl"),
  path.join(values.splits, "holdout-decisions.jsonl"),
);
const confirm = load(
  values["confirm-features"],
  values["confirm-labels"],
  values["confirm-decisions"],
);

const candidates = (set, key) => {
  const vals = [...new Set(set.map((r) => r[key]).filter((v) => v > 0))].sort((a, b) => a - b);
  return [...vals, INF];
};
const fires = (r, [a, b, c]) => r.oreRatio >= a || r.directness >= b || r.revealPace >= c;

const score = (set, rule) => {
  const pos = set.filter((r) => r.positive);
  const neg = set.filter((r) => !r.positive);
  const tp = pos.filter((r) => fires(r, rule)).length;
  const fp = neg.filter((r) => fires(r, rule)).length;
  return {
    tp,
    nPos: pos.length,
    fp,
    nNeg: neg.length,
    recall: tp / pos.length,
    fpr: fp / neg.length,
  };
};
const scorePolicy = (set) => {
  const pos = set.filter((r) => r.positive);
  const neg = set.filter((r) => !r.positive);
  const tp = pos.filter((r) => r.policyFlag).length;
  const fp = neg.filter((r) => r.policyFlag).length;
  return {
    tp,
    nPos: pos.length,
    fp,
    nNeg: neg.length,
    recall: tp / pos.length,
    fpr: fp / neg.length,
  };
};

// Grid search on development only.
let best = null;
for (const a of candidates(dev, "oreRatio")) {
  for (const b of candidates(dev, "directness")) {
    for (const c of candidates(dev, "revealPace")) {
      const rule = [a, b, c];
      const s = score(dev, rule);
      if (s.fpr > CEILING) continue;
      if (
        best === null ||
        s.recall > best.s.recall ||
        (s.recall === best.s.recall && s.fpr < best.s.fpr) ||
        (s.recall === best.s.recall && s.fpr === best.s.fpr && rule.join() < best.rule.join())
      ) {
        best = { rule, s };
      }
    }
  }
}
if (best === null) {
  console.error(`no feature-only rule respects FPR <= ${CEILING} on the development split`);
  process.exit(1);
}

const show = (name, s) =>
  `${name.padEnd(34)} recall ${s.tp}/${s.nPos} (${s.recall.toFixed(3)})   FPR ${s.fp}/${s.nNeg} (${s.fpr.toFixed(3)})`;
const t = (v) => (v === INF ? "off" : v.toFixed(2));

console.log(`ceiling FPR <= ${CEILING}`);
console.log(
  `\nBaseline F, fitted on ${dev.length} development sessions:` +
    `\n  ore-ratio >= ${t(best.rule[0])}  OR  directness >= ${t(best.rule[1])}  OR  reveal-pace >= ${t(best.rule[2])}`,
);
console.log(`  ${show("on development (fit, not a result)", best.s)}`);

for (const [name, set] of [
  ["held-out", holdout],
  ["confirmation", confirm],
]) {
  const f = score(set, best.rule);
  const p = scorePolicy(set);
  console.log(`\n--- ${name}: ${set.length} sessions ---`);
  console.log(`  ${show("F  feature-only combination", f)}`);
  console.log(`  ${show("P  shipped policy (with Jev)", p)}`);
  const delta = p.tp - f.tp;
  const verdict =
    delta >= 3 && p.fpr <= f.fpr
      ? "the model contributes"
      : Math.abs(delta) <= 2
        ? "no contribution demonstrated"
        : delta <= -3
          ? "the model costs detections"
          : "inconclusive (gap met but FPR worse)";
  console.log(`  P - F = ${delta >= 0 ? "+" : ""}${delta} positives  ->  ${verdict}`);

  // McNemar's exact test on the discordant pairs, which is what a 2-detector comparison needs.
  const pos = set.filter((r) => r.positive);
  const onlyP = pos.filter((r) => r.policyFlag && !fires(r, best.rule)).length;
  const onlyF = pos.filter((r) => !r.policyFlag && fires(r, best.rule)).length;
  const n = onlyP + onlyF;
  let pv = 1;
  if (n > 0) {
    const c = (k) => {
      let r = 1;
      for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
      return r;
    };
    const k = Math.min(onlyP, onlyF);
    let tail = 0;
    for (let i = 0; i <= k; i++) tail += c(i);
    pv = Math.min(1, (2 * tail) / 2 ** n);
  }
  console.log(`  discordant: only P ${onlyP}, only F ${onlyF}, McNemar exact p = ${pv.toFixed(4)}`);
  if (onlyP > 0) {
    const sub = {};
    for (const r of pos.filter((r) => r.policyFlag && !fires(r, best.rule)))
      sub[r.subtype] = (sub[r.subtype] ?? 0) + 1;
    console.log(`    only P by style: ${JSON.stringify(sub)}`);
  }
}
