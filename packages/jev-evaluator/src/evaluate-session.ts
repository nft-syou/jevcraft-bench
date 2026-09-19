import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  type DecisionRecord,
  DecisionRecordSchema,
  type JevAnswers,
  JevAnswersSchema,
  type MiningSessionFeatures,
  MiningSessionFeaturesSchema,
} from "@jevcraft/schema";
import type { SystemOneResult } from "@typesafe-ai/sdk";
import type { JevBackend } from "./backend";
import { applyPolicy, DEFAULT_THRESHOLDS, type PolicyThresholds } from "./policy";
import { DEFAULT_QUESTION_SET } from "./questions/index";
import type { XrayQuestions } from "./questions/question-set";
import { buildState, type QuestionSet } from "./questions/question-set";
import { ROUTE_NATURALNESS_MAX } from "./questions/xray-v1";

type XrayAnswers = SystemOneResult<XrayQuestions>["answers"];

import { DEFAULT_MODEL } from "./typesafe-backend";

export interface EvaluateSessionOptions {
  backend: JevBackend;
  /** Model override; defaults to `jev-latest`. */
  model?: string;
  thresholds?: PolicyThresholds;
  /** Question set to send; defaults to DEFAULT_QUESTION_SET. Its version is recorded on the decision. */
  questionSet?: QuestionSet;
  /** Injectable clock for reproducible records. */
  now?: () => Date;
  /** Injectable id factory for reproducible records. */
  newEvaluationId?: () => string;
}

/** Converts the SDK answer shape into the stored, validated shape. */
export function toJevAnswers(raw: XrayAnswers): JevAnswers {
  return JevAnswersSchema.parse({
    behaviorClass: {
      choice: raw.behavior_class.choice,
      probabilities: raw.behavior_class.probabilities,
      confidence: raw.behavior_class.confidence,
    },
    hiddenInformationUse: raw.hidden_information_use.noul,
    routeNaturalness: {
      score: raw.route_naturalness.score,
      normalized: raw.route_naturalness.score / ROUTE_NATURALNESS_MAX,
      confidence: raw.route_naturalness.confidence,
      probabilities: raw.route_naturalness.probabilities,
    },
    evidenceSufficiency: raw.evidence_sufficiency.noul,
    ...(raw.approach_targeting ? { approachTargeting: raw.approach_targeting.noul } : {}),
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Evaluates one mining session. Never throws for backend or validation failures:
 * those become a record with `policyOutcome: "error"` so batch runs and any future
 * live path stay fail-open.
 */
export async function evaluateSession(
  input: MiningSessionFeatures,
  options: EvaluateSessionOptions,
): Promise<DecisionRecord> {
  const features = MiningSessionFeaturesSchema.parse(input);
  const now = options.now ?? (() => new Date());
  const newId = options.newEvaluationId ?? (() => `eval_${randomUUID()}`);
  const model = options.model ?? DEFAULT_MODEL;
  const questionSet = options.questionSet ?? DEFAULT_QUESTION_SET;

  const base = {
    schemaVersion: 1 as const,
    evaluationId: newId(),
    sessionId: features.sessionId,
    evaluatedAt: now().toISOString(),
    backend: options.backend.kind,
    questionSetVersion: questionSet.version,
    featureExtractorVersion: features.featureExtractorVersion,
  };

  const started = performance.now();
  try {
    const result = await options.backend.systemOne({
      state: buildState(questionSet, features),
      questions: questionSet.questions,
      model,
    });
    const latencyMs = Math.round(performance.now() - started);
    const answers = toJevAnswers(result.answers);
    return DecisionRecordSchema.parse({
      ...base,
      model: result.model,
      answers,
      policyOutcome: applyPolicy(
        answers,
        features.quality,
        options.thresholds ?? DEFAULT_THRESHOLDS,
      ),
      latencyMs,
      usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
      error: null,
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return DecisionRecordSchema.parse({
      ...base,
      model,
      answers: null,
      policyOutcome: "error",
      latencyMs,
      usage: null,
      error: describeError(error),
    });
  }
}
