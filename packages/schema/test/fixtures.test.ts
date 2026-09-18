import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MiningSessionFeaturesSchema, SessionLabelSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const fixtureDir = join(root, "datasets/fixtures");
const labelFile = join(root, "datasets/labels/fixtures.jsonl");

const sessionIdFor = (file: string) =>
  `session_fixture_${file.replace(".json", "").replace(/-/g, "_")}`;

describe("datasets/fixtures", () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));

  it("contains the two fixtures required by the spec", () => {
    expect(files).toContain("legit-001.json");
    expect(files).toContain("xray-direct-001.json");
  });

  it.each(files)("%s is a valid MiningSessionFeatures document", (file) => {
    const raw = JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
    const parsed = MiningSessionFeaturesSchema.parse(raw);
    expect(parsed.sessionId).toBe(sessionIdFor(file));
  });

  it("has exactly one label per fixture", () => {
    const labels = readFileSync(labelFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => SessionLabelSchema.parse(JSON.parse(line)));
    const labeled = new Set(labels.map((l) => l.sessionId));
    const expected = new Set(files.map(sessionIdFor));
    expect(labeled).toEqual(expected);
  });
});
