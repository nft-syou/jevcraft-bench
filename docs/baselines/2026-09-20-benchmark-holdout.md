# JevCraft detection benchmark: held-out: seed 2 + human, thresholds frozen on the 77 development sessions

Evaluation set: 42 sessions (14 X-Ray, 28 legitimate).
Thresholds are chosen on a separate development set of 77 sessions, then frozen. Nothing tunes on the evaluation set.
Shared ceiling: false-positive rate <= 0.072.
Sessions a detector cannot score count as not flagged, as they would in production.
Ranges are 95% Wilson intervals.

## Recall at the matched false-positive ceiling

A detector marked **over ceiling** spent more false positives on the evaluation set than the
ceiling allows, so its recall is not comparable with the rest and it is excluded from the duel.

| Detector | Scored | AUC | Threshold | Recall | FPR | Precision |
| --- | --- | --- | --- | --- | --- | --- |
| ore-ratio | 42 | 0.903 | 4.13 | 0.714 [0.45-0.88] | 0.107 [0.04-0.27] **over ceiling** | 0.769 |
| reveal-ratio | 42 | 0.912 | 4.36 | 0.714 [0.45-0.88] | 0.036 [0.01-0.18] | 0.909 |
| ore-percentile | 42 | 0.894 | 100.00 | 0.286 [0.12-0.55] | 0.000 [0.00-0.12] | 1.000 |
| reveal-pace | 42 | 0.902 | 17.74 | 0.643 [0.39-0.84] | 0.071 [0.02-0.23] | 0.818 |
| straight-line | 28 | 0.904 | 0.74 | 0.500 [0.27-0.73] | 0.000 [0.00-0.12] | 1.000 |
| classic-combo | 42 | 0.917 | 0.54 | 0.857 [0.60-0.96] | 0.107 [0.04-0.27] **over ceiling** | 0.800 |
| fitted-logistic | 42 | 0.837 | 0.49 | 0.929 [0.69-0.99] | 0.500 [0.33-0.67] **over ceiling** | 0.481 |
| jev-likely-xray | 42 | 0.860 | 0.54 | 0.429 [0.21-0.67] | 0.000 [0.00-0.12] | 1.000 |
| jev-approach-targeting | 42 | 0.881 | 0.20 | 0.571 [0.33-0.79] | 0.036 [0.01-0.18] | 0.889 |
| jevcraft-policy (fixed point) | 42 | 0.857 | 1.00 | 0.786 [0.52-0.92] | 0.071 [0.02-0.23] | 0.846 |

## Recall by X-Ray style at those operating points

| Detector | detour_xray | direct_xray | humanized_xray |
| --- | --- | --- | --- |
| ore-ratio | 0.800 | 1.000 | 0.400 |
| reveal-ratio | 0.600 | 1.000 | 0.600 |
| ore-percentile | 0.000 | 1.000 | 0.000 |
| reveal-pace | 0.400 | 1.000 | 0.600 |
| straight-line | 0.000 | 1.000 | 0.600 |
| classic-combo | 0.800 | 1.000 | 0.800 |
| fitted-logistic | 1.000 | 1.000 | 0.800 |
| jev-likely-xray | 0.400 | 1.000 | 0.000 |
| jev-approach-targeting | 0.200 | 1.000 | 0.600 |
| jevcraft-policy | 0.800 | 1.000 | 0.600 |

## Head to head

`jevcraft-policy` against the strongest non-Jev detector, `reveal-ratio`,
counting sessions where exactly one of them is right (McNemar's exact test).
Subtype rows cover that style's positives only, so they say nothing about false positives.

| Scope | Only challenger right | Only baseline right | Two-sided p |
| --- | --- | --- | --- |
| all sessions | 3 | 3 | 1.0000 |
| detour_xray positives only | 2 | 1 | 1.0000 |
| direct_xray positives only | 0 | 0 | 1.0000 |
| humanized_xray positives only | 1 | 1 | 1.0000 |

## What each detector stands for

- **ore-ratio**: Valuable ore blocks mined per 100 blocks broken (classic ore-count heuristic).
- **reveal-ratio**: Hidden-ore first exposures per 100 blocks broken.
- **ore-percentile**: Efficiency percentile against a legitimate reference population.
- **reveal-pace**: Hidden-ore reveals per 10 minutes (streak / luck detectors).
- **straight-line**: Mean directness of the approach to each hidden ore (geometric rule).
- **classic-combo**: Hand-tuned rule: half ore efficiency, half approach directness.
- **fitted-logistic**: Logistic regression over the same features, fitted on the development split (strong baseline).
- **jev-likely-xray**: P(likely_xray) from the Jev answer (xray-v6).
- **jev-approach-targeting**: P(approach_targeting) from the Jev answer (xray-v6).
- **jevcraft-policy**: The shipped policy outcome (review or high_priority_review).
