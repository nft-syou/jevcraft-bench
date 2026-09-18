import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  generateDataset,
  type ScenarioSpec,
  ScenarioSpecSchema,
} from "@jevcraft/scenario-generator";
import { MiningSessionFeaturesSchema, SessionLabelSchema } from "@jevcraft/schema";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const scenarioDir = join(root, "scenarios");

function listScenarioFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listScenarioFiles(full));
    else if (name.endsWith(".json")) out.push(full);
  }
  return out.sort();
}

const direct: ScenarioSpec = {
  name: "test-direct",
  label: "simulated_xray",
  subtype: "direct_xray",
  parameters: {
    durationSec: { mean: 600, sd: 60 },
    blocksBroken: { mean: 400, sd: 40 },
    hiddenOreReveals: { mean: 25, sd: 4 },
    directness: { mean: 0.9, sd: 0.04 },
    aimAlignment: { mean: 0.85, sd: 0.05 },
    caveExposure: { mean: 0.05, sd: 0.02 },
    branchMiningLikelihood: { mean: 0.1, sd: 0.05 },
    breakIntervalMs: { mean: 450, sd: 60 },
    trajectoryCoverage: { mean: 0.97, sd: 0.01 },
    humanNoise: 1,
    enoughEvidence: true,
  },
};

describe("generateDataset", () => {
  it("produces the requested number of schema-valid sessions with matching labels", () => {
    const { features, labels } = generateDataset(direct, { count: 20, seed: 7 });
    expect(features).toHaveLength(20);
    expect(labels).toHaveLength(20);
    for (const f of features) expect(MiningSessionFeaturesSchema.parse(f)).toEqual(f);
    for (const l of labels) expect(SessionLabelSchema.parse(l)).toEqual(l);
    expect(labels.map((l) => l.sessionId)).toEqual(features.map((f) => f.sessionId));
    expect(new Set(features.map((f) => f.sessionId)).size).toBe(20);
    expect(labels[0]).toMatchObject({ label: "simulated_xray", subtype: "direct_xray" });
  });

  it("is deterministic for the same seed and differs across seeds", () => {
    const a = generateDataset(direct, { count: 5, seed: 1 });
    const b = generateDataset(direct, { count: 5, seed: 1 });
    const c = generateDataset(direct, { count: 5, seed: 2 });
    expect(a).toEqual(b);
    expect(a.features[0]?.hiddenOreApproach).not.toEqual(c.features[0]?.hiddenOreApproach);
  });

  it("follows the scenario's distributions", () => {
    const { features } = generateDataset(direct, { count: 200, seed: 3 });
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const directness = mean(features.map((f) => f.hiddenOreApproach.meanDirectness ?? 0));
    expect(directness).toBeGreaterThan(0.85);
    expect(directness).toBeLessThan(0.95);
    for (const f of features) {
      expect(f.hiddenOreApproach.medianDetourRatio).toBeGreaterThanOrEqual(1);
      expect(f.quality.enoughEvidence).toBe(true);
    }
  });

  it("removes noise entirely when humanNoise is 0", () => {
    const quiet = { ...direct, parameters: { ...direct.parameters, humanNoise: 0 } };
    const { features } = generateDataset(quiet, { count: 3, seed: 9 });
    expect(features.map((f) => f.hiddenOreApproach.meanDirectness)).toEqual([0.9, 0.9, 0.9]);
  });

  it("uses null (not 0) for approach features when no ore was revealed", () => {
    const none = {
      ...direct,
      parameters: { ...direct.parameters, hiddenOreReveals: { mean: 0, sd: 0 } },
    };
    const { features } = generateDataset(none, { count: 1, seed: 1 });
    expect(features[0]?.hiddenOreApproach.meanDirectness).toBeNull();
    expect(features[0]?.efficiency.nonOreBlocksPerHiddenReveal).toBeNull();
    expect(features[0]?.quality.enoughEvidence).toBe(false);
  });
});

describe("scenarios/", () => {
  const files = listScenarioFiles(scenarioDir);

  it("ships at least four legit and three xray scenarios (spec §21)", () => {
    const specs = files.map((f) => ScenarioSpecSchema.parse(JSON.parse(readFileSync(f, "utf8"))));
    expect(specs.filter((s) => s.label === "legit").length).toBeGreaterThanOrEqual(4);
    expect(specs.filter((s) => s.label === "simulated_xray").length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)("%s is valid and generates valid sessions", (file) => {
    const spec = ScenarioSpecSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const { features } = generateDataset(spec, { count: 10, seed: 42 });
    for (const f of features) expect(MiningSessionFeaturesSchema.parse(f)).toEqual(f);
  });
});
