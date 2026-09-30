#!/usr/bin/env node
// EVIDENCE: raw every experiment sends approach traces built from plugin telemetry. Decision D1.
// ACCESS: open only. Reads datasets/splits2/dev-*.jsonl and nothing else. See datasets/ACCESS.md.
//
// A wide search over what to ask, what to show and how to structure the calls.
//
// Read its output with one thing in mind. Trying many variants on the same 80 sessions and keeping
// the best guarantees the winner looks better here than it is: that is selection, not skill, and
// it grows with the number of variants tried. It is allowed because this is open data and the
// winner will be frozen and measured once on sealed sessions. Every run is appended to
// docs/tuning-ledger.jsonl so the number of things tried is on the record next to the winner.
//
// Nothing here chooses a threshold (decision D2). Variants are compared on AUC, on AUC per
// evasion style, and on how many cheats outrank every legitimate session. Aggregations across
// approaches or repeats are plain means, medians and maxima, with no fitted weight.
//
// usage: node scripts/tune-grid.mjs --raw <dir>[,<dir>] --round <name>
//          [--only <id>,<id>] [--repeat 3] [--concurrency 8] [--limit <n>]
import fs from "node:fs";
import { parseArgs } from "node:util";
import {
  aboveEveryLegit,
  auc,
  choice,
  createAsk,
  loadDev,
  loadTelemetry,
  makeTraceBuilder,
  mean,
  median,
  noul,
  perLegit,
  perStyle,
  pool,
  score,
  sd,
  traceNote,
} from "./lib/tuning.mjs";

const { values } = parseArgs({
  options: {
    raw: { type: "string" },
    round: { type: "string", default: "r1" },
    only: { type: "string" },
    repeat: { type: "string", default: "3" },
    concurrency: { type: "string", default: "8" },
    limit: { type: "string" },
    list: { type: "boolean", default: false },
  },
});

const TASK =
  "A Minecraft player mined underground. Decide whether their movement before hidden ores became visible looked like deliberate approaches toward ores whose position they already knew, rather than ordinary tunnelling that happened to meet them.";
const EVASION =
  "Two things are not evidence of innocence. A cheat can dig ordinary tunnel between targets until its ore-per-block rate looks unremarkable, and a cheat can wander on the way to ore it already knows about so its paths are not straight. Both are produced on purpose. Judge on whether the movement and the view anticipate the ore.";
const HONEST =
  "For contrast, an honest miner's view follows their own digging, and ore turns up in the face they were already cutting or in a wall they were passing. They have no reason to look at solid rock in one particular place.";

const DETOUR =
  "A wandering route says nothing either way. What matters is how the approach ends: whether the last part of the path and the view turn onto the position of the ore while it is still buried.";
const CAVE =
  "A player in a cave walks toward ore they can see in the wall and then digs into the wall around it, which exposes ore that was hidden behind. Their position and view converge on that hidden ore before it appears, but they were following ore they could see. That is ordinary play. Anticipation means converging on ore that was buried in solid rock with nothing visible to lead there.";

/* ------------------------------------------------------------------ prompts
   Each returns { task, question } given the sentence describing the trace. */
const YES_ANTICIPATES = "Position and view converge on the ore before it could have been seen.";
const NO_ANTICIPATES =
  "Nothing anticipates it. The player was going where they were going and the ore happened to be there.";

