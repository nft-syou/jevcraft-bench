import { arenaOrigin, getScenario, nextCellToward, SCENARIOS } from "@jevcraft/bot-recorder";
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

describe("nextCellToward", () => {
  it("walks a diagonal as an alternating staircase that hugs the straight line", () => {
    const start = new Vec3(0, 10, 0);
    const goal = new Vec3(6, 10, 6);
    let cell = start;
    const steps: string[] = [];
    for (let i = 0; i < 12; i++) {
      cell = nextCellToward(cell, goal, start);
      steps.push(`${cell.x},${cell.z}`);
    }
    expect(cell).toEqual(goal);
    expect(steps.slice(0, 4)).toEqual(["1,0", "1,1", "2,1", "2,2"]);
  });

  it("reaches a 2:1 slope goal in exactly dx+dz steps", () => {
    const start = new Vec3(0, 10, 0);
    const goal = new Vec3(10, 10, 5);
    let cell = start;
    for (let i = 0; i < 15; i++) cell = nextCellToward(cell, goal, start);
    expect(cell).toEqual(goal);
  });

  it("moves at most one level per step", () => {
    expect(nextCellToward(new Vec3(0, 10, 0), new Vec3(3, 13, 0)).y).toBe(11);
  });
});
