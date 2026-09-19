# JevCraft evaluation report: bots-all-live

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

Model / question set / feature extractor: jev-1.13.0 / xray-v4 / 0.1.0

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
| 0.50 | 14 | 0 | 13 | 29 | 1.000 | 0.326 | 0.000 | 0.491 |
| 0.55 | 10 | 0 | 13 | 33 | 1.000 | 0.233 | 0.000 | 0.377 |
| 0.60 | 6 | 0 | 13 | 37 | 1.000 | 0.140 | 0.000 | 0.245 |
| 0.65 | 4 | 0 | 13 | 39 | 1.000 | 0.093 | 0.000 | 0.170 |
| 0.70 | 1 | 0 | 13 | 42 | 1.000 | 0.023 | 0.000 | 0.045 |
| 0.75 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
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
| 0.60 | 4 / 43 | 1 / 13 |
| 0.65 | 4 / 43 | 1 / 13 |
| 0.70 | 4 / 43 | 3 / 13 |
| 0.75 | 6 / 43 | 3 / 13 |
| 0.80 | 8 / 43 | 3 / 13 |

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
| [0,0.5) | 45 | 0.844 |
| [0.5,0.7) | 9 | 0.889 |
| [0.7,0.9) | 2 | 0.500 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 246 ms |
| p95 | 577 ms |
| p99 | 672 ms |
| Input tokens | 67517 |
| Output tokens | 6513 |
| insufficient_evidence rate | 0.196 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_3eac62f7-6440-4e82-8d84-81092d026f99 | legit | branch_mining | review | 0.310 | 0.270 |

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_20d7c723-6ffe-4661-be9f-155f795596a5 | simulated_xray | humanized_xray | insufficient_evidence | 0.040 | 0.320 |
| session_86bd1fee-41f0-4426-bd9a-f5bf1486a597 | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.460 |
| session_ef612444-2ced-4c90-b910-41c43d74a7c5 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.780 |
| session_d022ec69-7623-4c41-a9cc-e5f92c568c2a | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.600 |
| session_bdb43c61-36ca-4ade-a6c6-60471914a913 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.360 |
| session_a453e271-cc58-4cde-a7d7-ee97f6e92ee8 | simulated_xray | direct_xray | insufficient_evidence | 0.020 | 0.410 |
| session_575a134a-8612-4472-b9a0-6d2257f72145 | simulated_xray | detour_xray | insufficient_evidence | 0.050 | 0.360 |
| session_c1cea18d-bc2c-4bdc-aead-b222d2f08324 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.460 |
