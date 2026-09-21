# The evasion experiment

> **Status: both results now confirmed, on one adversary.** Session-wide ore counting fails
> against a ratio-throttled cheater, and the policy rule that catches that cheater was originally
> added after the sessions it was measured on had been scored. A confirmation set of 22 sessions
> recorded after the rule was frozen reproduces the effect: 9 of 10 caught, against 3 of 10 for
> the policy without the rule and 0 of 10 for ore counting. See the confirmation section.

## Why it was run

The first benchmark found no advantage over classic heuristics, and the reason was the adversary,
not the benchmark. Among the 119 earlier sessions with `enoughEvidence = true` (47 X-Ray, 51
legitimate) the median was 6.01 valuable ore per 100 blocks broken for X-Ray against 0.46 for
legitimate play, and 45 of the 47 sat above the legitimate nearest-rank 90th percentile of 2.31.
When the cheats are that greedy, counting ore solves the problem and nothing subtler can show a
benefit.

Behavioural detection exists for the cheater whose numbers look ordinary. That adversary had never
been built.

## The adversary

`xray-throttled` (`packages/bot-recorder/src/scenarios.ts`) reads ore positions from chunk data
exactly like the other X-Ray bots, but before each target it digs ordinary tunnel until its own
ore-per-100-blocks figure falls back under 1.5. 16 runs of 15 minutes produced 15 labelled
sessions with ratios of 0.00 to 2.17, every one at or below the legitimate 90th percentile.

It dilutes by tunnelling and nothing else. The route to each target stays straight: it picks ore
at least six blocks away, walks a line-hugging path, and looks at the ore on the way. So this is
one specific evasion, **ratio dilution with a straight approach**. Wandering on the way, taking
only part of each vein, and spacing targets randomly are untested, and the `detour` bot already
shows they matter (below).

A qualitative prediction was committed before these sessions were recorded (`03afe63`): diluting
the ratio would not remove the information in the approach. That much was pre-registered. The
policy rule that exploits it was not.

## Where the three populations sit

![Distribution of valuable ore mined per 100 blocks broken, by session type](images/ore-ratio-distribution.svg)

43 of the 57 greedy sessions sit at or above the 4.13 threshold, against 5 of 74 legitimate ones
and **0 of 25** throttled ones. The throttled population is not merely harder to separate: it
occupies the same bins as ordinary mining, over a narrower range than legitimate play does.

## What was fixed when

| Event | Time (JST) |
| --- | --- |
| Throttled sessions recorded | 2026-09-20 23:58 - 2026-09-21 00:29 |
| Those sessions scored by Jev | 00:30:58 - 00:31:02 |
| `reviewApproachTargetingAlone` = 0.35 committed (`a54e559`) | **00:33:17** |
| Decisions regenerated under the new rule | 00:34:25 |

Every *scored* detector in the tables below takes its threshold from the 77 development sessions.
The policy's new promotion path does not. It was added after seeing that the throttled sessions
scored 0.36 to 0.63 on the approach question, and its value sits just above the highest approach
score of any development legitimate session (0.33). Regenerating the decisions with that one path
switched off gives the honest before-and-after:

| Policy | Throttled caught | Held-out legitimate flagged |
| --- | --- | --- |
| As frozen on development data | **4 / 15** | 2 / 28 |
| With the new rule | **10 / 15** | 2 / 28 |

Two things temper this. The rule costs nothing in false positives on either split, so it is not a
threshold bought with error budget. And it is not tuned to flatter itself: lowering it to 0.21,
which is what the development legitimate maximum becomes if the single 0.33 session is dropped,
catches **12 of 15** at exactly the same 2/28 and 2/34 false positives. The 0.35 anchor is
conservative. None of that changes the fact that the decision to add the path at all was taken
with the evaluation results in view.

## Result on the 57 held-out sessions (29 X-Ray including 15 throttled, 28 legitimate)

