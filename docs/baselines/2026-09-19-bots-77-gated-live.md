# JevCraft evaluation report: bots-77-gated-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 77 |
| Labels | 77 |
| Usable for metrics | 77 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v6 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 34 | 2 | 32 | 9 |

| Metric | Value |
| --- | --- |
| Precision | 0.944 |
| Recall | 0.791 |
| FPR | 0.059 |
| FNR | 0.209 |
| F1 | 0.861 |
| Accuracy | 0.857 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 16 | 3 | 31 | 27 | 0.842 | 0.372 | 0.088 | 0.516 |
| 0.55 | 13 | 2 | 32 | 30 | 0.867 | 0.302 | 0.059 | 0.448 |
| 0.60 | 10 | 0 | 34 | 33 | 1.000 | 0.233 | 0.000 | 0.377 |
| 0.65 | 7 | 0 | 34 | 36 | 1.000 | 0.163 | 0.000 | 0.280 |
| 0.70 | 5 | 0 | 34 | 38 | 1.000 | 0.116 | 0.000 | 0.208 |
| 0.75 | 3 | 0 | 34 | 40 | 1.000 | 0.070 | 0.000 | 0.130 |
| 0.80 | 2 | 0 | 34 | 41 | 1.000 | 0.047 | 0.000 | 0.089 |
| 0.85 | 0 | 0 | 34 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 34 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 34 | 43 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 43 | 1 / 34 |
| 0.40 | 0 / 43 | 1 / 34 |
| 0.50 | 0 / 43 | 1 / 34 |
| 0.55 | 0 / 43 | 1 / 34 |
| 0.60 | 1 / 43 | 1 / 34 |
| 0.65 | 1 / 43 | 1 / 34 |
| 0.70 | 6 / 43 | 1 / 34 |
| 0.75 | 6 / 43 | 3 / 34 |
| 0.80 | 8 / 43 | 4 / 34 |

## Review gate sweep (policy variant)

A `review` outcome additionally requires P(likely_xray) >= t; `high_priority_review` is unchanged.

| min P(likely_xray) for review | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 34 | 2 | 32 | 9 | 0.944 | 0.791 | 0.059 |
| 0.20 | 34 | 2 | 32 | 9 | 0.944 | 0.791 | 0.059 |
| 0.25 | 34 | 2 | 32 | 9 | 0.944 | 0.791 | 0.059 |
| 0.30 | 33 | 2 | 32 | 10 | 0.943 | 0.767 | 0.059 |
| 0.35 | 33 | 2 | 32 | 10 | 0.943 | 0.767 | 0.059 |
| 0.40 | 33 | 1 | 33 | 10 | 0.971 | 0.767 | 0.029 |
| 0.45 | 27 | 0 | 34 | 16 | 1.000 | 0.628 | 0.000 |
| 0.50 | 16 | 0 | 34 | 27 | 1.000 | 0.372 | 0.000 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 34 | 0 | 2 | 32 | 0 | 0.000 | n/a | 0.059 |
| detour_xray | 14 | 11 | 0 | 0 | 3 | 1.000 | 0.786 | n/a |
| direct_xray | 15 | 12 | 0 | 0 | 3 | 1.000 | 0.800 | n/a |
| humanized_xray | 14 | 11 | 0 | 0 | 3 | 1.000 | 0.786 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 60 | 0.867 |
| [0.5,0.7) | 11 | 0.818 |
| [0.7,0.9) | 6 | 0.833 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 246 ms |
| p95 | 546 ms |
| p99 | 594 ms |
| Input tokens | 107920 |
| Output tokens | 10557 |
| insufficient_evidence rate | 0.156 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_99ce1546-26bb-48a9-acd2-b1beaa9ed02a | legit | branch_mining | review | 0.420 | 0.240 |
| session_b9b3189f-d891-49d3-943d-b93f78b10e58 | legit | branch_mining | review | 0.350 | 0.230 |

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_20d7c723-6ffe-4661-be9f-155f795596a5 | simulated_xray | humanized_xray | insufficient_evidence | 0.060 | 0.340 |
| session_86bd1fee-41f0-4426-bd9a-f5bf1486a597 | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.500 |
| session_ef612444-2ced-4c90-b910-41c43d74a7c5 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.780 |
| session_12398cc1-e1ae-410b-9960-aa071065c91d | simulated_xray | detour_xray | no_action | 0.390 | 0.210 |
| session_d022ec69-7623-4c41-a9cc-e5f92c568c2a | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.500 |
| session_bdb43c61-36ca-4ade-a6c6-60471914a913 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.360 |
| session_a453e271-cc58-4cde-a7d7-ee97f6e92ee8 | simulated_xray | direct_xray | insufficient_evidence | 0.020 | 0.110 |
| session_575a134a-8612-4472-b9a0-6d2257f72145 | simulated_xray | detour_xray | insufficient_evidence | 0.140 | 0.340 |
| session_c1cea18d-bc2c-4bdc-aead-b222d2f08324 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.460 |
