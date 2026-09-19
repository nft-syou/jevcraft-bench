# JevCraft evaluation report: batch4-v4-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 17 |
| Labels | 17 |
| Usable for metrics | 17 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v4 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 11 | 0 | 5 | 1 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.917 |
| FPR | 0.000 |
| FNR | 0.083 |
| F1 | 0.957 |
| Accuracy | 0.941 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 5 | 0 | 5 | 7 | 1.000 | 0.417 | 0.000 | 0.588 |
| 0.55 | 4 | 0 | 5 | 8 | 1.000 | 0.333 | 0.000 | 0.500 |
| 0.60 | 3 | 0 | 5 | 9 | 1.000 | 0.250 | 0.000 | 0.400 |
| 0.65 | 3 | 0 | 5 | 9 | 1.000 | 0.250 | 0.000 | 0.400 |
| 0.70 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |
| 0.75 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 5 | 12 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 12 | 1 / 5 |
| 0.40 | 0 / 12 | 1 / 5 |
| 0.50 | 0 / 12 | 1 / 5 |
| 0.55 | 0 / 12 | 1 / 5 |
| 0.60 | 1 / 12 | 1 / 5 |
| 0.65 | 1 / 12 | 1 / 5 |
| 0.70 | 1 / 12 | 1 / 5 |
| 0.75 | 1 / 12 | 1 / 5 |
| 0.80 | 1 / 12 | 1 / 5 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 5 | 0 | 0 | 5 | 0 | n/a | n/a | 0.000 |
| detour_xray | 4 | 4 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |
| direct_xray | 4 | 4 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |
| humanized_xray | 4 | 3 | 0 | 0 | 1 | 1.000 | 0.750 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 11 | 1.000 |
| [0.5,0.7) | 5 | 0.800 |
| [0.7,0.9) | 1 | 1.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 238 ms |
| p95 | 624 ms |
| p99 | 624 ms |
| Input tokens | 20498 |
| Output tokens | 1978 |
| insufficient_evidence rate | 0.118 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_d022ec69-7623-4c41-a9cc-e5f92c568c2a | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.600 |
