import {
  accuracyByConfidenceBand,
  confusionMatrix,
  groupBySubtype,
  insufficientEvidenceRate,
  joinDecisionsWithLabels,
  latencyStats,
  metricsFrom,
  percentile,
  policyPredictsPositive,
  thresholdSweep,
  tokenTotals,
  xrayProbabilityAtLeast,
} from "@jevcraft/eval-runner";
import { describe, expect, it } from "vitest";
import { decision, label } from "./helpers";

const rows = joinDecisionsWithLabels(
  [
    decision("tp", "review", { likelyXray: 0.9, confidence: 0.95 }),
    decision("fn", "no_action", { likelyXray: 0.3, confidence: 0.4 }),
    decision("fp", "high_priority_review", { likelyXray: 0.7, confidence: 0.75 }),
    decision("tn", "no_action", { likelyXray: 0.05, confidence: 0.6 }),
  ],
  [
    label("tp", "simulated_xray", "direct_xray"),
    label("fn", "known_cheat", "humanized_xray"),
    label("fp", "legit", "cave_mining"),
    label("tn", "legit", "branch_mining"),
  ],
).rows;

describe("confusion matrix and metrics", () => {
  it("counts tp/fp/tn/fn from the policy outcome", () => {
    expect(confusionMatrix(rows, policyPredictsPositive)).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
  });

  it("computes precision, recall, fpr, fnr, f1, accuracy", () => {
    expect(metricsFrom({ tp: 1, fp: 1, tn: 1, fn: 1 })).toEqual({
      precision: 0.5,
      recall: 0.5,
      fpr: 0.5,
      fnr: 0.5,
      f1: 0.5,
      accuracy: 0.5,
    });
  });

  it("returns null instead of NaN when a denominator is zero", () => {
    expect(metricsFrom({ tp: 0, fp: 0, tn: 0, fn: 0 })).toEqual({
      precision: null,
      recall: null,
      fpr: null,
      fnr: null,
      f1: null,
      accuracy: null,
    });
  });

  it("sweeps P(likely_xray) thresholds", () => {
    const sweep = thresholdSweep(rows, [0.5, 0.8]);
    expect(sweep[0]).toMatchObject({ threshold: 0.5, cm: { tp: 1, fp: 1, tn: 1, fn: 1 } });
    expect(sweep[1]).toMatchObject({ threshold: 0.8, cm: { tp: 1, fp: 0, tn: 2, fn: 1 } });
    expect(xrayProbabilityAtLeast(0.8)(rows[0]?.decision ?? decision("x", "no_action"))).toBe(true);
  });

  it("groups by label subtype", () => {
    const groups = groupBySubtype(rows);
    expect(groups.map((g) => g.subtype)).toEqual([
      "branch_mining",
      "cave_mining",
      "direct_xray",
      "humanized_xray",
    ]);
    expect(groups.find((g) => g.subtype === "cave_mining")).toMatchObject({
      count: 1,
      cm: { tp: 0, fp: 1, tn: 0, fn: 0 },
    });
  });

  it("reports accuracy per confidence band", () => {
    const bands = accuracyByConfidenceBand(rows);
    expect(bands.map((b) => b.band)).toEqual(["[0,0.5)", "[0.5,0.7)", "[0.7,0.9)", "[0.9,1]"]);
    expect(bands[0]).toEqual({ band: "[0,0.5)", count: 1, accuracy: 0 });
    expect(bands[3]).toEqual({ band: "[0.9,1]", count: 1, accuracy: 1 });
  });
});

describe("operational stats", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([30, 10, 20], 100)).toBe(30);
  });

  it("summarizes latency and tokens over all decisions, including errors", () => {
    const decisions = [
      decision("a", "review", { latencyMs: 100 }),
      decision("b", "no_action", { latencyMs: 300 }),
      decision("c", "review", { latencyMs: 50, error: "boom" }),
    ];
    expect(latencyStats(decisions)).toEqual({ p50: 100, p95: 300, p99: 300 });
    expect(tokenTotals(decisions)).toEqual({ inputTokens: 200, outputTokens: 20 });
  });

  it("computes the insufficient_evidence rate over non-error decisions", () => {
    expect(
      insufficientEvidenceRate([
        decision("a", "insufficient_evidence"),
        decision("b", "no_action"),
        decision("c", "review", { error: "boom" }),
      ]),
    ).toBe(0.5);
    expect(insufficientEvidenceRate([])).toBeNull();
  });
});
