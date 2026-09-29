#!/usr/bin/env node
// EVIDENCE: raw the model is only ever shown the approach traces. Decision D1.
// ACCESS: open only. Reads datasets/splits2/dev-*.jsonl and nothing else. Every number this
// prints is a design decision with evidence attached, never a result: the whole point is to
// iterate here so the sealed data stays sealed. See datasets/ACCESS.md.
//
// A bench for rewriting the questions rather than the thresholds.
//
// The development split holds 34 branch_mining legitimate sessions, 15 direct_xray,
// 14 humanized_xray, 14 detour_xray and 19 throttled_xray, so all four evasion styles are
// covered. Sessions with no ore reveal have no approach to show and are skipped.
//
// Run-to-run variance of the model is about 0.03 AUC on this split. A difference smaller than
// that between two variants is noise, whichever way it points.
//
// Variants live in this file so a change to a question is a change to a commit.
//
// usage: node scripts/tune-questions.mjs --raw <dir>[,<dir>] [--variant <name>|all] [--limit <n>]
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
const choice = (instructions, criteria) => ({ type: "choice", instructions, criteria });

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
const buildTrace = (sessionId, maxApproaches = MAX_APPROACHES) => {
  const all = (telemetry.get(sessionId.split(":")[0]) ?? []).sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  const reveals = all.filter((e) => e.eventType === "hidden_ore_reveal").slice(0, maxApproaches);
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

// The framing that won the single-stage comparison, shared by the two-stage variants so that what
// differs between them is the staging and not the coaching.
const EVASION_NOTE =
  "Two things are not evidence of innocence. A cheat can dig ordinary tunnel between targets until its ore-per-block rate looks unremarkable, and a cheat can wander on the way to ore it already knows about so its paths are not straight. Both are produced on purpose. Judge on whether the movement and the view anticipate the ore.";

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

  // Work out how the player was moving, then ask the question that fits that movement.
  //
  // The single-stage results said coaching helps the style it names and hurts the rest:
  // detour-aware took detour from 0.69 to 0.78 and dropped direct to 0.44. If the style is
  // identified first, each session can get the coaching meant for it.
  //
  // Stage one deliberately asks about movement, not guilt. Its categories are things a legitimate
  // miner does too, so answering them does not leak the label: branch mining is straight, cave
  // following wanders.
  "two-stage-style": {
    task: TASK,
    stage1: {
      movement_pattern: choice(
        `${TRACE_NOTE} Ignoring whether anything is suspicious, how was this player moving in the run-up to the ore?`,
        {
          direct_line: "Travel is close to a straight line, held over most of the approach.",
          wandering: "The route changes direction repeatedly rather than holding a heading.",
          corridor: "Movement follows an existing tunnel or passage rather than cutting new line.",
          stationary: "Little travel; the player was largely working in one place.",
        },
      ),
    },
    routeOn: (a) => a.movement_pattern.choice,
    stage2: {
      // Straight travel is what branch mining looks like, so straightness alone decides nothing.
      // What separates them is whether the view knew where to go.
      direct_line: {
        approach_targeting: noul(
          `${TRACE_NOTE} This player travelled in straight lines, which is also what ordinary branch mining looks like, so straightness on its own means nothing here. Did the view anticipate the ore before it was exposed?`,
          {
            true: "Aim settles on the ore ahead of the reveal, or the line was aimed at it from the start rather than arriving there.",
            false:
              "The view scans or follows the dig; the ore turns up in front of a line that was going that way anyway.",
          },
        ),
      },
      // A wandering route is what an honest cave miner produces, and also what a cheat produces
      // when it hides a known destination. The tell is the ending.
      wandering: {
        approach_targeting: noul(
          `${TRACE_NOTE} This route wandered, which is also what exploring a cave looks like. Does the wandering end on the ore rather than pass it?`,
          {
            true: "The turns accumulate toward the ore and the path terminates on it, repeatedly.",
            false:
              "The ore lies beside a route that continued past it; the ending looks incidental.",
          },
        ),
      },
      corridor: {
        approach_targeting: noul(
          `${TRACE_NOTE} This player was following a corridor. Did they leave it to reach the ore, or did the ore simply lie along it?`,
          {
            true: "The path departs the corridor toward the ore, or the corridor itself was aimed at it.",
            false: "The ore sits in the wall of a passage that was being followed anyway.",
          },
        ),
      },
      default: {
        approach_targeting: noul(
          `${TRACE_NOTE} Does the movement and the view anticipate the ore before it was exposed?`,
          {
            true: "Position and view converge on the ore before it could have been seen.",
            false: "Nothing anticipates it.",
          },
        ),
      },
    },
  },

  // The control for the one above. Two calls, no routing: the model describes what it sees, then
  // judges with its own description in front of it. If this matches two-stage-style, the gain is
  // from having two passes rather than from picking the question.
  "two-stage-plain": {
    task: TASK,
    stage1: {
      movement_summary: noul(
        `${TRACE_NOTE} Before judging anything, does the run-up to the ore show the player changing course or view in ways that point toward where the ore turned out to be?`,
        {
          true: "Course or view shifts toward the ore's eventual position during the approach.",
          false: "Course and view are unrelated to where the ore turned out to be.",
        },
      ),
    },
    routeOn: () => "default",
    carry: (a) => ({
      firstPass: { pointedTowardOre: a.movement_summary.noul },
    }),
    stage2: {
      default: {
        approach_targeting: noul(
          `${TRACE_NOTE} A cheat can dig ordinary tunnel between targets so its rate looks unremarkable, and can wander so its paths are not straight; neither calm rates nor indirect routes are evidence of innocence. Taking your own first-pass reading in firstPass into account, does the movement anticipate the ore?`,
          {
            true: "Position and view converge on the ore before it could have been seen.",
            false:
              "Nothing anticipates it. The player was going where they were going and the ore happened to be there.",
          },
        ),
      },
    },
  },

  // Style routing again, with the mistake in two-stage-style removed. That variant told every
  // route "this pattern is also what legitimate play looks like", which handed every session a
  // reason to be innocent and inverted the ranking (AUC 0.223) even though the routing itself was
  // right. Here the second stage names the tell for that movement and says nothing exculpatory.
  "style-v2": {
    task: `${TASK}\n\n${EVASION_NOTE}`,
    stage1: {
      movement_pattern: choice(
        `${TRACE_NOTE} Ignoring whether anything is suspicious, how was this player moving in the run-up to the ore?`,
        {
          direct_line: "Travel is close to a straight line, held over most of the approach.",
          wandering: "The route changes direction repeatedly rather than holding a heading.",
          corridor: "Movement follows an existing tunnel or passage rather than cutting new line.",
          stationary: "Little travel; the player was largely working in one place.",
        },
      ),
    },
    routeOn: (a) => a.movement_pattern.choice,
    stage2: {
      direct_line: {
        approach_targeting: noul(
          `${TRACE_NOTE} The player held a straight line. A line can be aimed at something or merely dug. Was this one aimed at the ore: view on the ore's position before it was exposed, and the line ending at the ore rather than running on past it?`,
          {
            true: "The heading and the view point at the ore from early in the approach and the dig stops there.",
            false:
              "The line has its own direction; the ore is met along it and the dig carries on.",
          },
        ),
      },
      wandering: {
        approach_targeting: noul(
          `${TRACE_NOTE} The route wandered. Wandering can hide a destination. Do the changes of direction bring the player closer to the ore each time, ending on it?`,
          {
            true: "Distance to the ore shrinks across the turns and the route terminates on it.",
            false: "The turns are unrelated to the ore's position; distance to it rises and falls.",
          },
        ),
      },
      corridor: {
        approach_targeting: noul(
          `${TRACE_NOTE} The player followed a passage. Did they break out of it toward the ore before the ore could be seen?`,
          {
            true: "The dig leaves the passage in the ore's direction ahead of the reveal.",
            false: "The ore is exposed in the wall or floor of the passage being followed.",
          },
        ),
      },
      default: {
        approach_targeting: noul(`${TRACE_NOTE} Does the movement anticipate the ore?`, {
          true: "Position and view converge on the ore before it could have been seen.",
          false: "Nothing anticipates it.",
        }),
      },
    },
  },

  // Pull the observable facts out first, then judge with them on the table. The first stage is
  // asked nothing about guilt, only what happened; the second sees the trace and its own answers.
  "facts-then-verdict": {
    task: `${TASK}\n\n${EVASION_NOTE}`,
    stage1: {
      view_on_ore_early: noul(
        `${TRACE_NOTE} Was the view pointed at the ore's position well before second 0?`,
        {
          true: "Yaw and pitch line up with the ore's offset seconds ahead of the reveal.",
          false: "The view only lines up with the ore at or after the reveal, or never.",
        },
      ),
      path_ends_at_ore: noul(
        `${TRACE_NOTE} Does the path end at the ore, rather than continue in its direction of travel?`,
        {
          true: "The final positions close on the ore and stop.",
          false: "The ore is passed or met side-on while travel continues.",
        },
      ),
      distance_shrinks: noul(
        `${TRACE_NOTE} Does the distance to the ore fall steadily over the approach?`,
        {
          true: "Offsets shrink toward zero through most of the window.",
          false: "Distance rises and falls, or stays flat until the end.",
        },
      ),
      repeats: noul(`${TRACE_NOTE} Is the same pattern present in more than one approach?`, {
        true: "Two or more approaches show the same shape.",
        false: "Only one approach, or the approaches differ in shape.",
      }),
    },
    routeOn: () => "default",
    carry: (a) => ({
      observations: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.noul])),
    }),
    stage2: {
      default: {
        approach_targeting: noul(
          `${TRACE_NOTE} Your own readings of this trace are in observations, each a probability. With those and the trace, does the movement anticipate the ore?`,
          {
            true: "Position and view converge on the ore before it could have been seen.",
            false:
              "Nothing anticipates it. The player was going where they were going and the ore happened to be there.",
          },
        ),
      },
    },
  },

  // Hear both sides separately before judging. Each reading is asked for on its own terms, so
  // neither is anchored by the other.
  advocates: {
    task: `${TASK}\n\n${EVASION_NOTE}`,
    stage1: {
      honest_miner_plausible: noul(
        `${TRACE_NOTE} How plausible is it that a miner with no knowledge of where ore was produced this movement?`,
        {
          true: "An ordinary tunnel or exploration would produce this without needing to know.",
          false: "An honest miner would have had no reason to move and look this way.",
        },
      ),
      informed_player_plausible: noul(
        `${TRACE_NOTE} How plausible is it that a player who already knew where the ore was produced this movement, including one trying to look ordinary?`,
        {
          true: "Knowing the position explains the route and the view well.",
          false: "Knowing the position would not have produced this; it explains nothing here.",
        },
      ),
    },
    routeOn: () => "default",
    carry: (a) => ({
      readings: {
        honestMinerPlausible: a.honest_miner_plausible.noul,
        informedPlayerPlausible: a.informed_player_plausible.noul,
      },
    }),
    stage2: {
      default: {
        approach_targeting: noul(
          `${TRACE_NOTE} Two readings of this trace are in readings, each a probability. Weighing them against the trace, does the movement anticipate the ore?`,
          {
            true: "The informed reading fits better: position and view converge on the ore early.",
            false: "The honest reading fits better: nothing anticipates the ore.",
          },
        ),
      },
    },
  },

  // Judge each approach alone, then judge the set. One approach that ends on ore is a
  // coincidence; eight are not, and that consistency is the thing a session-level prompt has to
  // squeeze into one context. Asked one at a time, every approach gets the full path resolution,
  // so this variant can look at up to eight approaches where the others see three.
  "per-approach": {
    task: `${TASK}\n\n${EVASION_NOTE}`,
    run: async ({ f, ask }) => {
      const approaches = buildTrace(f.sessionId, 8);
      const each = [];
      for (const a of approaches) {
        const res = await ask(
          { task: `${TASK}\n\n${EVASION_NOTE}`, approach: a },
          {
            anticipates: noul(
              "This is one approach: the player's position and view over the 60 seconds before a hidden ore became visible, as offsets from that ore in blocks, with the blocks they broke. Second 0 is the moment the ore was exposed. Does this approach anticipate the ore?",
              {
                true: "Position and view converge on the ore before it could have been seen.",
                false: "Nothing anticipates it.",
              },
            ),
          },
        );
        each.push(res.answers.anticipates.noul);
      }
      const res = await ask(
        {
          task: `${TASK}\n\n${EVASION_NOTE}`,
          approachesJudgedOneAtATime: each.map((p, i) => ({ approach: i + 1, anticipatesOre: p })),
        },
        {
          approach_targeting: noul(
            "Each approach in this session was judged separately for whether it anticipated the ore; the probabilities are in approachesJudgedOneAtATime. A single approach that meets ore proves nothing. Taken together, do they show a player who knew where the ore was?",
            {
              true: "Anticipation recurs across the approaches rather than appearing once.",
              false: "Anticipation is absent, or appears once among approaches that show none.",
            },
          ),
        },
      );
      return { answers: res.answers, route: `${approaches.length} approaches`, each };
    },
  },
};

