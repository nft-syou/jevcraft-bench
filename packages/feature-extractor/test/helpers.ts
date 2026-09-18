import type { RawTelemetryEvent } from "@jevcraft/schema";

/** Builds a plausible raw session from a compact description. Times are ms offsets from `t0`. */
export interface Step {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  pitch?: number;
}
export interface Break {
  t: number;
  x: number;
  y: number;
  z: number;
  material?: string;
  targetOre?: boolean;
  openNeighbours?: number;
  gameMode?: string;
}
export interface Reveal {
  t: number;
  at: { x: number; y: number; z: number };
  ore: { x: number; y: number; z: number };
}

export interface RawSessionSpec {
  sessionId?: string;
  t0?: number;
  path?: Step[];
  breaks?: Break[];
  reveals?: Reveal[];
  endT?: number;
  endReason?: string;
  droppedLines?: number;
  omitStart?: boolean;
  omitEnd?: boolean;
}

const PLAYER = `hmac-sha256:${"ab".repeat(32)}`;
let counter = 0;

export function rawSession(spec: RawSessionSpec): RawTelemetryEvent[] {
  const sessionId = spec.sessionId ?? "session_test";
  const t0 = spec.t0 ?? Date.parse("2026-09-19T00:00:00.000Z");
  const iso = (dt: number) => new Date(t0 + dt).toISOString();
  const envelope = (dt: number) => ({
    schemaVersion: 1 as const,
    eventId: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    occurredAt: iso(dt),
    serverRunId: "run_test",
    sessionId,
    playerId: PLAYER,
    world: "world",
  });
  const events: RawTelemetryEvent[] = [];
  const first = spec.path?.[0];
  if (!spec.omitStart) {
    events.push({
      ...envelope(0),
      eventType: "session_start",
      position: first ? { x: first.x, y: first.y, z: first.z } : null,
      session: { reason: "underground_mining" },
    });
  }
  for (const s of spec.path ?? []) {
    events.push({
      ...envelope(s.t),
      eventType: "movement_sample",
      position: { x: s.x, y: s.y, z: s.z },
      rotation: { yaw: s.yaw ?? 0, pitch: s.pitch ?? 0 },
      movement: { sampledAtMs: t0 + s.t, preSession: false },
    });
  }
  for (const b of spec.breaks ?? []) {
    events.push({
      ...envelope(b.t),
      eventType: "block_break",
      position: { x: b.x, y: b.y, z: b.z },
      block: {
        material: b.material ?? "DEEPSLATE",
        targetOre: b.targetOre ?? false,
        stoneLike: !b.targetOre,
      },
      context: {
        gameMode: b.gameMode ?? "SURVIVAL",
        tool: "DIAMOND_PICKAXE",
        lightLevel: 0,
        underground: true,
        openNeighbours: b.openNeighbours ?? 1,
      },
    });
  }
  for (const r of spec.reveals ?? []) {
    events.push({
      ...envelope(r.t),
      eventType: "hidden_ore_reveal",
      position: r.at,
      revealedOre: { material: "DEEPSLATE_DIAMOND_ORE", ...r.ore, previouslyVisible: false },
      context: {
        gameMode: "SURVIVAL",
        tool: "DIAMOND_PICKAXE",
        lightLevel: 0,
        underground: true,
        openNeighbours: 1,
      },
    });
  }
  const endT =
    spec.endT ??
    Math.max(0, ...(spec.path ?? []).map((s) => s.t), ...(spec.breaks ?? []).map((b) => b.t)) +
      1000;
  if (!spec.omitEnd) {
    const breaks = spec.breaks ?? [];
    events.push({
      ...envelope(endT),
      eventType: "session_end",
      position: null,
      session: {
        reason: (spec.endReason ?? "logout") as "logout",
        durationSec: endT / 1000,
        blocksBroken: breaks.length,
        undergroundStoneBroken: breaks.filter((b) => !b.targetOre).length,
        oreReveals: (spec.reveals ?? []).length,
        oreBlocksBroken: breaks.filter((b) => b.targetOre).length,
        droppedLines: spec.droppedLines ?? 0,
      },
    });
  }
  return events;
}

/** Straight tunnel along +x at y=10,z=0: one break per second, a movement sample before each. */
export function straightTunnel(
  length: number,
  opts: { yaw?: number; startX?: number } = {},
): {
  path: Step[];
  breaks: Break[];
} {
  const path: Step[] = [];
  const breaks: Break[] = [];
  const startX = opts.startX ?? 0;
  for (let i = 0; i < length; i++) {
    path.push({ t: i * 1000, x: startX + i - 0.5, y: 10, z: 0.5, yaw: opts.yaw ?? -90, pitch: 0 });
    breaks.push({ t: i * 1000 + 500, x: startX + i, y: 10, z: 0 });
  }
  return { path, breaks };
}
