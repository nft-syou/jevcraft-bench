import { groupSessions } from "@jevcraft/feature-extractor";
import { describe, expect, it } from "vitest";
import { rawSession, straightTunnel } from "../../feature-extractor/test/helpers";
import { labelSessions, type ManifestEntry } from "../src/commands/label-runs";

const PLAYER = `hmac-sha256:${"ab".repeat(32)}`;

describe("labelSessions", () => {
  it("labels sessions by player id and time overlap, and marks the rest unknown", () => {
    const t0 = Date.parse("2026-09-19T10:00:00Z");
    const events = [
      ...rawSession({ sessionId: "s1", t0, ...straightTunnel(5) }),
      ...rawSession({ sessionId: "s2", t0: t0 + 600_000, ...straightTunnel(5) }),
    ];
    const manifest: ManifestEntry[] = [
      {
        playerId: PLAYER,
        scenario: "xray-direct",
        label: "simulated_xray",
        subtype: "direct_xray",
        joinedAt: new Date(t0 - 10_000).toISOString(),
        leftAt: new Date(t0 + 60_000).toISOString(),
      },
      {
        playerId: "hmac-sha256:someoneelse",
        scenario: "legit-branch-mining",
        label: "legit",
        subtype: "branch_mining",
        joinedAt: new Date(t0 + 590_000).toISOString(),
        leftAt: new Date(t0 + 700_000).toISOString(),
      },
    ];
    const labels = labelSessions(groupSessions(events), manifest);
    expect(labels).toEqual([
      {
        sessionId: "s1",
        label: "simulated_xray",
        subtype: "direct_xray",
        reviewStatus: "single_review",
        notes: "bot: xray-direct",
      },
      {
        sessionId: "s2",
        label: "unknown",
        subtype: null,
        reviewStatus: "unreviewed",
        notes: "no recorder run matched this session",
      },
    ]);
  });
});