const PROMPTS = {
  plain: (note) => ({
    task: TASK,
    text: `${note} Did this movement look like deliberate approaches toward ore whose position the player already knew, rather than ordinary tunnelling that happened to meet it?`,
    yes: "The path goes to the ore and the view settles on it before it is exposed.",
    no: "The path would have gone where it went regardless; the ore lies along it and the view does not anticipate it.",
  }),
  evasion: (note) => ({
    task: `${TASK}\n\n${EVASION}`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  "evasion+honest": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\n${HONEST}`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  honest: (note) => ({
    task: `${TASK}\n\n${HONEST}`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  short: (note) => ({
    task: "Minecraft mining telemetry.",
    text: `${note} Did the player know where the ore was before it was visible?`,
    yes: "They knew.",
    no: "They did not know.",
  }),
  view: (note) => ({
    task: `${TASK}\n\n${EVASION}`,
    text: `${note} Judge mainly from the view. Were yaw and pitch aimed at the ore's position before it was exposed, while it was still behind solid rock?`,
    yes: "The view sits on the ore's position ahead of the reveal.",
    no: "The view follows the digging and reaches the ore only when it appears.",
  }),
  explain: (note) => ({
    task: `${TASK}\n\n${EVASION}`,
    text: `${note} Is this movement explained better by the player knowing where the ore was than by the player not knowing?`,
    yes: "Knowing the position explains the route and the view; not knowing leaves them unexplained.",
    no: "Not knowing explains it just as well or better.",
  }),
  distance: (note) => ({
    task: `${TASK}\n\n${EVASION}`,
    text: `${note} Look at how the distance to the ore changes. Does the player close on the ore and stop there, rather than pass it or meet it side-on?`,
    yes: "Distance falls toward zero and the dig ends at the ore.",
    no: "Distance is unrelated to the ore until the moment it appears.",
  }),
  // The evasion framing plus what to look for, spelled out.
  tells: (note) => ({
    task: `${TASK}\n\n${EVASION}\n\nThings that show anticipation: the heading or the view pointing at the ore's position while it was still buried; a turn that brings the player onto a line toward the ore; digging that stops at the ore instead of carrying on; the same thing happening at more than one ore.`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // The evasion framing plus a reminder that most players are honest.
  "base-rate": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\nMost players are honest. Ore is common enough underground that an ordinary tunnel meets it regularly, so meeting ore is not itself evidence of anything.`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // The evasion framing alone, without the task paragraph in front of it.
  // Aimed at the style that still ranks lowest: a cheat that wanders before it arrives.
  detour: (note) => ({
    task: `${TASK}\n\n${EVASION}\n\nA wandering route says nothing either way. What matters is how the approach ends: whether the last part of the path and the view turn onto the position of the ore while it is still buried.`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // Asks for the comparison with a world in which the ore was not there.
  counterfactual: (note) => ({
    task: `${TASK}\n\n${EVASION}`,
    text: `${note} If the ore had not been there, would the player have moved and looked the same way?`,
    yes: "No. The route or the view only makes sense because the ore was there.",
    no: "Yes. The player would have done the same; the ore happened to be on the way.",
  }),
  // The evasion framing with both additions that helped a single call.
  "evasion+base-rate+honest": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\n${HONEST}\n\nMost players are honest. Ore is common enough underground that an ordinary tunnel meets it regularly, so meeting ore is not itself evidence of anything.`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // The detour wording with the reminder that most players are honest.
  "detour+base-rate": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\nA wandering route says nothing either way. What matters is how the approach ends: whether the last part of the path and the view turn onto the position of the ore while it is still buried.\n\nMost players are honest. Ore is common enough underground that an ordinary tunnel meets it regularly, so meeting ore is not itself evidence of anything.`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // The detour wording plus what a cave looks like, for traces that carry the open-face counts.
  "detour+cave": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\n${DETOUR}\n\n${CAVE}`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // Cave wording without the detour paragraph.
  "evasion+cave": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\n${CAVE}`,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
  // The cave paragraph as a question about the rock, not the route.
  "detour+cave-q": (note) => ({
    task: `${TASK}\n\n${EVASION}\n\n${DETOUR}`,
    text: `${note} Was this ore reached through solid rock by a player whose movement anticipated it, rather than found from open cave where ore is visible in the walls?`,
    yes: "Yes: the approach was through rock and the position and view converge on the ore before it could have been seen.",
    no: "No: the player was in open cave following what they could see, or nothing anticipates the ore.",
  }),
  "evasion-only": (note) => ({
    task: EVASION,
    text: `${note} Does the movement anticipate the ore?`,
    yes: YES_ANTICIPATES,
    no: NO_ANTICIPATES,
  }),
};

/* ------------------------------------------------------------ question types
   How the same prompt is asked, and how its answer becomes one number in 0..1. */
const QTYPES = {
  noul: {
    build: (p) => ({ q: noul(p.text, { true: p.yes, false: p.no }) }),
    read: (a) => ({ main: a.q.noul }),
  },
  score: {
    build: (p) => ({
      q: score(p.text, [
        `Clearly not. ${p.no}`,
        "Probably not.",
        "Cannot tell either way.",
        "Probably.",
        `Clearly. ${p.yes}`,
      ]),
    }),
    read: (a) => ({ main: a.q.score / 4 }),
  },
  choice: {
    build: (p) => ({
      q: choice(p.text, {
        legit: p.no,
        suspicious: "Some anticipation, not enough to be sure.",
        likely_xray: p.yes,
      }),
    }),
    // Two readings of one answer, both parameter-free.
    read: (a) => ({
      main: a.q.probabilities.likely_xray,
      notLegit: 1 - a.q.probabilities.legit,
    }),
  },
};

/* --------------------------------------------------------------- experiments */
const D = { points: 24, windowSec: 60, maxApproaches: 3 };
const single = (id, prompt, trace = {}, qtype = "noul") => ({
  id,
  structure: "single",
  prompt,
  qtype,
  trace: { ...D, ...trace },
});
const perApproach = (id, prompt, trace = {}, { qtype = "noul", judge = "set" } = {}) => ({
  id,
  structure: "per-approach",
  prompt,
  qtype,
  judge,
  trace: { ...D, maxApproaches: 8, ...trace },
});

// The leader after round 4, which round 5 varies one thing at a time.
const L = { points: 8, breaks: 0, maxApproaches: 12 };

const ROUNDS = {
  // Round 7: the open pool now holds cave mining by bots, the legitimate play that the frozen
  // questions scored as X-Ray on a person. The leader is re-measured with cave in the pool, and
  // then given what could tell cave from tunnel: the recorded open-face counts on breaks, block
  // breaks back in the trace, and wording that says what a cave looks like.
  r7: [
    perApproach("pa7-leader", "detour", { ...L, windowSec: 45 }),
    perApproach("pa7-leader-w60", "detour", { ...L }),
    perApproach("pa7-context", "detour", { ...L, windowSec: 45, context: true }),
    perApproach("pa7-context-breaks", "detour", { ...L, windowSec: 45, context: true, breaks: 8 }),
    perApproach("pa7-breaks", "detour", { ...L, windowSec: 45, breaks: 8 }),
    perApproach("pa7-cave", "detour+cave", { ...L, windowSec: 45 }),
    perApproach("pa7-cave-context", "detour+cave", { ...L, windowSec: 45, context: true }),
    perApproach("pa7-cave-context-breaks", "detour+cave", {
      ...L,
      windowSec: 45,
      context: true,
      breaks: 8,
    }),
    perApproach("pa7-evasion-cave-context-breaks", "evasion+cave", {
      ...L,
      windowSec: 45,
      context: true,
      breaks: 8,
    }),
    perApproach("pa7-caveq-context-breaks", "detour+cave-q", {
      ...L,
      windowSec: 45,
      context: true,
      breaks: 8,
    }),
    perApproach("pa7-cave-context-breaks-mat", "detour+cave", {
      ...L,
      windowSec: 45,
      context: true,
      breaks: 8,
      materials: true,
    }),
    perApproach("pa7-cave-context-breaks-a3", "detour+cave", {
      ...L,
      windowSec: 45,
      context: true,
      breaks: 8,
      maxApproaches: 3,
    }),
  ],
  // Round 6: round 5 had three things edge ahead of the reference: the detour wording, a 45
  // second window and the base-rate reminder. Each lead is two or three standard deviations on
  // 80 sessions, which many readings will produce by chance, so this round repeats them and
  // combines them. What survives a repeat is the candidate to freeze.
  r6: [
    perApproach("pa6-ref", "evasion", { ...L }),
    perApproach("pa6-detour", "detour", { ...L }),
    perApproach("pa6-w45", "evasion", { ...L, windowSec: 45 }),
    perApproach("pa6-detour-w45", "detour", { ...L, windowSec: 45 }),
    perApproach("pa6-detour-w50", "detour", { ...L, windowSec: 50 }),
    perApproach("pa6-detour-base-rate", "detour+base-rate", { ...L }),
    perApproach("pa6-detour-base-rate-w45", "detour+base-rate", { ...L, windowSec: 45 }),
    perApproach("pa6-detour-choice", "detour", { ...L }, { qtype: "choice" }),
    perApproach("pa6-detour-first3", "detour", { ...L }, { judge: "first3" }),
    perApproach("pa6-detour-a8", "detour", { ...L, maxApproaches: 8 }),
    perApproach("pa6-detour-a3", "detour", { ...L, maxApproaches: 3 }),
    perApproach("pa6-detour-p6", "detour", { ...L, points: 6 }),
    perApproach("pa6-detour-p10", "detour", { ...L, points: 10 }),
    perApproach("pa6-detour-noview", "detour", { ...L, view: false }),
    single("r6-detour-score", "detour", { points: 8, breaks: 0 }, "score"),
  ],
  // Round 5: the count of approaches alone separates the classes (AUC 0.83 at a cap of 12), so
  // readings that grow with the count are flattered. This round adds readings and a judge that
  // see the same number of answers for every session, goes after the detour style with wording,
  // and fills the gaps left around the leader: window, points, answer type and frame.
  r5: [
    perApproach("pa5-ref", "evasion", { ...L }),
    perApproach("pa5-judge-first3", "evasion", { ...L }, { judge: "first3" }),
    perApproach("pa5-detour", "detour", { ...L }),
    perApproach("pa5-counterfactual", "counterfactual", { ...L }),
    perApproach("pa5-explain", "explain", { ...L }),
    perApproach("pa5-view", "view", { ...L }),
    perApproach("pa5-all-framing", "evasion+base-rate+honest", { ...L }),
    perApproach("pa5-base-rate", "base-rate", { ...L }),
    perApproach("pa5-choice", "evasion", { ...L }, { qtype: "choice" }),
    perApproach("pa5-p10", "evasion", { ...L, points: 10 }),
    perApproach("pa5-w45", "evasion", { ...L, windowSec: 45 }),
    perApproach("pa5-w75", "evasion", { ...L, windowSec: 75 }),
    perApproach("pa5-noview", "evasion", { ...L, view: false }),
    perApproach("pa5-absolute", "evasion", { ...L, frame: "absolute" }),
    perApproach("pa5-materials", "evasion", { ...L, breaks: 8, materials: true }),
  ],
  // Round 4: round 3 found two more things that help a sparse per-approach trace: leaving the
  // block breaks out, and judging more approaches. This round combines what has helped so far
  // and repeats the two leaders, since the best of many readings is flattered by selection and
  // a repeat is the only check available on open data.
  r4: [
    perApproach("pa4-nobreaks-again", "evasion", { points: 8, breaks: 0 }),
    perApproach("pa4-a16-again", "evasion", { points: 8, maxApproaches: 16 }),
    perApproach("pa4-nobreaks-a16", "evasion", { points: 8, breaks: 0, maxApproaches: 16 }),
    perApproach("pa4-nobreaks-a12", "evasion", { points: 8, breaks: 0, maxApproaches: 12 }),
    perApproach("pa4-nobreaks-a24", "evasion", { points: 8, breaks: 0, maxApproaches: 24 }),
    perApproach("pa4-nobreaks-score", "evasion", { points: 8, breaks: 0 }, { qtype: "score" }),
    perApproach("pa4-nobreaks-p6", "evasion", { points: 6, breaks: 0 }),
    perApproach("pa4-nobreaks-p12", "evasion", { points: 12, breaks: 0 }),
    perApproach("pa4-nobreaks-p4", "evasion", { points: 4, breaks: 0 }),
    perApproach("pa4-nobreaks-noview", "evasion", { points: 8, breaks: 0, view: false }),
    perApproach("pa4-nobreaks-base-rate", "base-rate", { points: 8, breaks: 0 }),
    perApproach("pa4-nobreaks-honest", "evasion+honest", { points: 8, breaks: 0 }),
    perApproach(
      "pa4-nobreaks-a16-score",
      "evasion",
      { points: 8, breaks: 0, maxApproaches: 16 },
      { qtype: "score" },
    ),
    single("r4-p8-nobreaks", "evasion", { points: 8, breaks: 0 }),
    single("r4-score-p8-nobreaks", "evasion", { points: 8, breaks: 0 }, "score"),
    single(
      "r4-score-a8-p8-nobreaks",
      "evasion",
      { points: 8, breaks: 0, maxApproaches: 8 },
      "score",
    ),
  ],
  // Round 3: round 2 found one effect larger than everything else. Judged one approach at a
  // time, fewer movement samples per approach ranked better at every step from 24 down to 8.
  // This round finds where that stops, and checks whether the other knobs still matter once the
  // trace is that sparse.
  r3: [
    perApproach("pa3-p6", "evasion", { points: 6 }),
    perApproach("pa3-p4", "evasion", { points: 4 }),
    perApproach("pa3-p3", "evasion", { points: 3 }),
    perApproach("pa3-p2", "evasion", { points: 2 }),
    perApproach("pa3-score-p8", "evasion", { points: 8 }, { qtype: "score" }),
    perApproach("pa3-score-p6", "evasion", { points: 6 }, { qtype: "score" }),
    perApproach("pa3-score-p4", "evasion", { points: 4 }, { qtype: "score" }),
    perApproach("pa3-p8-noview", "evasion", { points: 8, view: false }),
    perApproach("pa3-p8-nobreaks", "evasion", { points: 8, breaks: 0 }),
    perApproach("pa3-p8-breaks4", "evasion", { points: 8, breaks: 4 }),
    perApproach("pa3-p8-a16", "evasion", { points: 8, maxApproaches: 16 }),
    perApproach("pa3-p8-a4", "evasion", { points: 8, maxApproaches: 4 }),
    perApproach("pa3-p8-w90", "evasion", { points: 8, windowSec: 90 }),
    perApproach("pa3-p8-w30", "evasion", { points: 8, windowSec: 30 }),
    perApproach("pa3-p8-base-rate", "base-rate", { points: 8 }),
    perApproach("pa3-p8-plain", "plain", { points: 8 }),
    single("r3-p8", "evasion", { points: 8 }),
    single("r3-p4", "evasion", { points: 4 }),
    single("r3-score-p6", "evasion", { points: 6 }, "score"),
    single("r3-score-p4", "evasion", { points: 4 }, "score"),
    single("r3-score-a8-p4", "evasion", { maxApproaches: 8, points: 4 }, "score"),
    single("r3-score-p8-base-rate", "base-rate", { points: 8 }, "score"),
  ],
  // Round 2: follow what round 1 found. Judging approaches one at a time was best, fewer points
  // per approach beat more, the rubric score beat the yes/no probability, and the evasion framing
  // was worth more than any other wording. Each of those is pushed further here, alone and in
  // combination, and the field the earlier bench carried is tested as a switch.
  r2: [
    // single call
    single("r2-ref", "evasion"),
    single("r2-marker", "evasion", { revealMarker: true }),
    single("r2-score-p12", "evasion", { points: 12 }, "score"),
    single("r2-score-p8", "evasion", { points: 8 }, "score"),
    single("r2-score-p16", "evasion", { points: 16 }, "score"),
    single("r2-score-marker", "evasion", { points: 12, revealMarker: true }, "score"),
    single("r2-tells", "tells", { points: 12 }),
    single("r2-base-rate", "base-rate", { points: 12 }),
    single("r2-evasion-only", "evasion-only", { points: 12 }),
    single("r2-score-a8-p8", "evasion", { maxApproaches: 8, points: 8 }, "score"),
    // one approach at a time
    perApproach("pa-ref", "evasion"),
    perApproach("pa-p12", "evasion", { points: 12 }),
    perApproach("pa-p8", "evasion", { points: 8 }),
    perApproach("pa-p16", "evasion", { points: 16 }),
    perApproach("pa-a12", "evasion", { maxApproaches: 12 }),
    perApproach("pa-a16", "evasion", { maxApproaches: 16 }),
    perApproach("pa-score", "evasion", {}, { qtype: "score" }),
    perApproach("pa-score-p12", "evasion", { points: 12 }, { qtype: "score" }),
    perApproach("pa-judge-score", "evasion", {}, { judge: "set-score" }),
    perApproach("pa-judge-trace", "evasion", {}, { judge: "set+trace" }),
    perApproach("pa-noview", "evasion", { view: false }),
    perApproach("pa-nobreaks", "evasion", { breaks: 0 }),
    perApproach("pa-w45", "evasion", { windowSec: 45 }),
    perApproach("pa-w90", "evasion", { windowSec: 90 }),
    perApproach("pa-marker", "evasion", { revealMarker: true }),
    perApproach("pa-tells", "tells"),
    perApproach("pa-base-rate", "base-rate"),
  ],
  // Round 1: one factor at a time around the best known configuration, so that what moves the
  // number can be told apart from what does not.
  r1: [
    // what is asked
    single("p-plain", "plain"),
    single("p-evasion", "evasion"),
    single("p-evasion+honest", "evasion+honest"),
    single("p-honest", "honest"),
    single("p-short", "short"),
    single("p-view", "view"),
    single("p-explain", "explain"),
    single("p-distance", "distance"),
    // how it is asked
    single("q-score", "evasion", {}, "score"),
    single("q-choice", "evasion", {}, "choice"),
    // what is shown
    single("t-points12", "evasion", { points: 12 }),
    single("t-points48", "evasion", { points: 48 }),
    single("t-window30", "evasion", { windowSec: 30 }),
    single("t-window120", "evasion", { windowSec: 120 }),
    single("t-approach1", "evasion", { maxApproaches: 1 }),
    single("t-approach5", "evasion", { maxApproaches: 5, points: 16 }),
    single("t-absolute", "evasion", { frame: "absolute" }),
    single("t-materials", "evasion", { materials: true }),
    single("t-nobreaks", "evasion", { breaks: 0 }),
    single("t-noview", "evasion", { view: false }),
    // how the calls are structured
    perApproach("s-per-approach", "evasion"),
    perApproach("s-per-approach48", "evasion", { points: 48 }),
    perApproach("s-per-approach-view", "view"),
  ],
};

if (values.list) {
  for (const [name, list] of Object.entries(ROUNDS)) {
    console.log(`${name}: ${list.map((e) => e.id).join(", ")}`);
  }
  process.exit(0);
}
if (!values.raw) {
  console.error("usage: node scripts/tune-grid.mjs --raw <dir>[,<dir>] --round <name>");
  process.exit(1);
}

const round = ROUNDS[values.round];
if (!round) {
  console.error(`unknown round "${values.round}"; have ${Object.keys(ROUNDS).join(", ")}`);
  process.exit(1);
}
const only = values.only ? new Set(values.only.split(",").map((s) => s.trim())) : null;
const experiments = round.filter((e) => !only || only.has(e.id));
const REPEAT = Number(values.repeat);
const CONCURRENCY = Number(values.concurrency);

const { sessions: allSessions, labels } = loadDev();
const telemetry = loadTelemetry(values.raw.split(","));
const build = makeTraceBuilder(telemetry);
// A session with no ore reveal has no approach to show, for any experiment.
let sessions = allSessions.filter((f) => build(f.sessionId, { maxApproaches: 1 }).length > 0);
if (values.limit) sessions = sessions.slice(0, Number(values.limit));
const ask = createAsk();

async function runOnce(exp) {
  const note = traceNote(exp.trace);
  const p = PROMPTS[exp.prompt](note);
  const qt = QTYPES[exp.qtype];

  return pool(sessions, CONCURRENCY, async (f) => {
    const label = labels.get(f.sessionId);
    const base = {
      sessionId: f.sessionId,
      subtype: label.subtype,
      positive: label.label !== "legit",
    };
    const approaches = build(f.sessionId, exp.trace);

    if (exp.structure === "single") {
      const res = await ask({ task: p.task, approaches }, qt.build(p));
      return { ...base, scores: qt.read(res.answers) };
    }

    // per-approach: each approach judged alone at full resolution, then the set judged.
    const oneNote = note.replace(/^Each approach gives/, "This is one approach. It gives");
    const one = PROMPTS[exp.prompt](oneNote);
    const each = [];
    for (const a of approaches) {
      const res = await ask({ task: one.task, approach: a }, qt.build(one));
      each.push(qt.read(res.answers).main);
    }

    // The set is judged from the model's own per-approach answers. "set+trace" also shows a
    // compact trace, to see whether the judge does better with the movement in front of it.
    const judge = exp.judge ?? "set";
    const judgeState = {
      task: p.task,
      approachesJudgedOneAtATime: (judge === "first3" ? each.slice(0, 3) : each).map((v, i) => ({
        approach: i + 1,
        anticipatesOre: v,
      })),
      ...(judge === "set+trace"
        ? { approaches: build(f.sessionId, { ...exp.trace, maxApproaches: 3, points: 12 }) }
        : {}),
    };
    const judgePrompt = {
      text: "Each approach in this session was judged separately for whether it anticipated the ore; the values are in approachesJudgedOneAtATime, from 0 for no anticipation to 1 for clear anticipation. A single approach that meets ore proves nothing. Taken together, do they show a player who knew where the ore was?",
      yes: "Anticipation recurs across the approaches rather than appearing once.",
      no: "Anticipation is absent, or appears once among approaches that show none.",
    };
    const jt = QTYPES[judge === "set-score" ? "score" : "noul"];
    const judged = await ask(judgeState, jt.build(judgePrompt));
    const sorted = [...each].sort((a, b) => b - a);
    return {
      ...base,
      each,
      scores: {
        main: jt.read(judged.answers).main,
        mean: mean(each),
        median: median(each),
        max: sorted[0],
        min: sorted[sorted.length - 1],
        // The strongest few approaches, averaged. Three is a fixed count, not a fitted one.
        top3: mean(sorted.slice(0, 3)),
        // The first few approaches in order: the same number of answers for every session that
        // has them, so the reading cannot grow with how much ore a session met.
        first2: mean(each.slice(0, 2)),
        first3: mean(each.slice(0, 3)),
      },
    };
  });
}

const summarise = (rows, key) => {
  const rs = rows.map((r) => ({ ...r, score: r.scores[key] }));
  return {
    auc: auc(rs),
    perStyle: perStyle(rs),
    perLegit: perLegit(rs),
    top: aboveEveryLegit(rs),
    n: rs.length,
  };
};

fs.mkdirSync("reports/grid", { recursive: true });
const LEDGER = "docs/tuning-ledger.jsonl";
const f3 = (v) => (v === null ? "  -  " : v.toFixed(3));

console.log(
  `round ${values.round}: ${experiments.length} experiments x ${REPEAT} repeats on ${sessions.length} sessions, concurrency ${CONCURRENCY}\n`,
);
console.log(
  `${"experiment".padEnd(28)} ${"AUC mean".padStart(8)} ${"sd".padStart(6)}   detour direct human thrott   branch   cave   top`,
);

for (const exp of experiments) {
  const started = Date.now();
  const callsBefore = ask.calls();
  const runs = [];
  for (let k = 0; k < REPEAT; k++) {
    const rows = await runOnce(exp);
    runs.push(rows);
    fs.writeFileSync(
      `reports/grid/${values.round}.${exp.id}.r${k}.json`,
      `${JSON.stringify(rows)}\n`,
    );
  }
  const keys = Object.keys(runs[0][0].scores);
  for (const key of keys) {
    const per = runs.map((rows) => summarise(rows, key));
    const name = key === "main" ? exp.id : `${exp.id}#${key}`;
    const styles = ["detour_xray", "direct_xray", "humanized_xray", "throttled_xray"];
    const styleMeans = styles.map((s) => mean(per.map((x) => x.perStyle[s] ?? 0)));
    const legitKinds = ["branch_mining", "cave_mining"];
    const legitMeans = legitKinds.map((k) => mean(per.map((x) => x.perLegit[k] ?? 0)));
    console.log(
      `${name.padEnd(28)} ${f3(mean(per.map((x) => x.auc))).padStart(8)} ${f3(sd(per.map((x) => x.auc))).padStart(6)}   ${styleMeans.map((v) => v.toFixed(2).padStart(6)).join(" ")}   ${legitMeans.map((v) => v.toFixed(2).padStart(6)).join(" ")}   ${mean(per.map((x) => x.top)).toFixed(1)}`,
    );
    fs.appendFileSync(
      LEDGER,
      `${JSON.stringify({
        at: new Date().toISOString(),
        round: values.round,
        id: name,
        structure: exp.structure,
        prompt: exp.prompt,
        qtype: exp.qtype,
        ...(exp.judge ? { judge: exp.judge } : {}),
        trace: exp.trace,
        reading: key,
        sessions: sessions.length,
        repeats: REPEAT,
        auc: per.map((x) => Number(x.auc.toFixed(4))),
        aucMean: Number(mean(per.map((x) => x.auc)).toFixed(4)),
        aucSd: Number(sd(per.map((x) => x.auc)).toFixed(4)),
        perStyle: Object.fromEntries(styles.map((s, i) => [s, Number(styleMeans[i].toFixed(4))])),
        perLegit: Object.fromEntries(
          legitKinds.map((k, i) => [k, Number(legitMeans[i].toFixed(4))]),
        ),
        aboveEveryLegit: per.map((x) => x.top),
        calls: key === keys[0] ? ask.calls() - callsBefore : 0,
        seconds: key === keys[0] ? Math.round((Date.now() - started) / 1000) : 0,
      })}\n`,
    );
  }

  // The same question asked REPEAT times and averaged per session: variance reduction with no
  // parameter. Reported as its own reading so it can be compared with a single ask.
  if (REPEAT > 1) {
    const ens = runs[0].map((r, i) => ({
      ...r,
      score: mean(runs.map((rows) => rows[i].scores.main)),
    }));
    console.log(
      `${`${exp.id}#ensemble`.padEnd(28)} ${f3(auc(ens)).padStart(8)} ${"".padStart(6)}   ${Object.values(
        perStyle(ens),
      )
        .map((v) => v.toFixed(2).padStart(6))
        .join(" ")}   ${aboveEveryLegit(ens)}`,
    );
    fs.appendFileSync(
      LEDGER,
      `${JSON.stringify({
        at: new Date().toISOString(),
        round: values.round,
        id: `${exp.id}#ensemble`,
        structure: exp.structure,
        prompt: exp.prompt,
        qtype: exp.qtype,
        ...(exp.judge ? { judge: exp.judge } : {}),
        trace: exp.trace,
        reading: `mean of ${REPEAT} asks`,
        sessions: sessions.length,
        repeats: 1,
        auc: [Number(auc(ens).toFixed(4))],
        aucMean: Number(auc(ens).toFixed(4)),
        aucSd: 0,
        perStyle: Object.fromEntries(
          Object.entries(perStyle(ens)).map(([k, v]) => [k, Number(v.toFixed(4))]),
        ),
        aboveEveryLegit: [aboveEveryLegit(ens)],
        calls: 0,
        seconds: 0,
      })}\n`,
    );
  }
}
console.log(`\n${ask.calls()} calls. Ledger: ${LEDGER}`);
