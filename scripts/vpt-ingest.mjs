#!/usr/bin/env node
// Turns an OpenAI VPT contractor segment into something comparable with MiningSessionFeatures,
// so the legitimate class can be real humans instead of 63 bots and one volunteer.
//
// VPT records, per game tick, the player's position and view plus the full Minecraft statistics
// block. `minecraft.mine_block:<block>` is a cumulative counter, so blocks broken and valuable ore
// mined come straight out of it: no world save and no block-break events needed for the counting
// features. See docs/external-data.md for how this source was verified.
//
// WHAT IS APPROXIMATED, and it matters:
//   - Ore position is not recorded. It is estimated by casting a ray from the player's eye along
//     their view at the tick the ore counter increments, which is where they must have been
//     looking to mine it. Good to about a block; wrong if they mined it at a glancing angle.
//   - "Hidden ore reveal" cannot be determined at all. The extractor's 6-neighbour occlusion test
//     needs the surrounding blocks. Every valuable ore mined is treated as one approach target,
//     which over-counts: a human who breaks into an exposed vein gets approaches the real
//     extractor would not record.
// Both make this a source of legitimate-class comparison, not a drop-in replacement for the
// plugin's own telemetry. Nothing here should be mixed into datasets/features/ as if it were.
//
// usage: node scripts/vpt-ingest.mjs <segment.jsonl>... [--json <out>]
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: { json: { type: "string" } },
  allowPositionals: true,
});
if (positionals.length === 0) {
  console.error("usage: node scripts/vpt-ingest.mjs <segment.jsonl>... [--json <out>]");
  process.exit(1);
}

// Matches the plugin's configured ore list.
const VALUABLE = new Set([
  "minecraft.mine_block:minecraft.diamond_ore",
  "minecraft.mine_block:minecraft.deepslate_diamond_ore",
  "minecraft.mine_block:minecraft.emerald_ore",
  "minecraft.mine_block:minecraft.deepslate_emerald_ore",
  "minecraft.mine_block:minecraft.ancient_debris",
]);
const MINED = /^minecraft\.mine_block:/;
const EYE_HEIGHT = 1.62;
const REACH = 3.2; // typical break distance; the ray only needs to land in the right block
const APPROACH_WINDOW_MS = 60_000;
const UNDERGROUND_Y_MAX = 40; // the plugin's own threshold, applied here for comparability

// Minecraft's yaw/pitch convention, in degrees.
const lookVector = (yaw, pitch) => {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  return { x: -Math.sin(y) * Math.cos(p), y: -Math.sin(p), z: Math.cos(y) * Math.cos(p) };
};

