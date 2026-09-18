import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import type {
  ChoiceQuestion,
  Question,
  Questions,
  ScoreQuestion,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import type { JevBackend } from "./backend";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const StateFeaturesSchema = MiningSessionFeaturesSchema.omit({ sessionId: true });

interface MockSignals {
  /** 0 = clearly legit, 1 = clearly acting on hidden information */
  suspicion: number;
  evidenceSufficiency: number;
  enoughEvidence: boolean;
}

const NEUTRAL: MockSignals = { suspicion: 0.5, evidenceSufficiency: 0.5, enoughEvidence: true };

function deriveSignals(state: unknown): MockSignals {
  if (typeof state !== "object" || state === null || !("features" in state)) return NEUTRAL;
  const parsed = StateFeaturesSchema.safeParse((state as { features: unknown }).features);
  if (!parsed.success) return NEUTRAL;
  const f = parsed.data;

  const directness = f.hiddenOreApproach.meanDirectness ?? 0.5;
  const aim = f.hiddenOreApproach.aimAlignmentBeforeRevealRatio ?? 0.5;
  const eff = clamp((f.efficiency.valuableOrePer100Blocks ?? 1) / 8, 0, 1);
  const cave = f.exploration.caveExposureRatio ?? 0.3;
  const samples = f.hiddenOreApproach.sampleCount;

  const raw = 0.45 * directness + 0.35 * aim + 0.2 * eff;
  const suspicion = clamp((raw - 0.15) / 0.7, 0, 1) * (1 - 0.5 * cave) * clamp(samples / 10, 0, 1);

  return {
    suspicion,
    evidenceSufficiency: f.quality.enoughEvidence ? f.quality.trajectoryCoverage : 0.2,
    enoughEvidence: f.quality.enoughEvidence,
  };
}

function normalize<K extends string>(weights: Record<K, number>): Record<K, number> {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  const out = {} as Record<K, number>;
  for (const key of Object.keys(weights) as K[]) out[key] = weights[key] / total;
  return out;
}

function argmax<K extends string>(probabilities: Record<K, number>): K {
  let best: K | undefined;
  for (const key of Object.keys(probabilities) as K[]) {
    if (best === undefined || probabilities[key] > probabilities[best]) best = key;
  }
  if (best === undefined) throw new Error("mock backend: empty choice criteria");
  return best;
}

const BEHAVIOR_LABELS = ["legit", "suspicious", "likely_xray", "insufficient_evidence"] as const;

function answerChoice(question: ChoiceQuestion, signals: MockSignals) {
  const labels = Object.keys(question.criteria);
  const isBehaviorClass =
    labels.length === BEHAVIOR_LABELS.length && BEHAVIOR_LABELS.every((l) => labels.includes(l));

  let probabilities: Record<string, number>;
  if (isBehaviorClass) {
    const s = signals.suspicion;
    probabilities = normalize(
      signals.enoughEvidence
        ? {
            legit: (1 - s) ** 2,
            suspicious: 2 * s * (1 - s),
            likely_xray: s ** 2,
            insufficient_evidence: 0.02,
          }
        : { legit: 0.05, suspicious: 0.08, likely_xray: 0.02, insufficient_evidence: 0.85 },
    );
  } else {
    probabilities = normalize(
      Object.fromEntries(labels.map((l) => [l, 1])) as Record<string, number>,
    );
  }
  const choice = argmax(probabilities);
  return { type: "choice" as const, choice, confidence: probabilities[choice] ?? 0, probabilities };
}

function answerNoul(name: string, signals: MockSignals) {
  const noul =
    name === "hidden_information_use"
      ? signals.suspicion
      : name === "evidence_sufficiency"
        ? signals.evidenceSufficiency
        : 0.5;
  return { type: "noul" as const, noul };
}

function answerScore(question: ScoreQuestion, signals: MockSignals) {
  const levels = question.criteria.length;
  const center = (1 - signals.suspicion) * (levels - 1);
  const weights: Record<string, number> = {};
  for (let i = 0; i < levels; i++) weights[String(i)] = Math.exp(-((i - center) ** 2) / 0.5);
  const probabilities = normalize(weights);
  let score = 0;
  for (let i = 0; i < levels; i++) score += i * (probabilities[String(i)] ?? 0);
  const legend = Object.fromEntries(question.criteria.map((desc, i) => [String(i), desc]));
  const confidence = Math.max(...Object.values(probabilities));
  return { type: "score" as const, score, confidence, legend, probabilities };
}

function answer(name: string, question: Question, signals: MockSignals) {
  switch (question.type) {
    case "choice":
      return answerChoice(question, signals);
    case "noul":
      return answerNoul(name, signals);
    case "score":
      return answerScore(question, signals);
  }
}

/** Deterministic stand-in for Jev. Uses only the supplied features; never calls the network. */
export function createMockBackend(): JevBackend {
  return {
    kind: "mock",
    async systemOne<const Q extends Questions>(
      request: SystemOneRequest<Q>,
    ): Promise<SystemOneResult<Q>> {
      const signals = deriveSignals(request.state);
      const answers: Record<string, unknown> = {};
      for (const [name, question] of Object.entries(request.questions)) {
        answers[name] = answer(name, question, signals);
      }
      const inputTokens = Math.ceil(JSON.stringify(request.state ?? "").length / 4);
      return {
        model: request.model ?? "mock-jev",
        answers: answers as SystemOneResult<Q>["answers"],
        usage: { input_tokens: inputTokens, output_tokens: 0 },
      };
    },
  };
}
