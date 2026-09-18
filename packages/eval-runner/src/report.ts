import type { DecisionRecord, SessionLabel } from "@jevcraft/schema";
import { joinDecisionsWithLabels, type LabeledDecision } from "./join";
import {
  accuracyByConfidenceBand,
  type BinaryMetrics,
  type ConfusionMatrix,
  confusionMatrix,
  DEFAULT_SWEEP,
  groupBySubtype,
  insufficientEvidenceRate,
  isTruthPositive,
  latencyStats,
  metricsFrom,
  policyPredictsPositive,
  thresholdSweep,
  tokenTotals,
} from "./metrics";
import {
  DEFAULT_SUFFICIENCY_SWEEP,
  repeatVariance,
  type Spread,
  sufficiencySweep,
} from "./variance";

export interface ReportInput {
  title: string;
  decisions: DecisionRecord[];
  labels: SessionLabel[];
  sweep?: number[];
  sufficiencySweep?: number[];
}

const fmt = (value: number | null, digits = 3): string =>
  value === null ? "n/a" : value.toFixed(digits);
const ms = (value: number | null): string => (value === null ? "n/a" : `${value} ms`);

const spreadCell = (s: Spread | null): string =>
  s === null ? "n/a" : `${fmt(s.mean)} ± ${fmt(s.std)} [${fmt(s.min)}, ${fmt(s.max)}]`;

function cmRow(cm: ConfusionMatrix): string {
  return `| ${cm.tp} | ${cm.fp} | ${cm.tn} | ${cm.fn} |`;
}

function metricsTable(m: BinaryMetrics): string[] {
  return [
    "| Metric | Value |",
    "| --- | --- |",
    `| Precision | ${fmt(m.precision)} |`,
    `| Recall | ${fmt(m.recall)} |`,
    `| FPR | ${fmt(m.fpr)} |`,
    `| FNR | ${fmt(m.fnr)} |`,
    `| F1 | ${fmt(m.f1)} |`,
    `| Accuracy | ${fmt(m.accuracy)} |`,
  ];
}

function mistakeRows(rows: LabeledDecision[]): string[] {
  if (rows.length === 0) return ["(none)"];
  return [
    "| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => {
      const a = row.decision.answers;
      const likelyXray = fmt(a?.behaviorClass.probabilities.likely_xray ?? null);
      const confidence = fmt(a?.behaviorClass.confidence ?? null);
      return `| ${row.sessionId} | ${row.label.label} | ${row.label.subtype ?? "unspecified"} | ${row.decision.policyOutcome} | ${likelyXray} | ${confidence} |`;
    }),
  ];
}

