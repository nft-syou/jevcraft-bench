import { noul } from "@typesafe-ai/sdk";
import type { QuestionSet, XrayQuestions } from "./question-set";
import { XRAY_V1_IMPORTANT_CONTEXT, XRAY_V1_TASK } from "./xray-v1";
import { xrayV4Questions } from "./xray-v4";

export const XRAY_V6_VERSION = "xray-v6";

/**
 * v6 = v4 + a fifth, dedicated question about approach geometry. On 56 bot sessions the
 * hiddenOreApproach features separated direct X-Ray from strip mining clearly (directness
 * 0.86 vs 0.63, detour 1.1 vs 2.4) but behavior_class barely moved; a structured question is
 * the Jev-native way to make the model commit on that evidence alone.
 */
export const xrayV6Questions: XrayQuestions = {
  ...xrayV4Questions,
  approach_targeting: noul(
    "Looking only at hiddenOreApproach (meanDirectness, medianDetourRatio, aimAlignmentBeforeRevealRatio, turnsTowardHiddenOre, directionChangesNearOre, sampleCount): did the miner's movement before hidden ores were exposed look like deliberate approaches toward those ores rather than ordinary tunnelling that happened to meet them?",
    {
      true: "Approaches are close to straight lines to the ore (directness near 1, detour ratio near 1), the view was often already on the ore before it was exposed, and there were several such approaches.",
      false:
        "Approaches look like the tunnel itself: low directness or high detour ratio, little aim alignment, few or no approaches, or reveals that simply lie along an existing straight tunnel.",
    },
  ),
};

export const xrayV6: QuestionSet = {
  version: XRAY_V6_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V1_IMPORTANT_CONTEXT,
  questions: xrayV6Questions,
};
