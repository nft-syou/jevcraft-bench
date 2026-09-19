import type { QuestionSet } from "./question-set";
import { xrayV1 } from "./xray-v1";
import { xrayV2 } from "./xray-v2";
import { xrayV3 } from "./xray-v3";
import { xrayV4 } from "./xray-v4";

export const QUESTION_SETS: readonly QuestionSet[] = [xrayV1, xrayV2, xrayV3, xrayV4];

/**
 * v4 since 2026-09-19: v1's sufficiency tracked suspicion; v3 fixed that but still demanded
 * hidden-ore approaches, so reveal-free legit sessions stayed "insufficient" (see docs/baselines).
 */
export const DEFAULT_QUESTION_SET: QuestionSet = xrayV4;

export function getQuestionSet(version: string): QuestionSet {
  const found = QUESTION_SETS.find((set) => set.version === version);
  if (found === undefined) {
    const known = QUESTION_SETS.map((s) => s.version).join(", ");
    throw new Error(`unknown question set "${version}" (known: ${known})`);
  }
  return found;
}
