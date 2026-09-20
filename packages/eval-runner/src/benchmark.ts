import { type BenchmarkRow, CLASSIC_DETECTORS, type Detector } from "./detectors";
import type { ConfusionMatrix } from "./metrics";
import { isTruthPositive } from "./metrics";

export interface Interval {
  low: number;
  high: number;
}

export interface OperatingPoint {
  threshold: number;
  cm: ConfusionMatrix;
  recall: number | null;
  fpr: number | null;
  precision: number | null;
  /** 95% Wilson intervals; a point estimate from tens of sessions is not a performance figure. */
  recallInterval: Interval | null;
  fprInterval: Interval | null;
}

export interface DetectorResult {
  name: string;
  description: string;
  /** Sessions the detector could score at all, on the evaluation split. */
  scored: number;
  /** Rank-based area under the ROC curve; 0.5 is chance. Null when a class is missing. */
  auc: number | null;
  best: OperatingPoint | null;
  /** True when the detector has one fixed decision point and cannot be moved along a ROC curve. */
  fixed: boolean;
  /** False when a fixed-point detector's own FPR exceeds the shared ceiling. */
  respectsCeiling: boolean;
  recallBySubtype: Record<string, number | null>;
}

/** 95% Wilson score interval for a binomial proportion. */
export function wilsonInterval(successes: number, trials: number): Interval | null {
  if (trials === 0) return null;
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const centre = p + (z * z) / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  };
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
    recallInterval: wilsonInterval(cm.tp, cm.tp + cm.fn),
    fprInterval: wilsonInterval(cm.fp, cm.fp + cm.tn),
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
 * Picks a threshold on `tuningRows` and measures it on `evalRows`. When those are different
 * splits, no detector sees the evaluation data while choosing its cut-off, which is the only way
 * the comparison says anything about unseen sessions.
 *
 * Detectors with a `fixedThreshold` are measured there regardless; the result records whether
 * that point clears the ceiling rather than silently degrading them to "flag nothing".
 */
export function evaluateDetector(
  evalRows: BenchmarkRow[],
  detector: Detector,
  maxFpr: number,
  tuningRows: BenchmarkRow[] = evalRows,
): DetectorResult {
  let best: OperatingPoint | null;
  let respectsCeiling = true;

  if (detector.fixedThreshold !== undefined) {
    best = pointAt(evalRows, detector, detector.fixedThreshold);
    respectsCeiling = best.fpr === null || best.fpr <= maxFpr;
  } else {
    const candidates = [
      ...new Set([
        ...tuningRows
          .map((row) => detector.score(row))
          .filter((s): s is number => s !== null)
          .sort((a, b) => a - b),
        Number.POSITIVE_INFINITY,
      ]),
    ];
    let chosen: number | null = null;
    let chosenRecall = -1;
    for (const threshold of candidates) {
      const onTuning = pointAt(tuningRows, detector, threshold);
      if (onTuning.fpr !== null && onTuning.fpr > maxFpr) continue;
      if ((onTuning.recall ?? 0) > chosenRecall) {
        chosenRecall = onTuning.recall ?? 0;
        chosen = threshold;
      }
    }
    best = chosen === null ? null : pointAt(evalRows, detector, chosen);
    respectsCeiling = best === null || best.fpr === null || best.fpr <= maxFpr;
  }

  const recallBySubtype: Record<string, number | null> = {};
  if (best !== null) {
    const threshold = best.threshold;
    const subtypes = new Set(
      evalRows
        .filter((r) => isTruthPositive(r.label.label))
        .map((r) => r.label.subtype ?? "unspecified"),
    );
    for (const subtype of [...subtypes].sort()) {
      const group = evalRows.filter(
        (r) => isTruthPositive(r.label.label) && (r.label.subtype ?? "unspecified") === subtype,
      );
      const caught = group.filter((r) => {
        const score = detector.score(r);
        return score !== null && score >= threshold;
      }).length;
      recallBySubtype[subtype] = rate(caught, group.length);
    }
  }

  return {
    name: detector.name,
    description: detector.description,
    scored: evalRows.filter((row) => detector.score(row) !== null).length,
    auc: rocAuc(evalRows, detector),
    best,
    fixed: detector.fixedThreshold !== undefined,
    respectsCeiling,
    recallBySubtype,
  };
}

export interface HeadToHead {
  challenger: string;
  baseline: string;
  /** What the paired test ran over, e.g. "all sessions" or "detour_xray positives only". */
  scope: string;
  challengerOnly: number;
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
    if (pmf(k) <= observed * (1 + 1e-9)) total += pmf(k);
  }
  return Math.min(1, total);
}

/**
 * Paired comparison of two detectors at given thresholds: McNemar's exact test over the sessions
 * where exactly one of them is correct. `scope` is carried through because the same counts mean
 * different things over all sessions and over one subtype's positives.
 */
export function headToHead(
  rows: BenchmarkRow[],
  challenger: Detector,
  challengerThreshold: number,
  baseline: Detector,
  baselineThreshold: number,
  scope = "all sessions",
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
    scope,
    challengerOnly,
    baselineOnly,
    pValue: exactBinomialP(challengerOnly, challengerOnly + baselineOnly),
  };
}

export interface BenchmarkInput {
  title: string;
  /** Sessions the reported numbers are measured on. */
  rows: BenchmarkRow[];
  /**
   * Sessions every tunable detector may use to pick its threshold. When omitted the evaluation
   * set is used, which measures fit rather than generalisation and is labelled as such.
   */
  tuningRows?: BenchmarkRow[];
  detectors: readonly Detector[];
  maxFpr: number;
  challenger?: string;
}

