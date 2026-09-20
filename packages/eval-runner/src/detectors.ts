import type { DecisionRecord, MiningSessionFeatures, SessionLabel } from "@jevcraft/schema";

/** One labelled session with its features and, when it was evaluated, the stored Jev answers. */
export interface BenchmarkRow {
  sessionId: string;
  features: MiningSessionFeatures;
  label: SessionLabel;
  decision: DecisionRecord | null;
}

/**
 * A detector scores a session; higher means more suspicious. `null` means the detector cannot
 * judge this session at all, which in production means it stays silent, so the benchmark counts
 * it as "not flagged".
 */
export interface Detector {
  name: string;
  /** What real-world approach this stands for. */
  description: string;
  score(row: BenchmarkRow): number | null;
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/**
 * The dominant heuristic in existing anti-X-Ray plugins: valuable ore found per 100 blocks
 * broken, flagged above a threshold.
 */
export const oreRatioDetector: Detector = {
  name: "ore-ratio",
  description: "Valuable ore per 100 blocks broken (classic ore-count heuristic).",
  score: (row) => row.features.efficiency.valuableOrePer100Blocks,
};

/**
 * The same idea expressed against a reference population instead of a fixed number: how the
 * session's efficiency ranks among legitimate sessions on this server.
 */
export const orePercentileDetector: Detector = {
  name: "ore-percentile",
  description: "Efficiency percentile against a legitimate reference population.",
  score: (row) => row.features.efficiency.baselinePercentile,
};

/**
 * "Too lucky, too fast": how many hidden ores were revealed per 10 minutes of the session.
 * Stands for streak and luck-based detectors.
 */
export const revealPaceDetector: Detector = {
  name: "reveal-pace",
  description: "Hidden-ore reveals per 10 minutes (streak / luck detectors).",
  score: (row) => {
    const { durationSec } = row.features.session;
    return ratio(row.features.session.valuableOreReveals * 600, durationSec);
  },
};

/**
 * Rule-based path check: did the digging go straight at the ore? This is the strongest purely
 * geometric heuristic available from the same telemetry.
 */
export const straightLineDetector: Detector = {
  name: "straight-line",
  description: "Mean directness of the approach to each hidden ore (geometric rule).",
  score: (row) => row.features.hiddenOreApproach.meanDirectness,
};

/**
 * The best a hand-tuned rule engine does with these features: efficiency and directness
 * combined, each normalised to 0..1 and weighted equally.
 */
export const classicComboDetector: Detector = {
  name: "classic-combo",
  description: "Hand-tuned rule: half ore efficiency, half approach directness.",
  score: (row) => {
    const per100 = row.features.efficiency.valuableOrePer100Blocks;
    const directness = row.features.hiddenOreApproach.meanDirectness;
    if (per100 === null && directness === null) return null;
    const e = Math.min(1, (per100 ?? 0) / 8);
    const d = directness ?? 0;
    return 0.5 * e + 0.5 * d;
  },
};

/** Jev's own probability that the session used hidden ore locations. */
export const jevLikelyXrayDetector: Detector = {
  name: "jev-likely-xray",
  description: "P(likely_xray) from the Jev answer (xray-v6).",
  score: (row) => row.decision?.answers?.behaviorClass.probabilities.likely_xray ?? null,
};

/** Jev's dedicated approach question, the answer the deployed policy gates on. */
export const jevApproachTargetingDetector: Detector = {
  name: "jev-approach-targeting",
  description: "P(approach_targeting) from the Jev answer (xray-v6).",
  score: (row) => row.decision?.answers?.approachTargeting ?? null,
};

/**
 * The shipped policy as a single detector: 1 when the recorded outcome asks for review.
 * Its ROC has only one useful point, which is the point operators would actually run.
 */
export const deployedPolicyDetector: Detector = {
  name: "jevcraft-policy",
  description: "The shipped policy outcome (review or high_priority_review).",
  score: (row) => {
    const outcome = row.decision?.policyOutcome;
    if (outcome === undefined) return null;
    return outcome === "review" || outcome === "high_priority_review" ? 1 : 0;
  },
};

export const CLASSIC_DETECTORS: readonly Detector[] = [
  oreRatioDetector,
  orePercentileDetector,
  revealPaceDetector,
  straightLineDetector,
  classicComboDetector,
];

export const JEV_DETECTORS: readonly Detector[] = [
  jevLikelyXrayDetector,
  jevApproachTargetingDetector,
  deployedPolicyDetector,
];
