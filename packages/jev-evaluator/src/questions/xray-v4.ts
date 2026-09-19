import { noul } from "@typesafe-ai/sdk";
import type { QuestionSet } from "./question-set";
import {
  XRAY_V1_IMPORTANT_CONTEXT,
  XRAY_V1_TASK,
  type XrayV1Questions,
  xrayV1Questions,
} from "./xray-v1";

export const XRAY_V4_VERSION = "xray-v4";

/**
 * v4 = v3 with one change: the sufficiency question no longer demands hidden-ore approaches.
 * Bot batch4 showed legit sessions with 0–1 reveals stuck at sufficiency 0.43–0.49 under v3,
 * whose criteria literally ask for "enough hidden-ore approaches". A long, well-covered session
 * with no targeted digging is evidence too: it shows the absence of hidden-information use.
 */
export const xrayV4Questions: XrayV1Questions = {
  behavior_class: xrayV1Questions.behavior_class,
  hidden_information_use: xrayV1Questions.hidden_information_use,
  route_naturalness: xrayV1Questions.route_naturalness,
  evidence_sufficiency: noul(
    "Is the telemetry complete and detailed enough to classify this session at all, whether as legitimate or not? Judge data quantity and quality (trajectory coverage, dropped events, session length, blocks broken, and hidden-ore approaches if any), not whether cheating occurred.",
    {
      true: "Coverage is high, few events were dropped, and the session is long and active enough to judge the pattern either way: either several hidden-ore approaches can be assessed, or there was plenty of mining with no targeted digging to assess.",
      false:
        "Coverage gaps, many dropped events, or a very short or nearly idle session make any classification, legitimate or not, unreliable.",
    },
  ),
};

export const xrayV4: QuestionSet = {
  version: XRAY_V4_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V1_IMPORTANT_CONTEXT,
  questions: xrayV4Questions,
};
