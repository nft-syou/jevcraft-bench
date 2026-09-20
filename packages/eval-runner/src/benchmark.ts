import { type BenchmarkRow, CLASSIC_DETECTORS, type Detector } from "./detectors";
import type { ConfusionMatrix } from "./metrics";
import { isTruthPositive } from "./metrics";

export interface OperatingPoint {
  threshold: number;
  cm: ConfusionMatrix;
  recall: number | null;
  fpr: number | null;
  precision: number | null;
}

export interface DetectorResult {
  name: string;
  description: string;
  /** Sessions the detector could score at all. */
  scored: number;
  /** Rank-based area under the ROC curve; 0.5 is chance. Null when a class is missing. */
  auc: number | null;
  /** Best recall subject to FPR <= target, or null when no threshold satisfies it. */
  best: OperatingPoint | null;
  /** Recall on each X-Ray subtype at `best`. */
  recallBySubtype: Record<string, number | null>;
}

/** Flags a session when its score is at or above the threshold; unscorable sessions never flag. */
function confusionAt(rows: BenchmarkRow[], detector: Detector, threshold: number): ConfusionMatrix {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const row of rows) {
    const score = detector.score(row);
    const flagged = score !== null && score >= threshold;
    const truth = isTruthPositive(row.label.label);
    if (truth && flagged) cm.tp++;
    else if (!truth && flagged) cm.fp++;
    else if (truth) cm.fn++;
    else cm.tn++;
  }
  return cm;
}

const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d);

function pointAt(rows: BenchmarkRow[], detector: Detector, threshold: number): OperatingPoint {
  const cm = confusionAt(rows, detector, threshold);
  return {
    threshold,
    cm,
    recall: rate(cm.tp, cm.tp + cm.fn),
    fpr: rate(cm.fp, cm.fp + cm.tn),
    precision: rate(cm.tp, cm.tp + cm.fp),
  };
}

/**
 * Rank-based AUC (Mann-Whitney U) with ties averaged. Sessions the detector cannot score rank
 * below every scored session, which is how they behave in production: never flagged.
 */
