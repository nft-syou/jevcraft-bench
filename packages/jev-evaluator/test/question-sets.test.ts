import {
  buildState,
  DEFAULT_QUESTION_SET,
  getQuestionSet,
  QUESTION_SETS,
  xrayV1,
  xrayV2,
  xrayV3,
  xrayV4,
  xrayV5,
} from "@jevcraft/jev-evaluator";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { validFeatures } from "../../schema/test/helpers";

describe("question set registry", () => {
  it("knows xray-v1..v5 and defaults to v4", () => {
    expect(QUESTION_SETS.map((s) => s.version)).toEqual([
      "xray-v1",
      "xray-v2",
      "xray-v3",
      "xray-v4",
      "xray-v5",
    ]);
    expect(DEFAULT_QUESTION_SET.version).toBe("xray-v4");
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

  it("v3 is v2's questions with v1's context", () => {
    expect(xrayV3.questions).toBe(xrayV2.questions);
    expect(xrayV3.importantContext).toEqual(xrayV1.importantContext);
    expect(xrayV3.task).toBe(xrayV1.task);
  });

  it("v4 changes only the sufficiency wording relative to v3", () => {
    const { evidence_sufficiency: v3Suff, ...v3Rest } = xrayV3.questions;
    const { evidence_sufficiency: v4Suff, ...v4Rest } = xrayV4.questions;
    expect(v4Rest).toEqual(v3Rest);
    expect(String(v4Suff.instructions)).toMatch(/blocks broken/);
    expect(String(v3Suff.instructions)).not.toMatch(/blocks broken/);
    expect(xrayV4.importantContext).toEqual(xrayV3.importantContext);
  });

  it("v5 keeps v4 questions and only adds context", () => {
    expect(xrayV5.questions).toBe(xrayV4.questions);
    expect(xrayV5.importantContext.slice(0, 4)).toEqual(xrayV4.importantContext);
    expect(xrayV5.importantContext.join(" ")).toMatch(/baselinePercentile/);
  });

  it("builds state from any set without the session id", () => {
    const features = MiningSessionFeaturesSchema.parse(validFeatures);
    const state = buildState(xrayV2, features);
    expect(state.importantContext).toHaveLength(5);
    expect(state.features).not.toHaveProperty("sessionId");
  });
});
