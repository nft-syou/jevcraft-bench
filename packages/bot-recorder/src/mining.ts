import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";

export interface Rng {
  next(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const DIAMOND_ORES = ["diamond_ore", "deepslate_diamond_ore"];
export const LOW_VALUE_ORES = ["coal_ore", "deepslate_coal_ore", "iron_ore", "deepslate_iron_ore"];

const PASSABLE = new Set(["air", "cave_air", "void_air"]);
const LIQUID = ["lava", "water"];
/** Lowest y a scenario may target; below it the floor is bedrock and steps fail. */
export const MIN_TARGET_Y = -59;
const DIG_TIMEOUT_MS = 10_000;

export const isPassable = (bot: Bot, pos: Vec3): boolean => {
  const b = bot.blockAt(pos);
  return b === null || PASSABLE.has(b.name);
};

const isLiquid = (bot: Bot, pos: Vec3): boolean => {
  const b = bot.blockAt(pos);
  return b !== null && LIQUID.some((d) => b.name.includes(d));
};

const isUndiggable = (bot: Bot, pos: Vec3): boolean => {
  const b = bot.blockAt(pos);
  return b !== null && !PASSABLE.has(b.name) && (b.name === "bedrock" || isLiquid(bot, pos));
};

/** Digs one block if it is solid, diggable and within reach. Never hangs on an unreachable block. */
export async function digAt(bot: Bot, pos: Vec3): Promise<boolean> {
  const block = bot.blockAt(pos);
  if (!block || PASSABLE.has(block.name) || !bot.canDigBlock(block)) return false;
  if (bot.entity.position.distanceTo(pos.offset(0.5, 0.5, 0.5)) > 5) return false;
  try {
    await Promise.race([
      bot.dig(block, true),
      sleep(DIG_TIMEOUT_MS).then(() => {
        throw new Error("dig timeout");
      }),
    ]);
    return true;
  } catch {
    try {
      bot.stopDigging();
    } catch {
      // ignore
    }
    return false;
  }
}

/** Walks the bot into the centre of a cell it can already stand in. */
async function walkInto(bot: Bot, cell: Vec3, jump: boolean, timeoutMs: number): Promise<boolean> {
  const centre = cell.offset(0.5, 0, 0.5);
  await bot.lookAt(centre.offset(0, 1.62, 0), true);
  bot.setControlState("forward", true);
  if (jump) bot.setControlState("jump", true);
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      const p = bot.entity.position;
      const dx = p.x - centre.x;
      const dz = p.z - centre.z;
      if (Math.sqrt(dx * dx + dz * dz) < 0.3 && Math.abs(p.y - cell.y) < 0.6) return true;
      await sleep(50);
    }
    return false;
  } finally {
    bot.setControlState("forward", false);
    bot.setControlState("jump", false);
  }
}

/**
 * One tunnelling step into the horizontally adjacent cell `next` (dy in -1..1): clears the
 * 1x2 space, makes sure there is a floor, then walks (or jumps) into it.
 */
export async function stepInto(bot: Bot, next: Vec3): Promise<boolean> {
  const here = bot.entity.position.floored();
  const dy = next.y - here.y;
  if (Math.abs(dy) > 1) return false;
  // Refuse to open liquids or hit bedrock; a bedrock floor is fine to stand on.
  for (const p of [next, next.offset(0, 1, 0), here.offset(0, 2, 0), next.offset(0, 2, 0)]) {
    if (isUndiggable(bot, p)) return false;
  }
  if (isLiquid(bot, next.offset(0, -1, 0))) return false;
  await digAt(bot, next);
  await digAt(bot, next.offset(0, 1, 0));
  if (dy > 0) await digAt(bot, here.offset(0, 2, 0));
  if (dy < 0) await digAt(bot, next.offset(0, 2, 0));
  if (isPassable(bot, next.offset(0, -1, 0))) return false; // no floor: would fall into a cave
  return walkInto(bot, next, dy > 0, 4000);
}

/** Distance from point p to the 2D line through a and b (xz plane). */
function distanceToLineXZ(p: Vec3, a: Vec3, b: Vec3): number {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len = Math.hypot(vx, vz);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z);
  return Math.abs(vx * (p.z - a.z) - vz * (p.x - a.x)) / len;
}

/**
 * Next cell one axis-step closer to `goal`, choosing the x or z step that stays nearest the
 * straight line from `start` to `goal` (Bresenham-like), moving at most one level per step.
 */
export function nextCellToward(from: Vec3, goal: Vec3, start: Vec3 = from): Vec3 {
  const dx = goal.x - from.x;
  const dz = goal.z - from.z;
  const dy = goal.y - from.y;
  const stepY = dy !== 0 ? Math.sign(dy) : 0;
  if (dx === 0 && dz === 0) return from.offset(0, Math.sign(dy), 0);
  if (dx === 0) return from.offset(0, stepY, Math.sign(dz));
  if (dz === 0) return from.offset(Math.sign(dx), stepY, 0);
  const viaX = from.offset(Math.sign(dx), stepY, 0);
  const viaZ = from.offset(0, stepY, Math.sign(dz));
  return distanceToLineXZ(viaX, start, goal) <= distanceToLineXZ(viaZ, start, goal) ? viaX : viaZ;
}

