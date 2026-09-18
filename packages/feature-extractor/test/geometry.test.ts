import {
  angleBetweenDeg,
  headingDeg,
  headingDeltaDeg,
  mean,
  median,
  stdDev,
  viewVector,
} from "@jevcraft/feature-extractor";
import { describe, expect, it } from "vitest";

describe("viewVector (Minecraft yaw/pitch)", () => {
  it("yaw 0 looks toward +z, yaw -90 toward +x, yaw 90 toward -x", () => {
    expect(viewVector(0, 0).z).toBeCloseTo(1);
    expect(viewVector(-90, 0).x).toBeCloseTo(1);
    expect(viewVector(90, 0).x).toBeCloseTo(-1);
  });

  it("positive pitch looks down", () => {
    expect(viewVector(0, 90).y).toBeCloseTo(-1);
    expect(viewVector(0, -45).y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("angles", () => {
  it("angleBetweenDeg handles right angles, parallel and degenerate vectors", () => {
    expect(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(90);
    expect(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeCloseTo(0);
    expect(angleBetweenDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it("headingDeg matches yaw convention and ignores tiny moves", () => {
    expect(headingDeg({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(0);
    expect(headingDeg({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(90);
    expect(headingDeg({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBeCloseTo(270);
    expect(headingDeg({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 5, z: 0 })).toBeNull();
  });

  it("headingDeltaDeg wraps around", () => {
    expect(headingDeltaDeg(350, 10)).toBe(20);
    expect(headingDeltaDeg(90, 270)).toBe(180);
  });
});

describe("stats", () => {
  it("mean, stdDev and median return null for empty input", () => {
    expect(mean([])).toBeNull();
    expect(stdDev([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it("median of even and odd counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
  });
});
