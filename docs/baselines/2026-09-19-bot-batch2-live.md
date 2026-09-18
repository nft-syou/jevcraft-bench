# JevCraft evaluation report: batch2-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 10 |
| Labels | 22 |
| Usable for metrics | 10 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v3 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 5 | 0 | 2 | 3 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.625 |
| FPR | 0.000 |
| FNR | 0.375 |
| F1 | 0.769 |
| Accuracy | 0.700 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 1 | 0 | 2 | 7 | 1.000 | 0.125 | 0.000 | 0.222 |
| 0.55 | 1 | 0 | 2 | 7 | 1.000 | 0.125 | 0.000 | 0.222 |
| 0.60 | 1 | 0 | 2 | 7 | 1.000 | 0.125 | 0.000 | 0.222 |
| 0.65 | 1 | 0 | 2 | 7 | 1.000 | 0.125 | 0.000 | 0.222 |
| 0.70 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |
| 0.75 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 2 | 8 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 3 / 8 | 0 / 2 |
| 0.40 | 3 / 8 | 0 / 2 |
| 0.50 | 3 / 8 | 1 / 2 |
| 0.55 | 3 / 8 | 1 / 2 |
| 0.60 | 3 / 8 | 2 / 2 |
| 0.65 | 3 / 8 | 2 / 2 |
| 0.70 | 3 / 8 | 2 / 2 |
| 0.75 | 4 / 8 | 2 / 2 |
| 0.80 | 4 / 8 | 2 / 2 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 2 | 0 | 0 | 2 | 0 | n/a | n/a | 0.000 |
| detour_xray | 2 | 1 | 0 | 0 | 1 | 1.000 | 0.500 | n/a |
| direct_xray | 3 | 2 | 0 | 0 | 1 | 1.000 | 0.667 | n/a |
| humanized_xray | 3 | 2 | 0 | 0 | 1 | 1.000 | 0.667 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 7 | 0.714 |
| [0.5,0.7) | 2 | 1.000 |
| [0.7,0.9) | 1 | 0.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 237 ms |
| p95 | 649 ms |
| p99 | 649 ms |
| Input tokens | 11776 |
| Output tokens | 1162 |
| insufficient_evidence rate | 0.500 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_20d7c723-6ffe-4661-be9f-155f795596a5 | simulated_xray | humanized_xray | insufficient_evidence | 0.060 | 0.290 |
| session_86bd1fee-41f0-4426-bd9a-f5bf1486a597 | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.370 |
| session_ef612444-2ced-4c90-b910-41c43d74a7c5 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.740 |
