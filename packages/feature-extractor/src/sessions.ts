import type { RawTelemetryEvent } from "@jevcraft/schema";

type EventOf<T extends RawTelemetryEvent["eventType"]> = Extract<
  RawTelemetryEvent,
  { eventType: T }
>;

export type MovementEvent = EventOf<"movement_sample">;
export type BreakEvent = EventOf<"block_break">;
export type RevealEvent = EventOf<"hidden_ore_reveal">;
export type SessionStartEvent = EventOf<"session_start">;
export type SessionEndEvent = EventOf<"session_end">;

/** Raw events of one session (or one time window of a session), time-ordered. */
export interface RawSession {
  sessionId: string;
  playerId: string;
  world: string;
  serverRunId: string;
  startedAtMs: number;
  endedAtMs: number;
  start: SessionStartEvent | null;
  end: SessionEndEvent | null;
  movements: MovementEvent[];
  breaks: BreakEvent[];
  reveals: RevealEvent[];
  /** e.g. "missing_session_start", "missing_session_end", "windowed" */
  notes: string[];
}

export const timeMs = (event: { occurredAt: string }): number => Date.parse(event.occurredAt);

/** Groups events by sessionId. Events without a session are ignored. */
export function groupSessions(events: RawTelemetryEvent[]): RawSession[] {
  const byId = new Map<string, RawTelemetryEvent[]>();
  for (const event of events) {
    if (event.sessionId === null) continue;
    const list = byId.get(event.sessionId);
    if (list) list.push(event);
    else byId.set(event.sessionId, [event]);
  }
  const sessions: RawSession[] = [];
  for (const [sessionId, list] of byId) {
    list.sort((a, b) => timeMs(a) - timeMs(b));
    const first = list[0];
    if (first === undefined) continue;
    const session: RawSession = {
      sessionId,
      playerId: first.playerId,
      world: first.world,
      serverRunId: first.serverRunId,
      startedAtMs: timeMs(first),
      endedAtMs: timeMs(list[list.length - 1] ?? first),
      start: null,
      end: null,
      movements: [],
      breaks: [],
      reveals: [],
      notes: [],
    };
    for (const event of list) {
      switch (event.eventType) {
        case "session_start":
          session.start = event;
          session.startedAtMs = timeMs(event);
          break;
        case "session_end":
          session.end = event;
          session.endedAtMs = timeMs(event);
          break;
        case "movement_sample":
          session.movements.push(event);
          break;
        case "block_break":
          session.breaks.push(event);
          break;
        case "hidden_ore_reveal":
          session.reveals.push(event);
          break;
      }
    }
    if (session.start === null) session.notes.push("missing_session_start");
    if (session.end === null) session.notes.push("missing_session_end");
    sessions.push(session);
  }
  sessions.sort((a, b) => a.startedAtMs - b.startedAtMs || a.sessionId.localeCompare(b.sessionId));
  return sessions;
}

/**
 * Splits a long session into contiguous windows of at most `windowMs` (spec §9: one request per
 * 5–15 minute window). Window ids are `<sessionId>:w<n>`; the relation is the shared prefix.
 */
export function splitIntoWindows(session: RawSession, windowMs: number): RawSession[] {
  const duration = session.endedAtMs - session.startedAtMs;
  if (duration <= windowMs) return [session];
  const count = Math.ceil(duration / windowMs);
  const windows: RawSession[] = [];
  for (let i = 0; i < count; i++) {
    const from = session.startedAtMs + i * windowMs;
    const to = i === count - 1 ? session.endedAtMs : from + windowMs;
    const inWindow = <T extends { occurredAt: string }>(events: T[]): T[] =>
      events.filter((e) => {
        const t = timeMs(e);
        return t >= from && (i === count - 1 ? t <= to : t < to);
      });
    windows.push({
      ...session,
      sessionId: `${session.sessionId}:w${i + 1}`,
      startedAtMs: from,
      endedAtMs: to,
      start: i === 0 ? session.start : null,
      end: i === count - 1 ? session.end : null,
      movements: inWindow(session.movements),
      breaks: inWindow(session.breaks),
      reveals: inWindow(session.reveals),
      notes: [...session.notes, "windowed"],
    });
  }
  return windows;
}
