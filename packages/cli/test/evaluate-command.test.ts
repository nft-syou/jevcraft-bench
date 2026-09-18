import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRecordSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";

const root = join(import.meta.dirname, "../../..");
const fixtures = join(root, "datasets/fixtures");
const outDir = mkdtempSync(join(tmpdir(), "jevcraft-eval-"));

describe("jevcraft evaluate", () => {
  it("evaluates a single fixture with the mock backend and writes schema-valid jsonl", async () => {
    const out = join(outDir, "single.jsonl");
    const notes: string[] = [];
    const { records } = await runEvaluate(
      [join(fixtures, "xray-direct-001.json"), "--out", out, "--backend", "mock"],
      { env: {}, stderr: (line) => notes.push(line) },
    );
    expect(records).toHaveLength(1);
    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const stored = DecisionRecordSchema.parse(JSON.parse(lines[0] ?? ""));
    expect(stored.policyOutcome).toBe("high_priority_review");
    expect(stored.backend).toBe("mock");
  });

  it("evaluates a whole directory", async () => {
    const out = join(outDir, "dir.jsonl");
    const { records } = await runEvaluate([fixtures, "--out", out, "--backend", "mock"], {
      env: {},
    });
    expect(records.map((r) => r.sessionId).sort()).toEqual([
      "session_fixture_insufficient_001",
      "session_fixture_legit_001",
      "session_fixture_legit_002",
      "session_fixture_xray_direct_001",
      "session_fixture_xray_evasive_001",
    ]);
  });

  it("falls back to mock when --backend auto and no API key, and says so", async () => {
    const notes: string[] = [];
    const { records } = await runEvaluate(
      [join(fixtures, "legit-001.json"), "--out", join(outDir, "auto.jsonl")],
      { env: {}, stderr: (line) => notes.push(line) },
    );
    expect(records[0]?.backend).toBe("mock");
    expect(notes.join("\n")).toMatch(/TYPESAFE_API_KEY/);
  });

  it("rejects --backend typesafe without an API key", async () => {
    await expect(
      runEvaluate(
        [
          join(fixtures, "legit-001.json"),
          "--backend",
          "typesafe",
          "--out",
          join(outDir, "x.jsonl"),
        ],
        { env: {} },
      ),
    ).rejects.toThrow(/TYPESAFE_API_KEY/);
  });

  it("rejects input that is not a valid feature document", async () => {
    await expect(
      runEvaluate(
        [
          join(root, "datasets/labels/fixtures.jsonl"),
          "--backend",
          "mock",
          "--out",
          join(outDir, "bad.jsonl"),
        ],
        { env: {} },
      ),
    ).rejects.toThrow();
  });
});
