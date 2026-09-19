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

/** Chunk loading is slow with many bots online; a timeout is a note, not a failure. */
async function waitForChunks(bot: Bot, notes: string[]): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bot.waitForChunksToLoad();
      return;
    } catch {
      await sleep(3000);
    }
  }
  notes.push("chunks slow to load after teleport");
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

// Paper rejects reconnects from one IP within 4 s. Serialize connects across parallel
// workers in this process and keep at least 5 s between them.
let connectChain: Promise<void> = Promise.resolve();
let lastConnectAt = 0;
const MIN_CONNECT_GAP_MS = 5000;

function gatedConnect<T>(fn: () => T): Promise<T> {
  const turn = connectChain.then(async () => {
    const wait = lastConnectAt + MIN_CONNECT_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastConnectAt = Date.now();
  });
  connectChain = turn.catch(() => undefined);
  return turn.then(fn);
}

function createBot(options: RecordOptions): Bot {
  return mineflayer.createBot({
    host: options.host,
    port: options.port,
    username: options.botName,
    version: options.version,
    auth: "offline",
  });
}

/** Joins, prepares the bot (survival, pickaxe, teleport), runs the scenario, leaves. */
export async function recordRun(options: RecordOptions): Promise<RunManifest> {
  const { botName, scenario, origin, log } = options;
  const uuid = offlineUuid(botName);
  const notes: string[] = [];
  // Paper throttles reconnects from one IP (default 4 s); parallel recorders trip it.
  let bot = await gatedConnect(() => createBot(options));
  let joinedAt = new Date().toISOString();
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await waitForSpawn(bot, 60_000);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= 4 || !/throttled/i.test(message)) throw error;
        log(`connection throttled; retrying (attempt ${attempt})`);
        bot.quit();
        await sleep(3000 + Math.random() * 4000);
        bot = await gatedConnect(() => createBot(options));
        joinedAt = new Date().toISOString();
      }
    }
    log(`${botName} spawned for ${scenario.name}`);
    bot.chat("/gamemode survival @s");
    bot.chat("/clear @s");
    // Plain pickaxe: enchanted items given via components are not visible to the 26.1 client
    // behind ViaBackwards, which leaves the bot digging bare-handed.
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
      await waitForChunks(bot, notes);
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
    const findPickaxe = () => bot.inventory.items().find((i) => i.name.endsWith("_pickaxe"));
    let pickaxe = findPickaxe();
    for (let attempt = 0; attempt < 20 && !pickaxe; attempt++) {
      if (attempt % 6 === 5) bot.chat("/give @s netherite_pickaxe");
      await sleep(500);
      pickaxe = findPickaxe();
    }
    if (pickaxe) {
      await bot.equip(pickaxe, "hand");
    } else {
      notes.push("no pickaxe in inventory");
      throw new Error("no pickaxe; refusing to record a bare-handed session");
    }

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
