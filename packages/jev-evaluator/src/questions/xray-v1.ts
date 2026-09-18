import type { MiningSessionFeatures } from "@jevcraft/schema";
import { choice, type JsonValue, noul, type SystemOneResult, score } from "@typesafe-ai/sdk";
import type { QuestionSet } from "./question-set";

export const XRAY_V1_VERSION = "xray-v1";

export const XRAY_V1_TASK =
  "Evaluate a Minecraft mining session for behavioral evidence of hidden ore knowledge.";

export const XRAY_V1_IMPORTANT_CONTEXT = [
  "High skill and high efficiency alone are not cheating.",
  "Cave exposure and branch-mining patterns can legitimately produce ore streaks.",
  "Judge only from the supplied observations.",
  "Insufficient telemetry must remain insufficient evidence.",
];

export const xrayV1Questions = {
  behavior_class: choice("Which class best describes this mining session?", {
    legit: "Consistent with ordinary exploration, cave mining, branch mining, or plausible luck.",
    suspicious:
      "Contains meaningful anomalies but not enough evidence for likely hidden ore knowledge.",
    likely_xray:
      "Strongly consistent with acting on locations of ores that were not yet legitimately visible.",
    insufficient_evidence:
      "Telemetry quantity or quality is too weak for a reliable classification.",
  }),
  hidden_information_use: noul(
    "Does the path provide evidence that the player acted on hidden ore-location information?",
    {
      true: "Repeated pre-reveal movement, turning, or tunneling is unusually targeted toward hidden valuable ores.",
      false:
        "The route is plausibly explained by visible terrain, ordinary mining patterns, chance, or insufficient data.",
    },
  ),
  // Index 0 = most unnatural, index 4 = most natural. `normalized = score / 4`.
  route_naturalness: score("How natural is the route for legitimate mining?", [
    "Highly unnatural and repeatedly target-directed",
    "Noticeably unnatural",
    "Ambiguous or mixed",
    "Mostly natural",
    "Strongly consistent with legitimate mining",
  ]),
  evidence_sufficiency: noul(
    "Is there enough high-quality behavioral evidence to classify this session?",
  ),
};

export type XrayV1Questions = typeof xrayV1Questions;
export type XrayV1Answers = SystemOneResult<XrayV1Questions>["answers"];

/** Highest rubric index of route_naturalness; used to normalize the score to 0..1. */
export const ROUTE_NATURALNESS_MAX = xrayV1Questions.route_naturalness.criteria.length - 1;

export interface XrayV1State {
  task: string;
  importantContext: string[];
  features: JsonValue;
  [key: string]: JsonValue;
}

/** State sent to Jev. The session id is an opaque handle for our records and is not sent. */
export function buildXrayV1State(features: MiningSessionFeatures): XrayV1State {
  const { sessionId: _omit, ...rest } = features;
  return {
    task: XRAY_V1_TASK,
    importantContext: XRAY_V1_IMPORTANT_CONTEXT,
    features: rest as unknown as JsonValue,
  };
}

export const xrayV1: QuestionSet = {
  version: XRAY_V1_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V1_IMPORTANT_CONTEXT,
  questions: xrayV1Questions,
};
