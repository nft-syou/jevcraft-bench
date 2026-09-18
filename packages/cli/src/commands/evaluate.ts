import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  createMockBackend,
  createTypeSafeBackend,
  evaluateSession,
  type JevBackend,
} from "@jevcraft/jev-evaluator";
import { type DecisionRecord, MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { readRecords, resolveInputFiles, writeJsonl } from "../io";

export interface EvaluateDeps {
  env?: NodeJS.ProcessEnv;
  stderr?: (line: string) => void;
}

export const EVALUATE_USAGE =
  "usage: jevcraft evaluate <input.json|input.jsonl|dir>... [--out <file.jsonl>] [--backend auto|typesafe|mock] [--model <name>]";

function chooseBackend(
  requested: string,
  env: NodeJS.ProcessEnv,
  stderr: (line: string) => void,
): JevBackend {
  const hasKey = (env.TYPESAFE_API_KEY ?? "").trim() !== "";
  switch (requested) {
    case "mock":
      return createMockBackend();
    case "typesafe":
      if (!hasKey) {
        throw new Error("--backend typesafe requires TYPESAFE_API_KEY in the environment");
      }
      return createTypeSafeBackend({ apiKey: env.TYPESAFE_API_KEY });
    case "auto":
      if (hasKey) return createTypeSafeBackend({ apiKey: env.TYPESAFE_API_KEY });
      stderr("TYPESAFE_API_KEY is not set; using the mock backend (no network calls).");
      return createMockBackend();
    default:
      throw new Error(`unknown backend "${requested}". ${EVALUATE_USAGE}`);
  }
}

export async function runEvaluate(
  args: string[],
  deps: EvaluateDeps = {},
): Promise<{ outPath: string; records: DecisionRecord[] }> {
  const env = deps.env ?? process.env;
  const stderr = deps.stderr ?? ((line) => console.error(line));

  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      backend: { type: "string", default: "auto" },
      model: { type: "string" },
    },
  });
  if (positionals.length === 0) throw new Error(EVALUATE_USAGE);

  const files = await resolveInputFiles(positionals);
  const features = [];
  for (const file of files) {
    for (const raw of await readRecords(file)) {
      const parsed = MiningSessionFeaturesSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`invalid MiningSessionFeatures in ${file}: ${parsed.error.message}`);
      }
      features.push(parsed.data);
    }
  }

  const backend = chooseBackend(values.backend, env, stderr);
  const firstInput = positionals[0] ?? "decisions";
  const outPath =
    values.out ??
    join("datasets", "decisions", `${basename(firstInput, extname(firstInput))}.jsonl`);

  const records: DecisionRecord[] = [];
  for (const f of features) {
    const record = await evaluateSession(f, {
      backend,
      ...(values.model !== undefined ? { model: values.model } : {}),
    });
    records.push(record);
    if (record.error !== null) stderr(`${record.sessionId}: ${record.error}`);
  }
  await writeJsonl(outPath, records);

  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.policyOutcome, (counts.get(r.policyOutcome) ?? 0) + 1);
  stderr(
    `evaluated ${records.length} session(s) with ${backend.kind} -> ${outPath} ` +
      `[${[...counts].map(([k, v]) => `${k}=${v}`).join(", ")}]`,
  );
  return { outPath, records };
}
