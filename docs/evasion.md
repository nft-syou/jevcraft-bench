# The evasion experiment

## Why it was run

The first benchmark found no advantage over classic heuristics. The reason was not the benchmark
but the adversary: every X-Ray bot in the dataset mined greedily. Across 47 X-Ray sessions the
median was 6.0 valuable ore per 100 blocks broken against 0.46 for legitimate play, and 45 of 47
sat above the legitimate 90th percentile. In that regime counting ore solves the problem, and
nothing more sophisticated can show a benefit.

Behavioural detection exists for the cheater who keeps their numbers ordinary. That adversary had
never been built, so the comparison was never testing the thing the project is for.

## The adversary

`xray-throttled` (`packages/bot-recorder/src/scenarios.ts`) reads ore positions from chunk data
exactly like the other X-Ray bots, but before each target it digs ordinary tunnel until its own
ore-per-100-blocks figure falls back under 1.5, inside the legitimate range. 16 runs of 15 minutes
produced 15 labelled sessions with ratios of 0.00 to 2.17, every one at or below the legitimate
90th percentile of 2.31. By construction no efficiency threshold can separate them from ordinary
mining without flagging ordinary miners too.

The prediction was written down before the sessions were evaluated: ratio detectors would miss
them, and the approach geometry would still give them away.

## Result

Evaluation set: 57 held-out sessions (29 X-Ray including the 15 throttled, 28 legitimate), all
recorded after every threshold was fixed. Thresholds come from the 77 development sessions.
Ceiling: FPR ≤ 0.072.

| Detector | Recall | FPR | AUC |
| --- | --- | --- | --- |
| jevcraft-policy | 0.724 [0.54–0.85] | 0.071 | 0.826 |
| jev-approach-targeting | 0.690 [0.51–0.83] | 0.036 | 0.897 |
| straight-line (approach directness) | 0.655 [0.47–0.80] | 0.000 | 0.922 |
| classic-combo | 0.586 | 0.107 (over ceiling) | 0.866 |
| reveal-ratio | 0.345 [0.20–0.53] | 0.036 | 0.783 |
| ore-ratio | 0.345 | 0.107 (over ceiling) | 0.805 |
| reveal-pace | 0.310 [0.17–0.49] | 0.071 | 0.802 |

On the 15 throttled sessions alone, at each detector's development threshold:

| Detector | Caught |
| --- | --- |
| straight-line (directness ≥ 0.74) | **12 / 15** |
| jevcraft-policy | **10 / 15** |
| ore-ratio (≥ 4.13 per 100 blocks) | **0 / 15** |

## What this establishes, and what it does not

**Ore counting fails completely against a cheater who throttles.** Not "degrades": zero of
fifteen, at a threshold that catches 100% of the greedy bots. Recall for the whole held-out set
falls from 0.714 to 0.345 once evasive sessions are present. This is the clearest result the
project has produced, and it is the case for behavioural detection.

**The approach path survives evasion.** Diluting the ore ratio costs the cheater nothing in
geometry: they still walk to ore they could not legitimately see. Both the Jev approach question
(0.690 recall at FPR 0.036, precision 0.952) and a plain directness rule (0.655 at FPR 0.000)
hold up where efficiency collapses.

**The language model is not what wins.** A hand-written rule on mean approach directness caught
12 of the 15 throttled sessions against the policy's 10, and the two are statistically
indistinguishable overall (4 vs 4 discordant, p = 1.0). What made the difference is the
*telemetry*: sampled movement, first-exposure detection for hidden ore, and the per-approach
features derived from them. No existing plugin measures those, and they are what defeats evasion.
Jev reads them correctly and produces a calibrated answer without anyone choosing a formula, but
on this dataset it does not beat the formula.

**Caveats.** The throttled bot dilutes by tunnelling, which is one evasion strategy of several; a
cheater who also wanders, or who only exploits a fraction of the veins they see, has not been
tried. All X-Ray sessions remain scenario-labelled bots, and the legitimate side is 51 bot
sessions plus 11 from one human. Fifteen throttled sessions give wide intervals.

## Reproducing

```bash
JEVCRAFT_HMAC_SECRET=... pnpm jevcraft record --scenario xray-throttled \
  --count 16 --budget-seconds 900 --parallel 8 --out datasets/recordings/throttled.jsonl
# extract, label, evaluate as in README, then:
node scripts/make-splits.mjs --dev-ids datasets/labels/bots-77.jsonl \
  --features datasets/features/all2.jsonl --labels datasets/labels/all2.jsonl \
  --decisions datasets/decisions/all2-gated.jsonl --out-dir datasets/splits2
pnpm jevcraft benchmark --features datasets/splits2/holdout-features.jsonl \
  --labels datasets/splits2/holdout-labels.jsonl --decisions datasets/splits2/holdout-decisions.jsonl \
  --dev-features datasets/splits2/dev-features.jsonl --dev-labels datasets/splits2/dev-labels.jsonl \
  --dev-decisions datasets/splits2/dev-decisions.jsonl --max-fpr 0.072 --out reports/benchmark-evasive.md
```

Archived output: `docs/baselines/2026-09-21-benchmark-evasive.md`.
