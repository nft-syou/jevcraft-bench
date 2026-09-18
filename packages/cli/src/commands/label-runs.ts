import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { groupSessions, type RawSession } from "@jevcraft/feature-extractor";
import {
  type RawTelemetryEvent,
  RawTelemetryEventSchema,
  type SessionLabel,
} from "@jevcraft/schema";
import { z } from "zod";
import { readRecords, resolveInputFiles, writeJsonl } from "../io";

export interface LabelRunsDeps {
  stderr?: (line: string) => void;
}

export const LABEL_RUNS_USAGE =
  "usage: jevcraft label-runs --raw <jsonl|dir> --manifest <manifest.jsonl> [--out <labels.jsonl>]";

const ManifestEntrySchema = z.looseObject({
  playerId: z.string().nullable(),
  scenario: z.string(),
  label: z.enum(["legit", "simulated_xray", "known_cheat", "unknown"]),
  subtype: z
    .enum([
      "branch_mining",
      "cave_mining",
      "lucky_streak",
      "direct_xray",
      "detour_xray",
      "humanized_xray",
      "mixed",
    ])
    .nullable(),
  joinedAt: z.iso.datetime(),
  leftAt: z.iso.datetime(),
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

/**
 * Matches plugin sessions to recorder runs by pseudonymous player id and time overlap.
 * Sessions no run explains are labelled `unknown` so they are counted but never scored.
 */
export function labelSessions(sessions: RawSession[], manifest: ManifestEntry[]): SessionLabel[] {
  const labels: SessionLabel[] = [];
  for (const session of sessions) {
    const match = manifest.find(
      (m) =>
        m.playerId === session.playerId &&
        session.startedAtMs >= Date.parse(m.joinedAt) - 5_000 &&
        session.startedAtMs <= Date.parse(m.leftAt) + 5_000,
    );
    labels.push(
      match
        ? {
            sessionId: session.sessionId,
            label: match.label,
            subtype: match.subtype,
            reviewStatus: "single_review",
            notes: `bot: ${match.scenario}`,
          }
        : {
            sessionId: session.sessionId,
            label: "unknown",
            subtype: null,
            reviewStatus: "unreviewed",
            notes: "no recorder run matched this session",
          },
    );
  }
  return labels;
}

export async function runLabelRuns(
  args: string[],
  deps: LabelRunsDeps = {},
): Promise<{ outPath: string; labels: SessionLabel[] }> {
  const stderr = deps.stderr ?? ((line) => console.error(line));
  const { values } = parseArgs({
    args,
    options: { raw: { type: "string" }, manifest: { type: "string" }, out: { type: "string" } },
  });
  if (values.raw === undefined) throw new Error(`--raw is required. ${LABEL_RUNS_USAGE}`);
  if (values.manifest === undefined) throw new Error(`--manifest is required. ${LABEL_RUNS_USAGE}`);

  const events: RawTelemetryEvent[] = [];
  for (const file of await resolveInputFiles([values.raw])) {
    for (const raw of await readRecords(file)) {
      const parsed = RawTelemetryEventSchema.safeParse(raw);
      if (parsed.success) events.push(parsed.data);
    }
  }
  const manifest = (await readRecords(values.manifest)).map((raw) =>
    ManifestEntrySchema.parse(raw),
  );
  const sessions = groupSessions(events);
  const labels = labelSessions(sessions, manifest);
  const outPath =
    values.out ??
    join("datasets", "labels", `${basename(values.manifest, extname(values.manifest))}.jsonl`);
  await writeJsonl(outPath, labels);
  const unknown = labels.filter((l) => l.label === "unknown").length;
  stderr(
    `labelled ${labels.length} session(s) from ${manifest.length} run(s) -> ${outPath} [unknown=${unknown}]`,
  );
  return { outPath, labels };
}
