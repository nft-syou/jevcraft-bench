import { createTypeSafeBackend, xrayV1Questions } from "@jevcraft/jev-evaluator";
import { describe, expect, it } from "vitest";

const apiResponse = {
  model: "jev-latest",
  answers: {
    behavior_class: {
      type: "choice",
      choice: "legit",
      confidence: 0.8,
      probabilities: {
        legit: 0.85,
        suspicious: 0.1,
        likely_xray: 0.03,
        insufficient_evidence: 0.02,
      },
    },
    hidden_information_use: { type: "noul", noul: 0.1 },
    route_naturalness: {
      type: "score",
      score: 3.4,
      confidence: 0.6,
      legend: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
      probabilities: { "0": 0, "1": 0.05, "2": 0.1, "3": 0.25, "4": 0.6 },
    },
    evidence_sufficiency: { type: "noul", noul: 0.9 },
  },
  usage: { input_tokens: 300, output_tokens: 20 },
};

describe("createTypeSafeBackend", () => {
  it("posts to /v1/systemone with a bearer token and returns the parsed answers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const backend = createTypeSafeBackend({
      apiKey: "test-key",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(apiResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(backend.kind).toBe("typesafe");
    const result = await backend.systemOne({
      state: { task: "t" },
      questions: xrayV1Questions,
      model: "jev-latest",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.model).toBe("jev-latest");
    expect(Object.keys(body.questions).sort()).toEqual([
      "behavior_class",
      "evidence_sufficiency",
      "hidden_information_use",
      "route_naturalness",
    ]);
    expect(result.answers.behavior_class.choice).toBe("legit");
    expect(result.answers.route_naturalness.score).toBe(3.4);
  });

  it("throws when no API key is available", () => {
    const saved = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(() => createTypeSafeBackend()).toThrow();
    } finally {
      if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
    }
  });
});
