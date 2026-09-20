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
| `2026-09-19-bot-batch4-v4-live.md` | same 17 sessions | 17 | xray-v4 |
| `2026-09-19-bot-batch2-v4-live.md` | batch2's 10 sessions | 10 | xray-v4 |
| `2026-09-19-bot-batch5-live.md` | 32 bot runs × 480 s, 8 in parallel (29 labelled sessions) | 29 | xray-v4 |
| `2026-09-19-bots-all-live.md` | batch2 + batch4 + batch5 under v4 (56 sessions) | 56 | xray-v4 |
| `2026-09-19-bots-all-bl-xray-v4.md` | same 56, features carry `baselinePercentile` | 56 | xray-v4 |
| `2026-09-19-bots-all-bl-xray-v5.md` | same, v5 context | 56 | xray-v5 |
| `2026-09-19-bots-all-bl-xray-v6.md` | same, v6 extra question | 56 | xray-v6 |
| `2026-09-19-bots-all-bl-xray-v6-noflag.md` | same, v6 with `quality.enoughEvidence` redacted from the state | 56 | xray-v6-noflag |
| `2026-09-19-bot-batch6-live.md` | 24 legit-only runs (21 sessions), held out from every choice above | 21 | xray-v6 |
| `2026-09-19-bots-77-gated-live.md` | all 77 bot sessions, approach gate 0.15 / bypass 0.6 (`jevcraft repolicy`) | 77 | xray-v6 |
| `2026-09-20-seed2-live.md` | second world (`SEED=jevcraft-arena-2`, level `arena2`), 32 runs → 31 sessions, settings frozen from seed 1 | 31 | xray-v6 |
| `2026-09-20-human-legit-live.md` | human-played legit sessions (one player, 5 branch + 6 cave) | 11 | xray-v6 |
| `2026-09-20-all-119-gated.md` | every labelled session so far (2 seeds, bots + human), gate applied | 119 | xray-v6 |

## Question sets compared

| Set | evidence_sufficiency question | importantContext |
| --- | --- | --- |
| xray-v1 | "Is there enough high-quality behavioral evidence to classify this session?" | 4 lines (spec §10) |
| xray-v2 | Reworded: telemetry quantity/quality, "not whether cheating occurred" | v1 + 1 line saying a legit session with complete telemetry has sufficient evidence |
| xray-v3 | Same as v2 | Same as v1 |
| xray-v4 | v3 wording, but "enough approaches **or** plenty of mining with no targeted digging" | Same as v1 |
| xray-v5 | v4 | v1 + 3 lines explaining baselinePercentile and the approach metrics |
| xray-v6 | v4 + fifth question `approach_targeting` (noul, judged from `hiddenOreApproach` only) | Same as v1 |

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

**xray-v4 result (same 17 + 10 sessions).** X-Ray outcomes did not move (all evidenced X-Ray
sessions still `review`, P(likely_xray) 0.35–0.66). Every legit session that met `enoughEvidence`
went from `insufficient_evidence` to `no_action`: sufficiency 0.87–0.93 instead of 0.43–0.49,
P(likely_xray) 0.00–0.33. FPR stayed 0.000, recall unchanged (0.917 / 0.625). **v4 is now the
default question set.** The remaining `insufficient_evidence` rows are sessions that never met a
diamond (recording limitation) or a 22 s session fragment.

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

## All bot sessions under xray-v4 (56 sessions: 13 legit, 43 X-Ray)

| | value |
| --- | --- |
| Policy confusion (TP / FP / TN / FN) | 35 / 1 / 12 / 8 |
| Precision / Recall / FPR | 0.972 / 0.814 / 0.077 |
| direct / detour / humanized recall | 0.80 / 0.86 / 0.79 |
| X-Ray misses that never met a diamond (recording limitation) | 6 of 8 |

- The single false positive is a **lucky streak**: a legit strip-mining bot cut through a cluster
  of veins (17 reveals in 200 breaks, P(likely_xray) 0.31, `suspicious` 0.45) and the review rule
  (`P(likely_xray) + P(suspicious) >= 0.75`) fired. Exactly the failure the spec warns about (§22),
  now observed on real telemetry rather than on the synthetic generator.
- `P(likely_xray)` alone never crosses 0.75 for any bot session; at a 0.50 threshold it gives
  FPR 0 with recall 0.33. Everything the policy catches beyond that comes from `suspicious` mass.
  `high_priority_review` (0.90) is unreachable with the current features.
- The three X-Ray styles are not separated: P(likely_xray) medians are direct 0.53, detour 0.55,
  humanized 0.44. Directness (0.7–0.98 vs 0.4–0.7) and detour ratio do differ in the features, so
  the signal exists but Jev is not using it strongly; a question that asks specifically about
  "first approach to each vein" or richer per-approach features is the next lever.
- Throughput: 8 parallel bots record 32 × 480 s runs in ~35 min; 56 usable sessions cost ~60k
  input tokens to evaluate.

## Baseline percentile, v5 and v6 on the same 56 sessions

