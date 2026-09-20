# JevCraft detection benchmark: held-out with ratio-evading X-Ray: seed 2, human, and 15 throttled sessions

Evaluation set: 57 sessions (29 X-Ray, 28 legitimate).
Thresholds are chosen on a separate development set of 77 sessions, then frozen. Nothing tunes on the evaluation set.
Shared ceiling: false-positive rate <= 0.072.
Sessions a detector cannot score count as not flagged, as they would in production.
Ranges are 95% Wilson intervals.

## Recall at the matched false-positive ceiling

A detector marked **over ceiling** spent more false positives on the evaluation set than the
ceiling allows, so its recall is not comparable with the rest and it is excluded from the duel.

| Detector | Scored | AUC | Threshold | Recall | FPR | Precision |
| --- | --- | --- | --- | --- | --- | --- |
| ore-ratio | 57 | 0.805 | 4.13 | 0.345 [0.20-0.53] | 0.107 [0.04-0.27] **over ceiling** | 0.769 |
| reveal-ratio | 57 | 0.783 | 4.36 | 0.345 [0.20-0.53] | 0.036 [0.01-0.18] | 0.909 |
| ore-percentile | 57 | 0.748 | 100.00 | 0.138 [0.05-0.31] | 0.000 [0.00-0.12] | 1.000 |
| reveal-pace | 57 | 0.802 | 17.74 | 0.310 [0.17-0.49] | 0.071 [0.02-0.23] | 0.818 |
| straight-line | 42 | 0.922 | 0.74 | 0.655 [0.47-0.80] | 0.000 [0.00-0.12] | 1.000 |
| classic-combo | 57 | 0.866 | 0.54 | 0.586 [0.41-0.74] | 0.107 [0.04-0.27] **over ceiling** | 0.850 |
| fitted-logistic | 57 | 0.616 | 0.49 | 0.517 [0.34-0.69] | 0.500 [0.33-0.67] **over ceiling** | 0.517 |
| jev-likely-xray | 57 | 0.743 | 0.54 | 0.207 [0.10-0.38] | 0.000 [0.00-0.12] | 1.000 |
| jev-approach-targeting | 57 | 0.897 | 0.20 | 0.690 [0.51-0.83] | 0.036 [0.01-0.18] | 0.952 |
| jevcraft-policy (fixed point) | 57 | 0.826 | 1.00 | 0.724 [0.54-0.85] | 0.071 [0.02-0.23] | 0.913 |

## Recall by X-Ray style at those operating points

| Detector | detour_xray | direct_xray | humanized_xray |
| --- | --- | --- | --- |
| ore-ratio | 0.800 | 1.000 | 0.100 |
| reveal-ratio | 0.600 | 1.000 | 0.150 |
| ore-percentile | 0.000 | 1.000 | 0.000 |
| reveal-pace | 0.400 | 1.000 | 0.150 |
| straight-line | 0.000 | 1.000 | 0.750 |
| classic-combo | 0.800 | 1.000 | 0.450 |
| fitted-logistic | 1.000 | 1.000 | 0.300 |
| jev-likely-xray | 0.400 | 1.000 | 0.000 |
| jev-approach-targeting | 0.200 | 1.000 | 0.750 |
| jevcraft-policy | 0.800 | 1.000 | 0.650 |

## Head to head

`jevcraft-policy` against the strongest non-Jev detector, `straight-line`,
counting sessions where exactly one of them is right (McNemar's exact test).
Subtype rows cover that style's positives only, so they say nothing about false positives.

| Scope | Only challenger right | Only baseline right | Two-sided p |
| --- | --- | --- | --- |
| all sessions | 4 | 4 | 1.0000 |
| detour_xray positives only | 4 | 0 | 0.1250 |
| direct_xray positives only | 0 | 0 | 1.0000 |
| humanized_xray positives only | 0 | 2 | 0.5000 |

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
