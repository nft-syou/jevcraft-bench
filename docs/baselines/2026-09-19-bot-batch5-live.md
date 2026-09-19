# JevCraft evaluation report: batch5-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 29 |
| Labels | 46 |
| Usable for metrics | 29 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v4 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 19 | 1 | 5 | 4 |

| Metric | Value |
| --- | --- |
| Precision | 0.950 |
| Recall | 0.826 |
| FPR | 0.167 |
| FNR | 0.174 |
| F1 | 0.884 |
| Accuracy | 0.828 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 8 | 0 | 6 | 15 | 1.000 | 0.348 | 0.000 | 0.516 |
| 0.55 | 6 | 0 | 6 | 17 | 1.000 | 0.261 | 0.000 | 0.414 |
| 0.60 | 3 | 0 | 6 | 20 | 1.000 | 0.130 | 0.000 | 0.231 |
| 0.65 | 1 | 0 | 6 | 22 | 1.000 | 0.043 | 0.000 | 0.083 |
| 0.70 | 1 | 0 | 6 | 22 | 1.000 | 0.043 | 0.000 | 0.083 |
| 0.75 | 0 | 0 | 6 | 23 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 6 | 23 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 6 | 23 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 6 | 23 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 6 | 23 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 23 | 0 / 6 |
| 0.40 | 0 / 23 | 0 / 6 |
| 0.50 | 0 / 23 | 0 / 6 |
| 0.55 | 0 / 23 | 0 / 6 |
| 0.60 | 1 / 23 | 0 / 6 |
| 0.65 | 1 / 23 | 0 / 6 |
| 0.70 | 1 / 23 | 2 / 6 |
| 0.75 | 2 / 23 | 2 / 6 |
| 0.80 | 4 / 23 | 2 / 6 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 6 | 0 | 1 | 5 | 0 | 0.000 | n/a | 0.167 |
| detour_xray | 8 | 7 | 0 | 0 | 1 | 1.000 | 0.875 | n/a |
| direct_xray | 8 | 6 | 0 | 0 | 2 | 1.000 | 0.750 | n/a |
| humanized_xray | 7 | 6 | 0 | 0 | 1 | 1.000 | 0.857 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 26 | 0.808 |
| [0.5,0.7) | 3 | 1.000 |
| [0.7,0.9) | 0 | n/a |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 244 ms |
| p95 | 509 ms |
| p99 | 672 ms |
| Input tokens | 35013 |
| Output tokens | 3373 |
| insufficient_evidence rate | 0.207 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_3eac62f7-6440-4e82-8d84-81092d026f99 | legit | branch_mining | review | 0.310 | 0.270 |

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_bdb43c61-36ca-4ade-a6c6-60471914a913 | simulated_xray | direct_xray | insufficient_evidence | 0.010 | 0.360 |
| session_a453e271-cc58-4cde-a7d7-ee97f6e92ee8 | simulated_xray | direct_xray | insufficient_evidence | 0.020 | 0.410 |
| session_575a134a-8612-4472-b9a0-6d2257f72145 | simulated_xray | detour_xray | insufficient_evidence | 0.050 | 0.360 |
| session_c1cea18d-bc2c-4bdc-aead-b222d2f08324 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.460 |
