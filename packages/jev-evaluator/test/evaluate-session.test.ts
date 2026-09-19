import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMockBackend,
  evaluateSession,
  type JevBackend,
  xrayV2,
} from "@jevcraft/jev-evaluator";
import { DecisionRecordSchema, MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

const fixtureDir = join(import.meta.dirname, "../../../datasets/fixtures");
const loadFixture = (name: string) =>
  MiningSessionFeaturesSchema.parse(JSON.parse(readFileSync(join(fixtureDir, name), "utf8")));

const fixedOptions = {
  backend: createMockBackend(),
  now: () => new Date("2026-09-19T00:00:00.000Z"),
  newEvaluationId: () => "eval_fixed",
};

describe("evaluateSession", () => {
  it("produces a schema-valid decision record with versions and probabilities", async () => {
    const record = await evaluateSession(loadFixture("xray-direct-001.json"), fixedOptions);
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      schemaVersion: 1,
      evaluationId: "eval_fixed",
      sessionId: "session_fixture_xray_direct_001",
      evaluatedAt: "2026-09-19T00:00:00.000Z",
      model: "jev-latest",
      backend: "mock",
      questionSetVersion: "xray-v4",
      featureExtractorVersion: "0.1.0",
      policyOutcome: "high_priority_review",
      error: null,
    });
    expect(record.answers?.behaviorClass.probabilities.likely_xray).toBeGreaterThanOrEqual(0.9);
    expect(record.answers?.behaviorClass.confidence).toBeGreaterThan(0);
    expect(record.usage?.inputTokens).toBeGreaterThan(0);
  });

  it("normalizes route naturalness so that 1 means natural", async () => {
    const legit = await evaluateSession(loadFixture("legit-001.json"), fixedOptions);
    const xray = await evaluateSession(loadFixture("xray-direct-001.json"), fixedOptions);
    expect(legit.answers?.routeNaturalness.normalized).toBeGreaterThan(0.75);
    expect(xray.answers?.routeNaturalness.normalized).toBeLessThan(0.25);
    expect(legit.answers?.routeNaturalness.normalized).toBeCloseTo(
      (legit.answers?.routeNaturalness.score ?? 0) / 4,
      10,
    );
  });

  it.each([
    ["legit-001.json", "no_action"],
    ["legit-002.json", "no_action"],
    ["xray-direct-001.json", "high_priority_review"],
    ["xray-evasive-001.json", "review"],
    ["insufficient-001.json", "insufficient_evidence"],
  ])("%s -> %s with the mock backend", async (file, outcome) => {
    const record = await evaluateSession(loadFixture(file), fixedOptions);
    expect(record.policyOutcome).toBe(outcome);
  });

  it("records the question set version and sends that set's questions", async () => {
    const seen: string[] = [];
    const spy: JevBackend = {
      kind: "mock",
      systemOne: async (request) => {
        seen.push(String(request.questions.evidence_sufficiency?.instructions));
        return createMockBackend().systemOne(request);
      },
    };
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      backend: spy,
      questionSet: xrayV2,
    });
    expect(record.questionSetVersion).toBe("xray-v2");
    expect(seen[0]).toMatch(/not whether cheating occurred/);
  });

  it("passes the model override to the backend", async () => {
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      model: "jev-2026-09",
    });
    expect(record.model).toBe("jev-2026-09");
  });

  it("fails open: backend errors become an error record instead of throwing", async () => {
    const failing: JevBackend = {
      kind: "typesafe",
      systemOne: async () => {
        throw new Error("boom");
      },
    };
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      backend: failing,
    });
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      backend: "typesafe",
      answers: null,
      usage: null,
      policyOutcome: "error",
      error: "Error: boom",
    });
  });

  it("treats a malformed backend response as an error record", async () => {
    const malformed: JevBackend = {
      kind: "typesafe",
      systemOne: async () =>
        // biome-ignore lint/suspicious/noExplicitAny: intentionally malformed
        ({ model: "x", answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }) as any,
    };
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      backend: malformed,
    });
    expect(record.policyOutcome).toBe("error");
    expect(record.error).toMatch(/behavior_class|ZodError|Cannot read/);
  });
});
