import { noul } from "@typesafe-ai/sdk";
import type { QuestionSet } from "./question-set";
import {
  XRAY_V1_IMPORTANT_CONTEXT,
  XRAY_V1_TASK,
  type XrayV1Questions,
  xrayV1Questions,
} from "./xray-v1";

export const XRAY_V2_VERSION = "xray-v2";

/**
 * v2 changes exactly one thing relative to v1: `evidence_sufficiency` is reworded so it asks
 * about telemetry quantity and quality, not about evidence *of cheating*. The 2026-09-19
 * baselines showed v1's sufficiency tracking suspicion (legit 0.5–0.6, direct X-Ray 0.76),
 * which pushed legitimate sessions into `insufficient_evidence`. One extra context line
 * states the intended reading. Everything else is byte-identical to v1 so the two sets can be
 * compared on the same dataset.
 */
export const XRAY_V2_IMPORTANT_CONTEXT = [
  ...XRAY_V1_IMPORTANT_CONTEXT,
  "Evidence sufficiency is about telemetry completeness, not about whether cheating occurred: a clearly legitimate session with complete telemetry has sufficient evidence.",
];

export const xrayV2Questions: XrayV1Questions = {
  behavior_class: xrayV1Questions.behavior_class,
  hidden_information_use: xrayV1Questions.hidden_information_use,
  route_naturalness: xrayV1Questions.route_naturalness,
  evidence_sufficiency: noul(
    "Is the telemetry complete and detailed enough to classify this session at all, whether as legitimate or not? Judge data quantity and quality (trajectory coverage, dropped events, number of hidden-ore approaches, session length), not whether cheating occurred.",
    {
      true: "Coverage is high, few events were dropped, and there are enough hidden-ore approaches and session length to judge the pattern either way.",
      false:
        "Coverage gaps, many dropped events, very few approaches, or a very short session make any classification, legitimate or not, unreliable.",
    },
  ),
};

export const xrayV2: QuestionSet = {
  version: XRAY_V2_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V2_IMPORTANT_CONTEXT,
  questions: xrayV2Questions,
};
