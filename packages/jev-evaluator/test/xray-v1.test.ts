import { buildXrayV1State, XRAY_V1_VERSION, xrayV1Questions } from "@jevcraft/jev-evaluator";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { validFeatures } from "../../schema/test/helpers";

describe("xray-v1 question set", () => {
  it("is versioned", () => {
    expect(XRAY_V1_VERSION).toBe("xray-v1");
  });

  it("decomposes the judgement into four independent questions", () => {
    expect(Object.keys(xrayV1Questions).sort()).toEqual([
      "behavior_class",
      "evidence_sufficiency",
      "hidden_information_use",
      "route_naturalness",
    ]);
    expect(xrayV1Questions.behavior_class.type).toBe("choice");
    expect(xrayV1Questions.hidden_information_use.type).toBe("noul");
    expect(xrayV1Questions.route_naturalness.type).toBe("score");
    expect(xrayV1Questions.evidence_sufficiency.type).toBe("noul");
  });

  it("uses the four behavior classes as choice labels", () => {
    expect(Object.keys(xrayV1Questions.behavior_class.criteria).sort()).toEqual([
      "insufficient_evidence",
      "legit",
      "likely_xray",
      "suspicious",
    ]);
  });

  it("orders route naturalness from unnatural (0) to natural (4)", () => {
    const rubric = xrayV1Questions.route_naturalness.criteria;
    expect(rubric).toHaveLength(5);
    expect(rubric[0]).toMatch(/unnatural/i);
    expect(rubric[4]).toMatch(/legitimate/i);
  });

  it("builds state without the session id and with the guard-rail context", () => {
    const features = MiningSessionFeaturesSchema.parse(validFeatures);
    const state = buildXrayV1State(features);
    expect(state.task).toMatch(/hidden ore knowledge/);
    expect(state.importantContext).toContain("Judge only from the supplied observations.");
    expect(state.features).not.toHaveProperty("sessionId");
    expect(state.features).toHaveProperty("hiddenOreApproach");
  });
});