const fmt = (v: number | null, digits = 3): string => (v === null ? "n/a" : v.toFixed(digits));
const withInterval = (v: number | null, ci: Interval | null): string =>
  v === null ? "n/a" : ci === null ? fmt(v) : `${fmt(v)} [${fmt(ci.low, 2)}-${fmt(ci.high, 2)}]`;

/** Markdown comparison of every detector at a matched false-positive ceiling. */
export function buildBenchmarkReport(input: BenchmarkInput): string {
  const heldOut = input.tuningRows !== undefined && input.tuningRows !== input.rows;
  const tuning = input.tuningRows ?? input.rows;
  const results = input.detectors.map((d) => evaluateDetector(input.rows, d, input.maxFpr, tuning));
  const positives = input.rows.filter((r) => isTruthPositive(r.label.label)).length;
  const subtypes = [
    ...new Set(
      input.rows
        .filter((r) => isTruthPositive(r.label.label))
        .map((r) => r.label.subtype ?? "unspecified"),
    ),
  ].sort();

  const challengerName = input.challenger ?? input.detectors.at(-1)?.name;
  const challengerResult = results.find((r) => r.name === challengerName);
  const challengerDetector = input.detectors.find((d) => d.name === challengerName);
  const rivalNames = new Set([...CLASSIC_DETECTORS.map((d) => d.name), "fitted-logistic"]);
  // Only a rival that respects the shared ceiling is a fair comparison; one that blew past it
  // bought its recall with false positives the challenger was not allowed to spend.
  const bestRival = results
    .filter((r) => rivalNames.has(r.name) && r.best !== null && r.respectsCeiling)
    .sort((a, b) => (b.best?.recall ?? 0) - (a.best?.recall ?? 0))[0];
  const bestRivalDetector = input.detectors.find((d) => d.name === bestRival?.name);

  const duels: HeadToHead[] = [];
  if (challengerResult?.best && challengerDetector && bestRival?.best && bestRivalDetector) {
    duels.push(
      headToHead(
        input.rows,
        challengerDetector,
        challengerResult.best.threshold,
        bestRivalDetector,
        bestRival.best.threshold,
      ),
    );
    for (const subtype of subtypes) {
      const group = input.rows.filter(
        (r) => isTruthPositive(r.label.label) && (r.label.subtype ?? "unspecified") === subtype,
      );
      duels.push(
        headToHead(
          group,
          challengerDetector,
          challengerResult.best.threshold,
          bestRivalDetector,
          bestRival.best.threshold,
          `${subtype} positives only`,
        ),
      );
    }
  }

  const lines = [
    `# JevCraft detection benchmark: ${input.title}`,
    "",
    `Evaluation set: ${input.rows.length} sessions (${positives} X-Ray, ${input.rows.length - positives} legitimate).`,
    heldOut
      ? `Thresholds are chosen on a separate development set of ${tuning.length} sessions, then frozen. Nothing tunes on the evaluation set.`
      : "**Thresholds are chosen on the evaluation set itself.** These numbers describe fit, not generalisation.",
    `Shared ceiling: false-positive rate <= ${input.maxFpr.toFixed(3)}.`,
    "Sessions a detector cannot score count as not flagged, as they would in production.",
    "Ranges are 95% Wilson intervals.",
    "",
    "## Recall at the matched false-positive ceiling",
    "",
    "A detector marked **over ceiling** spent more false positives on the evaluation set than the",
    "ceiling allows, so its recall is not comparable with the rest and it is excluded from the duel.",
    "",
    "| Detector | Scored | AUC | Threshold | Recall | FPR | Precision |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const mark = r.fixed ? " (fixed point)" : "";
      const warn = r.respectsCeiling ? "" : " **over ceiling**";
      return `${[
        `| ${r.name}${mark}`,
        r.scored,
        fmt(r.auc),
        r.best === null ? "n/a" : fmt(r.best.threshold, 2),
        r.best === null ? "n/a" : withInterval(r.best.recall, r.best.recallInterval),
        r.best === null ? "n/a" : withInterval(r.best.fpr, r.best.fprInterval) + warn,
        r.best === null ? "n/a" : fmt(r.best.precision),
      ].join(" | ")} |`;
    }),
    "",
    "## Recall by X-Ray style at those operating points",
    "",
    `| Detector | ${subtypes.join(" | ")} |`,
    `| --- | ${subtypes.map(() => "---").join(" | ")} |`,
    ...results.map(
      (r) =>
        `| ${r.name} | ${subtypes.map((s) => fmt(r.recallBySubtype[s] ?? null)).join(" | ")} |`,
    ),
    "",
    ...(duels.length === 0
      ? []
      : [
          "## Head to head",
          "",
          `\`${duels[0]?.challenger}\` against the strongest non-Jev detector, \`${duels[0]?.baseline}\`,`,
          "counting sessions where exactly one of them is right (McNemar's exact test).",
          "Subtype rows cover that style's positives only, so they say nothing about false positives.",
          "",
          "| Scope | Only challenger right | Only baseline right | Two-sided p |",
          "| --- | --- | --- | --- |",
          ...duels.map(
            (d) =>
              `| ${d.scope} | ${d.challengerOnly} | ${d.baselineOnly} | ${d.pValue.toFixed(4)} |`,
          ),
          "",
        ]),
    "## What each detector stands for",
    "",
    ...results.map((r) => `- **${r.name}**: ${r.description}`),
    "",
  ];
  return lines.join("\n");
}