`jevcraft baseline` now builds `efficiency.baselinePercentile` from the legit sessions
(spec §9); here from the 10 evidenced legit bot sessions (values 0 … 8.5 reveals per 100 blocks;
note the reference includes the lucky-streak session itself, which then ranks 100th percentile).

| | v4, no baseline | v4 + baseline | v5 + baseline | v6 + baseline |
| --- | --- | --- | --- | --- |
| Policy TP / FP / TN / FN | 35 / 1 / 12 / 8 | same | same | same |
| TP at P(likely_xray) ≥ 0.50 (FP) | 14 (0) | 23 (1) | 14 (1) | — |
| P(likely_xray) median: legit / direct / detour / humanized | 0.11 / 0.46 / 0.51 / 0.41 | 0.13 / 0.49 / 0.57 / 0.50 | 0.03 / 0.36 / 0.47 / 0.42 | 0.17 / 0.60 / 0.58 / 0.47 |
| `approach_targeting` median: legit / direct / detour / humanized | — | — | — | 0.10 / 0.43 / 0.18 / 0.20 |

- **Baseline helps recall at a fixed likely_xray threshold** (14 → 23 X-Ray sessions above 0.50)
  without touching policy outcomes. The lucky streak now sits at percentile 100 and stays a
  false positive under every variant; efficiency-based evidence cannot tell luck from X-Ray.
- **v5's explanatory context was counter-productive**: Jev moved mass from `likely_xray` to
  `suspicious` for every style (direct median 0.49 → 0.36). Kept in the registry as a negative result.
- **v6's dedicated question is the first answer that separates direct X-Ray from detour**
  (0.43 vs 0.18) and from strip mining (0.10). Absolute values stay below 0.5, so Jev hedges, but
  the ordering is right and `behavior_class` sharpened too (direct 0.49 → 0.60). **v6 is now the
  default**; the policy does not use `approachTargeting` yet, so outcomes are unchanged until a
  rule is written for it.

## Two more experiments on the same 56 sessions

**Policy gate on `approach_targeting` (offline, no API).** Rule: an ordinary `review` also needs
`approachTargeting >= t`, unless `P(likely_xray) >= 0.6`.

| t | TP | FP | Recall | FPR |
| --- | --- | --- | --- | --- |
| off | 35 | 1 | 0.814 | 0.077 |
| 0.15 | 34 | 0 | 0.791 | 0.000 |
| 0.20 | 23 | 0 | 0.535 | 0.000 |

The lucky-streak session has `approachTargeting` 0.13; three detour X-Ray sessions sit at
0.12–0.14. A gate at 0.15 removes the false positive for one lost detour; on these 56 sessions the margin
was a single session wide, so it was first left off. It was then validated on batch6 (below).

**Ablation: do not send `quality.enoughEvidence`** (`xray-v6-noflag`). Sufficiency barely
changed (nothing dropped below 0.75 either way), so Jev does judge telemetry itself. What the flag
actually does is make `behavior_class` commit: without it P(likely_xray) medians fell from
0.17 / 0.60 / 0.58 / 0.47 to 0.04 / 0.33 / 0.29 / 0.20 (legit / direct / detour / humanized) and
the policy went to 29 TP / 0 FP (recall 0.674, FPR 0). The flag is therefore a sensitivity knob,
not a leak of the answer; it stays in the state as spec §9 intends. `approach_targeting` ordering
was unchanged by the ablation (0.10 / 0.40 / 0.16 / 0.17).

## Held-out legit batch (batch6) and the gate decision

24 legit-only runs (21 sessions) were recorded *after* every choice above, in a different part of
the arena (ore-rich cells, because the recorder's start-spot probing looks for diamonds for every
scenario). They are the closest thing to a held-out FPR test the bench has.

| | legit sessions flagged (`review`) | FPR |
| --- | --- | --- |
| default policy, xray-v6, with baselinePercentile | 9 / 21 | 0.429 |
| same, without baselinePercentile | 8 / 21 | 0.381 |
| approach gate t = 0.15, bypass P(likely_xray) ≥ 0.6 | 2 / 21 | 0.095 |
| approach gate t = 0.20 | 1 / 21 | 0.048 |

So the earlier FPR of 0.077 was small-sample luck: ordinary strip mining that runs through a
vein-rich area is flagged by `suspicious` mass four times out of ten, and `baselinePercentile`
is not the cause. The flagged legit sessions have `approach_targeting` 0.10–0.15 (one at 0.33),
which is exactly what the dedicated question was built to expose.

Across all 77 sessions (34 legit / 43 X-Ray):

| gate | TP | FP | Recall | FPR |
| --- | --- | --- | --- | --- |
| off | 35 | 10 | 0.814 | 0.294 |
| 0.15 / bypass 0.6 | 34 | 2 | 0.791 | 0.059 |
| 0.20 / bypass 0.6 | 23 | 1 | 0.535 | 0.029 |

