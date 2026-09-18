import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractAll, extractFeatures, groupSessions } from "@jevcraft/feature-extractor";
import { MiningSessionFeaturesSchema, RawTelemetryEventSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";
import { rawSession, type Step, straightTunnel } from "./helpers";

const one = (events: ReturnType<typeof rawSession>) => {
  const [session] = groupSessions(events);
  if (!session) throw new Error("no session in events");
  return extractFeatures(session);
};

describe("extractFeatures", () => {
  it("produces a schema-valid document with nulls (not zeros) when nothing was observed", () => {
    const f = one(rawSession({ path: [{ t: 0, x: 0, y: 10, z: 0 }], endT: 5000 }));
    expect(MiningSessionFeaturesSchema.parse(f)).toEqual(f);
    expect(f.session.blocksBroken).toBe(0);
    expect(f.session.movementDistance).toBeNull();
    expect(f.exploration.branchMiningLikelihood).toBeNull();
    expect(f.exploration.caveExposureRatio).toBeNull();
    expect(f.hiddenOreApproach.sampleCount).toBe(0);
    expect(f.hiddenOreApproach.meanDirectness).toBeNull();
    expect(f.timing.meanBreakIntervalMs).toBeNull();
    expect(f.efficiency.valuableOrePer100Blocks).toBeNull();
    expect(f.efficiency.nonOreBlocksPerHiddenReveal).toBeNull();
    expect(f.quality.enoughEvidence).toBe(false);
    expect(f.quality.knownConfounders).toContain("short_session");
  });

  it("scores a straight tunnel to a buried ore as direct, aimed and branch-like", () => {
    const tunnel = straightTunnel(30); // 30 s, +x, looking +x
    const f = one(
      rawSession({
        ...tunnel,
        reveals: [{ t: 29_600, at: { x: 29, y: 10, z: 0 }, ore: { x: 30, y: 10, z: 0 } }],
      }),
    );
    expect(f.hiddenOreApproach.sampleCount).toBe(1);
    expect(f.hiddenOreApproach.meanDirectness).toBeGreaterThan(0.95);
    expect(f.hiddenOreApproach.medianDetourRatio).toBeLessThan(1.05);
    expect(f.hiddenOreApproach.aimAlignmentBeforeRevealRatio).toBeGreaterThan(0.9);
    expect(f.hiddenOreApproach.turnsTowardHiddenOre).toBe(0);
    expect(f.hiddenOreApproach.directionChangesNearOre).toBe(0);
    expect(f.exploration.branchMiningLikelihood).toBe(1);
    expect(f.exploration.uniqueTunnelDirections).toBe(1);
    expect(f.exploration.turnCount).toBe(0);
    expect(f.exploration.caveExposureRatio).toBe(0);
    expect(f.timing.meanBreakIntervalMs).toBe(1000);
    expect(f.timing.breakIntervalStdDevMs).toBe(0);
    expect(f.session.movementDistance).toBeCloseTo(29, 3);
    expect(f.efficiency.valuableOrePer100Blocks).toBeCloseTo(3.333, 3);
    expect(f.efficiency.nonOreBlocksPerHiddenReveal).toBe(30);
    expect(f.quality.trajectoryCoverage).toBe(1);
  });

  it("scores a zig-zag approach as indirect with turns toward the ore", () => {
    // Player walks +z 10 blocks, then turns +x toward an ore at (10, 10, 10). Looks along +z the whole time.
    const path: Step[] = [];
    for (let i = 0; i <= 10; i++) path.push({ t: i * 1000, x: 0.5, y: 10, z: i + 0.5, yaw: 0 });
    for (let i = 1; i <= 9; i++)
      path.push({ t: 10_000 + i * 1000, x: i + 0.5, y: 10, z: 10.5, yaw: 0 });
    const f = one(
      rawSession({
        path,
        breaks: path
          .map((p) => ({ t: p.t + 500, x: Math.floor(p.x), y: 10, z: Math.floor(p.z) }))
          .slice(0, 20),
        reveals: [{ t: 19_600, at: { x: 9, y: 10, z: 10 }, ore: { x: 10, y: 10, z: 10 } }],
      }),
    );
    expect(f.hiddenOreApproach.sampleCount).toBe(1);
    expect(f.hiddenOreApproach.meanDirectness).toBeCloseTo(Math.hypot(10, 0.5, 10) / 19, 2);
    expect(f.hiddenOreApproach.medianDetourRatio).toBeGreaterThan(1.3);
    expect(f.hiddenOreApproach.turnsTowardHiddenOre).toBe(1);
    expect(f.hiddenOreApproach.directionChangesNearOre).toBe(1);
    expect(f.hiddenOreApproach.aimAlignmentBeforeRevealRatio).toBeLessThan(0.6);
    expect(f.exploration.turnCount).toBe(1);
    expect(f.exploration.uniqueTunnelDirections).toBe(2);
  });

  it("uses pre-existing open faces for cave exposure and flags large caves", () => {
    const tunnel = straightTunnel(10);
    const breaks = tunnel.breaks.map((b, i) => ({
      ...b,
      preexistingOpenFaces: i % 2 === 0 ? 2 : 0,
    }));
    const f = one(rawSession({ path: tunnel.path, breaks }));
    expect(f.exploration.caveExposureRatio).toBe(0.5);
    expect(f.quality.knownConfounders).toContain("large_cave_system");
  });

  it("excludes long pauses from break rhythm and measures coverage gaps", () => {
    const tunnel = straightTunnel(5);
    const breaks = [...tunnel.breaks, { t: 100_500, x: 5, y: 10, z: 0 }]; // 95 s pause
    const path = [...tunnel.path, { t: 100_000, x: 4.5, y: 10, z: 0.5 }];
    const f = one(rawSession({ path, breaks }));
    expect(f.timing.meanBreakIntervalMs).toBe(1000);
    // 96 s gap in samples, 5 s allowed, over a ~101.5 s session
    expect(f.quality.trajectoryCoverage).toBeCloseTo(1 - 91_000 / 101_500, 2);
    expect(f.quality.enoughEvidence).toBe(false);
  });

  it("carries dropped lines, missing boundaries and non-survival breaks into quality", () => {
    const tunnel = straightTunnel(3);
    const firstBreak = tunnel.breaks[0];
    if (!firstBreak) throw new Error("tunnel has no breaks");
    const f = one(
      rawSession({ ...tunnel, droppedLines: 7, breaks: [{ ...firstBreak, gameMode: "CREATIVE" }] }),
    );
    expect(f.quality.droppedEventCount).toBe(7);
    expect(f.quality.knownConfounders).toContain("non_survival_game_mode");
    const g = one(rawSession({ ...tunnel, omitEnd: true }));
    expect(g.quality.droppedEventCount).toBe(0);
    expect(g.quality.knownConfounders).toContain("missing_session_end");
  });

  it("marks a long session with many breaks and no reveals as enough evidence of legit mining", () => {
    const f = one(rawSession(straightTunnel(160)));
    expect(f.hiddenOreApproach.sampleCount).toBe(0);
    expect(f.quality.enoughEvidence).toBe(true);
    const g = one(rawSession(straightTunnel(90)));
    expect(g.quality.enoughEvidence).toBe(false);
  });

  it("marks enough evidence with several analysable approaches", () => {
    const tunnel = straightTunnel(90);
    const reveals = [20, 45, 70].map((x) => ({
      t: x * 1000 + 600,
      at: { x, y: 10, z: 0 },
      ore: { x, y: 10, z: 1 },
    }));
    const f = one(rawSession({ ...tunnel, reveals }));
    expect(f.hiddenOreApproach.sampleCount).toBe(3);
    expect(f.timing.medianSecondsBetweenReveals).toBe(25);
    expect(f.quality.enoughEvidence).toBe(true);
  });
});

describe("1x2 tunnels", () => {
  it("collapses feet/head breaks of one column so a straight 1x2 tunnel is still straight", () => {
    const breaks = [];
    for (let x = 0; x < 12; x++) {
      breaks.push({ t: x * 1000, x, y: 10, z: 0 }, { t: x * 1000 + 400, x, y: 11, z: 0 });
    }
    const f = one(rawSession({ path: straightTunnel(12).path, breaks }));
    expect(f.exploration.branchMiningLikelihood).toBe(1);
    expect(f.exploration.uniqueTunnelDirections).toBe(1);
  });
});

describe("extractAll", () => {
  it("windows long sessions and extracts each window", () => {
    const events = rawSession({ sessionId: "s", ...straightTunnel(200) });
    const features = extractAll(events, { windowMs: 60_000 });
    expect(features.map((f) => f.sessionId)).toEqual(["s:w1", "s:w2", "s:w3", "s:w4"]);
    expect(features.every((f) => f.quality.knownConfounders.includes("windowed"))).toBe(true);
  });

  it("extracts the Paper plugin's sample into a valid feature document", () => {
    const file = join(import.meta.dirname, "../../../datasets/fixtures/raw/sample.jsonl");
    const events = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => RawTelemetryEventSchema.parse(JSON.parse(l)));
    const [f] = extractAll(events);
    expect(f).toBeDefined();
    expect(MiningSessionFeaturesSchema.parse(f)).toEqual(f);
    expect(f?.session.valuableOreReveals).toBe(1);
    expect(f?.session.blocksBroken).toBe(5);
    // one of the five breaks borders natural cave air the player did not dig
    expect(f?.exploration.caveExposureRatio).toBe(0.2);
    expect(f?.quality.enoughEvidence).toBe(false);
  });
});
