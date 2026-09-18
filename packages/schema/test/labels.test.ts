import { SessionLabelSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

describe("SessionLabelSchema", () => {
  it("accepts a reviewed label with subtype", () => {
    const label = {
      sessionId: "session_test_001",
      label: "simulated_xray",
      subtype: "direct_xray",
      reviewStatus: "single_review",
    };
    expect(SessionLabelSchema.parse(label)).toEqual(label);
  });

  it("accepts unknown labels with null subtype and optional notes", () => {
    const label = {
      sessionId: "session_test_002",
      label: "unknown",
      subtype: null,
      reviewStatus: "double_review_disagree",
      notes: "reviewers disagreed on cave exposure",
    };
    expect(SessionLabelSchema.parse(label)).toEqual(label);
  });

  it("rejects 'suspicious' as a ground truth label (it is a model output)", () => {
    expect(() =>
      SessionLabelSchema.parse({
        sessionId: "session_test_003",
        label: "suspicious",
        subtype: null,
        reviewStatus: "unreviewed",
      }),
    ).toThrow();
  });
});
