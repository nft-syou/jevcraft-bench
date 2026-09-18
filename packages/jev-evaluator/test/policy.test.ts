import { applyPolicy, DEFAULT_THRESHOLDS } from "@jevcraft/jev-evaluator";
import type { JevAnswers } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

function answers(overrides: {
  legit?: number;
  suspicious?: number;
  likely_xray?: number;
  insufficient_evidence?: number;
  confidence?: number;
  hidden?: number;
  sufficiency?: number;
}): JevAnswers {
  const probabilities = {
    legit: overrides.legit ?? 0,
    suspicious: overrides.suspicious ?? 0,
    likely_xray: overrides.likely_xray ?? 0,
    insufficient_evidence: overrides.insufficient_evidence ?? 0,
  };
  const remaining = 1 - Object.values(probabilities).reduce((a, b) => a + b, 0);
  probabilities.legit += remaining;
  return {
    behaviorClass: {
      choice: "legit",
      probabilities,
      confidence: overrides.confidence ?? 0.9,
    },
    hiddenInformationUse: overrides.hidden ?? 0.1,
    routeNaturalness: { score: 3, normalized: 0.75, confidence: 0.8, probabilities: { "3": 1 } },
    evidenceSufficiency: overrides.sufficiency ?? 0.95,
  };
}

const ok = { enoughEvidence: true };

describe("applyPolicy", () => {
  it("exposes the spec's provisional thresholds", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      minEvidenceSufficiency: 0.65,
      highPriorityXrayProbability: 0.9,
      highPriorityHiddenInfo: 0.85,
      highPriorityConfidence: 0.6,
      reviewCombinedProbability: 0.75,
    });
  });

  it("returns insufficient_evidence when the extractor says evidence is not enough, regardless of Jev", () => {
    expect(
      applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99 }), { enoughEvidence: false }),
    ).toBe("insufficient_evidence");
  });

  it("returns insufficient_evidence when Jev's evidence sufficiency is below 0.65", () => {
    expect(applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99, sufficiency: 0.64 }), ok)).toBe(
      "insufficient_evidence",
    );
    expect(applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99, sufficiency: 0.65 }), ok)).toBe(
      "high_priority_review",
    );
  });

  it("returns high_priority_review only when all three strong signals hold", () => {
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.85, confidence: 0.6 }), ok)).toBe(
      "high_priority_review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.89, hidden: 0.85, confidence: 0.6 }), ok)).toBe(
      "review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.84, confidence: 0.6 }), ok)).toBe(
      "review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.85, confidence: 0.59 }), ok)).toBe(
      "review",
    );
  });

  it("returns review when likely_xray + suspicious reaches 0.75", () => {
    expect(applyPolicy(answers({ likely_xray: 0.4, suspicious: 0.35 }), ok)).toBe("review");
    expect(applyPolicy(answers({ likely_xray: 0.4, suspicious: 0.3499 }), ok)).toBe("no_action");
  });

  it("returns no_action for clearly legit sessions", () => {
    expect(applyPolicy(answers({ legit: 0.9, suspicious: 0.05, likely_xray: 0.03 }), ok)).toBe(
      "no_action",
    );
  });

  it("honours custom thresholds", () => {
    const strict = { ...DEFAULT_THRESHOLDS, reviewCombinedProbability: 0.5 };
    expect(applyPolicy(answers({ likely_xray: 0.3, suspicious: 0.25 }), ok, strict)).toBe("review");
  });
});
