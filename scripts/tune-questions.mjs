#!/usr/bin/env node
// EVIDENCE: raw the model is only ever shown the approach traces. Decision D1.
// ACCESS: open only. Reads datasets/splits2/dev-*.jsonl and nothing else. Every number this
// prints is a design decision with evidence attached, never a result: the whole point is to
// iterate here so the sealed data stays sealed. See datasets/ACCESS.md.
//
// A bench for rewriting the questions rather than the thresholds.
//
// What the development split can and cannot show. It holds 34 branch_mining legitimate sessions,
// 15 direct_xray, 14 humanized_xray and 14 detour_xray, and **no throttled_xray at all**: the
// adversary the project cares most about is not in the open data. So a variant that looks good
// here has been shown to handle wandering and mixed-pace cheats, and nothing has been shown about
// ratio dilution. Recording throttled sessions into the open pool is the fix; until then, read
// these numbers as covering three of the four styles.
//
// Variants live in this file so a change to a question is a change to a commit.
//
// usage: node scripts/tune-questions.mjs [--variant <name>|all] [--limit <n>]
import fs from "node:fs";
import { parseArgs } from "node:util";
import { createTypeSafeBackend } from "../packages/jev-evaluator/src/typesafe-backend.ts";

const { values } = parseArgs({
  options: {
    variant: { type: "string", default: "all" },
    raw: { type: "string" },
    "trace-points": { type: "string", default: "24" },
    "max-approaches": { type: "string", default: "3" },
    limit: { type: "string" },
    out: { type: "string", default: "reports/tune-questions.json" },
  },
});

const noul = (instructions, criteria) => ({ type: "noul", instructions, criteria });

const rows = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const labels = new Map(
  rows("datasets/splits2/dev-labels.jsonl")
    .filter((l) => l.label !== "unknown")
    .map((l) => [l.sessionId, l]),
);
let sessions = rows("datasets/splits2/dev-features.jsonl").filter((f) => labels.has(f.sessionId));
if (values.limit) sessions = sessions.slice(0, Number(values.limit));

/* Raw approach traces. The whole point of tuning questions is to stop handing the model the six
   numbers a threshold rule reads. Decision D1 in docs/decisions.md. */
const APPROACH_WINDOW_MS = 60_000;
const TRACE_POINTS = Number(values["trace-points"]);
const MAX_APPROACHES = Number(values["max-approaches"]);
const r1 = (v) => Math.round(v * 10) / 10;
const telemetry = new Map();
if (!values.raw) {
  console.error("--raw <dir>[,<dir>] is required; it points at the plugin telemetry");
  process.exit(1);
}
{
  for (const dir of values.raw.split(",")) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      for (const line of fs.readFileSync(`${dir}/${name}`, "utf8").split("\n")) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (!telemetry.has(e.sessionId)) telemetry.set(e.sessionId, []);
        telemetry.get(e.sessionId).push(e);
      }
    }
  }
}
const buildTrace = (sessionId) => {
  const all = (telemetry.get(sessionId.split(":")[0]) ?? []).sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal").slice(0, MAX_APPROACHES);
  const samples = all.filter((e) => e.eventType === "movement_sample");
  const breaks = all.filter((e) => e.eventType === "block_break");
  return reveals.map((rev, i) => {
    const t1 = Date.parse(rev.occurredAt);
    const t0 = t1 - APPROACH_WINDOW_MS;
    const ore = rev.position;
    const win = samples.filter((x) => {
      const t = Date.parse(x.occurredAt);
      return t >= t0 && t <= t1;
    });
    const step = Math.max(1, Math.ceil(win.length / TRACE_POINTS));
    const inBreaks = breaks.filter((b) => {
      const t = Date.parse(b.occurredAt);
      return t >= t0 && t <= t1;
    });
    const bStep = Math.max(1, Math.ceil(inBreaks.length / 8));
    return {
      approach: i + 1,
      oreRevealedAtSecond: 0,
      path: win
        .filter((_, k) => k % step === 0)
        .map((x) => ({
          t: Math.round((Date.parse(x.occurredAt) - t1) / 1000),
          dx: r1(x.position.x - ore.x),
          dy: r1(x.position.y - ore.y),
          dz: r1(x.position.z - ore.z),
          yaw: Math.round(x.rotation?.yaw ?? 0),
          pitch: Math.round(x.rotation?.pitch ?? 0),
        })),
      blockBreaks: inBreaks
        .filter((_, k) => k % bStep === 0)
        .map((b) => ({
          t: Math.round((Date.parse(b.occurredAt) - t1) / 1000),
          dx: r1(b.position.x - ore.x),
          dy: r1(b.position.y - ore.y),
          dz: r1(b.position.z - ore.z),
        })),
    };
  });
};
// Raw only. Decision D1: the summarised approach numbers were designed for a threshold rule to
// read, so tuning a question against them measures the bottleneck rather than the question. The
// comparison between the two representations has its own script; it does not belong here.
const evidenceFor = (f) => ({ approaches: buildTrace(f.sessionId) });

const TASK =
  "A Minecraft player mined underground. Decide whether their movement before hidden ores became visible looked like deliberate approaches toward ores whose position they already knew, rather than ordinary tunnelling that happened to meet them.";

// Every variant answers the same question on the same evidence, so the only thing that changes is
// what the model is told. The baseline is the shipped xray-v6 wording, unaltered.
const TRACE_NOTE =
  "Each approach gives the player's position and view over the 60 seconds before a hidden ore became visible, as offsets from that ore in blocks, with the blocks they broke. Second 0 is the moment the ore was exposed.";

