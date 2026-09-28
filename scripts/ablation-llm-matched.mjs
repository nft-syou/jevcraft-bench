#!/usr/bin/env node
// ACCESS: spent-ok the confirmation set is the only data both sides were frozen before, which
// is what the matched comparison needs; the outcome is reported, not used to tune either side.
// The corrected ablation. scripts/ablation-llm.mjs is left as it was pre-registered and as it
// ran; this is the follow-up it earned, not an edit of it.
//
// WHY THE FIRST ONE WAS UNFAIR. It fitted the feature-only baseline on the 77 development
// sessions, which contain no ratio-throttled sessions at all: throttled play appears only in the
// 15 held-out and 10 confirmation sessions. The shipped policy did not labour under that
// restriction. Its decisive term, reviewApproachTargetingAlone = 0.35, was added after the 15
// held-out throttled sessions had been scored (docs/evasion.md has the timeline). So the first
// run compared a policy that had seen the evasion against a baseline that had not, and its
// "+7 positives, the model contributes" is an artefact of that gap. The baseline chose
// directness >= 0.98 because on greedy-only development data a near-perfectly-straight rule
// costs nothing; against a throttled adversary it is useless.
//
// THE MATCHED COMPARISON. Fit the baseline on all 134 sessions the policy's thresholds saw
// (development + held out, throttled included), then measure both on the 22 confirmation
// sessions, which were recorded after every threshold on both sides was frozen. Giving the
// baseline all 134 is deliberately generous: most of the policy's thresholds only ever saw the
// 77. When ablating your own system, the baseline should get the benefit of the doubt.
//
// Same grid, same ceiling, same deterministic tie-break as the pre-registered run. The reading
// rule is also unchanged: +-2 positives is no demonstrated contribution, +3 or more at no worse
// false-positive rate is a contribution.
//
// usage: node scripts/ablation-llm-matched.mjs [--max-fpr 0.072]
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
        positive: labels.get(f.sessionId).label !== "legit",
        subtype: labels.get(f.sessionId).subtype,
        oreRatio: (f.session.valuableOreBlocksBroken * 100) / blocks,
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
const fit = [...dev, ...holdout];

const candidates = (set, key) => {
  const vals = [...new Set(set.map((r) => r[key]).filter((v) => v > 0))].sort((a, b) => a - b);
  return [...vals, INF];
};
const fires = (r, [a, b, c]) => r.oreRatio >= a || r.directness >= b || r.revealPace >= c;
const stat = (set, hit) => {
  const pos = set.filter((r) => r.positive);
  const neg = set.filter((r) => !r.positive);
  const tp = pos.filter(hit).length;
  const fp = neg.filter(hit).length;
  return {
    tp,
    nPos: pos.length,
    fp,
    nNeg: neg.length,
    recall: tp / pos.length,
    fpr: fp / neg.length,
  };
};

let best = null;
for (const a of candidates(fit, "oreRatio")) {
  for (const b of candidates(fit, "directness")) {
    for (const c of candidates(fit, "revealPace")) {
      const rule = [a, b, c];
      const s = stat(fit, (r) => fires(r, rule));
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
  console.error(`no feature-only rule respects FPR <= ${CEILING} on the fitting set`);
  process.exit(1);
}

const t = (v) => (v === INF ? "off" : v.toFixed(2));
const show = (name, s) =>
  `${name.padEnd(34)} recall ${s.tp}/${s.nPos} (${s.recall.toFixed(3)})   FPR ${s.fp}/${s.nNeg} (${s.fpr.toFixed(3)})`;

console.log(`ceiling FPR <= ${CEILING}`);
console.log(
  `\nBaseline F, fitted on ${fit.length} sessions (development + held out, throttled included):`,
);
console.log(
  `  ore-ratio >= ${t(best.rule[0])}  OR  directness >= ${t(best.rule[1])}  OR  reveal-pace >= ${t(best.rule[2])}`,
);
console.log(`  ${show("on the fitting set (fit, not a result)", best.s)}`);
const fitPolicy = stat(fit, (r) => r.policyFlag);
console.log(`  ${show("policy on the same 134, for scale", fitPolicy)}`);

const f = stat(confirm, (r) => fires(r, best.rule));
const p = stat(confirm, (r) => r.policyFlag);
console.log(`\n--- confirmation: ${confirm.length} sessions, unseen by both sides ---`);
console.log(`  ${show("F  feature-only combination", f)}`);
console.log(`  ${show("P  shipped policy (with Jev)", p)}`);
const delta = p.tp - f.tp;
console.log(
  `  P - F = ${delta >= 0 ? "+" : ""}${delta} positives  ->  ` +
    (delta >= 3 && p.fpr <= f.fpr
      ? "the model contributes"
      : Math.abs(delta) <= 2
        ? "no contribution demonstrated"
        : delta <= -3
          ? "the model costs detections"
          : "inconclusive (gap met but FPR worse)"),
);

const pos = confirm.filter((r) => r.positive);
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
  let tail = 0;
  for (let i = 0; i <= Math.min(onlyP, onlyF); i++) tail += c(i);
  pv = Math.min(1, (2 * tail) / 2 ** n);
}
console.log(`  discordant: only P ${onlyP}, only F ${onlyF}, McNemar exact p = ${pv.toFixed(4)}`);
