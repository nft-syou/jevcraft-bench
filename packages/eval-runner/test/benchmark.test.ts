import {
  type BenchmarkRow,
  buildBenchmarkReport,
  CLASSIC_DETECTORS,
  createFittedLogisticDetector,
  type Detector,
  deployedPolicyDetector,
  evaluateDetector,
  exactBinomialP,
  headToHead,
  oreRatioDetector,
  rocAuc,
  wilsonInterval,
} from "@jevcraft/eval-runner";
import type { MiningSessionFeatures } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { decision, label } from "./helpers";

function features(overrides: {
  id: string;
  per100?: number | null;
  directness?: number | null;
  percentile?: number | null;
  reveals?: number;
  durationSec?: number;
}): MiningSessionFeatures {
  return {
    schemaVersion: 1,
    featureExtractorVersion: "0.1.0",
    sessionId: overrides.id,
    session: {
      durationSec: overrides.durationSec ?? 600,
      movementDistance: 100,
      blocksBroken: 100,
      valuableOreReveals: overrides.reveals ?? 5,
      // ore-ratio reads mined ore per 100 blocks; with 100 blocks broken this is the raw number.
      valuableOreBlocksBroken: overrides.per100 === undefined ? 2 : (overrides.per100 ?? 0),
    },
    exploration: {
      branchMiningLikelihood: 0.5,
      caveExposureRatio: 0.1,
      uniqueTunnelDirections: 3,
      turnCount: 20,
    },
    hiddenOreApproach: {
      sampleCount: 3,
      meanDirectness: overrides.directness === undefined ? 0.5 : overrides.directness,
      medianDetourRatio: 1.5,
      aimAlignmentBeforeRevealRatio: 0.3,
      turnsTowardHiddenOre: 2,
      directionChangesNearOre: 4,
    },
    timing: {
      meanBreakIntervalMs: 500,
      breakIntervalStdDevMs: 100,
      medianSecondsBetweenReveals: 60,
    },
    efficiency: {
      valuableOrePer100Blocks: overrides.per100 === undefined ? 2 : overrides.per100,
      nonOreBlocksPerHiddenReveal: 20,
      baselinePercentile: overrides.percentile === undefined ? null : overrides.percentile,
    },
    quality: {
      trajectoryCoverage: 1,
      droppedEventCount: 0,
      enoughEvidence: true,
      knownConfounders: [],
    },
  };
}

const row = (
  id: string,
  xray: boolean,
  f: Partial<Parameters<typeof features>[0]> = {},
  likelyXray = 0,
): BenchmarkRow => ({
  sessionId: id,
  features: features({ id, ...f }),
  label: xray ? label(id, "simulated_xray", "direct_xray") : label(id, "legit", "branch_mining"),
  decision: decision(id, "review", { likelyXray }),
});

describe("rocAuc", () => {
  it("is 1 when the detector separates the classes perfectly", () => {
    const rows = [row("a", true, { per100: 9 }), row("b", false, { per100: 1 })];
    expect(rocAuc(rows, oreRatioDetector)).toBe(1);
  });

  it("is 0.5 when every session scores the same", () => {
    const rows = [row("a", true, { per100: 4 }), row("b", false, { per100: 4 })];
    expect(rocAuc(rows, oreRatioDetector)).toBe(0.5);
  });

  it("ranks sessions the detector cannot score below every scored session", () => {
    const unscorable = row("b", false);
    unscorable.features.session.blocksBroken = 0;
    const rows = [row("a", true, { per100: 1 }), unscorable];
    expect(rocAuc(rows, oreRatioDetector)).toBe(1);
  });

  it("is null when a class is missing", () => {
    expect(rocAuc([row("a", true)], oreRatioDetector)).toBeNull();
  });
});

