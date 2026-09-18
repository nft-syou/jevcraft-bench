import type { BehaviorSubtype, GroundTruthLabel } from "@jevcraft/schema";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import {
  DIAMOND_ORES,
  digAt,
  fidget,
  findOre,
  goNear,
  goTo,
  LOW_VALUE_ORES,
  type Rng,
  sleep,
  visibleOreNear,
} from "./mining";

export interface ScenarioContext {
  bot: Bot;
  /** Where the bot was teleported; the scenario mines around here. */
  origin: Vec3;
  rng: Rng;
  /** 0 = robotic, 1 = fully noisy. */
  humanNoise: number;
  /** Stop mining after this many ms. */
  budgetMs: number;
  log: (line: string) => void;
}

export interface Scenario {
  name: string;
  label: GroundTruthLabel;
  subtype: BehaviorSubtype;
  description: string;
  run(ctx: ScenarioContext): Promise<void>;
}

const STEP_TIMEOUT_MS = 20_000;
const deadline = (ctx: ScenarioContext) => Date.now() + ctx.budgetMs;

/** Digs a straight 1x2 tunnel by pathing to successive blocks along `dir`. */
async function tunnel(
  ctx: ScenarioContext,
  from: Vec3,
  dir: Vec3,
  length: number,
  until: number,
): Promise<Vec3> {
  let pos = from;
  for (let i = 0; i < length && Date.now() < until; i++) {
    pos = pos.plus(dir);
    if (!(await goTo(ctx.bot, pos, STEP_TIMEOUT_MS))) {
      ctx.log(`stuck at ${pos}`);
      break;
    }
    await fidget(ctx.bot, ctx.rng, ctx.humanNoise);
  }
  return pos;
}

/** Legit: strip mining with side branches. Never looks through walls. */
export const legitBranchMining: Scenario = {
  name: "legit-branch-mining",
  label: "legit",
  subtype: "branch_mining",
  description:
    "Main tunnel along +x with 6-block branches every 4 blocks. Uses no hidden information.",
  async run(ctx) {
    const until = deadline(ctx);
    let pos = ctx.origin.clone();
    const branchLength = 6;
    for (let segment = 0; segment < 12 && Date.now() < until; segment++) {
      pos = await tunnel(ctx, pos, new Vec3(1, 0, 0), 4, until);
      const side = segment % 2 === 0 ? 1 : -1;
      const branchEnd = await tunnel(ctx, pos, new Vec3(0, 0, side), branchLength, until);
      // A legit miner mines ore they can see in the branch wall.
      const seen = visibleOreNear(ctx.bot, [...DIAMOND_ORES, ...LOW_VALUE_ORES], 3);
      if (seen) await digAt(ctx.bot, seen);
      if (!branchEnd.equals(pos)) await goTo(ctx.bot, pos, STEP_TIMEOUT_MS * 2);
    }
  },
};

async function mineTarget(ctx: ScenarioContext, ore: Vec3): Promise<void> {
  await goNear(ctx.bot, ore, 1, 90_000);
  await digAt(ctx.bot, ore);
}

/** Blatant X-Ray: reads ore positions from chunk data and tunnels straight to each. */
export const xrayDirect: Scenario = {
  name: "xray-direct",
  label: "simulated_xray",
  subtype: "direct_xray",
  description:
    "Finds the nearest diamond ore through the walls and digs the shortest path to it, repeatedly.",
  async run(ctx) {
    const until = deadline(ctx);
    for (let i = 0; i < 8 && Date.now() < until; i++) {
      const ore = findOre(ctx.bot, DIAMOND_ORES, 28);
      if (!ore) {
        ctx.log("no diamond within 28 blocks; moving on");
        await tunnel(ctx, ctx.bot.entity.position.floored(), new Vec3(1, 0, 0), 12, until);
        continue;
      }
      ctx.log(`target ${ore}`);
      await mineTarget(ctx, ore);
      await fidget(ctx.bot, ctx.rng, ctx.humanNoise);
    }
  },
};

/** Evasive X-Ray: knows the ore, but detours through a waypoint first. */
export const xrayDetour: Scenario = {
  name: "xray-detour",
  label: "simulated_xray",
  subtype: "detour_xray",
  description:
    "Same hidden knowledge as xray-direct, but adds a 4–8 block sideways waypoint before each ore.",
  async run(ctx) {
    const until = deadline(ctx);
    for (let i = 0; i < 8 && Date.now() < until; i++) {
      const ore = findOre(ctx.bot, DIAMOND_ORES, 28);
      if (!ore) {
        await tunnel(ctx, ctx.bot.entity.position.floored(), new Vec3(1, 0, 0), 12, until);
        continue;
      }
      const here = ctx.bot.entity.position.floored();
      const toOre = ore.minus(here);
      const sideways =
        Math.abs(toOre.x) >= Math.abs(toOre.z) ? new Vec3(0, 0, 1) : new Vec3(1, 0, 0);
      const offset = 4 + Math.floor(ctx.rng.next() * 5);
      const sign = ctx.rng.next() < 0.5 ? -1 : 1;
      const waypoint = here.plus(toOre.scaled(0.5).floored()).plus(sideways.scaled(offset * sign));
      waypoint.y = here.y;
      ctx.log(`target ${ore} via ${waypoint}`);
      await goTo(ctx.bot, waypoint, 60_000);
      await mineTarget(ctx, ore);
      await fidget(ctx.bot, ctx.rng, ctx.humanNoise);
    }
  },
};

/** Humanized X-Ray: ordinary branch mining interleaved with occasional targeted digs and low-value ore. */
export const xrayHumanized: Scenario = {
  name: "xray-humanized",
  label: "simulated_xray",
  subtype: "humanized_xray",
  description:
    "Alternates legit-looking strip mining with a targeted dig to a known diamond, mining coal/iron on the way.",
  async run(ctx) {
    const until = deadline(ctx);
    let pos = ctx.origin.clone();
    for (let round = 0; round < 6 && Date.now() < until; round++) {
      pos = await tunnel(ctx, pos, new Vec3(1, 0, 0), 6 + Math.floor(ctx.rng.next() * 4), until);
      const lowValue = findOre(ctx.bot, LOW_VALUE_ORES, 6);
      if (lowValue && ctx.rng.next() < 0.6) await mineTarget(ctx, lowValue);
      if (ctx.rng.next() < 0.7) {
        const ore = findOre(ctx.bot, DIAMOND_ORES, 20);
        if (ore) {
          ctx.log(`quiet target ${ore}`);
          await mineTarget(ctx, ore);
          await sleep(1000 + ctx.rng.next() * 3000);
        }
      }
      pos = ctx.bot.entity.position.floored();
    }
  },
};

export const SCENARIOS: readonly Scenario[] = [
  legitBranchMining,
  xrayDirect,
  xrayDetour,
  xrayHumanized,
];

export function getScenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found)
    throw new Error(
      `unknown scenario "${name}" (known: ${SCENARIOS.map((s) => s.name).join(", ")})`,
    );
  return found;
}
