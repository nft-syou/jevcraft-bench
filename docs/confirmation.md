# Confirmation on sealed sessions

The questions found by the grid search (`docs/tuning-ledger.jsonl`, 698 readings on the open
development split) were frozen in `scripts/confirm-frozen.mjs` at commit `cec0050`, and measured
once on sessions recorded afterwards. This is that measurement.

## Data

| | Sessions |
|---|---|
| runs requested | 120 |
| labelled sessions | 118 |
| with at least one ore reveal, scored | 103 |
| without a reveal, not scored | 15 (11 legitimate, 2 detour, 2 throttled) |

Scored sessions: 32 legitimate, 17 direct, 18 detour, 20 humanized, 16 throttled. All bots, world
`arena2`, seed 91, a region no earlier session had mined. Recorded 2026-09-30.

## Result

Each configuration was asked once per session. Intervals are 95%, from 2,000 stratified bootstrap
resamples.

| Reading | AUC | Interval | detour | direct | humanized | throttled | Cheats above every legitimate session |
|---|---|---|---|---|---|---|---|
| **A, judge (primary)** | **0.948** | 0.897 to 0.985 | 0.92 | 0.99 | 0.95 | 0.93 | 49 of 71 |
| A, first three approaches | 0.956 | 0.916 to 0.984 | 0.88 | 0.99 | 0.97 | 0.99 | 47 of 71 |
| B, judge | 0.912 | 0.846 to 0.963 | 0.90 | 0.94 | 0.89 | 0.92 | 38 of 71 |
| B, first three approaches | 0.951 | 0.906 to 0.982 | 0.89 | 0.97 | 0.96 | 0.98 | 47 of 71 |
| C, plain single question | 0.686 | 0.561 to 0.801 | 0.69 | 0.65 | 0.64 | 0.79 | 0 of 71 |
| control, count of approaches | 0.751 | 0.650 to 0.845 | 0.75 | 0.88 | 0.80 | 0.56 | 0 of 71 |

A minus the control, paired: 0.197, interval 0.101 to 0.296.

| Registered condition | Outcome |
|---|---|
| A reaches AUC 0.90 | met, 0.948 |
| every style reaches 0.80 under A | met, lowest is detour at 0.92 |
| interval of A minus the control excludes zero | met, lower bound 0.101 |

## Against the development split

| Reading | Development | Sealed |
|---|---|---|
| A, judge | 0.991 | 0.948 |
| A, first three approaches | 0.946 | 0.956 |
| B, judge | 0.972 | 0.912 |
| B, first three approaches | 0.942 | 0.951 |
| C, plain single question | 0.689 | 0.686 |
| control | 0.829 | 0.751 |

The judge's answer fell by 0.04 to 0.06. The mean of the first three approaches did not fall. The
judge was the part of the design selected hardest during the search, and it sees how many
approaches a session has, which separated the classes less well here (0.751 against 0.829).

## What this does and does not show

It shows that, on bot sessions that shaped nothing, raw approach traces and these questions rank
X-Ray play above legitimate play, across four evasion styles, and do so beyond what the number of
ore encounters explains. The same model asked the plain question once does not.

It does not show:

- that the ranking holds for people. Both classes here are bots, and the model may be reading how
  these bots move. `docs/human-recording.md` describes the recording that would test it.
- a decision rule. No threshold was chosen (decision D2), so this is a ranking, not a false
  positive rate.
- anything about sessions without an ore reveal, which were 13% of the labelled sessions and
  cannot be scored by this design.
- anything about other worlds. The sealed sessions come from the same world seed as part of the
  development split.

## Cost

Configuration A made 1,082 calls for 103 sessions, 10.5 per session. Configuration B made 400,
3.9 per session.

## Sessions played by a person

Measured once, the same day, with the same frozen script, on every session one person has played:
11 legitimate sessions from 2026-09-20 and 3 X-Ray sessions from 2026-09-30 with an X-Ray resource
pack. The X-Ray sessions were played as: whatever the player chose (twice), and a roundabout route
to each ore (once). Registered in advance as a first reading, not a result: 3 positives against 5
scorable negatives is 15 pairs.

| | Sessions |
|---|---|
| labelled | 14 |
| scored | 8: 3 X-Ray, 5 legitimate cave mining |
| not scored, no ore reveal | 6 legitimate: all 5 branch mining sessions and 1 cave session |

| Reading | AUC | Interval |
|---|---|---|
| A, judge (primary) | 0.433 | 0.000 to 0.833 |
| A, first three approaches | 0.467 | 0.000 to 1.000 |
| B, judge | 0.600 | 0.200 to 1.000 |
| B, first three approaches | 0.500 | 0.067 to 0.900 |
| C, plain single question | 0.467 | 0.000 to 1.000 |
| control, count of approaches | 1.000 | 1.000 to 1.000 |

None of the registered conditions is met. The model does not separate this player's X-Ray play
from their cave mining; the count of ore encounters separates them completely, because the X-Ray
sessions each met 12 or more ores and the cave sessions 1 to 7.

Per session, configuration A, judge:

| Session | Kind | Judge | First three |
|---|---|---|---|
| cave mining | legitimate | 0.83 | 0.66 |
| X-Ray, free | cheat | 0.81 | 0.71 |
| cave mining | legitimate | 0.81 | 0.68 |
| cave mining | legitimate | 0.76 | 0.64 |
| X-Ray, free | cheat | 0.72 | 0.62 |
| cave mining | legitimate | 0.65 | 0.53 |
| X-Ray, detour | cheat | 0.63 | 0.49 |
| cave mining | legitimate, 1 approach | 0.26 | 0.53 |

Two things stand out.

**Cave mining looks like anticipation.** In a cave, ore becomes visible as the player walks toward
it along the passage; the trace shows position and view converging on the ore before it is
exposed, which is exactly what the questions ask for. Every legitimate session in the bot corpus
is branch mining, where that never happens, so the search never met this case. The 5 human branch
mining sessions cannot say whether tunnelling by a person looks different from tunnelling by a
bot, because none of them met a hidden ore.

**The X-Ray sessions did not look like the bot X-Ray.** The player with a resource pack scored no
higher than their own cave mining, on either the per-approach answers or the judge. Whether that is
because a person with X-Ray moves differently from the bots, or because these three sessions are
too few to tell, cannot be read from 15 pairs.

So the bot result above stands for bots, and the question this repository set out to answer,
whether the approach works on people, is open. The next recording should be legitimate branch
mining by a person at a depth where ore is met, and X-Ray sessions by more than one person.
