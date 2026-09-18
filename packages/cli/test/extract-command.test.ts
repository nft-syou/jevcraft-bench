import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRecordSchema, MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";
import { runExtract } from "../src/commands/extract";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-extract-"));

describe("jevcraft extract", () => {
  it("turns the plugin sample into features and feeds evaluate", async () => {
    const out = join(dir, "features.jsonl");
    const { features, skipped } = await runExtract(
      [join(root, "datasets/fixtures/raw/sample.jsonl"), "--out", out],
      { stderr: () => {} },
    );
    expect(skipped).toBe(0);
    expect(features).toHaveLength(1);
    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    MiningSessionFeaturesSchema.parse(JSON.parse(lines[0] ?? ""));

    const decisions = join(dir, "decisions.jsonl");
    const { records } = await runEvaluate([out, "--backend", "mock", "--out", decisions], {
      env: {},
      stderr: () => {},
    });
    expect(DecisionRecordSchema.parse(records[0])).toEqual(records[0]);
    expect(records[0]?.policyOutcome).toBe("insufficient_evidence");
  });

  it("skips lines that are not telemetry and reports the count", async () => {
    const mixed = join(dir, "mixed.jsonl");
    const sample = readFileSync(join(root, "datasets/fixtures/raw/sample.jsonl"), "utf8");
    writeFileSync(mixed, `${sample}{"not":"telemetry"}\n`);
    const notes: string[] = [];
    const { skipped } = await runExtract([mixed, "--out", join(dir, "f2.jsonl")], {
      stderr: (l) => notes.push(l),
    });
    expect(skipped).toBe(1);
    expect(notes.join("\n")).toMatch(/skipped 1/);
  });

  it("validates --window-minutes", async () => {
    await expect(
      runExtract([join(root, "datasets/fixtures/raw/sample.jsonl"), "--window-minutes", "0"], {
        stderr: () => {},
      }),
    ).rejects.toThrow(/--window-minutes/);
  });
});
