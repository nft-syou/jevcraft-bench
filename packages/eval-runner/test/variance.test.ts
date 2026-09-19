import {
  joinDecisionsWithLabels,
  repeatVariance,
  reviewGateSweep,
  sufficiencySweep,
} from "@jevcraft/eval-runner";
import type { DecisionRecord } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { decision, label } from "./helpers";

function withAnswers(
  d: DecisionRecord,
  patch: { hidden?: number; sufficiency?: number },
): DecisionRecord {
  if (d.answers === null) return d;
  return {
    ...d,
    answers: {
      ...d.answers,
      hiddenInformationUse: patch.hidden ?? d.answers.hiddenInformationUse,
      evidenceSufficiency: patch.sufficiency ?? d.answers.evidenceSufficiency,
    },
  };
}

describe("repeatVariance", () => {
  it("summarizes repeated evaluations of the same session", () => {
    const decisions = [
      withAnswers(decision("a", "review", { likelyXray: 0.8 }), { sufficiency: 0.6 }),
      withAnswers(decision("a", "no_action", { likelyXray: 0.6 }), { sufficiency: 0.7 }),
      withAnswers(decision("a", "review", { likelyXray: 0.7, error: undefined }), {
        sufficiency: 0.8,
      }),
      decision("b", "no_action"),
      decision("a", "review", { error: "boom" }),
    ];
    const groups = repeatVariance(decisions);
    expect(groups).toHaveLength(1);
    const a = groups[0];
    expect(a).toMatchObject({ sessionId: "a", count: 3, errorCount: 1 });
    expect(a?.likelyXray).toEqual({
      mean: expect.closeTo(0.7, 10),
      std: expect.closeTo(0.0816, 3),
      min: 0.6,
      max: 0.8,
    });
    expect(a?.evidenceSufficiency).toEqual({
      mean: expect.closeTo(0.7, 10),
      std: expect.closeTo(0.0816, 3),
      min: 0.6,
      max: 0.8,
    });
    expect(a?.outcomes).toEqual({ review: 2, no_action: 1 });
  });

  it("returns nothing when no session was repeated", () => {
    expect(repeatVariance([decision("a", "review"), decision("b", "review")])).toEqual([]);
  });
});

describe("sufficiencySweep", () => {
  it("counts how many labeled rows each sufficiency threshold would drop, by truth class", () => {
    const rows = joinDecisionsWithLabels(
      [
        withAnswers(decision("p1", "review"), { sufficiency: 0.9 }),
        withAnswers(decision("p2", "review"), { sufficiency: 0.6 }),
        withAnswers(decision("n1", "no_action"), { sufficiency: 0.5 }),
        withAnswers(decision("n2", "no_action"), { sufficiency: 0.7 }),
      ],
      [
        label("p1", "simulated_xray"),
        label("p2", "simulated_xray"),
        label("n1", "legit"),
        label("n2", "legit"),
      ],
    ).rows;
    expect(sufficiencySweep(rows, [0.55, 0.65, 0.95])).toEqual([
      {
        threshold: 0.55,
        droppedPositive: 0,
        droppedNegative: 1,
        positiveTotal: 2,
        negativeTotal: 2,
      },
      {
        threshold: 0.65,
        droppedPositive: 1,
        droppedNegative: 1,
        positiveTotal: 2,
        negativeTotal: 2,
      },
      {
        threshold: 0.95,
        droppedPositive: 2,
        droppedNegative: 2,
        positiveTotal: 2,
        negativeTotal: 2,
      },
    ]);
  });
});

describe("reviewGateSweep", () => {
  it("drops review rows below the likely_xray floor but keeps high priority ones", () => {
    const rows = joinDecisionsWithLabels(
      [
        decision("lucky", "review", { likelyXray: 0.3 }),
        decision("xray", "review", { likelyXray: 0.5 }),
        decision("hp", "high_priority_review", { likelyXray: 0.2 }),
      ],
      [label("lucky", "legit"), label("xray", "simulated_xray"), label("hp", "simulated_xray")],
    ).rows;
    const [loose, strict] = reviewGateSweep(rows, [0, 0.35]);
    expect(loose?.cm).toEqual({ tp: 2, fp: 1, tn: 0, fn: 0 });
    expect(strict?.cm).toEqual({ tp: 2, fp: 0, tn: 1, fn: 0 });
  });
});
