import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  arenaOrigin,
  getScenario,
  type RunManifest,
  recordRun,
  SCENARIOS,
} from "@jevcraft/bot-recorder";
import { Vec3 } from "vec3";

export interface RecordDeps {
  env?: NodeJS.ProcessEnv;
  stderr?: (line: string) => void;
}

export const RECORD_USAGE =
  "usage: jevcraft record --scenario <name|all> [--count <n>] [--out <manifest.jsonl>] [--host 127.0.0.1] [--port 25565] [--version 26.1] [--budget-seconds 180] [--human-noise 0.5] [--seed 1] [--start-index 0]";

export async function runRecord(
  args: string[],
  deps: RecordDeps = {},
): Promise<{ outPath: string; runs: RunManifest[] }> {
  const env = deps.env ?? process.env;
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: "string" },
      count: { type: "string", default: "1" },
      out: { type: "string", default: "datasets/recordings/manifest.jsonl" },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "25565" },
      version: { type: "string", default: "26.1" },
      "budget-seconds": { type: "string", default: "180" },
      "human-noise": { type: "string", default: "0.5" },
      seed: { type: "string", default: "1" },
      "start-index": { type: "string", default: "0" },
      "base-x": { type: "string", default: "100" },
      "base-y": { type: "string", default: "-58" },
      "base-z": { type: "string", default: "100" },
    },
  });
  if (values.scenario === undefined) throw new Error(RECORD_USAGE);
  const scenarios = values.scenario === "all" ? [...SCENARIOS] : [getScenario(values.scenario)];
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) throw new Error("--count must be a positive integer");
  const secret = (env.JEVCRAFT_HMAC_SECRET ?? "").trim() || null;
  if (secret === null) stderr("JEVCRAFT_HMAC_SECRET is not set; manifest playerId will be null");

  const base = new Vec3(
    Number(values["base-x"]),
    Number(values["base-y"]),
    Number(values["base-z"]),
  );
  const outPath = values.out;
  await mkdir(dirname(outPath), { recursive: true });
  const runs: RunManifest[] = [];
  let index = Number(values["start-index"]);
  for (const scenario of scenarios) {
    for (let i = 0; i < count; i++) {
      const botName = `jevbot${String((index % 16) + 1).padStart(2, "0")}`;
      const seed = Number(values.seed) * 1000 + index;
      stderr(`run ${index}: ${scenario.name} as ${botName} (seed ${seed})`);
      const run = await recordRun({
        host: values.host,
        port: Number(values.port),
        version: values.version,
        botName,
        scenario,
        origin: arenaOrigin(base, index),
        seed,
        humanNoise: Number(values["human-noise"]),
        budgetMs: Number(values["budget-seconds"]) * 1000,
        hmacSecret: secret,
        log: (line) => stderr(`  ${line}`),
      });
      runs.push(run);
      await appendFile(outPath, `${JSON.stringify(run)}\n`, "utf8");
      if (run.notes.length > 0) stderr(`  notes: ${run.notes.join("; ")}`);
      index++;
    }
  }
  // The plugin flushes on logout; give a bind-mounted data dir a moment to show the tail.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  stderr(`recorded ${runs.length} run(s) -> ${outPath}`);
  return { outPath, runs };
}