export function buildReport(input: ReportInput): string {
  const join = joinDecisionsWithLabels(input.decisions, input.labels);
  const rows = join.rows;
  const policyCm = confusionMatrix(rows, policyPredictsPositive);
  const policyMetrics = metricsFrom(policyCm);
  const sweep = thresholdSweep(rows, input.sweep ?? DEFAULT_SWEEP);
  const subtypes = groupBySubtype(rows);
  const bands = accuracyByConfidenceBand(rows);
  const latency = latencyStats(input.decisions);
  const tokens = tokenTotals(input.decisions);
  const falsePositives = rows.filter(
    (r) => !isTruthPositive(r.label.label) && policyPredictsPositive(r.decision),
  );
  const falseNegatives = rows.filter(
    (r) => isTruthPositive(r.label.label) && !policyPredictsPositive(r.decision),
  );
  const sufficiency = sufficiencySweep(rows, input.sufficiencySweep ?? DEFAULT_SUFFICIENCY_SWEEP);
  const repeats = repeatVariance(input.decisions);
  const versions = new Set(
    input.decisions.map(
      (d) => `${d.model} / ${d.questionSetVersion} / ${d.featureExtractorVersion}`,
    ),
  );

  const lines: string[] = [
    `# JevCraft evaluation report: ${input.title}`,
    "",
    "Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.",
    "FPR is the primary metric: flagging skilled or lucky players costs operator trust.",
    "",
    "## Summary",
    "",
    "| Item | Count |",
    "| --- | --- |",
    `| Decisions | ${input.decisions.length} |`,
    `| Labels | ${input.labels.length} |`,
    `| Usable for metrics | ${rows.length} |`,
    `| Excluded: unknown label | ${join.unknownCount} |`,
    `| Excluded: evaluation error | ${join.errorCount} |`,
    `| Excluded: no label | ${join.unlabeledSessionIds.length} |`,
    `| Excluded: duplicate label | ${join.duplicateLabelSessionIds.length} |`,
    "",
    `Model / question set / feature extractor: ${versions.size === 0 ? "n/a" : [...versions].join("; ")}`,
    "",
    "## Policy outcome",
    "",
    "| TP | FP | TN | FN |",
    "| --- | --- | --- | --- |",
    cmRow(policyCm),
    "",
    ...metricsTable(policyMetrics),
    "",
    "## Threshold sweep on P(likely_xray)",
    "",
    "| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sweep.map(
      (p) =>
        `| ${p.threshold.toFixed(2)} | ${p.cm.tp} | ${p.cm.fp} | ${p.cm.tn} | ${p.cm.fn} | ${fmt(p.metrics.precision)} | ${fmt(p.metrics.recall)} | ${fmt(p.metrics.fpr)} | ${fmt(p.metrics.f1)} |`,
    ),
    "",
    "## Sufficiency threshold sweep",
    "",
    "Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).",
    "",
    "| minEvidenceSufficiency | Dropped positives | Dropped negatives |",
    "| --- | --- | --- |",
    ...sufficiency.map(
      (p) =>
        `| ${p.threshold.toFixed(2)} | ${p.droppedPositive} / ${p.positiveTotal} | ${p.droppedNegative} / ${p.negativeTotal} |`,
    ),
    "",
    ...(repeats.length === 0
      ? []
      : [
          "## Repeat variance",
          "",
          "Same session evaluated more than once. Values are mean ± population std [min, max].",
          "",
          "| Session | Runs | P(likely_xray) | hidden_information_use | evidence_sufficiency | route_naturalness (norm) | Outcomes |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          ...repeats.map(
            (g) =>
              `| ${g.sessionId} | ${g.count}${g.errorCount > 0 ? ` (+${g.errorCount} err)` : ""} | ${spreadCell(g.likelyXray)} | ${spreadCell(g.hiddenInformationUse)} | ${spreadCell(g.evidenceSufficiency)} | ${spreadCell(g.routeNaturalness)} | ${Object.entries(
                g.outcomes,
              )
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")} |`,
          ),
          "",
        ]),
    "## By scenario subtype",
    "",
    "| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(subtypes.length === 0
      ? ["| (none) | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |"]
      : subtypes.map(
          (g) =>
            `| ${g.subtype} | ${g.count} | ${g.cm.tp} | ${g.cm.fp} | ${g.cm.tn} | ${g.cm.fn} | ${fmt(g.metrics.precision)} | ${fmt(g.metrics.recall)} | ${fmt(g.metrics.fpr)} |`,
        )),
    "",
    "## Accuracy by confidence band",
    "",
    "| Band | Count | Accuracy |",
    "| --- | --- | --- |",
    ...bands.map((b) => `| ${b.band} | ${b.count} | ${fmt(b.accuracy)} |`),
    "",
    "## Latency and cost",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| p50 | ${ms(latency.p50)} |`,
    `| p95 | ${ms(latency.p95)} |`,
    `| p99 | ${ms(latency.p99)} |`,
    `| Input tokens | ${tokens.inputTokens} |`,
    `| Output tokens | ${tokens.outputTokens} |`,
    `| insufficient_evidence rate | ${fmt(insufficientEvidenceRate(input.decisions))} |`,
    "",
    "Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).",
    "",
    "## False positives",
    "",
    ...mistakeRows(falsePositives),
    "",
    "## False negatives",
    "",
    ...mistakeRows(falseNegatives),
    "",
  ];
  return lines.join("\n");
}
