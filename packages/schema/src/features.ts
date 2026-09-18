import { z } from "zod";

// Missing observations are `null`, never 0. See spec §9.
const nullableRatio = z.number().min(0).max(1).nullable();
const nullableNonNegative = z.number().min(0).nullable();
const nullableCount = z.number().int().min(0).nullable();
const count = z.number().int().min(0);

export const MiningSessionFeaturesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  featureExtractorVersion: z.string().min(1),
  sessionId: z.string().min(1),
  session: z.strictObject({
    durationSec: z.number().min(0),
    movementDistance: nullableNonNegative,
    blocksBroken: count,
    valuableOreReveals: count,
    valuableOreBlocksBroken: count,
  }),
  exploration: z.strictObject({
    branchMiningLikelihood: nullableRatio,
    caveExposureRatio: nullableRatio,
    uniqueTunnelDirections: nullableCount,
    turnCount: nullableCount,
  }),
  hiddenOreApproach: z.strictObject({
    sampleCount: count,
    /** straight-line distance / actual path length; 1 = perfectly direct */
    meanDirectness: nullableRatio,
    /** actual path length / straight-line distance; 1 = shortest */
    medianDetourRatio: z.number().min(1).nullable(),
    aimAlignmentBeforeRevealRatio: nullableRatio,
    turnsTowardHiddenOre: nullableCount,
    directionChangesNearOre: nullableCount,
  }),
  timing: z.strictObject({
    meanBreakIntervalMs: nullableNonNegative,
    breakIntervalStdDevMs: nullableNonNegative,
    medianSecondsBetweenReveals: nullableNonNegative,
  }),
  efficiency: z.strictObject({
    valuableOrePer100Blocks: nullableNonNegative,
    nonOreBlocksPerHiddenReveal: nullableNonNegative,
    /** null until a baseline population exists */
    baselinePercentile: z.number().min(0).max(100).nullable(),
  }),
  quality: z.strictObject({
    trajectoryCoverage: z.number().min(0).max(1),
    droppedEventCount: count,
    enoughEvidence: z.boolean(),
    knownConfounders: z.array(z.string()),
  }),
});

export type MiningSessionFeatures = z.infer<typeof MiningSessionFeaturesSchema>;
