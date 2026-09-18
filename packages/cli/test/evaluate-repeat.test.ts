import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";

const root = join(import.meta.dirname, "../../..");
const fixtures = join(root, "datasets/fixtures");
const outDir = mkdtempSync(join(tmpdir(), "jevcraft-repeat-"));

describe("jevcraft evaluate --repeat", () => {
  it("evaluates each session N times with distinct evaluation ids", async () => {
    const { records } = await runEvaluate(
      [
        join(fixtures, "legit-001.json"),
        "--backend",
        "mock",
        "--repeat",
        "3",
        "--out",
        join(outDir, "r.jsonl"),
      ],
      { env: {}, stderr: () => {} },
    );
    expect(records).toHaveLength(3);
    expect(new Set(records.map((r) => r.sessionId)).size).toBe(1);
    expect(new Set(records.map((r) => r.evaluationId)).size).toBe(3);
  });

  it("rejects a non-positive repeat count", async () => {
    await expect(
      runEvaluate(
        [
          join(fixtures, "legit-001.json"),
          "--backend",
          "mock",
          "--repeat",
          "0",
          "--out",
          join(outDir, "x.jsonl"),
        ],
        { env: {}, stderr: () => {} },
      ),
    ).rejects.toThrow(/--repeat/);
  });
});
