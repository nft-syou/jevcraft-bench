// Shared test data. Kept out of *.test.ts so importing it does not re-run those tests.
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
