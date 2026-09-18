# Baselines

Reports from real TypeSafe Jev runs, archived here because `reports/` is gitignored.
All inputs are hand-written fixtures or synthetic sessions from `scenarios/`; no player data.

| Date | Report | Input | Calls | Question set | Model |
| --- | --- | --- | --- | --- | --- |
| 2026-09-19 | `2026-09-19-fixtures-live.md` | 5 fixtures × 1 | 5 | xray-v1 | jev-1.13.0 |
| 2026-09-19 | `2026-09-19-fixtures-live-x10.md` | 5 fixtures × 10 | 50 | xray-v1 | jev-1.13.0 |
| 2026-09-19 | `2026-09-19-seed1-live.md` | 7 scenarios × 15, seed 1 | 105 | xray-v1 | jev-1.13.0 |

## What the 2026-09-19 runs showed

**Jev is stable on repeated input.** Over 10 repeats per fixture, every answer dimension had a
population std of 0.003–0.028. Threshold discussions are therefore meaningful; a session that
sits on a threshold (xray_evasive, sufficiency 0.645 ± 0.008 vs 0.65) flips outcome, but the
model is not noisy.

**`evidence_sufficiency` tracks suspicion, not telemetry quality.** Legit sessions with full
coverage came back at 0.51–0.61; direct X-Ray at 0.76. On the synthetic set, minEvidenceSufficiency
0.65 drops 27/60 legit rows and 4/45 X-Ray rows; 0.60 drops 12/60 and 0/45. The question wording
("enough evidence to classify this session?") is probably being read as "enough evidence of
cheating". This is the first candidate change for an `xray-v2` question set.

**`P(likely_xray)` alone never produced a false positive.** At every threshold from 0.50 to 0.85
the FPR was 0.000, at the cost of recall 0.09–0.36. All 11 false positives on the synthetic set
came through the `review` rule (`P(likely_xray) + P(suspicious) >= 0.75`), and 10 of them were
`lucky_streak`: branch mining with an unusually rich vein cluster. That is exactly the "skilled or
lucky player" failure the spec warns about (§22), and Jev marks it `suspicious` rather than
`likely_xray`, which is arguably correct behaviour for a review queue.

**Humanized X-Ray is invisible to this feature set.** 14/15 missed. With directness ~0.62 and
aim ~0.5 the synthetic sessions look like ordinary mixed mining; the current features carry no
signal for "low-value ore mixed in to look natural". Expect this until Phase 3 real telemetry and
richer per-approach features exist.

## Caveats

- Synthetic data tests the wiring and the shape of the thresholds, not detection accuracy
  (spec §22). A scenario the generator finds hard (humanized) may be easy with real trajectories,
  and vice versa.
- All numbers are for `xray-v1` and `jev-1.13.0`. Re-run when either changes.
