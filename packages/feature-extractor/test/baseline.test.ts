import {
  buildBaseline,
  extractFeatures,
  groupSessions,
  percentileOf,
} from "@jevcraft/feature-extractor";
import { describe, expect, it } from "vitest";
import { rawSession, straightTunnel } from "./helpers";

describe("baseline", () => {
  it("computes the share of reference values at or below x", () => {
    const b = buildBaseline([0, 0.5, 1, 2, 4], "test");
    expect(b.values).toEqual([0, 0.5, 1, 2, 4]);
    expect(percentileOf(b.values, 0)).toBe(20);
    expect(percentileOf(b.values, 1)).toBe(60);
    expect(percentileOf(b.values, 9)).toBe(100);
    expect(Number.isNaN(percentileOf([], 1))).toBe(true);
  });

  it("fills efficiency.baselinePercentile when a baseline is given, null otherwise", () => {
    const tunnel = straightTunnel(50);
    const events = rawSession({
      ...tunnel,
      reveals: [{ t: 20_600, at: { x: 20, y: 10, z: 0 }, ore: { x: 20, y: 10, z: 1 } }],
    });
    const [session] = groupSessions(events);
    if (!session) throw new Error("no session");
    expect(extractFeatures(session).efficiency.baselinePercentile).toBeNull();
    const baseline = buildBaseline([0, 0.5, 1, 1.5, 3], "test");
    const f = extractFeatures(session, { baseline });
    // 1 reveal / 50 breaks = 2 per 100 blocks -> above 4 of 5 reference values
    expect(f.efficiency.valuableOrePer100Blocks).toBe(2);
    expect(f.efficiency.baselinePercentile).toBe(80);
  });
});
