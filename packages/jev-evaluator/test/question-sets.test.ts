import {
  buildState,
  DEFAULT_QUESTION_SET,
  getQuestionSet,
  QUESTION_SETS,
  xrayV1,
  xrayV2,
} from "@jevcraft/jev-evaluator";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { validFeatures } from "../../schema/test/helpers";

describe("question set registry", () => {
  it("knows xray-v1 and xray-v2 and defaults to v1", () => {
    expect(QUESTION_SETS.map((s) => s.version)).toEqual(["xray-v1", "xray-v2"]);
    expect(DEFAULT_QUESTION_SET.version).toBe("xray-v1");
    expect(getQuestionSet("xray-v2")).toBe(xrayV2);
    expect(() => getQuestionSet("xray-v9")).toThrow(/unknown question set "xray-v9"/);
  });

  it("v2 differs from v1 only in evidence_sufficiency and one extra context line", () => {
    const { evidence_sufficiency: v1Suff, ...v1Rest } = xrayV1.questions;
    const { evidence_sufficiency: v2Suff, ...v2Rest } = xrayV2.questions;
    expect(v2Rest).toEqual(v1Rest);
    expect(v2Suff).not.toEqual(v1Suff);
    expect(v2Suff.type).toBe("noul");
    expect(String(v2Suff.instructions)).toMatch(/not whether cheating occurred/);
    expect(xrayV2.task).toBe(xrayV1.task);
    expect(xrayV2.importantContext.slice(0, xrayV1.importantContext.length)).toEqual(
      xrayV1.importantContext,
    );
    expect(xrayV2.importantContext).toHaveLength(xrayV1.importantContext.length + 1);
  });

  it("builds state from any set without the session id", () => {
    const features = MiningSessionFeaturesSchema.parse(validFeatures);
    const state = buildState(xrayV2, features);
    expect(state.importantContext).toHaveLength(5);
    expect(state.features).not.toHaveProperty("sessionId");
  });
});
