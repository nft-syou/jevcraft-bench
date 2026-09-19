import type { MiningSessionFeatures } from "@jevcraft/schema";
import type { JsonValue, NoulQuestion } from "@typesafe-ai/sdk";
import type { XrayV1Questions } from "./xray-v1";

/** v1 questions plus an optional dedicated approach question (xray-v6+). */
export type XrayQuestions = XrayV1Questions & { approach_targeting?: NoulQuestion };

/**
 * A versioned set of the four xray questions plus the framing sent as `state`.
 * All sets share the v1 keys and answer shapes so decision records stay comparable.
 */
export interface QuestionSet {
  version: string;
  task: string;
  importantContext: string[];
  questions: XrayQuestions;
  /** Feature paths (e.g. "quality.enoughEvidence") removed from the state before sending; for ablations. */
  redact?: string[];
}

export interface QuestionSetState {
  task: string;
  importantContext: string[];
  features: JsonValue;
  [key: string]: JsonValue;
}

/** State sent to Jev. The session id is an opaque handle for our records and is not sent. */
export function buildState(set: QuestionSet, features: MiningSessionFeatures): QuestionSetState {
  const { sessionId: _omit, ...rest } = features;
  const copy = structuredClone(rest) as Record<string, unknown>;
  for (const path of set.redact ?? []) {
    const parts = path.split(".");
    const last = parts.pop();
    let node: unknown = copy;
    for (const part of parts) node = (node as Record<string, unknown> | undefined)?.[part];
    if (last !== undefined && typeof node === "object" && node !== null) {
      delete (node as Record<string, unknown>)[last];
    }
  }
  return {
    task: set.task,
    importantContext: set.importantContext,
    features: copy as unknown as JsonValue,
  };
}
