import type { QuestionSet } from "./question-set";
import { XRAY_V1_IMPORTANT_CONTEXT, XRAY_V1_TASK } from "./xray-v1";
import { xrayV2Questions } from "./xray-v2";

export const XRAY_V3_VERSION = "xray-v3";

/**
 * v3 isolates v2's two changes: it keeps v2's reworded `evidence_sufficiency` question but
 * drops the extra importantContext line, so the state sent to Jev is identical to v1.
 * Comparing v1 / v2 / v3 on the same dataset shows whether the recall drop seen with v2
 * came from the question wording or from the added context.
 */
export const xrayV3: QuestionSet = {
  version: XRAY_V3_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V1_IMPORTANT_CONTEXT,
  questions: xrayV2Questions,
};
