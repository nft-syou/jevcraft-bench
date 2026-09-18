import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { validFeatures } from "./helpers";

describe("MiningSessionFeaturesSchema", () => {
  it("accepts the spec example", () => {
    expect(MiningSessionFeaturesSchema.parse(validFeatures)).toEqual(validFeatures);
  });

  it("keeps null distinct from zero", () => {
    const parsed = MiningSessionFeaturesSchema.parse({
      ...validFeatures,
      efficiency: { ...validFeatures.efficiency, baselinePercentile: null },
      hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: null },
    });
    expect(parsed.efficiency.baselinePercentile).toBeNull();
    expect(parsed.hiddenOreApproach.meanDirectness).toBeNull();
  });

  it("rejects undefined for a nullable metric (missing must be explicit null)", () => {
    const { baselinePercentile: _omit, ...efficiency } = validFeatures.efficiency;
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, efficiency })).toThrow();
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({ ...validFeatures, schemaVersion: 2 }),
    ).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, extra: 1 })).toThrow();
  });

  it("rejects ratios outside 0..1 and detour ratios below 1", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: 1.2 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, medianDetourRatio: 0.9 },
      }),
    ).toThrow();
  });

  it("rejects negative counts and non-integer counts", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: -1 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: 1.5 },
      }),
    ).toThrow();
  });
});
