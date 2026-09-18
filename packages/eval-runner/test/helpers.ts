import type {
  DecisionRecord,
  GroundTruthLabel,
  PolicyOutcome,
  SessionLabel,
} from "@jevcraft/schema";

export function decision(
  sessionId: string,
  policyOutcome: PolicyOutcome,
  overrides: { likelyXray?: number; confidence?: number; latencyMs?: number; error?: string } = {},
): DecisionRecord {
  const likelyXray = overrides.likelyXray ?? (policyOutcome === "no_action" ? 0.1 : 0.8);
  const failed = overrides.error !== undefined;
  return {
    schemaVersion: 1,
    evaluationId: `eval_${sessionId}`,
    sessionId,
    evaluatedAt: "2026-09-19T00:00:00.000Z",
    model: "mock-jev",
    backend: "mock",
    questionSetVersion: "xray-v1",
    featureExtractorVersion: "0.1.0",
    answers: failed
      ? null
      : {
          behaviorClass: {
            choice: likelyXray >= 0.5 ? "likely_xray" : "legit",
            probabilities: {
              legit: 1 - likelyXray - 0.1,
              suspicious: 0.1,
              likely_xray: likelyXray,
              insufficient_evidence: 0,
            },
            confidence: overrides.confidence ?? 0.8,
          },
          hiddenInformationUse: likelyXray,
          routeNaturalness: {
            score: 2,
            normalized: 0.5,
            confidence: 0.5,
            probabilities: { "2": 1 },
          },
          evidenceSufficiency: 0.9,
        },
    policyOutcome: failed ? "error" : policyOutcome,
    latencyMs: overrides.latencyMs ?? 100,
    usage: failed ? null : { inputTokens: 100, outputTokens: 10 },
    error: overrides.error ?? null,
  };
}

export function label(
  sessionId: string,
  value: GroundTruthLabel,
  subtype: SessionLabel["subtype"] = null,
): SessionLabel {
  return { sessionId, label: value, subtype, reviewStatus: "single_review" };
}
