import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RawTelemetryEventSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

const sampleFile = join(import.meta.dirname, "../../../datasets/fixtures/raw/sample.jsonl");

describe("RawTelemetryEventSchema", () => {
  const lines = readFileSync(sampleFile, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");

  it("validates every line the Paper plugin's integration test produced", () => {
    expect(lines.length).toBeGreaterThan(5);
    const events = lines.map((line) => RawTelemetryEventSchema.parse(JSON.parse(line)));
    const types = events.map((e) => e.eventType);
    expect(types[0]).toBe("session_start");
    expect(types.at(-1)).toBe("session_end");
    expect(types).toContain("hidden_ore_reveal");
    expect(types).toContain("block_break");
    expect(types).toContain("movement_sample");
  });

  it("never contains a raw UUID-looking player id or a player name", () => {
    for (const line of lines) {
      const raw = JSON.parse(line) as { playerId: string };
      expect(raw.playerId).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
      expect(raw).not.toHaveProperty("playerName");
    }
  });

  it("rejects a raw UUID as player id", () => {
    const first = JSON.parse(lines[0] ?? "{}");
    expect(() =>
      RawTelemetryEventSchema.parse({ ...first, playerId: "123e4567-e89b-12d3-a456-426614174000" }),
    ).toThrow();
  });

  it("rejects unknown event types and unknown keys", () => {
    const first = JSON.parse(lines[0] ?? "{}");
    expect(() => RawTelemetryEventSchema.parse({ ...first, eventType: "ban" })).toThrow();
    expect(() => RawTelemetryEventSchema.parse({ ...first, extra: 1 })).toThrow();
  });
});
