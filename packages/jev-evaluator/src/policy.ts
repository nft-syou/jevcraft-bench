import type { JevAnswers, PolicyOutcome } from "@jevcraft/schema";

export interface PolicyThresholds {
  /** Below this evidence_sufficiency the session is not classified. */
  minEvidenceSufficiency: number;
  /** P(likely_xray) needed for high priority review. */
  highPriorityXrayProbability: number;
  /** hidden_information_use needed for high priority review. */
  highPriorityHiddenInfo: number;
  /** behavior_class confidence (distribution shape, not P(likely_xray)) needed for high priority. */
  highPriorityConfidence: number;
  /** P(likely_xray) + P(suspicious) needed for ordinary review. */
  reviewCombinedProbability: number;
  /**
   * Optional approach gate for ordinary review (xray-v6+ answers only): a review also needs
   * `approachTargeting >= reviewMinApproachTargeting`, unless P(likely_xray) is at least
   * `reviewBypassXrayProbability`. Null disables the gate. Sessions without the answer are not gated.
   */
  reviewMinApproachTargeting: number | null;
  reviewBypassXrayProbability: number | null;
}

/** Provisional values from spec §10. Tune from labeled data; never treat as final. */
export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  minEvidenceSufficiency: 0.65,
  highPriorityXrayProbability: 0.9,
  highPriorityHiddenInfo: 0.85,
  highPriorityConfidence: 0.6,
  reviewCombinedProbability: 0.75,
  // On since 2026-09-19: chosen on 56 bot sessions (removed the one lucky-streak FP for one lost
  // detour X-Ray), then validated on 21 held-out legit sessions where it cut false positives from
  // 9 to 2. Still provisional: bots, one seed, one world. See docs/baselines/README.md.
  reviewMinApproachTargeting: 0.15,
  reviewBypassXrayProbability: 0.6,
};

/**
 * Maps Jev answers to an admin-facing outcome. This never bans, kicks, or rolls back;
 * the strongest outcome is a request for human review.
 */
export function applyPolicy(
  answers: JevAnswers,
  quality: { enoughEvidence: boolean },
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): PolicyOutcome {
  if (!quality.enoughEvidence) return "insufficient_evidence";
  if (answers.evidenceSufficiency < thresholds.minEvidenceSufficiency) {
    return "insufficient_evidence";
  }

  const p = answers.behaviorClass.probabilities;
  if (
    p.likely_xray >= thresholds.highPriorityXrayProbability &&
    answers.hiddenInformationUse >= thresholds.highPriorityHiddenInfo &&
    answers.behaviorClass.confidence >= thresholds.highPriorityConfidence
  ) {
    return "high_priority_review";
  }
  if (p.likely_xray + p.suspicious >= thresholds.reviewCombinedProbability) {
    const gate = thresholds.reviewMinApproachTargeting;
    const targeting = answers.approachTargeting;
    if (gate !== null && targeting !== undefined && targeting < gate) {
      const bypass = thresholds.reviewBypassXrayProbability;
      if (bypass === null || p.likely_xray < bypass) return "no_action";
    }
    return "review";
  }
  return "no_action";
}
