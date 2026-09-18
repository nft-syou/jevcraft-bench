# Baselines

Reports from real TypeSafe Jev runs, archived here because `reports/` is gitignored.
All inputs are hand-written fixtures or synthetic sessions from `scenarios/`; no player data.
Model for every run below: `jev-1.13.0` (what `jev-latest` resolved to on 2026-09-19).

| Report | Input | Calls | Question set |
| --- | --- | --- | --- |
| `2026-09-19-fixtures-live.md` | 5 fixtures × 1 | 5 | xray-v1 |
| `2026-09-19-fixtures-live-x10.md` | 5 fixtures × 10 | 50 | xray-v1 |
| `2026-09-19-fixtures-live-x10-v2.md` | 5 fixtures × 10 | 50 | xray-v2 |
| `2026-09-19-seed1-live.md` | 7 scenarios × 15, seed 1 | 105 | xray-v1 |
| `2026-09-19-seed1-live-v2.md` | same 105 sessions | 105 | xray-v2 |
| `2026-09-19-seed1-live-v3.md` | same 105 sessions | 105 | xray-v3 |

## Question sets compared

| Set | evidence_sufficiency question | importantContext |
| --- | --- | --- |
| xray-v1 | "Is there enough high-quality behavioral evidence to classify this session?" | 4 lines (spec §10) |
| xray-v2 | Reworded: telemetry quantity/quality, "not whether cheating occurred" | v1 + 1 line saying a legit session with complete telemetry has sufficient evidence |
| xray-v3 | Same as v2 | Same as v1 |

v3 isolates the question rewording from the added context line.

## Results on the seed-1 synthetic set (45 X-Ray, 60 legit, default policy)

| | v1 | v2 | v3 |
| --- | --- | --- | --- |
| Precision | 0.732 | 1.000 | 0.756 |
| Recall | 0.667 | 0.422 | 0.689 |
| FPR | 0.183 | 0.000 | 0.167 |
| insufficient_evidence rate | 0.295 | 0.038 | 0.038 |
| legit rows with sufficiency < 0.65 | 27 / 60 | 4 / 60 | 4 / 60 |
| direct_xray recall | 15/15 | 15/15 | 15/15 |
| detour_xray recall | 14/15 | 4/15 | 14/15 |
| humanized_xray recall | 1/15 | 0/15 | 2/15 |
| lucky_streak false positives | 10/15 | 0/15 | 8/15 |

The 4 legit rows below every sufficiency threshold are generator outputs with fewer than 3
reveals or low coverage; the extractor already marks them `enoughEvidence: false`.

## What the 2026-09-19 runs showed

**Jev is stable on repeated input.** Over 10 repeats per fixture, every answer dimension had a
population std of 0.003–0.028 (v1 and v2 alike). Threshold discussions are therefore meaningful;
a session that sits on a threshold flips outcome, but the model is not noisy.

**v1's `evidence_sufficiency` tracked suspicion, not telemetry quality.** Legit fixtures with
full coverage came back at 0.51–0.61 and fell under the 0.65 floor; direct X-Ray came back at
0.76. Rewording the question (v3) moves legit fixtures to 0.92–0.93 and direct X-Ray to 0.96
without changing any other answer in a measurable way. **v3 is now the default question set.**

**The extra context line in v2 is a separate, global knob.** Telling Jev that a legitimate
session with complete telemetry has sufficient evidence made `behavior_class` more conservative
across the board: FPR 0 and no lucky_streak false positives, but recall fell from 0.69 to 0.42
and detour X-Ray went from 14/15 to 4/15. That is a policy choice (review-queue size vs misses),
not a bug fix, so it is kept as `xray-v2` for comparison and not made the default.

**`P(likely_xray)` alone gives FPR 0.000 at every threshold ≥ 0.55** (v1 and v3), at the cost of
recall 0.09–0.36. All false positives come through the `review` rule
(`P(likely_xray) + P(suspicious) >= 0.75`), and most of them are `lucky_streak`: branch mining
that crosses a rich vein cluster. That is exactly the "skilled or lucky player" failure the spec
warns about (§22). Jev marks these `suspicious`, not `likely_xray`, which is arguably right for a
review queue; whether they belong in the queue is the operator's call.

**Humanized X-Ray is invisible to this feature set.** 13–15 of 15 missed under every set. With
directness ~0.62 and aim ~0.5 the synthetic sessions look like ordinary mixed mining; the
current features carry no signal for "low-value ore mixed in to look natural". Expect this until
Phase 3 real telemetry and richer per-approach features exist.

## Caveats

- Synthetic data tests the wiring and the shape of the thresholds, not detection accuracy
  (spec §22). A scenario the generator finds hard (humanized) may be easy with real trajectories,
  and vice versa.
- One seed, 15 sessions per scenario. Differences of one or two sessions per subtype are noise.
- All numbers are for `jev-1.13.0`. Re-run when the model or a question set changes.