export function rocAuc(rows: BenchmarkRow[], detector: Detector): number | null {
  const scored = rows.map((row) => ({
    score: detector.score(row) ?? Number.NEGATIVE_INFINITY,
    positive: isTruthPositive(row.label.label),
  }));
  const positives = scored.filter((s) => s.positive).length;
  const negatives = scored.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const ranks = new Array<number>(sorted.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]?.score === sorted[i]?.score) j++;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = averageRank;
    i = j + 1;
  }
  let rankSum = 0;
  for (let k = 0; k < sorted.length; k++) {
    if (sorted[k]?.positive) rankSum += ranks[k] ?? 0;
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/**
 * Evaluates one detector: its AUC, and the threshold that maximises recall while keeping the
 * false-positive rate at or below `maxFpr`. Every distinct score is tried as a threshold, so
 * each detector is given the best cut-off this very dataset allows — deliberately generous to
 * the baselines, since a real deployment could not tune on its own test set.
 */
export function evaluateDetector(
  rows: BenchmarkRow[],
  detector: Detector,
  maxFpr: number,
): DetectorResult {
  const scores = rows
    .map((row) => detector.score(row))
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  const candidates = [...new Set([...scores, Number.POSITIVE_INFINITY])];

  let best: OperatingPoint | null = null;
  for (const threshold of candidates) {
    const point = pointAt(rows, detector, threshold);
    if (point.fpr !== null && point.fpr > maxFpr) continue;
    if (best === null || (point.recall ?? 0) > (best.recall ?? 0)) best = point;
  }

  const recallBySubtype: Record<string, number | null> = {};
  if (best !== null) {
    const subtypes = new Set(
      rows
        .filter((r) => isTruthPositive(r.label.label))
        .map((r) => r.label.subtype ?? "unspecified"),
    );
    for (const subtype of [...subtypes].sort()) {
      const group = rows.filter(
        (r) => isTruthPositive(r.label.label) && (r.label.subtype ?? "unspecified") === subtype,
      );
      const caught = group.filter((r) => {
        const score = detector.score(r);
        return score !== null && best !== null && score >= best.threshold;
      }).length;
      recallBySubtype[subtype] = rate(caught, group.length);
    }
  }

  return {
    name: detector.name,
    description: detector.description,
    scored: scores.length,
    auc: rocAuc(rows, detector),
    best,
    recallBySubtype,
  };
}

export interface HeadToHead {
  challenger: string;
  baseline: string;
  /** Sessions the challenger gets right and the baseline gets wrong. */
  challengerOnly: number;
  /** Sessions the baseline gets right and the challenger gets wrong. */
  baselineOnly: number;
  /** Two-sided exact McNemar p-value over the discordant pairs. */
  pValue: number;
}

const logFactorial = (n: number): number => {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
};

/** Two-sided exact binomial test at p = 0.5, used for McNemar on the discordant pairs. */
export function exactBinomialP(successes: number, trials: number): number {
  if (trials === 0) return 1;
  const pmf = (k: number) =>
    Math.exp(logFactorial(trials) - logFactorial(k) - logFactorial(trials - k) - trials * Math.LN2);
  const observed = pmf(successes);
  let total = 0;
  for (let k = 0; k <= trials; k++) {
    // Guard against floating-point noise making an equally likely outcome look larger.
    if (pmf(k) <= observed * (1 + 1e-9)) total += pmf(k);
  }
  return Math.min(1, total);
}

/**
 * Paired comparison of two detectors at their own operating points: McNemar's exact test over
 * the sessions where exactly one of them is correct. Answers "is the gap bigger than chance?".
 */
export function headToHead(
  rows: BenchmarkRow[],
  challenger: Detector,
  challengerThreshold: number,
  baseline: Detector,
  baselineThreshold: number,
): HeadToHead {
  const correct = (detector: Detector, threshold: number, row: BenchmarkRow): boolean => {
    const score = detector.score(row);
    const flagged = score !== null && score >= threshold;
    return flagged === isTruthPositive(row.label.label);
  };
  let challengerOnly = 0;
  let baselineOnly = 0;
  for (const row of rows) {
    const a = correct(challenger, challengerThreshold, row);
    const b = correct(baseline, baselineThreshold, row);
    if (a && !b) challengerOnly++;
    else if (b && !a) baselineOnly++;
  }
  return {
    challenger: challenger.name,
    baseline: baseline.name,
    challengerOnly,
    baselineOnly,
    pValue: exactBinomialP(challengerOnly, challengerOnly + baselineOnly),
  };
}

export interface BenchmarkInput {
  title: string;
  rows: BenchmarkRow[];
  detectors: readonly Detector[];
  /** Operating points are compared at this false-positive rate. */
  maxFpr: number;
  /** Detector whose gap against the best classic baseline is tested; defaults to the last one. */
  challenger?: string;
}

const fmt = (v: number | null, digits = 3): string => (v === null ? "n/a" : v.toFixed(digits));

/** Markdown comparison of every detector at a matched false-positive rate. */
export function buildBenchmarkReport(input: BenchmarkInput): string {
  const results = input.detectors.map((d) => evaluateDetector(input.rows, d, input.maxFpr));
  const positives = input.rows.filter((r) => isTruthPositive(r.label.label)).length;
  const subtypes = [
    ...new Set(
      input.rows
        .filter((r) => isTruthPositive(r.label.label))
        .map((r) => r.label.subtype ?? "unspecified"),
    ),
  ].sort();

  // Head-to-head: the challenger against the strongest classic baseline by recall.
  const challengerName = input.challenger ?? input.detectors.at(-1)?.name;
  const challengerResult = results.find((r) => r.name === challengerName);
  const challengerDetector = input.detectors.find((d) => d.name === challengerName);
  const classicNames = new Set(CLASSIC_DETECTORS.map((d) => d.name));
  const bestClassic = results
    .filter((r) => classicNames.has(r.name) && r.best !== null)
    .sort((a, b) => (b.best?.recall ?? 0) - (a.best?.recall ?? 0))[0];
  const bestClassicDetector = input.detectors.find((d) => d.name === bestClassic?.name);
  const duel =
    challengerResult?.best && challengerDetector && bestClassic?.best && bestClassicDetector
      ? headToHead(
          input.rows,
          challengerDetector,
          challengerResult.best.threshold,
          bestClassicDetector,
          bestClassic.best.threshold,
        )
      : null;

  const lines = [
    `# JevCraft detection benchmark: ${input.title}`,
    "",
    `Sessions: ${input.rows.length} (${positives} X-Ray, ${input.rows.length - positives} legitimate).`,
    `Every detector is compared at the same ceiling: false-positive rate <= ${input.maxFpr.toFixed(3)}.`,
    "Each classic detector is given the threshold that maximises its recall on this very dataset,",
    "which flatters it: a real deployment cannot tune on its own test set.",
    "Sessions a detector cannot score count as not flagged, as they would in production.",
    "",
    "## Recall at matched false-positive rate",
    "",
    "| Detector | Scored | AUC | Threshold | Recall | FPR | Precision |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        [
          `| ${r.name}`,
          r.scored,
          fmt(r.auc),
          r.best === null ? "n/a" : fmt(r.best.threshold, 2),
          r.best === null ? "n/a" : fmt(r.best.recall),
          r.best === null ? "n/a" : fmt(r.best.fpr),
          r.best === null ? "n/a" : fmt(r.best.precision),
        ].join(" | ") + " |",
    ),
    "",
    "## Recall by X-Ray style at that operating point",
    "",
    `| Detector | ${subtypes.join(" | ")} |`,
    `| --- | ${subtypes.map(() => "---").join(" | ")} |`,
    ...results.map(
      (r) =>
        `| ${r.name} | ${subtypes.map((s) => fmt(r.recallBySubtype[s] ?? null)).join(" | ")} |`,
    ),
    "",
    ...(duel === null
      ? []
      : [
          "## Head to head at those operating points",
          "",
          `\`${duel.challenger}\` against the strongest classic baseline, \`${duel.baseline}\`, on the`,
          "sessions where exactly one of them is right (McNemar's exact test).",
          "",
          "| Item | Value |",
          "| --- | --- |",
          `| Sessions only \`${duel.challenger}\` gets right | ${duel.challengerOnly} |`,
          `| Sessions only \`${duel.baseline}\` gets right | ${duel.baselineOnly} |`,
          `| Two-sided p | ${duel.pValue.toFixed(4)} |`,
          "",
        ]),
    "## What each detector stands for",
    "",
    ...results.map((r) => `- **${r.name}**: ${r.description}`),
    "",
  ];
  return lines.join("\n");
}
