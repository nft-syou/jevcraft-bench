import type { BehaviorSubtype, GroundTruthLabel } from "@jevcraft/schema";
import mineflayer, { type Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { createRng, DIAMOND_ORES, findOre, sleep } from "./mining";
import { offlineUuid, pseudonymize } from "./offline-uuid";
import type { Scenario } from "./scenarios";

/** One recorded bot run; enough to label the plugin's sessions afterwards. */
export interface RunManifest {
  botName: string;
  uuid: string;
  /** hmac-sha256 id as the plugin writes it, or null when the secret is unknown */
  playerId: string | null;
  scenario: string;
  label: GroundTruthLabel;
  subtype: BehaviorSubtype;
  seed: number;
  humanNoise: number;
  origin: { x: number; y: number; z: number };
  joinedAt: string;
  leftAt: string;
  notes: string[];
}

export interface RecordOptions {
  host: string;
  port: number;
  /** Protocol version Mineflayer should speak (26.1 through ViaBackwards on a 26.2 server). */
  version: string;
  botName: string;
  scenario: Scenario;
  origin: Vec3;
  seed: number;
  humanNoise: number;
  budgetMs: number;
  hmacSecret: string | null;
  log: (line: string) => void;
}

function waitForSpawn(bot: Bot, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("spawn timeout")), timeoutMs);
    bot.once("spawn", () => {
      clearTimeout(timer);
      resolve();
    });
    bot.once("kicked", (reason) => {
      clearTimeout(timer);
      reject(new Error(`kicked: ${JSON.stringify(reason).slice(0, 200)}`));
    });
    bot.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Joins, prepares the bot (survival, pickaxe, teleport), runs the scenario, leaves. */
export async function recordRun(options: RecordOptions): Promise<RunManifest> {
  const { botName, scenario, origin, log } = options;
  const uuid = offlineUuid(botName);
  const notes: string[] = [];
  const bot = mineflayer.createBot({
    host: options.host,
    port: options.port,
    username: botName,
    version: options.version,
    auth: "offline",
  });
  const joinedAt = new Date().toISOString();
  try {
    await waitForSpawn(bot, 60_000);
    log(`${botName} spawned for ${scenario.name}`);
    bot.chat("/gamemode survival @s");
    bot.chat("/clear @s");
    bot.chat("/give @s netherite_pickaxe");
    bot.chat("/effect give @s night_vision 3600 1 true");
    await sleep(1000);
    // Probe a few spots in the cell and start where diamonds are within reach of a scenario,
    // otherwise short runs never meet an ore. Teleports before the session starts are harmless.
    let chosen = origin;
    const candidates = [
      origin,
      origin.offset(0, 0, 32),
      origin.offset(32, 0, 0),
      origin.offset(32, 0, 32),
    ];
    for (const candidate of candidates) {
      bot.chat(`/tp @s ${candidate.x} ${candidate.y} ${candidate.z}`);
      await sleep(2000);
      await bot.waitForChunksToLoad();
      chosen = candidate;
      if (findOre(bot, DIAMOND_ORES, 24, 3, 6) !== null) break;
      log(`no diamond near ${candidate}; trying the next spot`);
    }
    // The spot is usually inside solid rock. Carve a 3x2x3 pocket with a solid floor so the
    // tunneller has a valid start cell; /fill does not fire BlockBreakEvent, so nothing is recorded.
    bot.chat(
      `/fill ${chosen.x - 1} ${chosen.y - 1} ${chosen.z - 1} ${chosen.x + 1} ${chosen.y - 1} ${chosen.z + 1} minecraft:deepslate`,
    );
    bot.chat(
      `/fill ${chosen.x - 1} ${chosen.y} ${chosen.z - 1} ${chosen.x + 1} ${chosen.y + 1} ${chosen.z + 1} minecraft:air`,
    );
    await sleep(1000);
    bot.chat(`/tp @s ${chosen.x} ${chosen.y} ${chosen.z}`);
    await sleep(1500);
    const here = bot.entity.position.floored();
    if (here.distanceTo(chosen) > 4) notes.push(`teleport landed at ${here} (wanted ${chosen})`);
    let pickaxe = bot.inventory.items().find((i) => i.name.endsWith("_pickaxe"));
    for (let attempt = 0; attempt < 10 && !pickaxe; attempt++) {
      await sleep(500);
      pickaxe = bot.inventory.items().find((i) => i.name.endsWith("_pickaxe"));
    }
    if (pickaxe) await bot.equip(pickaxe, "hand");
    else notes.push("no pickaxe in inventory");

    await Promise.race([
      scenario.run({
        bot,
        origin: here,
        rng: createRng(options.seed),
        humanNoise: options.humanNoise,
        budgetMs: options.budgetMs,
        log,
      }),
      sleep(options.budgetMs + 30_000).then(() => notes.push("hard timeout")),
    ]);
  } catch (error) {
    notes.push(`error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    bot.clearControlStates();
    bot.quit();
    await sleep(500);
  }
  return {
    botName,
    uuid,
    playerId: options.hmacSecret ? pseudonymize(options.hmacSecret, uuid) : null,
    scenario: scenario.name,
    label: scenario.label,
    subtype: scenario.subtype,
    seed: options.seed,
    humanNoise: options.humanNoise,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    joinedAt,
    leftAt: new Date().toISOString(),
    notes,
  };
}

/** Spreads runs over fresh ground: a grid of 64-block cells along +x/+z from a base. */
export function arenaOrigin(base: Vec3, runIndex: number): Vec3 {
  const cols = 8;
  return new Vec3(
    base.x + (runIndex % cols) * 64,
    base.y,
    base.z + Math.floor(runIndex / cols) * 64,
  );
}
