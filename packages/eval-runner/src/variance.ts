import type { DecisionRecord } from "@jevcraft/schema";
import type { LabeledDecision } from "./join";
import { isTruthPositive } from "./metrics";

export interface Spread {
  mean: number;
  /** population standard deviation */
  std: number;
  min: number;
  max: number;
}

export function spread(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export interface RepeatGroup {
  sessionId: string;
  /** successfully evaluated repeats */
  count: number;
  errorCount: number;
  likelyXray: Spread | null;
  hiddenInformationUse: Spread | null;
  evidenceSufficiency: Spread | null;
  routeNaturalness: Spread | null;
  confidence: Spread | null;
  outcomes: Record<string, number>;
}

/**
 * Per-session spread of Jev answers when the same session was evaluated more than once.
 * Sessions evaluated only once are omitted. Error records count but contribute no values.
 */
export function repeatVariance(decisions: DecisionRecord[]): RepeatGroup[] {
  const bySession = new Map<string, DecisionRecord[]>();
  for (const d of decisions) {
    const list = bySession.get(d.sessionId);
    if (list) list.push(d);
    else bySession.set(d.sessionId, [d]);
  }
  const groups: RepeatGroup[] = [];
  for (const [sessionId, list] of [...bySession.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (list.length < 2) continue;
    const ok = list.filter((d) => d.answers !== null);
    const answers = ok.flatMap((d) => (d.answers === null ? [] : [d.answers]));
    const outcomes: Record<string, number> = {};
    for (const d of ok) outcomes[d.policyOutcome] = (outcomes[d.policyOutcome] ?? 0) + 1;
    groups.push({
      sessionId,
      count: ok.length,
      errorCount: list.length - ok.length,
      likelyXray: spread(answers.map((a) => a.behaviorClass.probabilities.likely_xray)),
      hiddenInformationUse: spread(answers.map((a) => a.hiddenInformationUse)),
      evidenceSufficiency: spread(answers.map((a) => a.evidenceSufficiency)),
      routeNaturalness: spread(answers.map((a) => a.routeNaturalness.normalized)),
      confidence: spread(answers.map((a) => a.behaviorClass.confidence)),
      outcomes,
    });
  }
  return groups;
}

export interface SufficiencyPoint {
  threshold: number;
  /** truth-positive rows whose evidenceSufficiency is below the threshold */
  droppedPositive: number;
  /** truth-negative rows whose evidenceSufficiency is below the threshold */
  droppedNegative: number;
  positiveTotal: number;
  negativeTotal: number;
}

export const DEFAULT_SUFFICIENCY_SWEEP = [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

/** How many labeled rows each minEvidenceSufficiency value would push into insufficient_evidence. */
export function sufficiencySweep(
  rows: LabeledDecision[],
  thresholds: number[],
): SufficiencyPoint[] {
  const positives = rows.filter((r) => isTruthPositive(r.label.label));
  const negatives = rows.filter((r) => !isTruthPositive(r.label.label));
  const below = (list: LabeledDecision[], t: number) =>
    list.filter((r) => (r.decision.answers?.evidenceSufficiency ?? 0) < t).length;
  return thresholds.map((threshold) => ({
    threshold,
    droppedPositive: below(positives, threshold),
    droppedNegative: below(negatives, threshold),
    positiveTotal: positives.length,
    negativeTotal: negatives.length,
  }));
}

export interface ReviewGatePoint {
  minLikelyXray: number;
  cm: { tp: number; fp: number; tn: number; fn: number };
  precision: number | null;
  recall: number | null;
  fpr: number | null;
}

export const DEFAULT_REVIEW_GATE_SWEEP = [0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

/**
 * Policy variant: a `review` (not high priority) additionally requires P(likely_xray) >= t.
 * Shows what a floor on likely_xray would do to lucky-streak false positives.
 */
export function reviewGateSweep(rows: LabeledDecision[], thresholds: number[]): ReviewGatePoint[] {
  return thresholds.map((minLikelyXray) => {
    const cm = { tp: 0, fp: 0, tn: 0, fn: 0 };
    for (const row of rows) {
      const d = row.decision;
      const p = d.answers?.behaviorClass.probabilities.likely_xray ?? 0;
      const predicted =
        d.policyOutcome === "high_priority_review" ||
        (d.policyOutcome === "review" && p >= minLikelyXray);
      const truth = isTruthPositive(row.label.label);
      if (truth && predicted) cm.tp++;
      else if (!truth && predicted) cm.fp++;
      else if (truth) cm.fn++;
      else cm.tn++;
    }
    const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
    return {
      minLikelyXray,
      cm,
      precision: ratio(cm.tp, cm.tp + cm.fp),
      recall: ratio(cm.tp, cm.tp + cm.fn),
      fpr: ratio(cm.fp, cm.fp + cm.tn),
    };
  });
}