Ceiling: FPR <= 0.072.

| Detector | Recall | FPR | AUC |
| --- | --- | --- | --- |
| jevcraft-policy | 0.724 [0.54-0.85] | 0.071 | 0.826 |
| jev-approach-targeting | 0.690 [0.51-0.83] | 0.036 | 0.897 |
| straight-line (approach directness) | 0.655 [0.47-0.80] | 0.000 | 0.922 |
| classic-combo | 0.586 | 0.107 (over ceiling) | 0.866 |
| reveal-ratio | 0.345 [0.20-0.53] | 0.036 | 0.783 |
| ore-ratio | 0.345 | 0.107 (over ceiling) | 0.805 |
| reveal-pace | 0.310 [0.17-0.49] | 0.071 | 0.802 |

On the 15 throttled sessions alone, at each detector's development threshold:

| Detector | Caught |
| --- | --- |
| straight-line (directness >= 0.74) | 12 / 15 [55-93%] |
| jev-approach-targeting | 12 / 15, *the same twelve sessions* |
| jevcraft-policy, with the post-hoc rule | 10 / 15 [42-85%] |
| jevcraft-policy, as frozen on development data | 4 / 15 |
| max reveals in any 300 s window (>= 14) | 3 / 15 [7-45%], at 1/28 false positives |
| ore-ratio (>= 4.13 per 100 blocks) | **0 / 15** |

## Was the ratio detector simply given a bad threshold?

No. `scripts/ratio-best-case.mjs` hands it the threshold that suits it best **on the evaluation
set itself**, which no deployment could do, and the trade is still hopeless:

| Ore-ratio threshold | Throttled caught | Legitimate flagged | FPR |
| --- | --- | --- | --- |
| 0.50 | 11 / 15 | 10 / 28 | 0.357 |
| 1.00 | 8 / 15 | 6 / 28 | 0.214 |
| 1.50 | 6 / 15 | 5 / 28 | 0.179 |
| 2.00 | 1 / 15 | 4 / 28 | 0.143 |
| 3.00 and above | 0 / 15 | 3 / 28 | 0.107 |

No cut-off catches throttled sessions while staying under the ceiling. The closest it comes is
flagging four in ten legitimate players to catch eleven of fifteen cheats. The ceiling is what
defeats it, not the particular number 4.13.

## The complementarity the subtype table shows

Now that throttled sessions carry their own `throttled_xray` subtype, the held-out report splits
recall by evasion style. Two styles defeat opposite detectors:

![Recall by X-Ray evasion style](images/detector-complementarity.svg)

| Detector | detour_xray (5) | direct_xray (4) | humanized_xray (5) | throttled_xray (15) |
| --- | --- | --- | --- | --- |
| ore-ratio | 0.800 | 1.000 | 0.400 | **0.000** |
| reveal-ratio | 0.600 | 1.000 | 0.600 | **0.000** |
| reveal-pace | 0.400 | 1.000 | 0.600 | **0.000** |
| straight-line | **0.000** | 1.000 | 0.600 | 0.800 |
| jev-approach-targeting | 0.200 | 1.000 | 0.600 | 0.800 |
| classic-combo (over ceiling) | 0.800 | 1.000 | 0.800 | 0.333 |
| jevcraft-policy | 0.800 | 1.000 | 0.600 | 0.667 |

The detour bot is greedy, so counting catches it and the straight-line rule does not see it at
all. The throttled bot is the mirror image. Head to head against the straight-line rule the policy
wins 4 to 0 on detour positives (p = 0.125) and loses 0 to 2 on throttled positives (p = 0.50),
which is why the overall test is a 4-4 tie.

The policy is the only detector in the table that stays above 0.65 on both evasion styles while
respecting the ceiling. That is a claim about coverage across adversaries rather than raw recall,
and it is the strongest thing this dataset supports. It is also only half earned: the detour half
comes from rules frozen on development data, the throttled half from the post-hoc rule above.

