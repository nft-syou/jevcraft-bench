#!/usr/bin/env node
// ACCESS: open only. Reads per-session scores that tune-grid.mjs wrote from the development
// split. No model calls are made here, so there is no evidence to declare.
//
// Combines two experiments that were already run, without asking the model anything new.
// Both combiners are parameter-free: the plain mean of the two scores, and the mean of their
// ranks, which ignores the fact that two questions may sit on different scales.
//
// usage: node scripts/tune-combine.mjs --round r1 --a <id[#reading]> --b <id[#reading]> [--repeats 3]
import fs from "node:fs";
import { parseArgs } from "node:util";
import { aboveEveryLegit, auc, mean, perStyle, sd } from "./lib/tuning-score.mjs";

const { values } = parseArgs({
  options: {
    round: { type: "string", default: "r1" },
    a: { type: "string" },
    b: { type: "string" },
    repeats: { type: "string", default: "3" },
    ledger: { type: "boolean", default: false },
  },
});
const load = (spec, k) => {
  const [id, reading = "main"] = spec.split("#");
  const rows = JSON.parse(fs.readFileSync(`reports/grid/${values.round}.${id}.r${k}.json`, "utf8"));
  return new Map(rows.map((r) => [r.sessionId, { ...r, v: r.scores[reading] }]));
};
const ranks = (m) => {
  const sorted = [...m.values()].sort((x, y) => x.v - y.v);
  const out = new Map();
  for (const [i, r] of sorted.entries()) out.set(r.sessionId, i / (sorted.length - 1));
  return out;
};
const out = { mean: [], rank: [] };
for (let k = 0; k < Number(values.repeats); k++) {
  const A = load(values.a, k);
  const B = load(values.b, k);
  const ra = ranks(A);
  const rb = ranks(B);
  const ids = [...A.keys()].filter((id) => B.has(id));
  out.mean.push(ids.map((id) => ({ ...A.get(id), score: (A.get(id).v + B.get(id).v) / 2 })));
  out.rank.push(ids.map((id) => ({ ...A.get(id), score: (ra.get(id) + rb.get(id)) / 2 })));
}
for (const [name, runs] of Object.entries(out)) {
  const aucs = runs.map(auc);
  const styles = ["detour_xray", "direct_xray", "humanized_xray", "throttled_xray"];
  const sm = styles.map((s) => mean(runs.map((r) => perStyle(r)[s])));
  const id = `${values.a}+${values.b}|${name}`;
  console.log(
    `${id.padEnd(44)} ${mean(aucs).toFixed(3)} ${sd(aucs).toFixed(3)}   ${sm.map((v) => v.toFixed(2)).join("  ")}   ${mean(runs.map(aboveEveryLegit)).toFixed(1)}`,
  );
  if (values.ledger) {
    fs.appendFileSync(
      "docs/tuning-ledger.jsonl",
      `${JSON.stringify({
        at: new Date().toISOString(),
        round: values.round,
        id,
        structure: "combination",
        reading: name,
        sessions: runs[0].length,
        repeats: runs.length,
        auc: aucs.map((v) => Number(v.toFixed(4))),
        aucMean: Number(mean(aucs).toFixed(4)),
        aucSd: Number(sd(aucs).toFixed(4)),
        perStyle: Object.fromEntries(styles.map((s, i) => [s, Number(sm[i].toFixed(4))])),
        aboveEveryLegit: runs.map(aboveEveryLegit),
        calls: 0,
        seconds: 0,
      })}\n`,
    );
  }
}
