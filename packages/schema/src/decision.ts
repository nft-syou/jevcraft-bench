import { z } from "zod";

const probability = z.number().min(0).max(1);

export const BehaviorClassSchema = z.enum([
  "legit",
  "suspicious",
  "likely_xray",
  "insufficient_evidence",
]);
export type BehaviorClass = z.infer<typeof BehaviorClassSchema>;

export const PolicyOutcomeSchema = z.enum([
  "no_action",
  "review",
  "high_priority_review",
  "insufficient_evidence",
  "error",
]);
export type PolicyOutcome = z.infer<typeof PolicyOutcomeSchema>;

export const EvaluationBackendSchema = z.enum(["typesafe", "mock"]);
export type EvaluationBackend = z.infer<typeof EvaluationBackendSchema>;

export const JevAnswersSchema = z.strictObject({
  behaviorClass: z.strictObject({
    choice: BehaviorClassSchema,
    // z.record with an enum key is exhaustive: every class must be present.
    probabilities: z.record(BehaviorClassSchema, probability),
    confidence: probability,
  }),
  /** P(player acted on hidden ore-location information) */
  hiddenInformationUse: probability,
  routeNaturalness: z.strictObject({
    /** expected rubric level, 0 (highly unnatural) .. 4 (strongly natural) */
    score: z.number().min(0).max(4),
    /** score / 4; 1 = natural, 0 = unnatural */
    normalized: probability,
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  }),
  /** P(enough high-quality evidence to classify) */
  evidenceSufficiency: probability,
});
export type JevAnswers = z.infer<typeof JevAnswersSchema>;

export const UsageSchema = z.strictObject({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
});

export const DecisionRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evaluationId: z.string().min(1),
  sessionId: z.string().min(1),
  evaluatedAt: z.iso.datetime(),
  model: z.string().min(1),
  backend: EvaluationBackendSchema,
  questionSetVersion: z.string().min(1),
  featureExtractorVersion: z.string().min(1),
  answers: JevAnswersSchema.nullable(),
  policyOutcome: PolicyOutcomeSchema,
  latencyMs: z.number().int().min(0),
  usage: UsageSchema.nullable(),
  error: z.string().nullable(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
