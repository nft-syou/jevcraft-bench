import { z } from "zod";

/** Ground truth. `suspicious` is a model output and is deliberately not a label. */
export const GroundTruthLabelSchema = z.enum(["legit", "simulated_xray", "known_cheat", "unknown"]);
export type GroundTruthLabel = z.infer<typeof GroundTruthLabelSchema>;

export const BehaviorSubtypeSchema = z.enum([
  "branch_mining",
  "cave_mining",
  "lucky_streak",
  "direct_xray",
  "detour_xray",
  "humanized_xray",
  "throttled_xray",
  "mixed",
]);
export type BehaviorSubtype = z.infer<typeof BehaviorSubtypeSchema>;

export const ReviewStatusSchema = z.enum([
  "unreviewed",
  "single_review",
  "double_review_agree",
  "double_review_disagree",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const SessionLabelSchema = z.strictObject({
  sessionId: z.string().min(1),
  label: GroundTruthLabelSchema,
  subtype: BehaviorSubtypeSchema.nullable(),
  reviewStatus: ReviewStatusSchema,
  notes: z.string().optional(),
});
export type SessionLabel = z.infer<typeof SessionLabelSchema>;
