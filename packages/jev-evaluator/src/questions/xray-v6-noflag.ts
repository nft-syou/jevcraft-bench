import type { QuestionSet } from "./question-set";
import { xrayV6 } from "./xray-v6";

export const XRAY_V6_NOFLAG_VERSION = "xray-v6-noflag";

/**
 * Ablation of v6: identical questions and context, but `quality.enoughEvidence` is not sent.
 * Jev's evidence_sufficiency tracked that flag closely; this measures how much of its answer
 * is its own judgement of the telemetry.
 */
export const xrayV6NoFlag: QuestionSet = {
  ...xrayV6,
  version: XRAY_V6_NOFLAG_VERSION,
  redact: ["quality.enoughEvidence"],
};
