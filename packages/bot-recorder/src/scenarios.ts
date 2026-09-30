import type { BehaviorSubtype, GroundTruthLabel } from "@jevcraft/schema";
import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import {
  approachAndMine,
  caveCellsNear,
  chipAround,
  DIAMOND_ORES,
  digAt,
  fidget,
  findOre,
  LOW_VALUE_ORES,
  mineVisibleVein,
  onBlockMined,
  oreInSight,
  type Rng,
  sleep,
  tunnelTo,
  visibleOreNear,
  walkToward,
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

const deadline = (ctx: ScenarioContext) => Date.now() + ctx.budgetMs;

const HEADINGS = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)];

/** Straight tunnel of `length` cells along `dir` from the bot's current cell. */
async function straight(
  ctx: ScenarioContext,
  dir: Vec3,
  length: number,
  until: number,
): Promise<{ cell: Vec3; reached: boolean }> {
  const from = ctx.bot.entity.position.floored();
  const goal = from.plus(dir.scaled(length));
  return tunnelTo(ctx.bot, goal, {
    deadline: until,
    onStep: () => fidget(ctx.bot, ctx.rng, ctx.humanNoise),
  });
}

/** Picks a different axis heading when a tunnel is blocked (lava, water, cave floor missing). */
function turn(current: Vec3, rng: Rng): Vec3 {
  const others = HEADINGS.filter((h) => !h.equals(current) && !h.equals(current.scaled(-1)));
  return others[Math.floor(rng.next() * others.length)] ?? current.scaled(-1);
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
    let main = new Vec3(1, 0, 0);
    for (let segment = 0; Date.now() < until; segment++) {
      const { cell: junction, reached } = await straight(ctx, main, 4, until);
      if (!reached) {
        main = turn(main, ctx.rng);
        ctx.log(`blocked; main tunnel now ${main}`);
        continue;
      }
      const side = segment % 2 === 0 ? new Vec3(main.z, 0, main.x) : new Vec3(-main.z, 0, -main.x);
      await straight(ctx, side, 6, until);
      // A legit miner mines ore they can see in the branch wall.
      const seen = visibleOreNear(ctx.bot, [...DIAMOND_ORES, ...LOW_VALUE_ORES], 3);
      if (seen) {
        await digAt(ctx.bot, seen);
        await mineVisibleVein(ctx.bot, [...DIAMOND_ORES, ...LOW_VALUE_ORES]);
      }
      await tunnelTo(ctx.bot, junction, { deadline: until });
    }
  },
};

/** Every ore a cave explorer would stop for. */
const CAVE_ORES = [
  ...DIAMOND_ORES,
  ...LOW_VALUE_ORES,
  "copper_ore",
  "deepslate_copper_ore",
  "gold_ore",
  "deepslate_gold_ore",
  "redstone_ore",
  "deepslate_redstone_ore",
  "lapis_ore",
  "deepslate_lapis_ore",
];

/**
 * Legit: walks through caves and mines the ore it can see. The only legitimate play in the
 * corpus used to be branch mining, and a person exploring a cave was scored as a cheat because
 * they walk toward ore they can see and expose the hidden ore next to it. This is that play.
 */