## What this establishes, and what it does not

**Session-wide ore counting fails against ratio dilution.** Zero of fifteen at any usable
threshold, using a rule fixed long before these sessions existed. This is the clean result and the
case for collecting behavioural telemetry at all. For calibration, that same threshold catches 10
of the 14 earlier held-out X-Ray sessions (71% [45-88%]), not 100%: greedy bots are easy but not
trivially so.

**"Counting cannot work" would be too strong.** A different aggregation of the same counts does
better than zero: the largest number of hidden-ore reveals in any 300-second window, thresholded
on the development split, catches 3 of 15 at 1 false positive in 28. Far behind the approach
features, but not nothing, and it is a counting rule no existing plugin would have trouble adding.

**Approach features survive this evasion and are defeated by another.** Diluting the ratio leaves
the straight walk to the ore intact, so approach detection holds up here. But the `detour` bot,
which wanders on its way to ore it already knows about, defeats the directness rule completely:
**0 of 5** held-out detour sessions, against 4 of 5 for the policy. So the approach *shape* is
evadable. Ratio dilution and path obfuscation are different evasions defeating different
detectors, and no single detector here handles both.

**On this adversary the language model added nothing measurable.** The Jev approach question and
the hand-written directness rule flagged the *identical twelve* sessions. For ratio-diluted X-Ray
with straight approaches the signal is in the telemetry and a simple rule extracts it. Across the
whole held-out set the policy catches two more positives than the directness rule and pays two
more false positives; the paired test is 4 vs 4, p = 1.0. That is a dead heat, which is neither
proof of equivalence nor evidence that the model contributes nothing. No ablation isolating the
model's contribution has been run.

**Caveats.** The directness rule cannot score 15 of the 57 held-out sessions (2 X-Ray, 13
legitimate, all without an ore reveal); its 0/28 false positives include those 13 silences, and
0 of 28 still carries a 95% upper bound of 12.1%. All X-Ray labels are scenario assignments, not
observed cheating. Five sessions per evasion style, and fifteen for throttled, give intervals
roughly 40 points wide, so none of the per-subtype differences is individually significant.

## The confirmation set

10 fresh `xray-throttled` runs and 10 fresh `legit-branch-mining` runs, recorded 2026-09-21
01:05-02:07 JST, more than half an hour after the 0.35 rule was committed and with no code or
threshold touched in between. They produced 22 labelled sessions (10 X-Ray, 12 legitimate; two
legitimate bots reconnected and so contributed two sessions each).

The throttled bots again landed inside the legitimate range: 0.58 to 1.82 ore per 100 blocks,
every one below the legitimate 90th percentile of 2.31.

| Detector | Caught | False positives |
| --- | --- | --- |
| ore-ratio >= 4.13 (its development threshold) | 0 / 10 [0-28%] | 0 / 12 |
| ore-ratio >= 2.31 (the legitimate 90th percentile) | 0 / 10 [0-28%] | 1 / 12 |
| straight-line >= 0.74 | 9 / 10 [60-98%] | 0 / 12 |
| jev-approach-targeting >= 0.20 | 10 / 10 [72-100%] | 0 / 12 |
| jevcraft-policy, as frozen on development data | 3 / 10 [11-60%] | 1 / 12 |
| **jevcraft-policy, with the 0.35 rule** | **9 / 10 [60-98%]** | 1 / 12 |

![Share of ratio-throttled X-Ray sessions caught, by detector and cohort](images/throttled-detection.svg)

The approach question separates the two populations completely on this set, with a clear gap:
throttled sessions score 0.28 to 0.63, legitimate ones 0.04 to 0.15. The 0.35 threshold sits
inside that gap, which is why it transfers. It is also visibly conservative: the single session
the policy misses scores 0.28, and the 0.20 threshold that `jev-approach-targeting` picked on
development data would have caught all ten at no cost here.

