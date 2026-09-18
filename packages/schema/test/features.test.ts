import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

export const validFeatures = {
  schemaVersion: 1,
  featureExtractorVersion: "0.1.0",
  sessionId: "session_test_001",
  session: {
    durationSec: 603,
    movementDistance: 311.4,
    blocksBroken: 428,
    valuableOreReveals: 31,
    valuableOreBlocksBroken: 34,
  },
  exploration: {
    branchMiningLikelihood: 0.18,
    caveExposureRatio: 0.07,
    uniqueTunnelDirections: 6,
    turnCount: 34,
  },
  hiddenOreApproach: {
    sampleCount: 28,
    meanDirectness: 0.89,
    medianDetourRatio: 1.12,
    aimAlignmentBeforeRevealRatio: 0.76,
    turnsTowardHiddenOre: 17,
    directionChangesNearOre: 27,
  },
  timing: {
    meanBreakIntervalMs: 438,
    breakIntervalStdDevMs: 143,
    medianSecondsBetweenReveals: 13.2,
  },
  efficiency: {
    valuableOrePer100Blocks: 7.24,
    nonOreBlocksPerHiddenReveal: 12.8,
    baselinePercentile: 99.4,
  },
  quality: {
    trajectoryCoverage: 0.96,
    droppedEventCount: 0,
    enoughEvidence: true,
    knownConfounders: [],
  },
};

describe("MiningSessionFeaturesSchema", () => {
  it("accepts the spec example", () => {
    expect(MiningSessionFeaturesSchema.parse(validFeatures)).toEqual(validFeatures);
  });

  it("keeps null distinct from zero", () => {
    const parsed = MiningSessionFeaturesSchema.parse({
      ...validFeatures,
      efficiency: { ...validFeatures.efficiency, baselinePercentile: null },
      hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: null },
    });
    expect(parsed.efficiency.baselinePercentile).toBeNull();
    expect(parsed.hiddenOreApproach.meanDirectness).toBeNull();
  });

  it("rejects undefined for a nullable metric (missing must be explicit null)", () => {
    const { baselinePercentile: _omit, ...efficiency } = validFeatures.efficiency;
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, efficiency })).toThrow();
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({ ...validFeatures, schemaVersion: 2 }),
    ).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, extra: 1 })).toThrow();
  });

  it("rejects ratios outside 0..1 and detour ratios below 1", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: 1.2 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, medianDetourRatio: 0.9 },
      }),
    ).toThrow();
  });

  it("rejects negative counts and non-integer counts", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: -1 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: 1.5 },
      }),
    ).toThrow();
  });
});
