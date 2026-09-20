import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { applyPolicy, DEFAULT_THRESHOLDS, type PolicyThresholds } from "@jevcraft/jev-evaluator";
import {
  type DecisionRecord,
  DecisionRecordSchema,
  MiningSessionFeaturesSchema,
} from "@jevcraft/schema";
import { readRecords, resolveInputFiles, writeJsonl } from "../io";

export interface RepolicyDeps {
  stderr?: (line: string) => void;
}

export const REPOLICY_USAGE =
  "usage: jevcraft repolicy --decisions <jsonl|dir> --features <jsonl|dir> [--out <jsonl>] [--min-approach-targeting <t|off>] [--bypass-xray <p|off>] [--approach-alone <t|off>]";

/**
 * Recomputes policyOutcome from the stored Jev answers with the current (or overridden)
 * thresholds. No API calls: this is how threshold changes are compared on archived decisions.
 */
export async function runRepolicy(
  args: string[],
  deps: RepolicyDeps = {},
): Promise<{ outPath: string; records: DecisionRecord[]; changed: number }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: {
      decisions: { type: "string" },
      features: { type: "string" },
      out: { type: "string" },
      "min-approach-targeting": { type: "string" },
      "bypass-xray": { type: "string" },
      "approach-alone": { type: "string" },
    },
  });
  if (!values.decisions || !values.features) throw new Error(REPOLICY_USAGE);
  const num = (raw: string | undefined, fallback: number | null): number | null => {
    if (raw === undefined) return fallback;
    if (raw === "off") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`not a number: ${raw}`);
    return n;
  };
  const thresholds: PolicyThresholds = {
    ...DEFAULT_THRESHOLDS,
    reviewMinApproachTargeting: num(
      values["min-approach-targeting"],
      DEFAULT_THRESHOLDS.reviewMinApproachTargeting,
    ),
    reviewBypassXrayProbability: num(
      values["bypass-xray"],
      DEFAULT_THRESHOLDS.reviewBypassXrayProbability,
    ),
    reviewApproachTargetingAlone: num(
      values["approach-alone"],
      DEFAULT_THRESHOLDS.reviewApproachTargetingAlone,
    ),
  };

  const quality = new Map<string, { enoughEvidence: boolean }>();
  for (const file of await resolveInputFiles([values.features])) {
    for (const raw of await readRecords(file)) {
      const f = MiningSessionFeaturesSchema.parse(raw);
      quality.set(f.sessionId, f.quality);
    }
  }
  const records: DecisionRecord[] = [];
  let changed = 0;
  for (const file of await resolveInputFiles([values.decisions])) {
    for (const raw of await readRecords(file)) {
      const d = DecisionRecordSchema.parse(raw);
      const q = quality.get(d.sessionId);
      if (d.answers === null || q === undefined) {
        records.push(d);
        continue;
      }
      const outcome = applyPolicy(d.answers, q, thresholds);
      if (outcome !== d.policyOutcome) changed++;
      records.push({ ...d, policyOutcome: outcome });
    }
  }
  const outPath =
    values.out ??
    join(
      "datasets",
      "decisions",
      `${basename(values.decisions, extname(values.decisions))}-repolicy.jsonl`,
    );
  await writeJsonl(outPath, records);
  // A rewritten decision file is only reproducible if the thresholds that produced it are
  // recorded next to it, together with a digest of what went in.
  const digest = createHash("sha256")
    .update(records.map((r) => `${r.sessionId}:${r.policyOutcome}`).join("|"))
    .digest("hex")
    .slice(0, 16);
  await writeFile(
    `${outPath}.meta.json`,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        decisions: values.decisions,
        features: values.features,
        recordCount: records.length,
        changed,
        thresholds,
        outcomeDigest: digest,
      },
      null,
      2,
    )}
`,
    "utf8",
  );
  stderr(
    `repolicy: ${records.length} record(s), ${changed} outcome(s) changed -> ${outPath} (thresholds in ${outPath}.meta.json)`,
  );
  return { outPath, records, changed };
}
