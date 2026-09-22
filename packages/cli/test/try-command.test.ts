import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTry } from "../src/commands/try";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-try-test-"));

const capture = () => {
  const lines: string[] = [];
  return { lines, write: (l: string) => lines.push(l) };
};

describe("jevcraft try", () => {
  it("extracts, evaluates and prints a shortlist in one pass", async () => {
    const out = capture();
    const outDir = join(dir, "run");
    const code = await runTry(
      [join(root, "datasets/fixtures/raw/sample.jsonl"), "--backend", "mock", "--out-dir", outDir],
      { stdout: out.write, stderr: () => {}, env: {} },
    );
    expect(code).toBe(0);
    const text = out.lines.join("\n");
    expect(text).toMatch(/session window\(s\) extracted/);
    // A trial with no key must say so, or an operator will read mock output as a judgement.
    expect(text).toMatch(/MOCK backend/);
    expect(text).toMatch(/features\.jsonl/);
  });

  it("explains why an empty recording found nothing, and fails", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "jevcraft-try-empty-"));
    writeFileSync(
      join(emptyDir, "run.jsonl"),
      `${JSON.stringify({
        schemaVersion: 1,
        eventId: "e",
        eventType: "session_start",
        occurredAt: "2026-09-22T00:00:00.000Z",
        serverRunId: "r",
        sessionId: "s",
        playerId: "hmac-sha256:aa",
        world: "w",
        session: { reason: "underground_mining" },
        position: { x: 0, y: 0, z: 0 },
      })}\n`,
    );
    const out = capture();
    const code = await runTry([emptyDir, "--backend", "mock", "--out-dir", join(dir, "empty")], {
      stdout: out.write,
      stderr: () => {},
      env: {},
    });
    expect(code).toBe(1);
    expect(out.lines.join("\n")).toMatch(/No mining sessions found/);
  });

  it("refuses to run without a path", async () => {
    await expect(runTry([], { stdout: () => {}, stderr: () => {}, env: {} })).rejects.toThrow(
      /usage: jevcraft try/,
    );
  });
});
