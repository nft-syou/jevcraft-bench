import { DecisionRecordSchema, JevAnswersSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

export const validAnswers = {
  behaviorClass: {
    choice: "likely_xray",
    probabilities: { legit: 0.03, suspicious: 0.15, likely_xray: 0.8, insufficient_evidence: 0.02 },
    confidence: 0.72,
  },
  hiddenInformationUse: 0.88,
  routeNaturalness: {
    score: 0.6,
    normalized: 0.15,
    confidence: 0.7,
    probabilities: { "0": 0.5, "1": 0.4, "2": 0.1, "3": 0, "4": 0 },
  },
  evidenceSufficiency: 0.96,
} as const;

export const validDecision = {
  schemaVersion: 1,
  evaluationId: "eval_test_001",
  sessionId: "session_test_001",
  evaluatedAt: "2026-09-18T12:40:00.000Z",
  model: "jev-latest",
  backend: "typesafe",
  questionSetVersion: "xray-v1",
  featureExtractorVersion: "0.1.0",
  answers: validAnswers,
  policyOutcome: "review",
  latencyMs: 143,
  usage: { inputTokens: 512, outputTokens: 40 },
  error: null,
} as const;

describe("JevAnswersSchema", () => {
  it("accepts a full answer set", () => {
    expect(JevAnswersSchema.parse(validAnswers)).toEqual(validAnswers);
  });

  it("requires every behavior class probability", () => {
    const { insufficient_evidence: _omit, ...probabilities } =
      validAnswers.behaviorClass.probabilities;
    expect(() =>
      JevAnswersSchema.parse({
        ...validAnswers,
        behaviorClass: { ...validAnswers.behaviorClass, probabilities },
      }),
    ).toThrow();
  });

  it("rejects a choice outside the behavior classes", () => {
    expect(() =>
      JevAnswersSchema.parse({
        ...validAnswers,
        behaviorClass: { ...validAnswers.behaviorClass, choice: "cheater" },
      }),
    ).toThrow();
  });

  it("rejects probabilities outside 0..1", () => {
    expect(() => JevAnswersSchema.parse({ ...validAnswers, hiddenInformationUse: 1.5 })).toThrow();
  });
});

describe("DecisionRecordSchema", () => {
  it("accepts a successful evaluation", () => {
    expect(DecisionRecordSchema.parse(validDecision)).toEqual(validDecision);
  });

  it("accepts a failed evaluation with null answers and an error message", () => {
    const failed = {
      ...validDecision,
      backend: "mock",
      answers: null,
      usage: null,
      policyOutcome: "error",
      error: "APIConnectionError: fetch failed",
    };
    expect(DecisionRecordSchema.parse(failed)).toEqual(failed);
  });

  it("rejects an unknown policy outcome", () => {
    expect(() => DecisionRecordSchema.parse({ ...validDecision, policyOutcome: "ban" })).toThrow();
  });

  it("rejects a non-ISO evaluatedAt", () => {
    expect(() =>
      DecisionRecordSchema.parse({ ...validDecision, evaluatedAt: "yesterday" }),
    ).toThrow();
  });
});
