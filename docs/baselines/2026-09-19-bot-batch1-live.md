# JevCraft evaluation report: batch1-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 25 |
| Labels | 25 |
| Usable for metrics | 12 |
| Excluded: unknown label | 13 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v3 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 2 | 0 | 3 | 7 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.222 |
| FPR | 0.000 |
| FNR | 0.778 |
| F1 | 0.364 |
| Accuracy | 0.417 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 1 | 0 | 3 | 8 | 1.000 | 0.111 | 0.000 | 0.200 |
| 0.55 | 1 | 0 | 3 | 8 | 1.000 | 0.111 | 0.000 | 0.200 |
| 0.60 | 1 | 0 | 3 | 8 | 1.000 | 0.111 | 0.000 | 0.200 |
| 0.65 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.70 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.75 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 3 | 9 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 5 / 9 | 2 / 3 |
| 0.40 | 7 / 9 | 3 / 3 |
| 0.50 | 7 / 9 | 3 / 3 |
| 0.55 | 7 / 9 | 3 / 3 |
| 0.60 | 7 / 9 | 3 / 3 |
| 0.65 | 7 / 9 | 3 / 3 |
| 0.70 | 7 / 9 | 3 / 3 |
| 0.75 | 7 / 9 | 3 / 3 |
| 0.80 | 7 / 9 | 3 / 3 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 3 | 0 | 0 | 3 | 0 | n/a | n/a | 0.000 |
| detour_xray | 3 | 1 | 0 | 0 | 2 | 1.000 | 0.333 | n/a |
| direct_xray | 3 | 1 | 0 | 0 | 2 | 1.000 | 0.333 | n/a |
| humanized_xray | 3 | 0 | 0 | 0 | 3 | n/a | 0.000 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 7 | 0.429 |
| [0.5,0.7) | 3 | 0.333 |
| [0.7,0.9) | 2 | 0.500 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 280 ms |
| p95 | 773 ms |
| p99 | 1244 ms |
| Input tokens | 28847 |
| Output tokens | 2984 |
| insufficient_evidence rate | 0.920 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_4cd5a9df-6ab0-493b-a2c0-b83e7ca3409c | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.610 |
| session_f7adb27c-0a13-45ef-a77a-ea359a35b657 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.150 |
| session_65aec904-9bdf-4a00-808e-652ec83be2ec | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.670 |
| session_de74c572-05c3-40fd-9bfe-48616c0b2858 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.760 |
| session_10ecb4bd-35be-41d8-aa61-8558b2ddf117 | simulated_xray | humanized_xray | insufficient_evidence | 0.020 | 0.390 |
| session_e94fc0df-e480-4a08-b612-833afb8bfa83 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.440 |
| session_bdd4fbc3-471f-4094-9d10-b1bdd17894ef | simulated_xray | humanized_xray | insufficient_evidence | 0.030 | 0.290 |
