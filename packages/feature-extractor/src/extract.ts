import {
  type MiningSessionFeatures,
  MiningSessionFeaturesSchema,
  type RawTelemetryEvent,
} from "@jevcraft/schema";
import {
  angleBetweenDeg,
  distance,
  headingDeg,
  headingDeltaDeg,
  mean,
  median,
  round3,
  stdDev,
  sub,
  type Vec3,
  viewVector,
} from "./geometry";
import {
  groupSessions,
  type MovementEvent,
  type RawSession,
  splitIntoWindows,
  timeMs,
} from "./sessions";

export const FEATURE_EXTRACTOR_VERSION = "0.1.0";

export interface ExtractOptions {
  /** How far back before a reveal the approach is analysed (ms). Default 60 s. */
  approachWindowMs: number;
  /** View direction within this many degrees of the ore counts as "aimed at it". Default 30. */
  aimToleranceDeg: number;
  /** Heading change that counts as a turn. Default 30. */
  turnThresholdDeg: number;
  /** A turn must cut the angular error to the ore by at least this much to count as "toward". Default 20. */
  towardImprovementDeg: number;
  /** Direction changes within this many blocks of the ore are "near". Default 16. */
  nearOreDistance: number;
  /** Break intervals longer than this are pauses, not digging rhythm (ms). Default 30 s. */
  maxBreakIntervalMs: number;
  /** Gaps between movement samples longer than this count against coverage (ms). Default 5 s. */
  coverageGapMs: number;
  /** Sessions longer than this are split (ms). Default 15 min. */
  windowMs: number;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions = {
  approachWindowMs: 60_000,
  aimToleranceDeg: 30,
  turnThresholdDeg: 30,
  towardImprovementDeg: 20,
  nearOreDistance: 16,
  maxBreakIntervalMs: 30_000,
  coverageGapMs: 5_000,
  windowMs: 15 * 60_000,
};

const EYE_HEIGHT = 1.62;
const pos = (m: MovementEvent): Vec3 => m.position;

interface Approach {
  directness: number;
  detourRatio: number;
  aimedSamples: number;
  totalSamples: number;
  turnsToward: number;
  directionChangesNear: number;
}

function analyseApproach(
  samples: MovementEvent[],
  ore: Vec3,
  opts: ExtractOptions,
): Approach | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  if (first === undefined) return null;
  let path = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a && b) path += distance(pos(a), pos(b));
  }
  const straight = distance(pos(first), ore);
  if (path < 1 || straight < 0.5) return null;

  let aimed = 0;
  for (const s of samples) {
    const eye = { x: s.position.x, y: s.position.y + EYE_HEIGHT, z: s.position.z };
    const angle = angleBetweenDeg(viewVector(s.rotation.yaw, s.rotation.pitch), sub(ore, eye));
    if (angle !== null && angle <= opts.aimToleranceDeg) aimed++;
  }

  let turnsToward = 0;
  let directionChangesNear = 0;
  let previousHeading: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    const heading = headingDeg(pos(a), pos(b));
    if (heading === null) continue;
    if (previousHeading !== null) {
      const change = headingDeltaDeg(previousHeading, heading);
      if (change >= opts.turnThresholdDeg) {
        const toOre = headingDeg(pos(a), ore, 0);
        if (toOre !== null) {
          const errorBefore = headingDeltaDeg(previousHeading, toOre);
          const errorAfter = headingDeltaDeg(heading, toOre);
          if (errorBefore - errorAfter >= opts.towardImprovementDeg) turnsToward++;
        }
        if (distance(pos(a), ore) <= opts.nearOreDistance) directionChangesNear++;
      }
    }
    previousHeading = heading;
  }

  return {
    directness: Math.min(1, straight / path),
    detourRatio: Math.max(1, path / straight),
    aimedSamples: aimed,
    totalSamples: samples.length,
    turnsToward,
    directionChangesNear,
  };
}

