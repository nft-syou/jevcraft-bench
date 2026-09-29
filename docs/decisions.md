# Settled decisions

Directions that have already been decided. They are not open for quiet reinterpretation in the
next script; changing one means editing this file in a commit that says why.

This file exists because three times in one session work was built that contradicted a decision
made a few messages earlier: a threshold-based cascade after thresholds were ruled out, question
tuning on the summarised features after raw data was ruled in, and a dataset hunt that drifted
into validating a different claim than the one that sent it looking. Each was caught by the
person who made the decision, not by the person doing the work.

`scripts/check-decisions.mjs` enforces the parts that can be enforced. `pnpm check` and CI run it.

---

## D1. Evidence sent to the model is raw, not summarised

**Decided 2026-09-28.**

The feature extractor produces six numbers describing each approach. Those numbers were designed
so a threshold rule could read them. Handing the model the same six numbers guarantees it cannot
beat the rule: it is looking at the rule's own summary. Every comparison that did so ended in a
tie or a loss, which is the expected result of the setup rather than a finding about models.

So an experiment that asks the model to judge approach behaviour sends the trace: position and
view over the window before each reveal, and the blocks broken, as recorded.

**Forbidden:** sending `hiddenOreApproach` or another pre-computed summary as the evidence for a
judgement, without saying in the file why that particular experiment needs it.

**Allowed:** summarised features as a *comparison arm*, when the point is to measure what the
summary costs. That is what `scripts/raw-vs-summary.mjs` does, and it declares it.

**How it is checked:** a script that calls the Jev backend must carry an `// EVIDENCE:` marker.
`raw` needs no justification; `summary` or `both` must be followed by a reason.

---

## D2. No thresholds chosen by us

**Decided 2026-09-28.**

Every threshold is a number fitted to data, and every number fitted to data is a place
contamination enters. This project has already had three of them shape a published claim.

So a detector built from the model's answers uses the model's own output as the decision, and
comparisons are reported threshold-free: AUC, separation, and the gap between classes.

**Forbidden:** picking a numeric cut on a model answer and reporting the recall or false-positive
rate it produces as a result.

**Allowed:** thresholds inside the *baselines* being compared against. A hand-written rule cannot
work without one, and denying it a fitted threshold would be the mirror of the unfairness in
`scripts/ablation-llm.mjs`.

---

## D3. Exploration happens on open data

**Decided 2026-09-28.** See `datasets/ACCESS.md`, which is the enforced version.

Sessions are the scarce resource. A sealed set may be spent once, on a question written down
first. Nothing that is allowed to influence what gets built may read spent or sealed data.

---

## D4. The question that sent us looking is the question we answer

**Decided 2026-09-28.**

A tangent that produces something useful is still a tangent. The VPT ingestion is worth having and
did nothing for the experiment that sent us hunting for data, which needed positives that no public
dataset contains.

Not mechanically checkable. The habit that substitutes for a check: when a piece of work finishes,
state which question it answered, and whether that was the question asked.