export interface TunnelOptions {
  /** Stop when this returns true (checked before every step). */
  stopWhen?: () => boolean;
  deadline: number;
  onStep?: (cell: Vec3) => Promise<void> | void;
  /** Where to look after each step (an X-Ray user keeps glancing at the ore they can "see"). */
  lookAt?: Vec3;
}

/**
 * Digs a tunnel from the bot's cell toward `goal` one step at a time. Returns the final cell.
 * A horizontal goal on the same level yields a straight or 45° line; that is the point.
 */
export async function tunnelTo(
  bot: Bot,
  goal: Vec3,
  opts: TunnelOptions,
): Promise<{ cell: Vec3; reached: boolean }> {
  let cell = bot.entity.position.floored();
  const start = cell.clone();
  let failures = 0;
  while (Date.now() < opts.deadline) {
    if (opts.stopWhen?.()) return { cell, reached: true };
    if (cell.x === goal.x && cell.z === goal.z && Math.abs(cell.y - goal.y) <= 1) {
      return { cell, reached: true };
    }
    const next = nextCellToward(cell, goal, start);
    if (next.x === cell.x && next.z === cell.z) return { cell, reached: true };
    const ok = await stepInto(bot, next);
    if (!ok) {
      failures++;
      if (failures >= 3) return { cell, reached: false };
      await sleep(300);
      cell = bot.entity.position.floored();
      continue;
    }
    failures = 0;
    cell = bot.entity.position.floored();
    if (opts.lookAt) await bot.lookAt(opts.lookAt.offset(0.5, 0.5, 0.5), true);
    if (opts.onStep) await opts.onStep(cell);
  }
  return { cell, reached: false };
}

/** The X-Ray primitive: the bot reads world data it could not legitimately see. */
export function findOre(
  bot: Bot,
  names: string[],
  maxDistance: number,
  maxDy = 3,
  minHorizontal = 0,
): Vec3 | null {
  const ids = names
    .map((n) => bot.registry.blocksByName[n]?.id)
    .filter((id): id is number => id !== undefined);
  const here = bot.entity.position;
  let best: Vec3 | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const pos of bot.findBlocks({ matching: ids, maxDistance, count: 64 })) {
    const dy = Math.abs(pos.y - here.y);
    if (dy > maxDy || pos.y < MIN_TARGET_Y) continue;
    if (Math.hypot(pos.x + 0.5 - here.x, pos.z + 0.5 - here.z) < minHorizontal) continue;
    const score = pos.distanceTo(here) + dy * 2;
    if (score < bestScore) {
      bestScore = score;
      best = pos;
    }
  }
  return best;
}

/** A neighbouring ore that is actually visible (has an open face), which a legit miner may notice. */
export function visibleOreNear(bot: Bot, names: string[], maxDistance: number): Vec3 | null {
  const ids = names
    .map((n) => bot.registry.blocksByName[n]?.id)
    .filter((id): id is number => id !== undefined);
  for (const pos of bot.findBlocks({ matching: ids, maxDistance, count: 16 })) {
    for (const d of [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 1, 0),
      new Vec3(0, -1, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ]) {
      if (isPassable(bot, pos.plus(d))) return pos;
    }
  }
  return null;
}

/** Mines every ore of `names` that is within reach and has an open face (the rest of a vein). */
export async function mineVisibleVein(bot: Bot, names: string[]): Promise<number> {
  let mined = 0;
  for (let i = 0; i < 12; i++) {
    const next = visibleOreNear(bot, names, 4);
    if (!next) break;
    await bot.lookAt(next.offset(0.5, 0.5, 0.5), true);
    if (!(await digAt(bot, next))) break;
    mined++;
  }
  return mined;
}

/** Tunnels until the ore is within reach, then mines it. */
export async function approachAndMine(bot: Bot, ore: Vec3, deadline: number): Promise<boolean> {
  const y0 = bot.entity.position.floored().y;
  const goal = new Vec3(ore.x, Math.max(y0 - 3, Math.min(y0 + 3, ore.y)), ore.z);
  const inReach = () =>
    bot.entity.position.offset(0, 1.62, 0).distanceTo(ore.offset(0.5, 0.5, 0.5)) <= 3.5;
  const { reached } = await tunnelTo(bot, goal, { deadline, stopWhen: inReach, lookAt: ore });
  if (!reached && !inReach()) return false;
  await bot.lookAt(ore.offset(0.5, 0.5, 0.5), true);
  return digAt(bot, ore);
}

/** Human-ish pause and glance, scaled by `noise` (0 = none). */
export async function fidget(bot: Bot, rng: Rng, noise: number): Promise<void> {
  if (noise <= 0) return;
  if (rng.next() < 0.3 * noise) {
    await bot.look(
      bot.entity.yaw + (rng.next() - 0.5) * Math.PI * noise,
      (rng.next() - 0.5) * 0.6,
      false,
    );
  }
  if (rng.next() < 0.5 * noise) await sleep(200 + rng.next() * 1500 * noise);
}
