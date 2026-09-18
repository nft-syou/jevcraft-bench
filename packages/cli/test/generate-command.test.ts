import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MiningSessionFeaturesSchema, SessionLabelSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";
import { runGenerate } from "../src/commands/generate";
import { runReport } from "../src/commands/report";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-gen-"));

describe("jevcraft generate", () => {
  it("generates features and labels from the scenarios directory", async () => {
    const features = join(dir, "features.jsonl");
    const labels = join(dir, "labels.jsonl");
    const result = await runGenerate(
      [
        join(root, "scenarios"),
        "--count",
        "3",
        "--seed",
        "5",
        "--out-features",
        features,
        "--out-labels",
        labels,
      ],
      { stderr: () => {} },
    );
    expect(result.features.length).toBeGreaterThanOrEqual(3 * 7);
    const lines = readFileSync(features, "utf8").trim().split("\n");
    expect(lines).toHaveLength(result.features.length);
    for (const line of lines) MiningSessionFeaturesSchema.parse(JSON.parse(line));
    for (const line of readFileSync(labels, "utf8").trim().split("\n")) {
      SessionLabelSchema.parse(JSON.parse(line));
    }
  });

  it("feeds evaluate and report end to end with the mock backend", async () => {
    const features = join(dir, "e2e-features.jsonl");
    const labels = join(dir, "e2e-labels.jsonl");
    const decisions = join(dir, "e2e-decisions.jsonl");
    await runGenerate(
      [join(root, "scenarios"), "--count", "2", "--out-features", features, "--out-labels", labels],
      { stderr: () => {} },
    );
    await runEvaluate([features, "--backend", "mock", "--out", decisions], {
      env: {},
      stderr: () => {},
    });
    const { markdown } = await runReport(
      ["--decisions", decisions, "--labels", labels, "--out", join(dir, "e2e.md")],
      { stderr: () => {} },
    );
    expect(markdown).toContain("| Excluded: no label | 0 |");
    expect(markdown).toContain("| direct_xray |");
  });

  it("requires output paths", async () => {
    await expect(runGenerate([join(root, "scenarios")], { stderr: () => {} })).rejects.toThrow(
      /--out-features/,
    );
  });
});