function trajectoryCoverage(session: RawSession, opts: ExtractOptions): number {
  const duration = session.endedAtMs - session.startedAtMs;
  if (duration <= 0 || session.movements.length === 0) return 0;
  const times = session.movements.map(timeMs);
  let uncovered = 0;
  let previous = session.startedAtMs;
  for (const t of [...times, session.endedAtMs]) {
    const gap = t - previous;
    if (gap > opts.coverageGapMs) uncovered += gap - opts.coverageGapMs;
    previous = t;
  }
  return Math.min(1, Math.max(0, 1 - uncovered / duration));
}

function breakSteps(session: RawSession): Vec3[] {
  const steps: Vec3[] = [];
  for (let i = 1; i < session.breaks.length; i++) {
    const a = session.breaks[i - 1]?.position;
    const b = session.breaks[i]?.position;
    if (!a || !b) continue;
    steps.push({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y), z: Math.sign(b.z - a.z) });
  }
  return steps;
}

const isAxisStep = (s: Vec3) => Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z) === 1;
const sameStep = (a: Vec3, b: Vec3) => a.x === b.x && a.y === b.y && a.z === b.z;

/** Computes one feature document for one (possibly windowed) session. */
export function extractFeatures(
  session: RawSession,
  options: Partial<ExtractOptions> = {},
): MiningSessionFeatures {
  const opts = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  const durationSec = Math.max(0, (session.endedAtMs - session.startedAtMs) / 1000);
  const blocksBroken = session.breaks.length;
  const reveals = session.reveals.length;
  const oreBlocksBroken = session.breaks.filter((b) => b.block.targetOre).length;

  // movement
  let movementDistance: number | null = null;
  if (session.movements.length >= 2) {
    movementDistance = 0;
    for (let i = 1; i < session.movements.length; i++) {
      const a = session.movements[i - 1];
      const b = session.movements[i];
      if (a && b && a.world === b.world) movementDistance += distance(pos(a), pos(b));
    }
  }
  let turnCount: number | null = null;
  if (session.movements.length >= 3) {
    turnCount = 0;
    let previousHeading: number | null = null;
    for (let i = 1; i < session.movements.length; i++) {
      const a = session.movements[i - 1];
      const b = session.movements[i];
      if (!a || !b) continue;
      const heading = headingDeg(pos(a), pos(b), 0.5);
      if (heading === null) continue;
      if (previousHeading !== null && headingDeltaDeg(previousHeading, heading) >= 45) turnCount++;
      previousHeading = heading;
    }
  }

  // exploration from break geometry
  const steps = breakSteps(session);
  let branchMiningLikelihood: number | null = null;
  let uniqueTunnelDirections: number | null = null;
  if (session.breaks.length >= 3) {
    let straightPairs = 0;
    const runDirections = new Set<string>();
    let run = 1;
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1];
      const b = steps[i];
      if (!a || !b) continue;
      if (isAxisStep(a) && isAxisStep(b) && sameStep(a, b)) {
        straightPairs++;
        run++;
        if (run >= 3) runDirections.add(`${b.x},${b.y},${b.z}`);
      } else {
        run = 1;
      }
    }
    branchMiningLikelihood = steps.length > 1 ? straightPairs / (steps.length - 1) : 0;
    uniqueTunnelDirections = runDirections.size;
  }
  const caveExposureRatio =
    blocksBroken === 0
      ? null
      : session.breaks.filter((b) => b.context.openNeighbours >= 2).length / blocksBroken;

  // approaches to hidden ore
  const approaches: Approach[] = [];
  let previousRevealMs = Number.NEGATIVE_INFINITY;
  for (const reveal of session.reveals) {
    const t = timeMs(reveal);
    const from = Math.max(previousRevealMs, t - opts.approachWindowMs);
    const samples = session.movements.filter((m) => {
      const mt = timeMs(m);
      return mt > from && mt <= t;
    });
    const ore = {
      x: reveal.revealedOre.x + 0.5,
      y: reveal.revealedOre.y + 0.5,
      z: reveal.revealedOre.z + 0.5,
    };
    const approach = analyseApproach(samples, ore, opts);
    if (approach) approaches.push(approach);
    previousRevealMs = t;
  }
  const aimedTotal = approaches.reduce((s, a) => s + a.aimedSamples, 0);
  const samplesTotal = approaches.reduce((s, a) => s + a.totalSamples, 0);

  // timing
  const breakIntervals: number[] = [];
  for (let i = 1; i < session.breaks.length; i++) {
    const a = session.breaks[i - 1];
    const b = session.breaks[i];
    if (!a || !b) continue;
    const gap = timeMs(b) - timeMs(a);
    if (gap >= 0 && gap <= opts.maxBreakIntervalMs) breakIntervals.push(gap);
  }
  const revealGaps: number[] = [];
  for (let i = 1; i < session.reveals.length; i++) {
    const a = session.reveals[i - 1];
    const b = session.reveals[i];
    if (a && b) revealGaps.push((timeMs(b) - timeMs(a)) / 1000);
  }

  // quality
  const coverage = trajectoryCoverage(session, opts);
  const dropped = session.end?.session.droppedLines ?? 0;
  const confounders = [...session.notes];
  if (caveExposureRatio !== null && caveExposureRatio >= 0.4) confounders.push("large_cave_system");
  if (session.breaks.some((b) => b.context.gameMode !== "SURVIVAL"))
    confounders.push("non_survival_game_mode");
  if (durationSec < 60) confounders.push("short_session");
  const enoughEvidence =
    reveals >= 3 &&
    approaches.length >= 3 &&
    coverage >= 0.8 &&
    durationSec >= 60 &&
    blocksBroken >= 20 &&
    dropped === 0;

  return MiningSessionFeaturesSchema.parse({
    schemaVersion: 1,
    featureExtractorVersion: FEATURE_EXTRACTOR_VERSION,
    sessionId: session.sessionId,
    session: {
      durationSec: round3(durationSec),
      movementDistance: round3(movementDistance),
      blocksBroken,
      valuableOreReveals: reveals,
      valuableOreBlocksBroken: oreBlocksBroken,
    },
    exploration: {
      branchMiningLikelihood: round3(branchMiningLikelihood),
      caveExposureRatio: round3(caveExposureRatio),
      uniqueTunnelDirections,
      turnCount,
    },
    hiddenOreApproach: {
      sampleCount: approaches.length,
      meanDirectness: round3(mean(approaches.map((a) => a.directness))),
      medianDetourRatio: round3(median(approaches.map((a) => a.detourRatio))),
      aimAlignmentBeforeRevealRatio: samplesTotal === 0 ? null : round3(aimedTotal / samplesTotal),
      turnsTowardHiddenOre:
        approaches.length === 0 ? null : approaches.reduce((s, a) => s + a.turnsToward, 0),
      directionChangesNearOre:
        approaches.length === 0 ? null : approaches.reduce((s, a) => s + a.directionChangesNear, 0),
    },
    timing: {
      meanBreakIntervalMs: round3(mean(breakIntervals)),
      breakIntervalStdDevMs: round3(stdDev(breakIntervals)),
      medianSecondsBetweenReveals: round3(median(revealGaps)),
    },
    efficiency: {
      valuableOrePer100Blocks: blocksBroken === 0 ? null : round3((reveals / blocksBroken) * 100),
      nonOreBlocksPerHiddenReveal:
        reveals === 0 ? null : round3((blocksBroken - oreBlocksBroken) / reveals),
      baselinePercentile: null,
    },
    quality: {
      trajectoryCoverage: round3(coverage),
      droppedEventCount: dropped,
      enoughEvidence,
      knownConfounders: confounders,
    },
  });
}

/** Groups, windows and extracts every session found in the raw events. */
export function extractAll(
  events: RawTelemetryEvent[],
  options: Partial<ExtractOptions> = {},
): MiningSessionFeatures[] {
  const opts = { ...DEFAULT_EXTRACT_OPTIONS, ...options };
  return groupSessions(events)
    .flatMap((session) => splitIntoWindows(session, opts.windowMs))
    .map((window) => extractFeatures(window, opts));
}
