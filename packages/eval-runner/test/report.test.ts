import { buildReport } from "@jevcraft/eval-runner";
import { describe, expect, it } from "vitest";
import { decision, label } from "./helpers";

describe("buildReport", () => {
  const markdown = buildReport({
    title: "run-test",
    decisions: [
      decision("tp", "review", { likelyXray: 0.9, confidence: 0.95, latencyMs: 120 }),
      decision("fn", "no_action", { likelyXray: 0.3, confidence: 0.4, latencyMs: 80 }),
      decision("fp", "high_priority_review", { likelyXray: 0.7, confidence: 0.75, latencyMs: 200 }),
      decision("tn", "no_action", { likelyXray: 0.05, confidence: 0.6, latencyMs: 90 }),
      decision("unk", "insufficient_evidence", { likelyXray: 0.1 }),
      decision("err", "review", { error: "APIConnectionError: fetch failed" }),
    ],
    labels: [
      label("tp", "simulated_xray", "direct_xray"),
      label("fn", "known_cheat", "humanized_xray"),
      label("fp", "legit", "cave_mining"),
      label("tn", "legit", "branch_mining"),
      label("unk", "unknown"),
      label("err", "legit"),
    ],
    sweep: [0.5, 0.8],
  });

  it("starts with the title and summary counts", () => {
    expect(markdown).toMatch(/^# JevCraft evaluation report: run-test/);
    expect(markdown).toContain("| Decisions | 6 |");
    expect(markdown).toContain("| Usable for metrics | 4 |");
    expect(markdown).toContain("| Excluded: unknown label | 1 |");
    expect(markdown).toContain("| Excluded: evaluation error | 1 |");
  });

  it("includes the policy confusion matrix and headline metrics with FPR", () => {
    expect(markdown).toContain("## Policy outcome");
    expect(markdown).toContain("| TP | FP | TN | FN |");
    expect(markdown).toContain("| 1 | 1 | 1 | 1 |");
    expect(markdown).toMatch(/\| FPR \| 0\.500 \|/);
    expect(markdown).toMatch(/\| Precision \| 0\.500 \|/);
  });

  it("includes a threshold sweep table", () => {
    expect(markdown).toContain("## Threshold sweep on P(likely_xray)");
    expect(markdown).toMatch(/\| 0\.50 \| 1 \| 1 \| 1 \| 1 \|/);
    expect(markdown).toMatch(/\| 0\.80 \| 1 \| 0 \| 2 \| 1 \|/);
  });

  it("includes subtype, confidence band, latency, tokens and insufficient rate", () => {
    expect(markdown).toContain("## By scenario subtype");
    expect(markdown).toContain("| cave_mining | 1 |");
    expect(markdown).toContain("## Accuracy by confidence band");
    expect(markdown).toContain("| [0.9,1] | 1 | 1.000 |");
    expect(markdown).toContain("## Latency and cost");
    expect(markdown).toMatch(/\| p95 \| 200 ms \|/);
    expect(markdown).toMatch(/\| Input tokens \| 500 \|/);
    expect(markdown).toMatch(/\| insufficient_evidence rate \| 0\.200 \|/);
  });

  it("lists false positives and false negatives by session id", () => {
    expect(markdown).toContain("## False positives");
    expect(markdown).toMatch(/\| fp \| legit \| cave_mining \| high_priority_review \| 0\.700 \|/);
    expect(markdown).toContain("## False negatives");
    expect(markdown).toMatch(/\| fn \| known_cheat \| humanized_xray \| no_action \| 0\.300 \|/);
  });

  it("includes a sufficiency sweep and omits repeat variance when nothing was repeated", () => {
    expect(markdown).toContain("## Sufficiency threshold sweep");
    expect(markdown).toMatch(/\| 0\.65 \| 0 \/ 2 \| 0 \/ 2 \|/);
    expect(markdown).not.toContain("## Repeat variance");
  });

  it("includes repeat variance when a session was evaluated more than once", () => {
    const repeated = buildReport({
      title: "rep",
      decisions: [
        decision("a", "review", { likelyXray: 0.8 }),
        decision("a", "review", { likelyXray: 0.6 }),
      ],
      labels: [label("a", "simulated_xray")],
    });
    expect(repeated).toContain("## Repeat variance");
    expect(repeated).toMatch(/\| a \| 2 \| 0\.700 ± 0\.100 \[0\.600, 0\.800\] \|/);
  });

  it("prints n/a instead of NaN when there is nothing to measure", () => {
    const empty = buildReport({ title: "empty", decisions: [], labels: [] });
    expect(empty).toContain("| Precision | n/a |");
    expect(empty).not.toContain("NaN");
  });
});
