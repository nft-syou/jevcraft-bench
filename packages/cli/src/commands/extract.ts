import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { extractAll } from "@jevcraft/feature-extractor";
import {
  type MiningSessionFeatures,
  type RawTelemetryEvent,
  RawTelemetryEventSchema,
} from "@jevcraft/schema";
import { readRecords, resolveInputFiles, writeJsonl } from "../io";

export interface ExtractDeps {
  stderr?: (line: string) => void;
}

export const EXTRACT_USAGE =
  "usage: jevcraft extract <raw.jsonl|dir>... [--out <features.jsonl>] [--window-minutes <n>]";

export async function runExtract(
  args: string[],
  deps: ExtractDeps = {},
): Promise<{ outPath: string; features: MiningSessionFeatures[]; skipped: number }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      "window-minutes": { type: "string", default: "15" },
    },
  });
  if (positionals.length === 0) throw new Error(EXTRACT_USAGE);
  const windowMinutes = Number(values["window-minutes"]);
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new Error("--window-minutes must be a positive number");
  }

  const events: RawTelemetryEvent[] = [];
  let skipped = 0;
  for (const file of await resolveInputFiles(positionals)) {
    for (const raw of await readRecords(file)) {
      const parsed = RawTelemetryEventSchema.safeParse(raw);
      if (parsed.success) events.push(parsed.data);
      else skipped++;
    }
  }
  if (skipped > 0) stderr(`skipped ${skipped} line(s) that did not match RawTelemetryEventSchema`);

  const features = extractAll(events, { windowMs: windowMinutes * 60_000 });
  const firstInput = positionals[0] ?? "features";
  const outPath =
    values.out ??
    join("datasets", "features", `${basename(firstInput, extname(firstInput))}.jsonl`);
  await writeJsonl(outPath, features);
  const enough = features.filter((f) => f.quality.enoughEvidence).length;
  stderr(
    `extracted ${features.length} session window(s) from ${events.length} event(s) -> ${outPath} ` +
      `[enoughEvidence=${enough}]`,
  );
  return { outPath, features, skipped };
}