function ingest(path) {
  const ticks = fs
    .readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (ticks.length < 2) return null;

  const totalMined = (stats) => {
    let n = 0;
    for (const [k, v] of Object.entries(stats ?? {})) if (MINED.test(k)) n += v;
    return n;
  };
  const totalValuable = (stats) => {
    let n = 0;
    for (const [k, v] of Object.entries(stats ?? {})) if (VALUABLE.has(k)) n += v;
    return n;
  };

  let movement = 0;
  let undergroundTicks = 0;
  const breaks = []; // ticks where the mined counter went up
  const oreEvents = []; // ticks where a valuable counter went up
  let prev = null;
  let prevMined = null;
  let prevValuable = null;

  for (const t of ticks) {
    if (prev) {
      movement += Math.hypot(t.xpos - prev.xpos, t.ypos - prev.ypos, t.zpos - prev.zpos);
    }
    if (t.ypos <= UNDERGROUND_Y_MAX) undergroundTicks++;
    const mined = totalMined(t.stats);
    const valuable = totalValuable(t.stats);
    if (prevMined !== null && mined > prevMined) breaks.push(t);
    if (prevValuable !== null && valuable > prevValuable) oreEvents.push(t);
    prevMined = mined;
    prevValuable = valuable;
    prev = t;
  }

  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const durationSec = (last.milli - first.milli) / 1000;
  const blocksBroken = totalMined(last.stats) - totalMined(first.stats);
  const valuableOreBlocksBroken = totalValuable(last.stats) - totalValuable(first.stats);

  // Approach geometry toward each ore, using the estimated ore position.
  const approaches = [];
  for (const ev of oreEvents) {
    const dir = lookVector(ev.yaw, ev.pitch);
    const ore = {
      x: ev.xpos + dir.x * REACH,
      y: ev.ypos + EYE_HEIGHT + dir.y * REACH,
      z: ev.zpos + dir.z * REACH,
    };
    const window = ticks.filter(
      (t) => t.milli >= ev.milli - APPROACH_WINDOW_MS && t.milli <= ev.milli,
    );
    if (window.length < 2) continue;
    let pathLength = 0;
    for (let i = 1; i < window.length; i++) {
      const a = window[i - 1];
      const b = window[i];
      pathLength += Math.hypot(b.xpos - a.xpos, b.ypos - a.ypos, b.zpos - a.zpos);
    }
    const start = window[0];
    const straight = Math.hypot(start.xpos - ore.x, start.ypos - ore.y, start.zpos - ore.z);
    if (pathLength < 1 || straight < 1) continue; // stationary; no approach to speak of
    // Same definitions the feature extractor uses.
    const directness = Math.min(1, straight / pathLength);
    const detourRatio = pathLength / straight;
    // Share of the window where the view was already within 30 degrees of the ore.
    let aimed = 0;
    for (const t of window) {
      const d = lookVector(t.yaw, t.pitch);
      const to = { x: ore.x - t.xpos, y: ore.y - (t.ypos + EYE_HEIGHT), z: ore.z - t.zpos };
      const mag = Math.hypot(to.x, to.y, to.z);
      if (mag < 0.5) continue;
      const cos = (d.x * to.x + d.y * to.y + d.z * to.z) / mag;
      if (cos > Math.cos((30 * Math.PI) / 180)) aimed++;
    }
    approaches.push({ directness, detourRatio, aimRatio: aimed / window.length });
  }

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const intervals = [];
  for (let i = 1; i < breaks.length; i++) intervals.push(breaks[i].milli - breaks[i - 1].milli);

  return {
    source: path.split(/[\\/]/).pop(),
    durationSec: Math.round(durationSec),
    undergroundShare: undergroundTicks / ticks.length,
    movementDistance: Math.round(movement),
    blocksBroken,
    valuableOreBlocksBroken,
    valuableOrePer100Blocks: blocksBroken > 0 ? (valuableOreBlocksBroken * 100) / blocksBroken : 0,
    meanBreakIntervalMs: intervals.length ? Math.round(mean(intervals)) : null,
    approachCount: approaches.length,
    meanDirectness: mean(approaches.map((a) => a.directness)),
    medianDetourRatio: median(approaches.map((a) => a.detourRatio)),
    aimAlignmentRatio: mean(approaches.map((a) => a.aimRatio)),
  };
}

const out = [];
for (const p of positionals) {
  const f = ingest(p);
  if (f) out.push(f);
}
const n2 = (v) => (v === null ? "   -" : v.toFixed(2));
console.log(
  "segment".padEnd(22),
  "sec",
  "u/g%",
  "move",
  "brk",
  "ore",
  "ore/100",
  "appr",
  "direct",
  "detour",
  "aim",
);
for (const f of out) {
  console.log(
    f.source.slice(0, 20).padEnd(22),
    String(f.durationSec).padStart(4),
    `${Math.round(f.undergroundShare * 100)}%`.padStart(5),
    String(f.movementDistance).padStart(5),
    String(f.blocksBroken).padStart(4),
    String(f.valuableOreBlocksBroken).padStart(4),
    f.valuableOrePer100Blocks.toFixed(2).padStart(7),
    String(f.approachCount).padStart(5),
    n2(f.meanDirectness).padStart(7),
    n2(f.medianDetourRatio).padStart(7),
    n2(f.aimAlignmentRatio).padStart(5),
  );
}
if (values.json) {
  fs.writeFileSync(values.json, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${values.json}`);
}
