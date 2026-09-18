import { joinDecisionsWithLabels } from "@jevcraft/eval-runner";
import { describe, expect, it } from "vitest";
import { decision, label } from "./helpers";

describe("joinDecisionsWithLabels", () => {
  it("pairs decisions with labels by session id", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review"), decision("b", "no_action")],
      [label("a", "simulated_xray"), label("b", "legit")],
    );
    expect(result.rows.map((r) => r.sessionId)).toEqual(["a", "b"]);
    expect(result.unknownCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.unlabeledSessionIds).toEqual([]);
  });

  it("excludes unknown labels and counts them", () => {
    const result = joinDecisionsWithLabels([decision("a", "review")], [label("a", "unknown")]);
    expect(result.rows).toEqual([]);
    expect(result.unknownCount).toBe(1);
  });

  it("excludes error records and counts them", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review", { error: "boom" })],
      [label("a", "legit")],
    );
    expect(result.rows).toEqual([]);
    expect(result.errorCount).toBe(1);
  });

  it("reports decisions without labels and duplicate labels", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review"), decision("b", "review")],
      [label("a", "legit"), label("a", "simulated_xray")],
    );
    expect(result.unlabeledSessionIds).toEqual(["b"]);
    expect(result.duplicateLabelSessionIds).toEqual(["a"]);
    expect(result.rows).toEqual([]);
  });
});