const backend = createTypeSafeBackend({ apiKey: process.env.TYPESAFE_API_KEY });
const ask = (state, questions) => backend.systemOne({ state, questions, model: "jev-latest" });
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
    const trace = buildTrace(f.sessionId);
    if (trace.length === 0) continue;
    const state = { task: v.task, ...evidenceFor(f) };
    const label = labels.get(f.sessionId);
    let answers;
    let route = null;
    let extra = {};

    if (v.run) {
      // A variant whose shape does not fit one or two fixed calls drives the backend itself.
      const r = await v.run({ f, ask });
      answers = r.answers;
      route = r.route ?? null;
      extra = { each: r.each };
    } else if (v.stage1) {
      // Two calls. The first looks at the same trace and answers something that is not a verdict;
      // the second is chosen by that answer. Nothing numeric is compared, so no threshold enters.
      const first = await backend.systemOne({ state, questions: v.stage1, model: "jev-latest" });
      route = v.routeOn(first.answers);
      const second = v.stage2[route] ?? v.stage2.default;
      const res = await backend.systemOne({
        state: { ...state, ...(v.carry ? v.carry(first.answers) : {}) },
        questions: second,
        model: "jev-latest",
      });
      answers = res.answers;
    } else {
      const res = await backend.systemOne({
        state,
        questions: v.questions ?? { approach_targeting: v.question },
        model: "jev-latest",
      });
      answers = res.answers;
    }

    results.push({
      sessionId: f.sessionId,
      subtype: label.subtype,
      positive: label.label !== "legit",
      route,
      // A variant with several questions is combined with max: suspicious if any one of the
      // independent signals fires. Nothing is weighted and nothing is fitted, so a split variant
      // cannot beat a single question by having a combiner tuned for it.
      score: Math.max(...Object.values(answers).map((a) => a.noul)),
      parts: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.noul])),
      ...extra,
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
