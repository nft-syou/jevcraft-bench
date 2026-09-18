import { BehaviorSubtypeSchema, GroundTruthLabelSchema } from "@jevcraft/schema";
import { z } from "zod";

/** A normally distributed parameter. `sd` is scaled by the scenario's humanNoise. */
const Dist = z.strictObject({ mean: z.number(), sd: z.number().min(0) });

/**
 * Feature-level scenario (spec §13A). Describes the *distribution* of a mining
 * session's features; no Minecraft is involved. Useful for wiring, question-set and
 * threshold checks. Not proof of accuracy (spec §22: data leak).
 */
export const ScenarioSpecSchema = z.strictObject({
  name: z.string().min(1),
  label: GroundTruthLabelSchema,
  subtype: BehaviorSubtypeSchema.nullable(),
  description: z.string().optional(),
  parameters: z.strictObject({
    durationSec: Dist,
    blocksBroken: Dist,
    /** number of hidden valuable ores revealed; also the hiddenOreApproach sample count */
    hiddenOreReveals: Dist,
    /** 0..1, straight-line distance / path length toward hidden ores */
    directness: Dist,
    /** 0..1, share of pre-reveal time aimed at the hidden ore */
    aimAlignment: Dist,
    /** 0..1, share of the route touching existing caves */
    caveExposure: Dist,
    /** 0..1 */
    branchMiningLikelihood: Dist,
    breakIntervalMs: Dist,
    /** 0..1, trajectory coverage reported by the extractor */
    trajectoryCoverage: Dist,
    /** multiplies every sd; 0 = every session identical, 1 = as specified */
    humanNoise: z.number().min(0).max(2),
    enoughEvidence: z.boolean(),
  }),
});

export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;
