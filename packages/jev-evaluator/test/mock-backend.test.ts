import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildXrayV1State, createMockBackend, xrayV1Questions } from "@jevcraft/jev-evaluator";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

const fixtureDir = join(import.meta.dirname, "../../../datasets/fixtures");
const loadFixture = (name: string) =>
  MiningSessionFeaturesSchema.parse(JSON.parse(readFileSync(join(fixtureDir, name), "utf8")));

const ask = (name: string) =>
  createMockBackend().systemOne({
    state: buildXrayV1State(loadFixture(name)),
    questions: xrayV1Questions,
    model: "jev-latest",
  });

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("mock backend", () => {
  it("reports kind mock", () => {
    expect(createMockBackend().kind).toBe("mock");
  });

  it("returns answers shaped like the SDK result for every question", async () => {
    const result = await ask("xray-direct-001.json");
    expect(result.model).toBe("jev-latest");
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.answers.behavior_class.type).toBe("choice");
    expect(result.answers.hidden_information_use.type).toBe("noul");
    expect(result.answers.route_naturalness.type).toBe("score");
    expect(result.answers.evidence_sufficiency.type).toBe("noul");
    expect(Object.keys(result.answers.route_naturalness.probabilities)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("produces probability distributions that sum to one", async () => {
    const result = await ask("xray-evasive-001.json");
    expect(sum(Object.values(result.answers.behavior_class.probabilities))).toBeCloseTo(1, 6);
    expect(sum(Object.values(result.answers.route_naturalness.probabilities))).toBeCloseTo(1, 6);
    expect(result.answers.behavior_class.confidence).toBeCloseTo(
      Math.max(...Object.values(result.answers.behavior_class.probabilities)),
      6,
    );
  });

  it("is deterministic", async () => {
    const a = await ask("legit-002.json");
    const b = await ask("legit-002.json");
    expect(a).toEqual(b);
  });

  it("flags direct xray strongly", async () => {
    const { answers } = await ask("xray-direct-001.json");
    expect(answers.behavior_class.choice).toBe("likely_xray");
    expect(answers.behavior_class.probabilities.likely_xray).toBeGreaterThanOrEqual(0.9);
    expect(answers.hidden_information_use.noul).toBeGreaterThanOrEqual(0.85);
    expect(answers.route_naturalness.score).toBeLessThan(1);
  });

  it("keeps branch mining legit", async () => {
    const { answers } = await ask("legit-001.json");
    expect(answers.behavior_class.choice).toBe("legit");
    expect(answers.behavior_class.probabilities.likely_xray).toBeLessThan(0.1);
    expect(answers.route_naturalness.score).toBeGreaterThan(3);
  });

  it("marks weak telemetry as insufficient evidence", async () => {
    const { answers } = await ask("insufficient-001.json");
    expect(answers.behavior_class.choice).toBe("insufficient_evidence");
    expect(answers.evidence_sufficiency.noul).toBeLessThan(0.65);
  });

  it("answers 0.5 for unknown noul questions and uniform for unknown choice labels", async () => {
    const result = await createMockBackend().systemOne({
      state: { unrelated: true },
      questions: {
        anything: { type: "noul", instructions: "?" },
        pick: { type: "choice", instructions: "?", criteria: { a: null, b: null } },
      },
    });
    expect(result.answers.anything.noul).toBe(0.5);
    expect(result.answers.pick.probabilities).toEqual({ a: 0.5, b: 0.5 });
  });
});
