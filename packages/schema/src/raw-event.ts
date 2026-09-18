import { z } from "zod";

/**
 * One line of the Paper plugin's JSONL output (spec §8). Mirrors
 * `plugin/src/main/java/dev/jevcraft/plugin/telemetry/TelemetryService.java`.
 * Keep the two in sync; `datasets/fixtures/raw/sample.jsonl` is produced by the plugin's
 * integration test and validated against this schema.
 */
const Position = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });

/** `hmac-sha256:<64 hex>`; a raw UUID or name here is a bug. */
export const PseudonymousPlayerIdSchema = z.string().regex(/^hmac-sha256:[0-9a-f]{64}$/);

const envelope = {
  schemaVersion: z.literal(1),
  eventId: z.uuid(),
  occurredAt: z.iso.datetime(),
  serverRunId: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  playerId: PseudonymousPlayerIdSchema,
  world: z.string().min(1),
};

const BreakContext = z.strictObject({
  gameMode: z.string(),
  tool: z.string(),
  lightLevel: z.number().int().min(0).max(15),
  underground: z.boolean(),
  /** faces already open before the break that this player did not dig themselves recently, 0..6 */
  preexistingOpenFaces: z.number().int().min(0).max(6),
});

export const MovementSampleEventSchema = z.strictObject({
  ...envelope,
  eventType: z.literal("movement_sample"),
  position: Position,
  rotation: z.strictObject({ yaw: z.number(), pitch: z.number() }),
  movement: z.strictObject({ sampledAtMs: z.number().int(), preSession: z.boolean() }),
});

export const BlockBreakEventSchema = z.strictObject({
  ...envelope,
  eventType: z.literal("block_break"),
  position: Position,
  block: z.strictObject({ material: z.string(), targetOre: z.boolean(), stoneLike: z.boolean() }),
  context: BreakContext,
});

export const HiddenOreRevealEventSchema = z.strictObject({
  ...envelope,
  eventType: z.literal("hidden_ore_reveal"),
  position: Position,
  revealedOre: z.strictObject({
    material: z.string(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    previouslyVisible: z.literal(false),
  }),
  context: BreakContext,
});

export const SessionStartEventSchema = z.strictObject({
  ...envelope,
  eventType: z.literal("session_start"),
  sessionId: z.string().min(1),
  position: Position.nullable(),
  session: z.strictObject({ reason: z.enum(["underground_mining", "valuable_ore"]) }),
  playerName: z.string().optional(),
});

export const SessionEndEventSchema = z.strictObject({
  ...envelope,
  eventType: z.literal("session_end"),
  sessionId: z.string().min(1),
  position: Position.nullable(),
  session: z.strictObject({
    reason: z.enum([
      "idle_timeout",
      "logout",
      "world_change",
      "teleport",
      "game_mode_change",
      "admin_flush",
      "server_shutdown",
    ]),
    durationSec: z.number().min(0),
    blocksBroken: z.number().int().min(0),
    undergroundStoneBroken: z.number().int().min(0),
    oreReveals: z.number().int().min(0),
    oreBlocksBroken: z.number().int().min(0),
    /** telemetry lines dropped by the bounded writer during this session */
    droppedLines: z.number().int().min(0),
  }),
});

export const RawTelemetryEventSchema = z.discriminatedUnion("eventType", [
  MovementSampleEventSchema,
  BlockBreakEventSchema,
  HiddenOreRevealEventSchema,
  SessionStartEventSchema,
  SessionEndEventSchema,
]);
export type RawTelemetryEvent = z.infer<typeof RawTelemetryEventSchema>;