export const legitCaveMining: Scenario = {
  name: "legit-cave-mining",
  label: "legit",
  subtype: "cave_mining",
  description:
    "Finds a cave, wanders through it and walks to any ore in sight to mine it and its vein. Digs only when the cave ends. Uses no hidden information.",
  async run(ctx) {
    const until = deadline(ctx);
    const { bot } = ctx;
    const rng = ctx.rng;

    // Get into a cave. The teleport happens before the session starts, so nothing records it.
    // A session begins after ten stone breaks, so open with a short dig into the cave wall and
    // come back out, which is also how a person usually enters a cave from their own tunnel.
    let cells = caveCellsNear(bot, 64, 2000);
    // Caves are not everywhere at one depth. Look higher up and a little way off before giving up.
    const probes: [number, number, number][] = [
      [0, 20, 0],
      [0, 40, 0],
      [24, 0, 24],
      [24, 20, 24],
      [24, 40, 24],
      [-24, 30, 24],
    ];
    for (const [dx, dy, dz] of probes) {
      if (cells.length > 0) break;
      const probe = ctx.origin.offset(dx, dy, dz);
      bot.chat(`/tp @s ${probe.x} ${probe.y} ${probe.z}`);
      await sleep(2500);
      cells = caveCellsNear(bot, 64, 2000);
    }
    const target = cells[Math.floor(rng.next() * Math.min(cells.length, 8))] ?? cells[0];
    if (!target) throw new Error("no cave near any probe; not a cave session");
    bot.chat(`/tp @s ${target.x} ${target.y} ${target.z}`);
    await sleep(1500);
    ctx.log(`cave at ${target}`);
    let heading = HEADINGS[Math.floor(rng.next() * HEADINGS.length)] ?? new Vec3(1, 0, 0);
    const entrance = bot.entity.position.floored();
    await straight(ctx, heading, 6, until);
    await tunnelTo(bot, entrance, { deadline: until });

    let blocked = 0;
    let lastOreAt = Date.now();
    while (Date.now() < until) {
      // A person stops for ore they can see, from some way off.
      const seen = oreInSight(bot, CAVE_ORES, 16);
      if (seen) {
        lastOreAt = Date.now();
        ctx.log(`ore in sight ${seen}`);
        const inReach = () =>
          bot.entity.position.offset(0, 1.62, 0).distanceTo(seen.offset(0.5, 0.5, 0.5)) <= 4;
        await walkToward(bot, seen, { deadline: until, stopWhen: inReach, lookAt: seen });
        let mined = false;
        if (inReach()) {
          await bot.lookAt(seen.offset(0.5, 0.5, 0.5), true);
          mined = await digAt(bot, seen);
        } else {
          // Not walkable: dig the last few blocks, as a person would.
          mined = await approachAndMine(bot, seen, until);
        }
        if (mined) {
          await mineVisibleVein(bot, CAVE_ORES);
          // Follow the vein a little into the wall.
          await chipAround(bot, seen, 2 + Math.floor(rng.next() * 3));
          await mineVisibleVein(bot, CAVE_ORES);
        }
        await fidget(bot, rng, ctx.humanNoise);
        continue;
      }

      // Otherwise wander: prefer an open cell some way off along the current heading, and take
      // any open cell a few blocks away when the heading is blocked.
      const here = bot.entity.position.floored();
      const open = caveCellsNear(bot, 24, 1200).filter(
        (c) => Math.abs(c.y - here.y) <= 8 && here.distanceTo(c) >= 3,
      );
      const ahead = open.filter((c) => {
        const d = c.minus(here);
        return d.x * heading.x + d.z * heading.z >= 4;
      });
      // Far cells first, so the bot crosses the cave instead of pacing one chamber.
      const pool = (ahead.length > 0 ? ahead : open).sort(
        (a, b) => b.distanceTo(here) - a.distanceTo(here),
      );
      const goal = pool[Math.floor(rng.next() * Math.min(pool.length, 8))];
      if (goal) {
        const { reached, cell } = await walkToward(bot, goal, {
          deadline: until,
          onStep: () => fidget(bot, rng, ctx.humanNoise),
        });
        ctx.log(`wander ${here} -> ${goal}: ${reached ? "reached" : `stopped at ${cell}`}`);
        blocked = reached ? 0 : blocked + 1;
      } else {
        ctx.log(`no open cell near ${here}`);
        blocked++;
      }
      // A barren stretch of cave: dig into the wall for a while, as a person would.
      if (Date.now() - lastOreAt > 90_000) {
        blocked = 2;
        lastOreAt = Date.now();
      }
      if (blocked >= 2) {
        // The cave has run out here: dig a short way in a new direction, as a person would.
        heading = turn(heading, rng);
        const from = bot.entity.position.floored();
        const goal2 = from.plus(heading.scaled(8));
        ctx.log(`cave ends; digging toward ${goal2}`);
        const dug = await tunnelTo(bot, goal2, { deadline: until });
        if (!dug.reached) heading = turn(heading, rng);
        blocked = 0;
      }
    }
  },
};

