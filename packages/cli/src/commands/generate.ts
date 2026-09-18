import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { generateDataset, ScenarioSpecSchema } from "@jevcraft/scenario-generator";
import type { MiningSessionFeatures, SessionLabel } from "@jevcraft/schema";
import { writeJsonl } from "../io";

export interface GenerateDeps {
  stderr?: (line: string) => void;
}

export const GENERATE_USAGE =
  "usage: jevcraft generate <scenario.json|dir>... --out-features <file.jsonl> --out-labels <file.jsonl> [--count <n>] [--seed <n>]";

/** Scenario files, recursing into directories, sorted for reproducibility. */
async function listScenarioFiles(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    if ((await stat(path)).isDirectory()) {
      const children = (await readdir(path)).sort().map((name) => join(path, name));
      out.push(...(await listScenarioFiles(children)));
    } else if (path.endsWith(".json")) {
      out.push(path);
    }
  }
  return out;
}

export async function runGenerate(
  args: string[],
  deps: GenerateDeps = {},
): Promise<{ features: MiningSessionFeatures[]; labels: SessionLabel[] }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "out-features": { type: "string" },
      "out-labels": { type: "string" },
      count: { type: "string", default: "20" },
      seed: { type: "string", default: "1" },
    },
  });
  if (positionals.length === 0) throw new Error(GENERATE_USAGE);
  const outFeatures = values["out-features"];
  const outLabels = values["out-labels"];
  if (outFeatures === undefined) throw new Error(`--out-features is required. ${GENERATE_USAGE}`);
  if (outLabels === undefined) throw new Error(`--out-labels is required. ${GENERATE_USAGE}`);
  const count = Number(values.count);
  const seed = Number(values.seed);
  if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be a positive integer`);
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`--seed must be a non-negative integer`);

  const features: MiningSessionFeatures[] = [];
  const labels: SessionLabel[] = [];
  for (const file of await listScenarioFiles(positionals)) {
    const parsed = ScenarioSpecSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (!parsed.success) throw new Error(`invalid scenario in ${file}: ${parsed.error.message}`);
    const dataset = generateDataset(parsed.data, { count, seed });
    features.push(...dataset.features);
    labels.push(...dataset.labels);
    stderr(`${parsed.data.name}: ${dataset.features.length} sessions (${parsed.data.label})`);
  }
  await writeJsonl(outFeatures, features);
  await writeJsonl(outLabels, labels);
  stderr(`generated ${features.length} sessions -> ${outFeatures}, labels -> ${outLabels}`);
  return { features, labels };
}