The one legitimate session the policy flags was already flagged before the rule was added, so the
rule bought its 6 extra detections without spending any error budget on this set either.

**What this is and is not.** It is a genuine out-of-sample test of the rule: nothing about it was
chosen after these sessions existed. It is not a new environment. Same world, same server, same
two scenario generators, different bot seeds, all bots. It confirms the rule was not fitted to
noise in the first 15 sessions. It says nothing about human players, other worlds, or evasion
strategies the `xray-throttled` bot does not implement.

**It still does not show a language-model advantage.** The hand-written directness rule caught 9
of 10 at zero false positives; the policy caught 9 of 10 at one. The Jev approach question caught
all ten, one more than the directness rule, on ten sessions. That is one session of difference and
proves nothing.

## What would settle what remains

The open questions are now about generalisation, not about the rule: a different world seed, human
legitimate players against the throttled adversary, and an evasion combining ratio dilution with
the wandering approach the `detour` bot already uses, which no detector here handles.

## Reproducing

```bash
JEVCRAFT_HMAC_SECRET=... pnpm jevcraft record --scenario xray-throttled \
  --count 16 --budget-seconds 900 --parallel 8 --out datasets/recordings/throttled.jsonl
# extract, label and evaluate as in the README, then:
node scripts/make-splits.mjs --dev-ids datasets/labels/bots-77.jsonl \
  --features datasets/features/all2.jsonl --labels datasets/labels/all2.jsonl \
  --decisions datasets/decisions/all2-gated.jsonl --out-dir datasets/splits2
pnpm jevcraft benchmark --features datasets/splits2/holdout-features.jsonl \
  --labels datasets/splits2/holdout-labels.jsonl --decisions datasets/splits2/holdout-decisions.jsonl \
  --dev-features datasets/splits2/dev-features.jsonl --dev-labels datasets/splits2/dev-labels.jsonl \
  --dev-decisions datasets/splits2/dev-decisions.jsonl --max-fpr 0.072 --out reports/benchmark-evasive.md
node scripts/ratio-best-case.mjs --features datasets/splits2/holdout-features.jsonl \
  --labels datasets/splits2/holdout-labels.jsonl --evasive-labels datasets/labels/throttled.jsonl
node scripts/window-count.mjs --raw <plugin data dir> --splits datasets/splits2 \
  --evasive-labels datasets/labels/throttled.jsonl --window-sec 300
# the policy as it stood before the post-hoc rule:
pnpm jevcraft repolicy --decisions datasets/decisions/all2-live.jsonl \
  --features datasets/features/all2.jsonl --approach-alone off --out prerule.jsonl
# the confirmation set:
pnpm jevcraft record --scenario xray-throttled --count 10 --budget-seconds 900 --parallel 8 --start-index 500 --seed 21 --out datasets/recordings/confirm.jsonl
pnpm jevcraft record --scenario legit-branch-mining --count 10 --budget-seconds 900 --parallel 8 --start-index 520 --seed 21 --out datasets/recordings/confirm.jsonl
pnpm jevcraft label-runs --raw <run file> --manifest datasets/recordings/confirm.jsonl --out datasets/labels/confirm.jsonl
pnpm jevcraft extract <run file> --baseline datasets/baselines/legit-bots-2026-09-19.json --out all.jsonl   # then keep the rows the labels cover
pnpm jevcraft evaluate datasets/features/confirm.jsonl --questions xray-v6 --labels datasets/labels/confirm.jsonl --out datasets/decisions/confirm-live.jsonl
pnpm jevcraft repolicy --decisions datasets/decisions/confirm-live.jsonl --features datasets/features/confirm.jsonl --out datasets/decisions/confirm-gated.jsonl
# the figures on this page:
pnpm figures:refresh   # recompute docs/figure-data.json from the datasets, then redraw the SVGs
```

Archived output: `docs/baselines/2026-09-21-benchmark-evasive.md`.