describe("evaluateDetector", () => {
  const rows = [
    row("x1", true, { per100: 9 }),
    row("x2", true, { per100: 5 }),
    row("l1", false, { per100: 6 }),
    row("l2", false, { per100: 1 }),
  ];

  it("picks the best recall that stays under the false-positive ceiling", () => {
    // Flagging at 9 catches one X-Ray with no false positive; at 5 it also catches x2 but
    // sweeps in l1 (ratio 6), which exceeds an FPR of 0.
    const strict = evaluateDetector(rows, oreRatioDetector, 0);
    expect(strict.best?.threshold).toBe(9);
    expect(strict.best?.recall).toBe(0.5);
    expect(strict.best?.fpr).toBe(0);

    const loose = evaluateDetector(rows, oreRatioDetector, 0.5);
    expect(loose.best?.recall).toBe(1);
    expect(loose.best?.fpr).toBe(0.5);
  });

  it("reports recall per X-Ray subtype at the chosen point", () => {
    const mixed = [
      ...rows,
      { ...row("h1", true, { per100: 2 }), label: label("h1", "simulated_xray", "humanized_xray") },
    ];
    const result = evaluateDetector(mixed, oreRatioDetector, 0);
    expect(result.recallBySubtype).toEqual({ direct_xray: 0.5, humanized_xray: 0 });
  });

  it("falls back to flagging nothing when no tunable threshold meets the ceiling", () => {
    const indiscriminate: Detector = {
      name: "always",
      description: "gives every session the same score",
      score: () => 1,
    };
    const result = evaluateDetector(rows, indiscriminate, 0);
    // Any cut below Infinity flags both classes at once, so the only admissible point is silence.
    expect(result.best?.threshold).toBe(Number.POSITIVE_INFINITY);
    expect(result.best?.recall).toBe(0);
    expect(result.best?.fpr).toBe(0);
    expect(result.auc).toBe(0.5);
  });

  it("counts how many sessions it could score", () => {
    const unscorable = row("a", true);
    unscorable.features.session.blocksBroken = 0;
    expect(
      evaluateDetector([unscorable, row("b", false, { per100: 3 })], oreRatioDetector, 1).scored,
    ).toBe(1);
  });
});