const VARIANTS = {
  // Plain question, no coaching. The reference every other variant has to beat.
  baseline: {
    task: TASK,
    question: noul(
      `${TRACE_NOTE} Did this movement look like deliberate approaches toward ore whose position the player already knew, rather than ordinary tunnelling that happened to meet it?`,
      {
        true: "The path goes to the ore and the view settles on it before it is exposed.",
        false:
          "The path would have gone where it went regardless; the ore lies along it and the view does not anticipate it.",
      },
    ),
  },

  // Names the tactic that beat the summarised features: wandering on the way to known ore.
  "detour-aware": {
    task: `${TASK}

A cheat does not have to walk in straight lines. One that knows where the ore is can wander on the way to it, so an indirect path is not evidence of innocence. What separates the two is whether the wandering ends somewhere: an honest tunnel meets ore incidentally and carries on past it, while a route to known ore terminates on it.`,
    question: noul(
      `${TRACE_NOTE} However indirect the route, does it end on the ore rather than pass by it?`,
      {
        true: "The path terminates on the ore, turns toward it, or the view lands on it before exposure, whatever shape the route took.",
        false:
          "The ore sits beside a route that continued past it, with no turning toward it and no anticipation in the view.",
      },
    ),
  },

  // Tells the model that calm-looking behaviour can be manufactured.
  "not-exculpatory": {
    task: `${TASK}

Two things are not evidence of innocence. A cheat can dig ordinary tunnel between targets until its ore-per-block rate looks unremarkable, and a cheat can wander on the way to ore it already knows about so its paths are not straight. Both are produced on purpose. Judge on whether the movement and the view anticipate the ore.`,
    question: noul(`${TRACE_NOTE} Does the movement anticipate the ore?`, {
      true: "Position and view converge on the ore before it could have been seen.",
      false:
        "Nothing anticipates it. The player was going where they were going and the ore happened to be there.",
    }),
  },

  // Two independent signals rather than one paragraph carrying both warnings. Combined with max,
  // so nothing is weighted and nothing is fitted.
  split: {
    task: TASK,
    questions: {
      straight_approach: noul(
        `${TRACE_NOTE} Was the path close to a straight line to the ore, with the view already on it before exposure?`,
        {
          true: "Near-direct travel to the ore, aim landing on it ahead of the reveal.",
          false: "The path bends or wanders, or the view only finds the ore once it is visible.",
        },
      ),
      terminates_on_ore: noul(
        `${TRACE_NOTE} Regardless of how indirect it was, does the path end on the ore rather than pass by it?`,
        {
          true: "It terminates on the ore or turns toward it, even with a wandering route.",
          false: "The route continued past the ore; the ending looks incidental.",
        },
      ),
    },
  },
};

const backend = createTypeSafeBackend({ apiKey: process.env.TYPESAFE_API_KEY });
const names =
  values.variant === "all" ? Object.keys(VARIANTS) : values.variant.split(",").map((s) => s.trim());

const auc = (rs) => {
  const pos = rs.filter((r) => r.positive).map((r) => r.score);
  const neg = rs.filter((r) => !r.positive).map((r) => r.score);
  let s = 0;
  for (const a of pos) for (const b of neg) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (pos.length * neg.length);
};
// No threshold is chosen here. Separation is reported as AUC, plus the gap between the classes,
// so a variant cannot be made to look good by picking a cut.
const gap = (rs) => {
  const pos = rs.filter((r) => r.positive).map((r) => r.score);
  const neg = rs.filter((r) => !r.positive).map((r) => r.score);
  return Math.min(...pos) - Math.max(...neg);
};

const all = {};
for (const name of names) {
  const v = VARIANTS[name];
  if (!v) {
    console.error(`unknown variant "${name}"; have ${Object.keys(VARIANTS).join(", ")}`);
    process.exit(1);
  }
  const results = [];
  for (const [i, f] of sessions.entries()) {
    if (buildTrace(f.sessionId).length === 0) continue;
    const res = await backend.systemOne({
      state: { task: v.task, ...evidenceFor(f) },
      questions: v.questions ?? { approach_targeting: v.question },
      model: "jev-latest",
    });
    const label = labels.get(f.sessionId);
    results.push({
      sessionId: f.sessionId,
      subtype: label.subtype,
      positive: label.label !== "legit",
      // A variant with several questions is combined with max: suspicious if any one of the
      // independent signals fires. Nothing is weighted and nothing is fitted, so a split variant
      // cannot beat a single question by having a combiner tuned for it.
      score: Math.max(...Object.values(res.answers).map((a) => a.noul)),
      parts: Object.fromEntries(Object.entries(res.answers).map(([k, a]) => [k, a.noul])),
    });
    process.stdout.write(`\r  ${name}: ${i + 1}/${sessions.length}        `);
  }
  console.log();
  all[name] = results;
}

console.log(`\ndevelopment split, ${sessions.length} sessions, raw approach traces\n`);
console.log("variant".padEnd(18), "AUC", "  gap", "   by style (AUC against the 34 legitimate)");
for (const [name, rs] of Object.entries(all)) {
  const styles = [...new Set(rs.filter((r) => r.positive).map((r) => r.subtype))].sort();
  const per = styles
    .map((s) => {
      const sub = rs.filter((r) => !r.positive || r.subtype === s);
      return `${s.replace("_xray", "")} ${auc(sub).toFixed(2)}`;
    })
    .join("  ");
  console.log(name.padEnd(18), auc(rs).toFixed(3), gap(rs).toFixed(2).padStart(6), "  ", per);
}
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(values.out, `${JSON.stringify(all, null, 2)}\n`);
console.log(`\nwrote ${values.out}`);
