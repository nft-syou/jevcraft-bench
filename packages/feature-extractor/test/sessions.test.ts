import { groupSessions, splitIntoWindows } from "@jevcraft/feature-extractor";
import { describe, expect, it } from "vitest";
import { rawSession, straightTunnel } from "./helpers";

const firstSession = (events: ReturnType<typeof rawSession>) => {
  const [session] = groupSessions(events);
  if (!session) throw new Error("no session in events");
  return session;
};

describe("groupSessions", () => {
  it("groups by session id, sorts by time and records missing boundaries", () => {
    const a = rawSession({ sessionId: "s_a", ...straightTunnel(3) });
    const b = rawSession({
      sessionId: "s_b",
      t0: Date.parse("2026-09-19T01:00:00Z"),
      ...straightTunnel(2),
      omitEnd: true,
    });
    const shuffled = [...b, ...a].reverse();
    const sessions = groupSessions(shuffled);
    expect(sessions.map((s) => s.sessionId)).toEqual(["s_a", "s_b"]);
    expect(sessions[0]?.breaks.map((e) => e.position.x)).toEqual([0, 1, 2]);
    expect(sessions[0]?.notes).toEqual([]);
    expect(sessions[1]?.notes).toEqual(["missing_session_end"]);
    expect(sessions[1]?.endedAtMs).toBe(Date.parse("2026-09-19T01:00:01.500Z"));
  });

  it("ignores events without a session id", () => {
    const events = rawSession(straightTunnel(2)).map((e) =>
      e.eventType === "movement_sample" ? { ...e, sessionId: null } : e,
    );
    const [session] = groupSessions(events);
    expect(session?.movements).toHaveLength(0);
    expect(session?.breaks).toHaveLength(2);
  });
});

describe("splitIntoWindows", () => {
  it("keeps short sessions whole", () => {
    const session = firstSession(rawSession(straightTunnel(5)));
    expect(splitIntoWindows(session, 60_000)).toHaveLength(1);
  });

  it("splits long sessions into contiguous windows with related ids", () => {
    const tunnel = straightTunnel(130); // 130 s
    const session = firstSession(rawSession({ sessionId: "s_long", ...tunnel }));
    const windows = splitIntoWindows(session, 60_000);
    expect(windows.map((w) => w.sessionId)).toEqual(["s_long:w1", "s_long:w2", "s_long:w3"]);
    expect(windows.reduce((n, w) => n + w.breaks.length, 0)).toBe(130);
    expect(windows[0]?.start).not.toBeNull();
    expect(windows[0]?.end).toBeNull();
    expect(windows[2]?.end).not.toBeNull();
    expect(windows[1]?.notes).toContain("windowed");
    expect(windows[1]?.startedAtMs).toBe(windows[0]?.endedAtMs);
  });
});
