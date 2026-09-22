import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { DecisionRecord, MiningSessionFeatures } from "@jevcraft/schema";
import { runEvaluate } from "./evaluate";
import { runExtract } from "./extract";

export const TRY_USAGE =
  "usage: jevcraft try <plugin data dir|file>... [--backend auto|typesafe|mock] [--out-dir <dir>] [--min-probability <n>] [--window-minutes <n>]";

// Measured over 156 live evaluations; see the operating-cost section of the README.
const BILLABLE_TOKENS_PER_WINDOW = 1402;
const USD_PER_MILLION_INPUT_TOKENS = 0.042;

export interface TryDeps {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
}

const flagged = (d: DecisionRecord) =>
  d.policyOutcome === "review" || d.policyOutcome === "high_priority_review";

/**
 * One command for a server operator trying this for the first time: point it at the directory the
 * plugin writes to and it extracts, evaluates and prints the shortlist. The separate `extract`,
 * `evaluate` and `flagged` steps still exist for anyone doing real work; this exists so that a
 * first run needs no API key, no labels and no second tool.
 */
export async function runTry(args: string[], deps: TryDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((line) => console.log(line));
  const note = deps.stderr ?? ((line) => console.error(line));
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      backend: { type: "string", default: "auto" },
      "out-dir": { type: "string" },
      "min-probability": { type: "string", default: "0" },
      "window-minutes": { type: "string", default: "15" },
    },
  });
  if (positionals.length === 0) throw new Error(TRY_USAGE);
  const floor = Number(values["min-probability"]);
  if (!Number.isFinite(floor)) throw new Error("--min-probability must be a number");

  // In the container this points at the mounted /out volume, so the intermediate files survive.
  const env = deps.env ?? process.env;
  const outDir = values["out-dir"] ?? (env.JEVCRAFT_DEFAULT_OUT_DIR ?? "").trim();
  const resolvedOutDir = outDir === "" ? await mkdtemp(join(tmpdir(), "jevcraft-try-")) : outDir;
  const featurePath = join(resolvedOutDir, "features.jsonl");
  const decisionPath = join(resolvedOutDir, "decisions.jsonl");

  const { features } = await runExtract(
    [...positionals, "--out", featurePath, "--window-minutes", values["window-minutes"] ?? "15"],
    { stderr: note },
  );

  if (features.length === 0) {
    out("");
    out("No mining sessions found in that telemetry.");
    out("");
    out("That is normal if nobody has mined underground since the plugin was installed. A session");
    out("starts after 10 stone breaks at or below y=40, or on any target-ore reveal, so surface");
    out("building and cave walking produce nothing. Things worth checking:");
    out("");
    out("  - the path is the plugin's data directory, plugins/JevCraft/data");
    out("  - /jevcraft status in game shows a session open while someone is mining");
    out("  - /jevcraft metrics shows events written, and a drop count of zero");
    return 1;
  }

  const scorable = features.filter((f: MiningSessionFeatures) => f.quality.enoughEvidence);
  out("");
  out(
    `${features.length} session window(s) extracted, ${scorable.length} with enough evidence to score.`,
  );
  if (scorable.length < features.length) {
    out(
      `${features.length - scorable.length} window(s) are too short or too sparse to judge. That is ordinary.`,
    );
  }

  const { records } = await runEvaluate(
    [featurePath, "--out", decisionPath, "--backend", values.backend ?? "auto"],
    { stderr: note },
  );
  const usedMock = records.some((r) => r.backend === "mock");

  const shortlist = records
    .filter(flagged)
    .map((d) => ({
      outcome: d.policyOutcome,
      sessionId: d.sessionId,
      xray: d.answers?.behaviorClass?.probabilities?.likely_xray ?? null,
      hidden: d.answers?.hiddenInformationUse ?? null,
      approach: d.answers?.approachTargeting ?? null,
    }))
    .filter((r) => (r.xray ?? 0) >= floor)
    .sort((a, b) => (b.xray ?? 0) - (a.xray ?? 0));

  out("");
  if (shortlist.length === 0) {
    out("Nothing was flagged for review.");
  } else {
    out(`${shortlist.length} session window(s) flagged for review, most suspicious first:`);
    out("");
    out("  outcome                 P(xray)  hidden  approach  session");
    for (const r of shortlist) {
      const n = (v: number | null) => (v === null ? "   -" : v.toFixed(2));
      out(
        `  ${r.outcome.padEnd(22)}  ${n(r.xray)}    ${n(r.hidden)}    ${n(r.approach)}      ${r.sessionId}`,
      );
    }
    out("");
    out("Session ids are pseudonymous. Matching one to an account needs your own record of who");
    out("was online. A flag is a prompt to look, never a verdict, and never grounds to punish.");
  }

  out("");
  if (usedMock) {
    // Every window is billed, including the ones that come back insufficient_evidence: the
    // backend is called before the policy looks at the evidence. So price the calls, not the
    // scorable windows.
    const usd = (records.length * BILLABLE_TOKENS_PER_WINDOW * USD_PER_MILLION_INPUT_TOKENS) / 1e6;
    out("These answers came from the MOCK backend. They are a deterministic function of the");
    out("features, not a judgement, and they tell you only that the pipeline works end to end.");
    out(
      `For real answers set TYPESAFE_API_KEY and run again. That bills all ${records.length} window(s),`,
    );
    out(
      `including the ${records.length - scorable.length} without enough evidence, so about $${usd.toFixed(4)}.`,
    );
  } else {
    out("Detection quality is unproven: on held-out data this policy is level with a hand-written");
    out("rule on approach directness. Treat the shortlist as a place to look, nothing more.");
  }
  out("");
  out(`Intermediate files: ${featurePath} and ${decisionPath}`);
  return 0;
}