/** Blatant X-Ray: reads ore positions from chunk data and tunnels straight to each. */
export const xrayDirect: Scenario = {
  name: "xray-direct",
  label: "simulated_xray",
  subtype: "direct_xray",
  description:
    "Finds the nearest diamond ore through the walls and digs the shortest path to it, repeatedly.",
  async run(ctx) {
    const until = deadline(ctx);
    let failures = 0;
    let heading = new Vec3(1, 0, 0);
    while (Date.now() < until) {
      // Targets at least 6 blocks away so every reveal has an approach worth measuring.
      const ore = failures >= 2 ? null : findOre(ctx.bot, DIAMOND_ORES, 28, 3, 6);
      if (!ore) {
        ctx.log(
          failures >= 2 ? "targets keep failing; tunnelling on" : "no diamond within 28 blocks",
        );
        failures = 0;
        if (!(await straight(ctx, heading, 10, until)).reached) heading = turn(heading, ctx.rng);
        continue;
      }
      ctx.log(`target ${ore}`);
      if (await approachAndMine(ctx.bot, ore, until)) {
        failures = 0;
        await mineVisibleVein(ctx.bot, DIAMOND_ORES);
      } else {
        failures++;
      }
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
    let failures = 0;
    let heading = new Vec3(1, 0, 0);
    while (Date.now() < until) {
      const ore = failures >= 2 ? null : findOre(ctx.bot, DIAMOND_ORES, 28, 3, 6);
      if (!ore) {
        failures = 0;
        if (!(await straight(ctx, heading, 10, until)).reached) heading = turn(heading, ctx.rng);
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
      await tunnelTo(ctx.bot, waypoint, { deadline: until, lookAt: ore });
      if (await approachAndMine(ctx.bot, ore, until)) {
        failures = 0;
        await mineVisibleVein(ctx.bot, DIAMOND_ORES);
      } else {
        failures++;
      }
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
    let heading = new Vec3(1, 0, 0);
    while (Date.now() < until) {
      const run = await straight(ctx, heading, 6 + Math.floor(ctx.rng.next() * 4), until);
      if (!run.reached) heading = turn(heading, ctx.rng);
      const lowValue = findOre(ctx.bot, LOW_VALUE_ORES, 6, 2);
      if (lowValue && ctx.rng.next() < 0.6) await approachAndMine(ctx.bot, lowValue, until);
      if (ctx.rng.next() < 0.7) {
        const ore = findOre(ctx.bot, DIAMOND_ORES, 20, 3, 5);
        if (ore) {
          ctx.log(`quiet target ${ore}`);
          if (await approachAndMine(ctx.bot, ore, until))
            await mineVisibleVein(ctx.bot, DIAMOND_ORES);
          await sleep(1000 + ctx.rng.next() * 3000);
        }
      }
    }
  },
};

/**
 * The adversary behavioural detection exists for: a cheater who knows where the ore is but keeps
 * their ore-per-block ratio inside the legitimate range by digging ordinary tunnel between
 * targets. Efficiency heuristics cannot flag it above the legitimate distribution by
 * construction; only the shape of the approach still carries the hidden knowledge.
 */
export const xrayThrottled: Scenario = {
  name: "xray-throttled",
  label: "simulated_xray",
  subtype: "throttled_xray",
  description:
    "Walks straight to known ore, then dilutes the session with plain tunnelling to hold ore per 100 blocks near the legitimate median.",
  async run(ctx) {
    const until = deadline(ctx);
    // Legitimate sessions sit at 0.46 per 100 blocks (median) and 2.31 (90th percentile), so
    // 1.5 is inside the ordinary range while still profitable.
    const targetRatio = 1.5;
    let blocksBroken = 0;
    let oreMined = 0;
    const stopCounting = onBlockMined((bot, name) => {
      if (bot !== ctx.bot) return;
      blocksBroken++;
      if (DIAMOND_ORES.includes(name)) oreMined++;
    });
    let heading = new Vec3(1, 0, 0);
    let failures = 0;
    try {
      // Open with plain tunnel so the first vein is not the whole session.
      await straight(ctx, heading, 30, until);
      while (Date.now() < until) {
        // Dig ordinary tunnel until the ratio leaves room for one more vein.
        const required = ((oreMined + 1) * 100) / targetRatio;
        while (blocksBroken < required && Date.now() < until) {
          if (!(await straight(ctx, heading, 12, until)).reached) heading = turn(heading, ctx.rng);
        }
        if (Date.now() >= until) break;
        const ore = failures >= 2 ? null : findOre(ctx.bot, DIAMOND_ORES, 28, 3, 6);
        if (!ore) {
          failures = 0;
          if (!(await straight(ctx, heading, 12, until)).reached) heading = turn(heading, ctx.rng);
          continue;
        }
        ctx.log(`target ${ore} at ${oreMined}/${blocksBroken} blocks`);
        if (await approachAndMine(ctx.bot, ore, until)) {
          failures = 0;
          await mineVisibleVein(ctx.bot, DIAMOND_ORES);
        } else {
          failures++;
        }
        await fidget(ctx.bot, ctx.rng, ctx.humanNoise);
      }
    } finally {
      stopCounting();
      ctx.log(
        `final ratio ${((oreMined * 100) / Math.max(1, blocksBroken)).toFixed(2)} per 100 blocks (${oreMined}/${blocksBroken})`,
      );
    }
  },
};

export const SCENARIOS: readonly Scenario[] = [
  legitBranchMining,
  legitCaveMining,
  xrayDirect,
  xrayDetour,
  xrayHumanized,
  xrayThrottled,
];

export function getScenario(name: string): Scenario {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found)
    throw new Error(
      `unknown scenario "${name}" (known: ${SCENARIOS.map((s) => s.name).join(", ")})`,
    );
  return found;
}
