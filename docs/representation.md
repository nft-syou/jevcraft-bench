# Does the feature extractor throw away what matters?

Every comparison in this repository has fed Jev the same eight numbers a threshold rule reads.
That is a bottleneck we built, and it guarantees the model cannot win: it is looking at the rule's
own summary. This experiment removes it for one question and measures what happens.

## The setup

The target is detour X-Ray, chosen because the summary demonstrably fails there. A detour bot
wanders on its way to ore whose position it already knows. Mean directness is therefore low, which
is exactly what `hiddenOreApproach` reports, and the thing that would give it away — that every
wander terminates on ore — is what the summary destroys.

The shipped approach question scores detour 0.10 to 0.31 and legitimate mining 0.07 to 0.30. The
distributions overlap almost entirely.

Both conditions ask the same question about the same 42 sessions (18 detour, 24 legitimate), in
one pass against the same model, so drift cannot explain a gap:

- **summary**: state is `hiddenOreApproach`, the six numbers the extractor produces.
- **raw**: state is the trace itself. For each of up to three reveals, the player's position and
  view over the 60 seconds before the ore became visible, as offsets from that ore, plus the
  blocks they broke, at 24 points per approach. Nothing is pre-computed for the model.

Pre-registered in `scripts/raw-vs-summary.mjs`, committed before either condition ran. The metric
is AUC over detour against legitimate; the reading was fixed at +0.10.

## The result

| Condition | AUC | detour range | legitimate range |
| --- | --- | --- | --- |
| summary | 0.682 | 0.10 - 0.31 | 0.07 - 0.30 |
| raw trace | 0.771 | 0.40 - 0.69 | 0.32 - 0.66 |

**+0.089, against a pre-registered bar of +0.10. The experiment does not clear it.**

A paired bootstrap over 20,000 resamples puts the 95% interval at **[-0.113, +0.312]**. It
straddles zero. P(difference > 0) is 0.797, which is suggestive and nothing more.

## What went wrong with the experiment

It was underpowered before it ran, and the bar was set without checking that. At 18 against 24
sessions the standard error of the AUC difference is 0.108, so a +0.10 threshold was never
reliably detectable. Resolving a true difference of this size at 80% power needs roughly **490
sessions**, about 210 detour and 279 legitimate. That is a recording job of a few hours with the
existing bots, not a research obstacle, but it was not done first.

## What is worth noticing anyway

**Neither representation solves detour.** The best AUC is 0.771, and exactly one detour session
scores above every legitimate session in either condition. This is not a near-miss on a working
detector.

**The summary compresses both classes into "no evidence".** Every session, cheating or not, scores
under 0.31. The model is not discriminating; it is declining. The raw condition spreads the same
sessions across 0.32 to 0.69, so it at least engages with the question. Whether that is better
discrimination or just a different prior is what the underpowered test cannot say.

**The direction is the one predicted.** That is worth one more experiment, not a claim.

## What would settle it

Record to n ≈ 490 with the representation frozen exactly as it is, and re-run once. Freezing
matters: the trace format here is crude, capped at three approaches and 24 points, and it is
tempting to improve it against these 42 sessions. Doing that would contaminate the result the same
way the approach-alone threshold was contaminated in `evasion.md`. If the representation is to be
developed, it needs its own development split and a fresh test set.

## Reproducing

```bash
node --env-file-if-exists=.env --import tsx scripts/raw-vs-summary.mjs --raw <plugin data dir>
node --env-file-if-exists=.env --import tsx scripts/raw-vs-summary.mjs --raw <dir> --dry-run
```

Raw answers are written to `reports/raw-vs-summary.json`.
