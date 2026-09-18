# JevCraft evaluation report: fixtures-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 5 |
| Labels | 5 |
| Usable for metrics | 4 |
| Excluded: unknown label | 1 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v1 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 2 | 0 | 2 | 0 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 1.000 |
| FPR | 0.000 |
| FNR | 0.000 |
| F1 | 1.000 |
| Accuracy | 1.000 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.55 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.60 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.65 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.70 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.75 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.80 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.85 | 1 | 0 | 2 | 1 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.90 | 0 | 0 | 2 | 2 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 2 | 2 | n/a | 0.000 | 0.000 | n/a |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 1 | 0 | 0 | 1 | 0 | n/a | n/a | 0.000 |
| cave_mining | 1 | 0 | 0 | 1 | 0 | n/a | n/a | 0.000 |
| detour_xray | 1 | 1 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |
| direct_xray | 1 | 1 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 3 | 1.000 |
| [0.5,0.7) | 0 | n/a |
| [0.7,0.9) | 1 | 1.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 249 ms |
| p95 | 646 ms |
| p99 | 646 ms |
| Input tokens | 5289 |
| Output tokens | 583 |
| insufficient_evidence rate | 0.600 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

(none)