**The gate (0.15, bypass 0.6) is now on by default.** It costs one X-Ray session out of 35 and
removes eight of ten false positives. It is still provisional: one seed, one world, bots only.
`jevcraft repolicy` recomputes outcomes from archived answers, so future threshold changes can be
compared on these 77 sessions without new API calls.

## Second seed (2026-09-20): does it transfer?

A new world (`JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2`) was recorded with everything
frozen from seed 1: question set xray-v6, approach gate 0.15 / bypass 0.6, and the *seed 1* legit
baseline for `baselinePercentile`. 32 runs (17 legit, 15 X-Ray) gave 31 sessions.

| | seed 1 (77 sessions) | seed 2 (31 sessions) |
| --- | --- | --- |
| Ungated FPR | 0.294 (10 / 34) | 0.294 (5 / 17) |
| Gated FPR | 0.059 (2 / 34) | 0.059 (1 / 17) |
| Gated recall | 0.791 | 0.786 |
| Gated precision | 0.944 | 0.917 |
| `approach_targeting` median: legit / direct / detour / humanized | 0.11 / 0.43 / 0.18 / 0.20 | 0.11 / 0.46 / 0.18 / 0.47 |
| P(likely_xray) median: legit / direct / detour / humanized | 0.29 / 0.60 / 0.58 / 0.47 | 0.30 / 0.78 / 0.59 / 0.46 |

The numbers carried over almost exactly, including the ungated false-positive rate, so the
"lucky strip mining gets flagged by `suspicious` mass, and the approach gate removes most of it"
story is not an artefact of one world. Of the three X-Ray misses on seed 2, two never gathered
enough evidence (recording limitation) and one humanized run was gated out (`approach_targeting`
0.14, P(likely_xray) 0.43). Direct X-Ray on this seed met richer ore (13.7 reveals per 100 blocks)
and scored P(likely_xray) 0.67–0.79, still short of the 0.90 needed for `high_priority_review`.

Total labelled real-telemetry sessions so far: 108 (51 legit, 57 X-Ray) across two seeds.

## Human-played legit sessions (2026-09-20)

One person played on the seed-2 world with no X-Ray tooling: five branch-mining sessions, then six
spent in a deep cave system and an abandoned mineshaft (teleported to a cave pocket found by a
spectator probe). Settings unchanged (xray-v6, gate 0.15 / bypass 0.6, seed-1 baseline).

| | sessions | flagged | FPR |
| --- | --- | --- | --- |
| Branch mining | 5 | 0 | 0.000 |
| Cave / mineshaft | 6 | 1 | 0.167 |
| All human | 11 | 1 | 0.091 |

**Human branch mining is cleaner than the bot's.** 1400 blocks, zero reveals, P(likely_xray) 0.00
and targeting 0.04–0.05, versus bot medians of 0.29 and 0.11. The bot tunnels mechanically at a
fixed level and stumbles into veins; the human wandered and changed level. The bot legit
population is therefore *harder* than the human one — the FPR measured on bots is not optimistic.

**Cave exploration is the risky class, and the gate is what saves it.** All six cave sessions
produced `suspicious` mass (0.37–0.53) because ore is everywhere and the route is erratic
(directness 0.36–0.54, detour 1.5–4.1). Ungated, two of them cross the review rule; with the gate
at 0.15 one survives (targeting 0.17); at 0.20 none do. Cave sessions also show why
`enoughEvidence` matters: two short ones were correctly held back as insufficient.

## Everything so far: 119 labelled real-telemetry sessions

Two seeds, bot and human, `xray-v6`, gate 0.15 / bypass 0.6 (`jevcraft repolicy` over archived
answers — no new API calls).

| | value |
| --- | --- |
| Sessions | 119 (62 legit, 57 X-Ray) |
| Policy TP / FP / TN / FN | 45 / 4 / 58 / 12 |
| Precision / Recall / FPR | 0.918 / 0.789 / 0.065 |
| FPR by legit style | branch mining 0.054 (3/56), cave mining 0.167 (1/6) |
| Recall by X-Ray style | direct 0.842, detour 0.789, humanized 0.737 |

Gate sweep over all 119:

| t | TP | FP | Recall | FPR |
| --- | --- | --- | --- | --- |
| off | 47 | 17 | 0.825 | 0.274 |
| 0.15 | 45 | 4 | 0.789 | 0.065 |
| 0.20 | 31 | 2 | 0.544 | 0.032 |
| 0.30 | 27 | 1 | 0.474 | 0.016 |

0.15 remains the best trade: it costs two X-Ray sessions and removes thirteen false positives.
Moving to 0.20 halves recall to buy two more, which is not worth it at this sample size.

## Caveats

- Synthetic data tests the wiring and the shape of the thresholds, not detection accuracy
  (spec §22). A scenario the generator finds hard (humanized) may be easy with real trajectories,
  and vice versa.
- One seed, 15 sessions per scenario. Differences of one or two sessions per subtype are noise.
- All numbers are for `jev-1.13.0`. Re-run when the model or a question set changes.
