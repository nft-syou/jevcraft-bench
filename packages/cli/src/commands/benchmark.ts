import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  type BenchmarkRow,
  buildBenchmarkReport,
  CLASSIC_DETECTORS,
  JEV_DETECTORS,
} from "@jevcraft/eval-runner";
import {
  DecisionRecordSchema,
  MiningSessionFeaturesSchema,
  SessionLabelSchema,
} from "@jevcraft/schema";
import { readRecords, resolveInputFiles } from "../io";

export interface BenchmarkDeps {
  stderr?: (line: string) => void;
}

export const BENCHMARK_USAGE =
  "usage: jevcraft benchmark --features <jsonl|dir> --labels <jsonl|dir> --decisions <jsonl|dir> [--out <file.md>] [--max-fpr 0.065] [--title <text>]";

/**
 * Compares JevCraft against the heuristics existing anti-X-Ray tooling relies on, on the same
 * labelled sessions, at the same false-positive ceiling. Uses only archived answers: no API calls.
 */
export async function runBenchmark(
  args: string[],
  deps: BenchmarkDeps = {},
): Promise<{ outPath: string; markdown: string; rows: number }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: {
      features: { type: "string" },
      labels: { type: "string" },
      decisions: { type: "string" },
      out: { type: "string" },
      "max-fpr": { type: "string", default: "0.065" },
      title: { type: "string" },
    },
  });
  if (!values.features || !values.labels || !values.decisions) throw new Error(BENCHMARK_USAGE);
  const maxFpr = Number(values["max-fpr"]);
  if (!Number.isFinite(maxFpr) || maxFpr < 0 || maxFpr > 1) {
    throw new Error("--max-fpr must be between 0 and 1");
  }

  const labels = new Map<string, ReturnType<typeof SessionLabelSchema.parse>>();
  for (const file of await resolveInputFiles([values.labels])) {
    for (const raw of await readRecords(file)) {
      const label = SessionLabelSchema.parse(raw);
      if (label.label !== "unknown") labels.set(label.sessionId, label);
    }
  }
  const decisions = new Map<string, ReturnType<typeof DecisionRecordSchema.parse>>();
  for (const file of await resolveInputFiles([values.decisions])) {
    for (const raw of await readRecords(file)) {
      const d = DecisionRecordSchema.parse(raw);
      decisions.set(d.sessionId, d);
    }
  }

  const rows: BenchmarkRow[] = [];
  const seen = new Set<string>();
  for (const file of await resolveInputFiles([values.features])) {
    for (const raw of await readRecords(file)) {
      const features = MiningSessionFeaturesSchema.parse(raw);
      const label = labels.get(features.sessionId);
      if (label === undefined || seen.has(features.sessionId)) continue;
      seen.add(features.sessionId);
      rows.push({
        sessionId: features.sessionId,
        features,
        label,
        decision: decisions.get(features.sessionId) ?? null,
      });
    }
  }
  if (rows.length === 0) throw new Error("no labelled sessions with features found");

  const title = values.title ?? `${rows.length} sessions`;
  const markdown = buildBenchmarkReport({
    title,
    rows,
    detectors: [...CLASSIC_DETECTORS, ...JEV_DETECTORS],
    maxFpr,
    challenger: "jevcraft-policy",
  });
  const outPath = values.out ?? join("reports", "benchmark.md");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  stderr(`benchmark over ${rows.length} session(s) at FPR <= ${maxFpr} -> ${outPath}`);
  return { outPath, markdown, rows: rows.length };
}
