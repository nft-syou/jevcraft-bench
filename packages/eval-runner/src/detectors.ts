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
  /**
   * Detectors whose output is a decision rather than a score cannot be moved along a ROC curve.
   * They are always evaluated here, and the benchmark reports whether that point respects the
   * shared false-positive ceiling instead of silently degrading them to "flag nothing".
   */
  fixedThreshold?: number;
}

const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

/**
 * The dominant heuristic in existing anti-X-Ray plugins: how much valuable ore the player
 * actually mined per 100 blocks broken.
 */
export const oreRatioDetector: Detector = {
  name: "ore-ratio",
  description: "Valuable ore blocks mined per 100 blocks broken (classic ore-count heuristic).",
  score: (row) =>
    ratio(row.features.session.valuableOreBlocksBroken * 100, row.features.session.blocksBroken),
};

/**
 * The same shape of rule counting first exposures instead of mined blocks. Kept separate
 * because the two differ on most sessions: a vein is exposed once but mined many times.
 */
export const revealRatioDetector: Detector = {
  name: "reveal-ratio",
  description: "Hidden-ore first exposures per 100 blocks broken.",
  score: (row) => row.features.efficiency.valuableOrePer100Blocks,
};

/**
 * Efficiency expressed against a reference population rather than a fixed number. Coarse by
 * construction: the reference here holds only a handful of legitimate sessions.
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
  score: (row) =>
    ratio(row.features.session.valuableOreReveals * 600, row.features.session.durationSec),
};

/**
 * Rule-based path check: did the digging go straight at the ore? The strongest purely geometric
 * heuristic available from the same telemetry.
 */
export const straightLineDetector: Detector = {
  name: "straight-line",
  description: "Mean directness of the approach to each hidden ore (geometric rule).",
  score: (row) => row.features.hiddenOreApproach.meanDirectness,
};

/**
 * A hand-tuned rule using efficiency and directness together, as a rule engine would. The
 * weights and the divisor are fixed by hand, which is the point: it stands for a rule someone
 * wrote, not one fitted to data.
 */
export const classicComboDetector: Detector = {
  name: "classic-combo",
  description: "Hand-tuned rule: half ore efficiency, half approach directness.",
  score: (row) => {
    const per100 = oreRatioDetector.score(row);
    const directness = row.features.hiddenOreApproach.meanDirectness;
    if (per100 === null && directness === null) return null;
    return 0.5 * Math.min(1, (per100 ?? 0) / 8) + 0.5 * (directness ?? 0);
  },
};

/** Inputs the fitted baseline reads, in a fixed order. */
const LOGISTIC_FEATURES: readonly ((row: BenchmarkRow) => number | null)[] = [
  (row) => oreRatioDetector.score(row),
  (row) => row.features.efficiency.valuableOrePer100Blocks,
  (row) => revealPaceDetector.score(row),
  (row) => row.features.hiddenOreApproach.meanDirectness,
  (row) => row.features.hiddenOreApproach.medianDetourRatio,
  (row) => row.features.hiddenOreApproach.aimAlignmentBeforeRevealRatio,
  (row) => row.features.exploration.caveExposureRatio,
  (row) => row.features.exploration.branchMiningLikelihood,
];

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/**
 * A logistic regression over the same features, fitted on the development split. This is the
 * strong baseline: anything JevCraft adds has to beat a model that learns the best linear
 * combination of exactly the numbers it is given. Missing values are imputed with the training
 * median, and inputs are standardised so the L2 penalty treats them alike.
 */
export function createFittedLogisticDetector(
  trainingRows: BenchmarkRow[],
  options: { iterations?: number; learningRate?: number; l2?: number } = {},
): Detector {
  const iterations = options.iterations ?? 4000;
  const learningRate = options.learningRate ?? 0.1;
  const l2 = options.l2 ?? 0.01;

  const medians = LOGISTIC_FEATURES.map((get) =>
    median(trainingRows.map(get).filter((v): v is number => v !== null)),
  );
  const raw = (row: BenchmarkRow) => LOGISTIC_FEATURES.map((get, i) => get(row) ?? medians[i] ?? 0);

  const means = new Array(LOGISTIC_FEATURES.length).fill(0);
  const sds = new Array(LOGISTIC_FEATURES.length).fill(1);
  if (trainingRows.length > 0) {
    const matrix = trainingRows.map(raw);
    for (let j = 0; j < LOGISTIC_FEATURES.length; j++) {
      const column = matrix.map((r) => r[j] ?? 0);
      const mean = column.reduce((a, b) => a + b, 0) / column.length;
      const variance = column.reduce((a, b) => a + (b - mean) ** 2, 0) / column.length;
      means[j] = mean;
      sds[j] = Math.sqrt(variance) || 1;
    }
  }
  const standardise = (row: BenchmarkRow) =>
    raw(row).map((v, j) => (v - (means[j] ?? 0)) / (sds[j] ?? 1));

  const weights = new Array(LOGISTIC_FEATURES.length).fill(0);
  let bias = 0;
  const xs = trainingRows.map(standardise);
  const ys = trainingRows.map((row) =>
    row.label.label === "simulated_xray" || row.label.label === "known_cheat" ? 1 : 0,
  );
  for (let step = 0; step < iterations && xs.length > 0; step++) {
    const gradW = new Array(LOGISTIC_FEATURES.length).fill(0);
    let gradB = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] ?? [];
      let z = bias;
      for (let j = 0; j < weights.length; j++) z += (weights[j] ?? 0) * (x[j] ?? 0);
      const p = 1 / (1 + Math.exp(-z));
      const error = p - (ys[i] ?? 0);
      for (let j = 0; j < weights.length; j++) gradW[j] += error * (x[j] ?? 0);
      gradB += error;
    }
    for (let j = 0; j < weights.length; j++) {
      weights[j] =
        (weights[j] ?? 0) - learningRate * (gradW[j] / xs.length + l2 * (weights[j] ?? 0));
    }
    bias -= learningRate * (gradB / xs.length);
  }

  return {
    name: "fitted-logistic",
    description:
      "Logistic regression over the same features, fitted on the development split (strong baseline).",
    score: (row) => {
      const x = standardise(row);
      let z = bias;
      for (let j = 0; j < weights.length; j++) z += (weights[j] ?? 0) * (x[j] ?? 0);
      return 1 / (1 + Math.exp(-z));
    },
  };
}

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
 * The shipped policy as it actually behaves: one decision per session, not a score. Evaluated at
 * its own fixed point, so the benchmark can say whether that point clears the shared ceiling.
 */
export const deployedPolicyDetector: Detector = {
  name: "jevcraft-policy",
  description: "The shipped policy outcome (review or high_priority_review).",
  fixedThreshold: 1,
  score: (row) => {
    const outcome = row.decision?.policyOutcome;
    if (outcome === undefined) return null;
    return outcome === "review" || outcome === "high_priority_review" ? 1 : 0;
  },
};

export const CLASSIC_DETECTORS: readonly Detector[] = [
  oreRatioDetector,
  revealRatioDetector,
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
