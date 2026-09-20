# The JevCraft detection benchmark

## What it claims to measure

Whether asking Jev structured questions about a mining session catches X-Ray that the heuristics
in existing anti-cheat tooling miss, **at the same false-positive rate**, on the same real
telemetry.

False-positive rate is the ceiling, not an afterthought. A detector that flags twice as many
cheaters while also flagging twice as many ordinary players has not improved anything, so every
detector in the benchmark is given the threshold that maximises its recall while staying at or
below one shared FPR ceiling.

## What it is compared against

Existing servers fight X-Ray in two ways, and only one of them is a detector:

- **Obfuscation** (Paper's built-in anti-xray engine modes, Orebfuscator). The server lies to the
  client about which blocks are ore. This is prevention, not detection, and it is out of scope
  here: it changes what the cheater can see rather than judging what they did.
- **Behavioural heuristics**, which is what plugins and staff tooling actually use to decide who
  to investigate. These are what the benchmark stands up as baselines:

| Detector | Stands for |
| --- | --- |
| `ore-ratio` | Valuable ore per 100 blocks broken. The dominant heuristic. |
| `ore-percentile` | The same idea against a legitimate reference population instead of a fixed number. |
| `reveal-pace` | Reveals per 10 minutes: "too lucky, too fast" streak detectors. |
| `straight-line` | Mean directness of the approach to each hidden ore: the strongest purely geometric rule. |
| `classic-combo` | A hand-tuned rule using efficiency and directness together, as a rule engine would. |

The baselines are deliberately given every advantage. They read the same extracted features
JevCraft uses, including `baselinePercentile`, and each one is allowed to pick the threshold that
maximises its recall **on the test set itself**, which no real deployment could do.

## Running it

```bash
pnpm jevcraft benchmark \
  --features datasets/features/all.jsonl \
  --labels datasets/labels/all.jsonl \
  --decisions datasets/decisions/all-gated.jsonl \
  --max-fpr 0.065 --out reports/benchmark.md
```

It reads archived Jev answers, so it costs no API calls and can be re-run after any threshold or
policy change (`jevcraft repolicy` rewrites outcomes offline first).

## Result on 2026-09-20 (119 sessions, 2 seeds, bots + one human player)

57 X-Ray sessions, 62 legitimate, all from the Paper plugin's own telemetry. Ceiling: FPR ≤ 0.065.

| Detector | AUC | Recall | FPR | Precision |
| --- | --- | --- | --- | --- |
| ore-ratio | 0.866 | 0.649 | 0.065 | 0.902 |
| ore-percentile | 0.843 | 0.158 | 0.016 | 0.900 |
| reveal-pace | 0.850 | 0.596 | 0.065 | 0.895 |
| straight-line | 0.817 | 0.474 | 0.065 | 0.871 |
| classic-combo | 0.874 | 0.702 | 0.065 | 0.909 |
| **jevcraft-policy** | 0.862 | **0.789** | 0.065 | 0.918 |

Recall by X-Ray style at those operating points:

| Detector | direct | detour | humanized |
| --- | --- | --- | --- |
| ore-ratio | 0.842 | 0.474 | 0.632 |
| classic-combo | 0.947 | 0.474 | 0.684 |
| **jevcraft-policy** | 0.842 | **0.789** | **0.737** |

## What this does and does not establish

**It leads on the headline number.** The shipped policy has the highest recall of any detector at
the shared ceiling, and the gap is concentrated exactly where the design predicted: evasive
(`detour`) X-Ray, where the bot deliberately walks a crooked path to the ore it already knows
about. Efficiency-based detectors cannot see that, because a detour bot's ore ratio sits inside
the legitimate range — human cave mining reached 5.0 ore per 100 blocks while the humanized X-Ray
bot averaged 4.6.

**It is not yet statistically significant.** McNemar's exact test over the sessions where exactly
one detector is right gives 12 for JevCraft against 7 for the best classic baseline, p = 0.36.
Restricted to detour X-Ray the split is 10 against 4, p = 0.18. Both favour JevCraft; neither
clears the usual bar. At this effect size roughly twice the current data (about 240 sessions,
some four hours of parallel bot recording) would settle it either way.

**The dataset is narrow.** Two world seeds, four mining styles, one human player, and the X-Ray
side is entirely bots whose evasive behaviour is a guess at what a human cheater would do. The
legit side is the sturdier half: human branch mining scored P(likely_xray) 0.00 where the bot
scored 0.29, so the false-positive figures are, if anything, pessimistic.

**Every number is reproducible.** `reports/benchmark-119.md` is generated from archived answers
by one command, and `docs/baselines/` holds the per-batch reports it was built from.
