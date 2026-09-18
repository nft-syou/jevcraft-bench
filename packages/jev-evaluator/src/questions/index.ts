import type { QuestionSet } from "./question-set";
import { xrayV1 } from "./xray-v1";
import { xrayV2 } from "./xray-v2";

export const QUESTION_SETS: readonly QuestionSet[] = [xrayV1, xrayV2];

export const DEFAULT_QUESTION_SET: QuestionSet = xrayV1;

export function getQuestionSet(version: string): QuestionSet {
  const found = QUESTION_SETS.find((set) => set.version === version);
  if (found === undefined) {
    const known = QUESTION_SETS.map((s) => s.version).join(", ");
    throw new Error(`unknown question set "${version}" (known: ${known})`);
  }
  return found;
}
