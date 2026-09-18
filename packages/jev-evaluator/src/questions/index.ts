import type { QuestionSet } from "./question-set";
import { xrayV1 } from "./xray-v1";
import { xrayV2 } from "./xray-v2";
import { xrayV3 } from "./xray-v3";

export const QUESTION_SETS: readonly QuestionSet[] = [xrayV1, xrayV2, xrayV3];

/** v3 since 2026-09-19: v1's sufficiency question tracked suspicion (see docs/baselines). */
export const DEFAULT_QUESTION_SET: QuestionSet = xrayV3;

export function getQuestionSet(version: string): QuestionSet {
  const found = QUESTION_SETS.find((set) => set.version === version);
  if (found === undefined) {
    const known = QUESTION_SETS.map((s) => s.version).join(", ");
    throw new Error(`unknown question set "${version}" (known: ${known})`);
  }
  return found;
}
