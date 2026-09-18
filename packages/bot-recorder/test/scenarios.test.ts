import { arenaOrigin, getScenario, SCENARIOS } from "@jevcraft/bot-recorder";
import { Vec3 } from "vec3";
import { describe, expect, it } from "vitest";

describe("scenario registry", () => {
  it("ships one legit and three x-ray scenarios with labels the eval runner understands", () => {
    expect(SCENARIOS.map((s) => s.name)).toEqual([
      "legit-branch-mining",
      "xray-direct",
      "xray-detour",
      "xray-humanized",
    ]);
    expect(SCENARIOS.filter((s) => s.label === "legit")).toHaveLength(1);
    expect(SCENARIOS.filter((s) => s.label === "simulated_xray")).toHaveLength(3);
    expect(getScenario("xray-detour").subtype).toBe("detour_xray");
    expect(() => getScenario("nope")).toThrow(/unknown scenario/);
  });
});

describe("arenaOrigin", () => {
  it("spreads runs over a 64-block grid", () => {
    const base = new Vec3(100, -58, 100);
    expect(arenaOrigin(base, 0)).toEqual(new Vec3(100, -58, 100));
    expect(arenaOrigin(base, 1)).toEqual(new Vec3(164, -58, 100));
    expect(arenaOrigin(base, 8)).toEqual(new Vec3(100, -58, 164));
  });
});
