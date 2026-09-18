import type { Bot } from "mineflayer";
// CommonJS package: named imports are not detectable under native ESM.
import type { Movements as MovementsClass } from "mineflayer-pathfinder";
import pathfinderPkg from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

const { goals, Movements } = pathfinderPkg;

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

/** Pathfinder movements that tunnel through stone and never build. */
export function tunnelMovements(bot: Bot): MovementsClass {
  const m = new Movements(bot);
  m.canDig = true;
  m.allow1by1towers = false;
  m.allowParkour = false;
  m.allowSprinting = false;
  m.scafoldingBlocks = [];
  m.digCost = 1;
  m.placeCost = 1000;
  return m;
}

/** Walks/digs to stand on (x, y, z). Rejects on timeout so a stuck bot does not hang the run. */
export async function goTo(bot: Bot, target: Vec3, timeoutMs: number): Promise<boolean> {
  const goal = new goals.GoalBlock(target.x, target.y, target.z);
  try {
    await Promise.race([
      bot.pathfinder.goto(goal),
      sleep(timeoutMs).then(() => {
        throw new Error("goto timeout");
      }),
    ]);
    return true;
  } catch {
    bot.pathfinder.stop();
    return false;
  }
}

/** Walks/digs until within `range` of the block. */
export async function goNear(
  bot: Bot,
  target: Vec3,
  range: number,
  timeoutMs: number,
): Promise<boolean> {
  const goal = new goals.GoalNear(target.x, target.y, target.z, range);
  try {
    await Promise.race([
      bot.pathfinder.goto(goal),
      sleep(timeoutMs).then(() => {
        throw new Error("goto timeout");
      }),
    ]);
    return true;
  } catch {
    bot.pathfinder.stop();
    return false;
  }
}

/** Digs one block if it is diggable and within reach. */
export async function digAt(bot: Bot, pos: Vec3): Promise<boolean> {
  const block = bot.blockAt(pos);
  if (!block || block.name === "air" || block.name === "cave_air" || !bot.canDigBlock(block))
    return false;
  try {
    await bot.dig(block, true);
    return true;
  } catch {
    return false;
  }
}

/** The X-Ray primitive: the bot reads world data it could not legitimately see. */
export function findOre(bot: Bot, names: string[], maxDistance: number): Vec3 | null {
  const ids = names
    .map((n) => bot.registry.blocksByName[n]?.id)
    .filter((id): id is number => id !== undefined);
  const block = bot.findBlock({ matching: ids, maxDistance, count: 1 });
  return block ? block.position : null;
}

/** A neighbouring ore that is actually visible (has an air face), which a legit miner may notice. */
export function visibleOreNear(bot: Bot, names: string[], maxDistance: number): Vec3 | null {
  const ids = names
    .map((n) => bot.registry.blocksByName[n]?.id)
    .filter((id): id is number => id !== undefined);
  const candidates = bot.findBlocks({ matching: ids, maxDistance, count: 16 });
  for (const pos of candidates) {
    for (const d of [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 1, 0),
      new Vec3(0, -1, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
    ]) {
      const n = bot.blockAt(pos.plus(d));
      if (n && (n.name === "air" || n.name === "cave_air")) return pos;
    }
  }
  return null;
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
