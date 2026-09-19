# JevCraft evaluation report: bots-all-bl-xray-v5

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 56 |
| Labels | 56 |
| Usable for metrics | 56 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v5 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 35 | 1 | 12 | 8 |

| Metric | Value |
| --- | --- |
| Precision | 0.972 |
| Recall | 0.814 |
| FPR | 0.077 |
| FNR | 0.186 |
| F1 | 0.886 |
| Accuracy | 0.839 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 14 | 1 | 12 | 29 | 0.933 | 0.326 | 0.077 | 0.483 |
| 0.55 | 11 | 0 | 13 | 32 | 1.000 | 0.256 | 0.000 | 0.407 |
| 0.60 | 9 | 0 | 13 | 34 | 1.000 | 0.209 | 0.000 | 0.346 |
| 0.65 | 5 | 0 | 13 | 38 | 1.000 | 0.116 | 0.000 | 0.208 |
| 0.70 | 4 | 0 | 13 | 39 | 1.000 | 0.093 | 0.000 | 0.170 |
| 0.75 | 3 | 0 | 13 | 40 | 1.000 | 0.070 | 0.000 | 0.130 |
| 0.80 | 1 | 0 | 13 | 42 | 1.000 | 0.023 | 0.000 | 0.045 |
| 0.85 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 43 | 1 / 13 |
| 0.40 | 0 / 43 | 1 / 13 |
| 0.50 | 0 / 43 | 1 / 13 |
| 0.55 | 0 / 43 | 1 / 13 |
| 0.60 | 2 / 43 | 1 / 13 |
| 0.65 | 6 / 43 | 1 / 13 |
| 0.70 | 7 / 43 | 2 / 13 |
| 0.75 | 8 / 43 | 3 / 13 |
| 0.80 | 8 / 43 | 3 / 13 |

## Review gate sweep (policy variant)

A `review` outcome additionally requires P(likely_xray) >= t; `high_priority_review` is unchanged.

| min P(likely_xray) for review | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 35 | 1 | 12 | 8 | 0.972 | 0.814 | 0.077 |
| 0.20 | 34 | 1 | 12 | 9 | 0.971 | 0.791 | 0.077 |
| 0.25 | 34 | 1 | 12 | 9 | 0.971 | 0.791 | 0.077 |
| 0.30 | 30 | 1 | 12 | 13 | 0.968 | 0.698 | 0.077 |
| 0.35 | 26 | 1 | 12 | 17 | 0.963 | 0.605 | 0.077 |
| 0.40 | 22 | 1 | 12 | 21 | 0.957 | 0.512 | 0.077 |
| 0.45 | 18 | 1 | 12 | 25 | 0.947 | 0.419 | 0.077 |
| 0.50 | 14 | 1 | 12 | 29 | 0.933 | 0.326 | 0.077 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 13 | 0 | 1 | 12 | 0 | 0.000 | n/a | 0.077 |
| detour_xray | 14 | 12 | 0 | 0 | 2 | 1.000 | 0.857 | n/a |
| direct_xray | 15 | 12 | 0 | 0 | 3 | 1.000 | 0.800 | n/a |
| humanized_xray | 14 | 11 | 0 | 0 | 3 | 1.000 | 0.786 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 41 | 0.829 |
| [0.5,0.7) | 8 | 0.875 |
| [0.7,0.9) | 7 | 0.857 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 248 ms |
| p95 | 358 ms |
| p99 | 686 ms |
| Input tokens | 76091 |
| Output tokens | 6513 |
| insufficient_evidence rate | 0.196 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_3eac62f7-6440-4e82-8d84-81092d026f99 | legit | branch_mining | review | 0.500 | 0.330 |

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_20d7c723-6ffe-4661-be9f-155f795596a5 | simulated_xray | humanized_xray | insufficient_evidence | 0.090 | 0.400 |
| session_86bd1fee-41f0-4426-bd9a-f5bf1486a597 | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.340 |
| session_ef612444-2ced-4c90-b910-41c43d74a7c5 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.700 |
| session_d022ec69-7623-4c41-a9cc-e5f92c568c2a | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.460 |
| session_bdb43c61-36ca-4ade-a6c6-60471914a913 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.260 |
| session_a453e271-cc58-4cde-a7d7-ee97f6e92ee8 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.520 |
| session_575a134a-8612-4472-b9a0-6d2257f72145 | simulated_xray | detour_xray | insufficient_evidence | 0.260 | 0.370 |
| session_c1cea18d-bc2c-4bdc-aead-b222d2f08324 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.390 |
