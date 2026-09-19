import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { type Baseline, buildBaseline } from "@jevcraft/feature-extractor";
import { MiningSessionFeaturesSchema, SessionLabelSchema } from "@jevcraft/schema";
import { readRecords, resolveInputFiles } from "../io";

export interface BaselineDeps {
  stderr?: (line: string) => void;
}

export const BASELINE_USAGE =
  "usage: jevcraft baseline --features <features.jsonl|dir> --labels <labels.jsonl|dir> --out <baseline.json> [--source <text>]";

/** Builds the legit efficiency reference from labelled sessions that met enoughEvidence. */
export async function runBaseline(
  args: string[],
  deps: BaselineDeps = {},
): Promise<{ outPath: string; baseline: Baseline }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: {
      features: { type: "string" },
      labels: { type: "string" },
      out: { type: "string" },
      source: { type: "string" },
    },
  });
  if (!values.features || !values.labels || !values.out) throw new Error(BASELINE_USAGE);

  const legit = new Set<string>();
  for (const file of await resolveInputFiles([values.labels])) {
    for (const raw of await readRecords(file)) {
      const label = SessionLabelSchema.parse(raw);
      if (label.label === "legit") legit.add(label.sessionId);
    }
  }
  const efficiencies: number[] = [];
  for (const file of await resolveInputFiles([values.features])) {
    for (const raw of await readRecords(file)) {
      const f = MiningSessionFeaturesSchema.parse(raw);
      if (!legit.has(f.sessionId) || !f.quality.enoughEvidence) continue;
      if (f.efficiency.valuableOrePer100Blocks === null) continue;
      efficiencies.push(f.efficiency.valuableOrePer100Blocks);
    }
  }
  if (efficiencies.length === 0) throw new Error("no legit sessions with enough evidence found");
  const baseline = buildBaseline(
    efficiencies,
    values.source ?? `${values.features} (legit, enoughEvidence)`,
  );
  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  stderr(`baseline from ${efficiencies.length} legit session(s) -> ${values.out}`);
  return { outPath: values.out, baseline };
}
