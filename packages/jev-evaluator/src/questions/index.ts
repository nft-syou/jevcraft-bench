import type { QuestionSet } from "./question-set";
import { xrayV1 } from "./xray-v1";
import { xrayV2 } from "./xray-v2";
import { xrayV3 } from "./xray-v3";
import { xrayV4 } from "./xray-v4";
import { xrayV5 } from "./xray-v5";
import { xrayV6 } from "./xray-v6";

export const QUESTION_SETS: readonly QuestionSet[] = [
  xrayV1,
  xrayV2,
  xrayV3,
  xrayV4,
  xrayV5,
  xrayV6,
];

/**
 * v6 since 2026-09-19: v4 (sufficiency accepts reveal-free activity) plus a dedicated
 * approach_targeting question, the only answer so far that separates direct X-Ray from detour
 * and from strip mining on real bot telemetry (see docs/baselines).
 */
export const DEFAULT_QUESTION_SET: QuestionSet = xrayV6;

export function getQuestionSet(version: string): QuestionSet {
  const found = QUESTION_SETS.find((set) => set.version === version);
  if (found === undefined) {
    const known = QUESTION_SETS.map((s) => s.version).join(", ");
    throw new Error(`unknown question set "${version}" (known: ${known})`);
  }
  return found;
}
