#!/usr/bin/env node
// A counting baseline that the session-wide ore ratio misses: the largest number of hidden-ore
// reveals inside any sliding window. Answers the objection that "ore counting fails" was only
// shown for one particular aggregation of the counts.
//
// Reads reveal timestamps straight from the plugin's raw telemetry, because the extracted
// features keep only session totals. Picks its threshold on the development split under the
// shared false-positive ceiling, then reports held-out recall and the evasive subset.
//
// usage: node scripts/window-count.mjs --raw <dir of run_*.jsonl> --splits <dir>
//          [--evasive-labels <jsonl>] [--window-sec 300] [--max-fpr 0.072]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    raw: { type: "string" },
    splits: { type: "string" },
    "evasive-labels": { type: "string" },
    "window-sec": { type: "string", default: "300" },
    "max-fpr": { type: "string", default: "0.072" },
  },
});
for (const key of ["raw", "splits"]) {
  if (!values[key]) {
    console.error(`missing --${key}`);
    process.exit(1);
  }
}
const windowMs = Number(values["window-sec"]) * 1000;
const ceiling = Number(values["max-fpr"]);

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

// reveal timestamps per session, from raw telemetry
const reveals = new Map();
for (const name of fs.readdirSync(values.raw)) {
  if (!name.endsWith(".jsonl")) continue;
  for (const line of fs.readFileSync(path.join(values.raw, name), "utf8").split("\n")) {
    if (!line.includes('"hidden_ore_reveal"')) continue;
    const event = JSON.parse(line);
    if (event.eventType !== "hidden_ore_reveal") continue;
    if (!reveals.has(event.sessionId)) reveals.set(event.sessionId, []);
    reveals.get(event.sessionId).push(Date.parse(event.occurredAt));
  }
}

// largest count of reveals inside any window of the given width
const maxInWindow = (timestamps) => {
  if (!timestamps || timestamps.length === 0) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  let best = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++;
    best = Math.max(best, right - left + 1);
  }
  return best;
};

const loadSplit = (prefix) => {
  const labels = new Map(
    rows(path.join(values.splits, `${prefix}-labels.jsonl`)).map((l) => [l.sessionId, l.label]),
  );
  return rows(path.join(values.splits, `${prefix}-features.jsonl`))
    .filter((f) => labels.has(f.sessionId) && labels.get(f.sessionId) !== "unknown")
    .map((f) => ({
      id: f.sessionId,
      positive: labels.get(f.sessionId) !== "legit",
      score: maxInWindow(reveals.get(f.sessionId)),
    }));
};
const dev = loadSplit("dev");
const holdout = loadSplit("holdout");
if (dev.length === 0 || holdout.length === 0) {
  console.error("no sessions matched; is --raw pointing at the plugin data directory?");
  process.exit(1);
}

const rate = (set, want, threshold) => {
  const pool = set.filter((r) => r.positive === want);
  return { hit: pool.filter((r) => r.score >= threshold).length, total: pool.length };
};

// highest development recall that still respects the ceiling
let chosen = null;
for (const threshold of [...new Set(dev.map((r) => r.score))]
  .sort((a, b) => a - b)
  .filter((v) => v > 0)) {
  const fp = rate(dev, false, threshold);
  if (fp.hit / fp.total > ceiling) continue;
  const tp = rate(dev, true, threshold);
  const recall = tp.hit / tp.total;
  if (!chosen || recall > chosen.recall) chosen = { threshold, recall, fpr: fp.hit / fp.total };
}
if (!chosen) {
  console.error(`no development threshold respects FPR <= ${ceiling}`);
  process.exit(1);
}

const line = (name, { hit, total }) =>
  `${name.padEnd(28)} ${String(hit).padStart(3)}/${String(total).padEnd(3)} (${(hit / total).toFixed(3)})`;
console.log(`window ${values["window-sec"]}s, ceiling FPR <= ${ceiling}`);
console.log(
  `development threshold: >= ${chosen.threshold} reveals (dev recall ${chosen.recall.toFixed(3)}, dev FPR ${chosen.fpr.toFixed(3)})`,
);
console.log(line("holdout recall", rate(holdout, true, chosen.threshold)));
console.log(line("holdout false positives", rate(holdout, false, chosen.threshold)));

if (values["evasive-labels"]) {
  const evasive = new Set(
    rows(values["evasive-labels"])
      .filter((l) => l.label !== "unknown")
      .map((l) => l.sessionId),
  );
  const subset = holdout.filter((r) => evasive.has(r.id));
  console.log(
    line("evasive subset caught", {
      hit: subset.filter((r) => r.score >= chosen.threshold).length,
      total: subset.length,
    }),
  );
  console.log(
    `evasive scores: ${subset
      .map((r) => r.score)
      .sort((a, b) => b - a)
      .join(", ")}`,
  );
}
