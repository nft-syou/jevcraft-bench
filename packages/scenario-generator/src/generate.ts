import {
  type MiningSessionFeatures,
  MiningSessionFeaturesSchema,
  type SessionLabel,
} from "@jevcraft/schema";
import { createRng, hashString, type Rng } from "./rng";
import type { ScenarioSpec } from "./scenario";

export interface GenerateOptions {
  count: number;
  seed: number;
  featureExtractorVersion?: string;
}

export interface GeneratedDataset {
  features: MiningSessionFeatures[];
  labels: SessionLabel[];
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, digits: number) => Number(v.toFixed(digits));

function sample(rng: Rng, dist: { mean: number; sd: number }, noise: number): number {
  return dist.mean + rng.gaussian() * dist.sd * noise;
}

/** Builds one schema-valid session from the scenario's distributions. */
export function generateSession(
  spec: ScenarioSpec,
  rng: Rng,
  sessionId: string,
  featureExtractorVersion: string,
): MiningSessionFeatures {
  const p = spec.parameters;
  const noise = p.humanNoise;

  const durationSec = Math.max(30, Math.round(sample(rng, p.durationSec, noise)));
  const blocksBroken = Math.max(1, Math.round(sample(rng, p.blocksBroken, noise)));
  const reveals = Math.max(0, Math.round(sample(rng, p.hiddenOreReveals, noise)));
  const directness = clamp(sample(rng, p.directness, noise), 0.05, 1);
  const aim = clamp(sample(rng, p.aimAlignment, noise), 0, 1);
  const cave = clamp(sample(rng, p.caveExposure, noise), 0, 1);
  const branch = clamp(sample(rng, p.branchMiningLikelihood, noise), 0, 1);
  const breakIntervalMs = Math.max(50, sample(rng, p.breakIntervalMs, noise));
  const coverage = clamp(sample(rng, p.trajectoryCoverage, noise), 0, 1);

  // Derived quantities. Cave-exposed ore is found more easily, so some reveals
  // happen without any approach; direct tunnelling produces fewer, sharper turns.
  const oreBlocks = Math.round(reveals * (1.15 + 0.2 * rng.next()));
  const movementDistance = blocksBroken * (0.6 + 0.3 * rng.next()) + durationSec * 0.15 * cave;
  const turnsToward = Math.round(reveals * aim * (0.8 + 0.4 * rng.next()));
  const directionChanges = Math.round(reveals * (0.9 + noise * rng.next()));
  const turnCount = Math.round(
    (durationSec / 20) * (0.3 + cave + (1 - branch) * 0.5) * (0.7 + 0.6 * rng.next()),
  );
  const uniqueDirections = Math.max(1, Math.round(2 + cave * 10 + (1 - branch) * 4 * rng.next()));
  const hasApproach = reveals > 0;
  const droppedEvents = coverage < 0.9 ? Math.round((1 - coverage) * blocksBroken) : 0;

  const features = {
    schemaVersion: 1 as const,
    featureExtractorVersion,
    sessionId,
    session: {
      durationSec,
      movementDistance: round(movementDistance, 1),
      blocksBroken,
      valuableOreReveals: reveals,
      valuableOreBlocksBroken: oreBlocks,
    },
    exploration: {
      branchMiningLikelihood: round(branch, 3),
      caveExposureRatio: round(cave, 3),
      uniqueTunnelDirections: uniqueDirections,
      turnCount,
    },
    hiddenOreApproach: {
      sampleCount: reveals,
      meanDirectness: hasApproach ? round(directness, 3) : null,
      medianDetourRatio: hasApproach ? round(Math.max(1, 1 / directness), 3) : null,
      aimAlignmentBeforeRevealRatio: hasApproach ? round(aim, 3) : null,
      turnsTowardHiddenOre: hasApproach ? turnsToward : null,
      directionChangesNearOre: hasApproach ? directionChanges : null,
    },
    timing: {
      meanBreakIntervalMs: round(breakIntervalMs, 0),
      breakIntervalStdDevMs: round(breakIntervalMs * (0.2 + 0.5 * noise * rng.next()), 0),
      medianSecondsBetweenReveals: hasApproach ? round(durationSec / reveals, 1) : null,
    },
    efficiency: {
      valuableOrePer100Blocks: round((reveals / blocksBroken) * 100, 2),
      nonOreBlocksPerHiddenReveal: hasApproach
        ? round((blocksBroken - oreBlocks) / reveals, 1)
        : null,
      baselinePercentile: null,
    },
    quality: {
      trajectoryCoverage: round(coverage, 3),
      droppedEventCount: droppedEvents,
      enoughEvidence: p.enoughEvidence && coverage >= 0.8 && reveals >= 3,
      knownConfounders: cave > 0.4 ? ["large_cave_system"] : [],
    },
  };
  return MiningSessionFeaturesSchema.parse(features);
}

/** Generates `count` sessions plus their ground-truth labels. Same spec + seed = same output. */
export function generateDataset(spec: ScenarioSpec, options: GenerateOptions): GeneratedDataset {
  const version = options.featureExtractorVersion ?? "0.1.0-synthetic";
  const rng = createRng((options.seed ^ hashString(spec.name)) >>> 0);
  const features: MiningSessionFeatures[] = [];
  const labels: SessionLabel[] = [];
  for (let i = 0; i < options.count; i++) {
    const sessionId = `session_gen_${spec.name}_${options.seed}_${String(i).padStart(3, "0")}`;
    features.push(generateSession(spec, rng, sessionId, version));
    labels.push({
      sessionId,
      label: spec.label,
      subtype: spec.subtype,
      reviewStatus: "single_review",
      notes: `synthetic: ${spec.name}`,
    });
  }
  return { features, labels };
}
