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

import { RECORD_USAGE } from "./record-usage";

export { RECORD_USAGE };

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
      parallel: { type: "string", default: "1" },
    },
  });
  if (values.scenario === undefined) throw new Error(RECORD_USAGE);
  const scenarios = values.scenario === "all" ? [...SCENARIOS] : [getScenario(values.scenario)];
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1) throw new Error("--count must be a positive integer");
  const secret = (env.JEVCRAFT_HMAC_SECRET ?? "").trim() || null;
  if (secret === null) stderr("JEVCRAFT_HMAC_SECRET is not set; manifest playerId will be null");

  const parallel = Number(values.parallel);
  if (!Number.isInteger(parallel) || parallel < 1 || parallel > 16) {
    throw new Error("--parallel must be an integer between 1 and 16");
  }
  const base = new Vec3(
    Number(values["base-x"]),
    Number(values["base-y"]),
    Number(values["base-z"]),
  );
  const outPath = values.out;
  await mkdir(dirname(outPath), { recursive: true });
  const runs: RunManifest[] = [];
  const startIndex = Number(values["start-index"]);
  const jobs: { index: number; scenario: (typeof scenarios)[number] }[] = [];
  let index = startIndex;
  for (const scenario of scenarios) {
    for (let i = 0; i < count; i++) jobs.push({ index: index++, scenario });
  }
  const runJob = async (job: { index: number; scenario: (typeof scenarios)[number] }) => {
    const botName = `jevbot${String((job.index % 16) + 1).padStart(2, "0")}`;
    const seed = Number(values.seed) * 1000 + job.index;
    stderr(`run ${job.index}: ${job.scenario.name} as ${botName} (seed ${seed})`);
    const run = await recordRun({
      host: values.host,
      port: Number(values.port),
      version: values.version,
      botName,
      scenario: job.scenario,
      origin: arenaOrigin(base, job.index),
      seed,
      humanNoise: Number(values["human-noise"]),
      budgetMs: Number(values["budget-seconds"]) * 1000,
      hmacSecret: secret,
      log: (line) => stderr(`  [${job.index}] ${line}`),
    });
    runs.push(run);
    await appendFile(
      outPath,
      `${JSON.stringify(run)}
`,
      "utf8",
    );
    stderr(
      `run ${job.index} done${run.notes.length > 0 ? ` (notes: ${run.notes.join("; ")})` : ""}`,
    );
  };
  // N workers pull from the queue; starts are staggered so Paper's reconnect throttle (4 s) is not hit.
  let next = 0;
  const worker = async (slot: number) => {
    await new Promise((resolve) => setTimeout(resolve, slot * 6000));
    while (next < jobs.length) {
      const job = jobs[next++];
      if (job) await runJob(job);
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(parallel, jobs.length) }, (_, slot) => worker(slot)),
  );
  // The plugin flushes on logout; give a bind-mounted data dir a moment to show the tail.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  stderr(`recorded ${runs.length} run(s) -> ${outPath}`);
  return { outPath, runs };
}
