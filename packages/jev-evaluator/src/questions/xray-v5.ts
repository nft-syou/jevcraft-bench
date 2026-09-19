import type { QuestionSet } from "./question-set";
import { XRAY_V1_IMPORTANT_CONTEXT, XRAY_V1_TASK } from "./xray-v1";
import { xrayV4Questions } from "./xray-v4";

export const XRAY_V5_VERSION = "xray-v5";

/**
 * v5 = v4 questions + context that explains the two features Jev was not using:
 * `efficiency.baselinePercentile` (rank against legitimate reference sessions on this server,
 * spec §9) and the approach metrics. No thresholds are given; only what the numbers mean.
 */
export const XRAY_V5_IMPORTANT_CONTEXT = [
  ...XRAY_V1_IMPORTANT_CONTEXT,
  "efficiency.baselinePercentile is this session's valuable-ore efficiency ranked against legitimate reference sessions recorded on the same server (100 = above every reference session). It is null when no baseline exists.",
  "hiddenOreApproach describes the movement before each hidden ore was first exposed: meanDirectness near 1 and medianDetourRatio near 1 mean the digging went straight to the ore; turnsTowardHiddenOre counts turns that pointed the miner at an ore that was not yet visible.",
  "In ordinary tunnelling a hidden ore is met by chance, so approaches to it look like the tunnel itself rather than like a change of course toward the ore.",
];

export const xrayV5: QuestionSet = {
  version: XRAY_V5_VERSION,
  task: XRAY_V1_TASK,
  importantContext: XRAY_V5_IMPORTANT_CONTEXT,
  questions: xrayV4Questions,
};
