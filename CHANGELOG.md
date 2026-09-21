# Changelog

Notable changes to the bench and, more importantly, to the claims it makes. Findings are listed
with what was measured and what was later withdrawn, because a research bench that quietly edits
its own conclusions is not worth reading.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
released versions yet; everything below is unreleased work on `main`.

## Unreleased

### Added

- `xray-throttled` adversary: an X-Ray bot that digs plain tunnel between targets to hold its ore
  ratio inside the legitimate range. Built because every earlier X-Ray bot was greedy enough for
  ore counting to catch, which made the benchmark unable to show anything.
- `throttled_xray` behaviour subtype, so ratio-diluted sessions stop being pooled with the
  humanized ones in per-style tables.
- `jevcraft benchmark`: classic heuristics, a fitted logistic baseline and the shipped policy on
  the same sessions at a shared false-positive ceiling, with development/held-out splits.
- `scripts/window-count.mjs`: a windowed reveal-count detector, kept as the counter-example to
  "counting cannot work".
- `scripts/ratio-best-case.mjs`: gives the ore-ratio baseline its best possible threshold, chosen
  on the evaluation set, to show the ceiling rather than the threshold is what defeats it.
- Measured operating cost: 1,402 billable input tokens per judged window.

### Changed

- Default question set is `xray-v6`, which adds `approach_targeting` judged from the approach
  features alone.
- The policy can promote a session to review on strong approach evidence by itself
  (`reviewApproachTargetingAlone`).

### Fixed

- `enoughEvidence` no longer requires an ore reveal, which had been suppressing legitimate
  sessions from evaluation entirely.

### Withdrawn

- **The first advantage claim** ("policy recall 0.789 vs classic 0.702 at FPR 0.065 over 119
  sessions"). The evaluation set contained the policy's own development data. Review found the
  leak; the corrected held-out result is a dead heat with a plain reveal-count rule.
- **"Ore counting catches 100% of greedy bots."** It catches 10 of 14 held-out greedy sessions.
- **"The approach path survives evasion."** It survives ratio dilution. The `detour` bot, which
  wanders on the way to ore it already knows about, defeats the directness rule 0 of 5.
- **"The language model is not what wins"** as a settled conclusion. The Jev approach question and
  the hand-written directness rule flag the same sessions; no ablation has isolated the model's
  contribution either way.

### Disclosed

- `reviewApproachTargetingAlone = 0.35` was committed after the sessions it was first measured on
  had been scored, so its 10/15 was a hypothesis, not a measurement. A 22-session confirmation set
  recorded after the rule was frozen gives 9/10 against 3/10 for the policy without it. Both
  numbers, and the timeline, are in `docs/evasion.md`.
