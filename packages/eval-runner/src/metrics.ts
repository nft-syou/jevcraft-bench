import type { DecisionRecord, GroundTruthLabel } from "@jevcraft/schema";
import type { LabeledDecision } from "./join";

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface BinaryMetrics {
  precision: number | null;
  recall: number | null;
  fpr: number | null;
  fnr: number | null;
  f1: number | null;
  accuracy: number | null;
}

export const isTruthPositive = (label: GroundTruthLabel): boolean =>
  label === "simulated_xray" || label === "known_cheat";

export const policyPredictsPositive = (d: DecisionRecord): boolean =>
  d.policyOutcome === "review" || d.policyOutcome === "high_priority_review";

export const xrayProbabilityAtLeast =
  (threshold: number) =>
  (d: DecisionRecord): boolean =>
    d.answers !== null && d.answers.behaviorClass.probabilities.likely_xray >= threshold;

export function confusionMatrix(
  rows: LabeledDecision[],
  predictPositive: (d: DecisionRecord) => boolean,
): ConfusionMatrix {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const row of rows) {
    const truth = isTruthPositive(row.label.label);
    const predicted = predictPositive(row.decision);
    if (truth && predicted) cm.tp++;
    else if (!truth && predicted) cm.fp++;
    else if (truth && !predicted) cm.fn++;
    else cm.tn++;
  }
  return cm;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export function metricsFrom(cm: ConfusionMatrix): BinaryMetrics {
  const precision = ratio(cm.tp, cm.tp + cm.fp);
  const recall = ratio(cm.tp, cm.tp + cm.fn);
  const f1 =
    precision === null || recall === null
      ? null
      : precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
  return {
    precision,
    recall,
    fpr: ratio(cm.fp, cm.fp + cm.tn),
    fnr: ratio(cm.fn, cm.fn + cm.tp),
    f1,
    accuracy: ratio(cm.tp + cm.tn, cm.tp + cm.fp + cm.tn + cm.fn),
  };
}

export const DEFAULT_SWEEP = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export interface SweepPoint {
  threshold: number;
  cm: ConfusionMatrix;
  metrics: BinaryMetrics;
}

export function thresholdSweep(rows: LabeledDecision[], thresholds: number[]): SweepPoint[] {
  return thresholds.map((threshold) => {
    const cm = confusionMatrix(rows, xrayProbabilityAtLeast(threshold));
    return { threshold, cm, metrics: metricsFrom(cm) };
  });
}

export interface SubtypeGroup {
  subtype: string;
  count: number;
  cm: ConfusionMatrix;
  metrics: BinaryMetrics;
}

export function groupBySubtype(rows: LabeledDecision[]): SubtypeGroup[] {
  const groups = new Map<string, LabeledDecision[]>();
  for (const row of rows) {
    const key = row.label.subtype ?? "unspecified";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subtype, list]) => {
      const cm = confusionMatrix(list, policyPredictsPositive);
      return { subtype, count: list.length, cm, metrics: metricsFrom(cm) };
    });
}

export interface ConfidenceBand {
  band: string;
  count: number;
  accuracy: number | null;
}

const BANDS: { band: string; min: number; max: number; inclusiveMax: boolean }[] = [
  { band: "[0,0.5)", min: 0, max: 0.5, inclusiveMax: false },
  { band: "[0.5,0.7)", min: 0.5, max: 0.7, inclusiveMax: false },
  { band: "[0.7,0.9)", min: 0.7, max: 0.9, inclusiveMax: false },
  { band: "[0.9,1]", min: 0.9, max: 1, inclusiveMax: true },
];

export function accuracyByConfidenceBand(rows: LabeledDecision[]): ConfidenceBand[] {
  return BANDS.map(({ band, min, max, inclusiveMax }) => {
    const inBand = rows.filter((row) => {
      const c = row.decision.answers?.behaviorClass.confidence ?? Number.NaN;
      return c >= min && (inclusiveMax ? c <= max : c < max);
    });
    const correct = inBand.filter(
      (row) => isTruthPositive(row.label.label) === policyPredictsPositive(row.decision),
    ).length;
    return { band, count: inBand.length, accuracy: ratio(correct, inBand.length) };
  });
}

/** Nearest-rank percentile. `p` is 0..100. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? null;
}

export function latencyStats(decisions: DecisionRecord[]) {
  const latencies = decisions.map((d) => d.latencyMs);
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
}

export function tokenTotals(decisions: DecisionRecord[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const d of decisions) {
    inputTokens += d.usage?.inputTokens ?? 0;
    outputTokens += d.usage?.outputTokens ?? 0;
  }
  return { inputTokens, outputTokens };
}

export function insufficientEvidenceRate(decisions: DecisionRecord[]): number | null {
  const evaluated = decisions.filter((d) => d.answers !== null);
  const insufficient = evaluated.filter((d) => d.policyOutcome === "insufficient_evidence").length;
  return ratio(insufficient, evaluated.length);
}