describe("buildBenchmarkReport", () => {
  it("compares every detector at one ceiling and names what each stands for", () => {
    const rows = [
      row("x1", true, { per100: 9, directness: 0.9, percentile: 95 }, 0.7),
      row("x2", true, { per100: 4, directness: 0.8, percentile: 80 }, 0.6),
      row("l1", false, { per100: 5, directness: 0.4, percentile: 85 }, 0.1),
      row("l2", false, { per100: 0.5, directness: 0.3, percentile: 20 }, 0),
    ];
    const md = buildBenchmarkReport({
      title: "unit",
      rows,
      detectors: CLASSIC_DETECTORS,
      maxFpr: 0,
    });
    expect(md).toMatch(/^# JevCraft detection benchmark: unit/);
    expect(md).toContain("Evaluation set: 4 sessions (2 X-Ray, 2 legitimate)");
    expect(md).toContain("false-positive rate <= 0.000");
    expect(md).toContain("| ore-ratio |");
    expect(md).toContain("## Recall by X-Ray style at those operating points");
    expect(md).toContain("- **straight-line**:");
    expect(md).not.toContain("NaN");
  });
});

describe("exactBinomialP", () => {
  it("is 1 for a perfectly even split and small for a lopsided one", () => {
    expect(exactBinomialP(5, 10)).toBe(1);
    expect(exactBinomialP(0, 0)).toBe(1);
    expect(exactBinomialP(10, 10)).toBeCloseTo(2 / 1024, 6);
    expect(exactBinomialP(9, 10)).toBeCloseTo(22 / 1024, 6);
  });
});

describe("headToHead", () => {
  it("counts the sessions only one detector gets right and tests the split", () => {
    // ore-ratio flags at 5: x2 (ratio 9) yes, x1 (ratio 1) no, l1 (ratio 6) wrongly yes.
    const rows = [
      row("x1", true, { per100: 1 }),
      row("x2", true, { per100: 9 }),
      row("l1", false, { per100: 6 }),
      row("l2", false, { per100: 0 }),
    ];
    const perfect: Detector = {
      name: "oracle",
      description: "knows the answer",
      score: (r) => (r.label.label === "simulated_xray" ? 1 : 0),
    };
    const duel = headToHead(rows, perfect, 1, oreRatioDetector, 5);
    expect(duel.challengerOnly).toBe(2);
    expect(duel.baselineOnly).toBe(0);
    expect(duel.pValue).toBeCloseTo(0.5, 6);
  });
});

describe("benchmark report head to head", () => {
  it("includes the McNemar section when a challenger is given", () => {
    const rows = [
      row("x1", true, { per100: 9, directness: 0.9 }, 0.8),
      row("x2", true, { per100: 1, directness: 0.2 }, 0.7),
      row("l1", false, { per100: 6, directness: 0.8 }, 0.1),
      row("l2", false, { per100: 0.2, directness: 0.1 }, 0),
    ];
    const md = buildBenchmarkReport({
      title: "duel",
      rows,
      detectors: [...CLASSIC_DETECTORS, deployedPolicyDetector],
      maxFpr: 0.5,
      challenger: "jevcraft-policy",
    });
    expect(md).toContain("## Head to head");
    expect(md).toContain("`jevcraft-policy` against the strongest non-Jev detector");
    expect(md).toContain("| Two-sided p |");
  });
});

describe("wilsonInterval", () => {
  it("brackets the point estimate and stays inside 0..1", () => {
    const ci = wilsonInterval(4, 62);
    expect(ci?.low).toBeGreaterThan(0.02);
    expect(ci?.high).toBeLessThan(0.16);
    expect(wilsonInterval(0, 10)?.low).toBe(0);
    expect(wilsonInterval(10, 10)?.high ?? 0).toBeCloseTo(1, 10);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe("held-out evaluation", () => {
  const dev = [
    row("d-x1", true, { per100: 9 }),
    row("d-x2", true, { per100: 7 }),
    row("d-l1", false, { per100: 2 }),
    row("d-l2", false, { per100: 1 }),
  ];
  const holdout = [
    row("h-x1", true, { per100: 8 }),
    row("h-x2", true, { per100: 3 }),
    row("h-l1", false, { per100: 6 }),
    row("h-l2", false, { per100: 0.5 }),
  ];

  it("freezes the threshold picked on dev and measures it on the evaluation set", () => {
    // On dev the best cut under FPR 0 is 7 (catches both X-Ray, no legit above 2).
    const result = evaluateDetector(holdout, oreRatioDetector, 0, dev);
    expect(result.best?.threshold).toBe(7);
    // Frozen at 7 the held-out set gives one hit and one miss, and no false positive.
    expect(result.best?.recall).toBe(0.5);
    expect(result.best?.fpr).toBe(0);
  });

  it("says in the report whether anything tuned on the evaluation set", () => {
    const heldOut = buildBenchmarkReport({
      title: "split",
      rows: holdout,
      tuningRows: dev,
      detectors: CLASSIC_DETECTORS,
      maxFpr: 0.5,
    });
    expect(heldOut).toContain("separate development set of 4 sessions");
    const selfTuned = buildBenchmarkReport({
      title: "self",
      rows: holdout,
      detectors: CLASSIC_DETECTORS,
      maxFpr: 0.5,
    });
    expect(selfTuned).toContain("Thresholds are chosen on the evaluation set itself");
  });
});

describe("fixed-point detectors", () => {
  it("are measured at their own point and marked when they exceed the ceiling", () => {
    const rows = [
      { ...row("x1", true), decision: decision("x1", "review") },
      { ...row("l1", false), decision: decision("l1", "review") },
      { ...row("l2", false), decision: decision("l2", "no_action") },
    ];
    const result = evaluateDetector(rows, deployedPolicyDetector, 0);
    expect(result.fixed).toBe(true);
    expect(result.best?.threshold).toBe(1);
    expect(result.best?.recall).toBe(1);
    expect(result.best?.fpr).toBe(0.5);
    expect(result.respectsCeiling).toBe(false);

    const md = buildBenchmarkReport({
      title: "fixed",
      rows,
      detectors: [deployedPolicyDetector],
      maxFpr: 0,
      challenger: "jevcraft-policy",
    });
    expect(md).toContain("(fixed point)");
    expect(md).toContain("**over ceiling**");
  });
});

describe("createFittedLogisticDetector", () => {
  it("learns a separating direction from the development split", () => {
    const dev = [
      row("x1", true, { per100: 9, directness: 0.9 }),
      row("x2", true, { per100: 8, directness: 0.85 }),
      row("l1", false, { per100: 1, directness: 0.3 }),
      row("l2", false, { per100: 0.5, directness: 0.2 }),
    ];
    const fitted = createFittedLogisticDetector(dev);
    const xray = fitted.score(row("t1", true, { per100: 8.5, directness: 0.88 })) ?? 0;
    const legit = fitted.score(row("t2", false, { per100: 0.8, directness: 0.25 })) ?? 1;
    expect(xray).toBeGreaterThan(legit);
    expect(fitted.name).toBe("fitted-logistic");
  });

  it("scores every session, imputing missing inputs from the training median", () => {
    const dev = [row("x1", true, { per100: 9 }), row("l1", false, { per100: 1 })];
    const fitted = createFittedLogisticDetector(dev);
    const gap = row("t", false);
    gap.features.hiddenOreApproach.meanDirectness = null;
    gap.features.efficiency.valuableOrePer100Blocks = null;
    expect(fitted.score(gap)).not.toBeNull();
  });
});
