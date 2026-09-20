import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";
import { runRepolicy } from "../src/commands/repolicy";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-repolicy-"));

describe("jevcraft repolicy", () => {
  it("recomputes outcomes offline and reports how many changed", async () => {
    const decisions = join(dir, "d.jsonl");
    await runEvaluate([join(root, "datasets/fixtures"), "--backend", "mock", "--out", decisions], {
      env: {},
      stderr: () => {},
    });
    const same = await runRepolicy(
      [
        "--decisions",
        decisions,
        "--features",
        join(root, "datasets/fixtures"),
        "--out",
        join(dir, "same.jsonl"),
      ],
      { stderr: () => {} },
    );
    expect(same.changed).toBe(0);
    // A gate no session can pass, with the approach-only path disabled, turns every ordinary
    // review into no_action.
    const strict = await runRepolicy(
      [
        "--decisions",
        decisions,
        "--features",
        join(root, "datasets/fixtures"),
        "--min-approach-targeting",
        "0.99",
        "--bypass-xray",
        "off",
        "--approach-alone",
        "off",
        "--out",
        join(dir, "strict.jsonl"),
      ],
      { stderr: () => {} },
    );
    expect(strict.changed).toBe(1);
    expect(
      strict.records.find((r) => r.sessionId === "session_fixture_xray_evasive_001")?.policyOutcome,
    ).toBe("no_action");
  });
});
