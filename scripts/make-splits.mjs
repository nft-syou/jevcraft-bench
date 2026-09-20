#!/usr/bin/env node
// Splits the combined dataset into the sessions used to develop the policy and the ones recorded
// afterwards. Benchmarks tune on the first and report on the second.
// usage: node scripts/make-splits.mjs --dev-ids <labels.jsonl> --features <jsonl> --labels <jsonl> --decisions <jsonl> --out-dir <dir>
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "dev-ids": { type: "string" },
    features: { type: "string" },
    labels: { type: "string" },
    decisions: { type: "string" },
    "out-dir": { type: "string", default: "datasets/splits" },
  },
});
for (const key of ["dev-ids", "features", "labels", "decisions"]) {
  if (!values[key]) {
    console.error(`missing --${key}`);
    process.exit(1);
  }
}

const lines = (p) => fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
const devIds = new Set(lines(values["dev-ids"]).map((l) => JSON.parse(l).sessionId));
fs.mkdirSync(values["out-dir"], { recursive: true });

for (const [name, keep] of [
  ["dev", (id) => devIds.has(id)],
  ["holdout", (id) => !devIds.has(id)],
]) {
  const counts = { legit: 0, xray: 0 };
  for (const [kind, source] of [
    ["features", values.features],
    ["labels", values.labels],
    ["decisions", values.decisions],
  ]) {
    const kept = lines(source).filter((l) => keep(JSON.parse(l).sessionId));
    fs.writeFileSync(path.join(values["out-dir"], `${name}-${kind}.jsonl`), `${kept.join("\n")}\n`);
    if (kind === "labels") {
      for (const l of kept.map((x) => JSON.parse(x))) {
        if (l.label === "legit") counts.legit++;
        else counts.xray++;
      }
    }
  }
  console.log(
    `${name}: ${counts.legit + counts.xray} sessions (legit ${counts.legit}, xray ${counts.xray})`,
  );
}
