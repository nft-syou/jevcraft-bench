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
| `2026-09-19-bot-batch1-live.md` | 12 Mineflayer bot runs × 240 s (real plugin telemetry) | 12 | xray-v3 |
| `2026-09-19-bot-batch2-live.md` | 10 Mineflayer bot runs × 480 s (real plugin telemetry) | 10 | xray-v3 |
| `2026-09-19-bot-batch4-live.md` | 16 bot runs × 480 s, 8 in parallel (17 sessions) | 17 | xray-v3 |

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

## Bot recordings (real plugin telemetry, 2026-09-19)

`jevcraft record` drove Mineflayer bots on the compose Paper server; the plugin, the extractor and
`label-runs` produced everything below. Two batches: 240 s runs (batch1) and 480 s runs (batch2).

| | batch1 (12) | batch2 (10) | batch4 (17) |
| --- | --- | --- | --- |
| Sessions that met `enoughEvidence` | 2 | 6 | 15 |
| X-Ray sessions sent to review | 2 / 9 | 5 / 8 | 11 / 12 |
| Legit sessions flagged | 0 / 3 | 0 / 2 | 0 / 5 |
| FPR / Precision / Recall (policy) | 0.000 / 1.000 / 0.22 | 0.000 / 1.000 / 0.625 | 0.000 / 1.000 / 0.917 |
| Wall-clock for the batch | ~50 min sequential | ~90 min sequential | ~18 min, 8 bots in parallel |

Batch4 is the first batch where the recorder itself was not the bottleneck (ore-aware start
spots, plain pickaxe, parallel workers, no reconnect throttle). Every X-Ray run that met a
diamond went to `review` with P(likely_xray) 0.34–0.67; none reached `high_priority_review`
(needs 0.90). Legit runs with ≥ 2 reveals got `no_action` (P 0.18–0.27, sufficiency 0.78–0.86);
legit runs with 0–1 reveals stayed `insufficient_evidence` because Jev's sufficiency was 0.43–0.49
even with the extractor's `enoughEvidence: true`. The v3 sufficiency wording literally asks for
"enough hidden-ore approaches", so a reveal-free legit session cannot satisfy it; an `xray-v4`
wording that also accepts "enough mining activity to show the absence of targeted digging" is
the next cheap experiment.

What the bot data taught us, in order of importance:

**`enoughEvidence` must not require reveals.** The first rule (≥3 analysable approaches) made every
legit session "insufficient" by construction, because legit miners rarely expose hidden diamonds.
It now accepts telemetry-clean sessions with either ≥3 separate approaches or ≥150 breaks, so a long
reveal-free session counts as evidence of *not* using hidden information. After the change both
legit bot sessions reached Jev (P(likely_xray) 0.00 and 0.33), but Jev's own `evidence_sufficiency`
for them stayed at 0.42 / 0.57, under the 0.65 floor: with no approaches to look at, the model is
hesitant to call the session anything.

**Short runs find no ore.** 3 of 8 X-Ray sessions in batch2 (and most in batch1) never met a
diamond within 28 blocks and just tunnelled; they are labelled `simulated_xray` but contain no
hidden-information use at all. Recorder now probes for ore before starting; runs still need
≥ 8 minutes. Such sessions are honest false negatives of the *recording*, not of the model.

**Approaches, not reveals, are the unit.** A diamond vein of 5–9 blocks produces 5–9
`hidden_ore_reveal` events within seconds; the extractor collapses them into one approach. Batch2
sessions had 11–24 reveals but only 2–5 approaches.

**Bot X-Ray is not very "direct" by the features.** Directness 0.63–0.93, aim alignment
0.18–0.43. Bots look at the next cell while walking, and a 1x2 tunnel to a diagonal target is a
staircase. Jev put every evidenced X-Ray session in `review` (P(likely_xray) 0.34–0.65) but none
in `high_priority_review`. Detour (0.65) scored *higher* than direct (0.34–0.42) in this batch;
with n=5 that is noise, but it says the current features do not separate the two.

**Jev's `evidence_sufficiency` follows the `quality.enoughEvidence` flag we send.** Sessions with
the flag true got 0.73–0.91, false got 0.13–0.32. Sending the flag is per spec §9, but it means the
sufficiency question largely echoes the extractor. Worth an ablation (drop the flag from the state).

Operational notes: Paper throttles reconnects from one IP (4 s), which killed three parallel bot
runs before the recorder learned to retry; targets in the bedrock layer (y < -59) made the
tunneller fail until they were excluded; `bot.dig` needs a timeout.

## Caveats

- Synthetic data tests the wiring and the shape of the thresholds, not detection accuracy
  (spec §22). A scenario the generator finds hard (humanized) may be easy with real trajectories,
  and vice versa.
- One seed, 15 sessions per scenario. Differences of one or two sessions per subtype are noise.
- All numbers are for `jev-1.13.0`. Re-run when the model or a question set changes.
