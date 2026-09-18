import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";
import { runReport } from "../src/commands/report";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-report-"));

describe("jevcraft report", () => {
  it("renders a report from evaluate output and the fixture labels", async () => {
    const decisions = join(dir, "fixtures.jsonl");
    await runEvaluate([join(root, "datasets/fixtures"), "--backend", "mock", "--out", decisions], {
      env: {},
      stderr: () => {},
    });

    const out = join(dir, "fixtures.md");
    const { markdown } = await runReport(
      [
        "--decisions",
        decisions,
        "--labels",
        join(root, "datasets/labels/fixtures.jsonl"),
        "--out",
        out,
      ],
      { stderr: () => {} },
    );

    expect(readFileSync(out, "utf8")).toBe(markdown);
    expect(markdown).toContain("| Decisions | 5 |");
    expect(markdown).toContain("| Usable for metrics | 4 |");
    // The mock is designed to separate the fixtures perfectly; the report must say so.
    expect(markdown).toMatch(/\| FPR \| 0\.000 \|/);
    expect(markdown).toMatch(/\| Recall \| 1\.000 \|/);
  });

  it("requires --decisions and --labels", async () => {
    await expect(runReport(["--decisions", "x.jsonl"])).rejects.toThrow(/--labels/);
  });
});
