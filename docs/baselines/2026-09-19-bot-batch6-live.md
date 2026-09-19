# JevCraft evaluation report: batch6-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 21 |
| Labels | 67 |
| Usable for metrics | 21 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v6 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 0 | 9 | 12 | 0 |

| Metric | Value |
| --- | --- |
| Precision | 0.000 |
| Recall | n/a |
| FPR | 0.429 |
| FNR | n/a |
| F1 | n/a |
| Accuracy | 0.571 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 0 | 2 | 19 | 0 | 0.000 | n/a | 0.095 | n/a |
| 0.55 | 0 | 2 | 19 | 0 | 0.000 | n/a | 0.095 | n/a |
| 0.60 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.65 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.70 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.75 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.80 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.85 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.90 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |
| 0.95 | 0 | 0 | 21 | 0 | n/a | n/a | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 0 | 0 / 21 |
| 0.40 | 0 / 0 | 0 / 21 |
| 0.50 | 0 / 0 | 0 / 21 |
| 0.55 | 0 / 0 | 0 / 21 |
| 0.60 | 0 / 0 | 0 / 21 |
| 0.65 | 0 / 0 | 0 / 21 |
| 0.70 | 0 / 0 | 0 / 21 |
| 0.75 | 0 / 0 | 0 / 21 |
| 0.80 | 0 / 0 | 1 / 21 |

## Review gate sweep (policy variant)

A `review` outcome additionally requires P(likely_xray) >= t; `high_priority_review` is unchanged.

| min P(likely_xray) for review | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |
| 0.20 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |
| 0.25 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |
| 0.30 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |
| 0.35 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |
| 0.40 | 0 | 7 | 14 | 0 | 0.000 | n/a | 0.333 |
| 0.45 | 0 | 4 | 17 | 0 | 0.000 | n/a | 0.190 |
| 0.50 | 0 | 2 | 19 | 0 | 0.000 | n/a | 0.095 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 21 | 0 | 9 | 12 | 0 | 0.000 | n/a | 0.429 |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 18 | 0.500 |
| [0.5,0.7) | 3 | 1.000 |
| [0.7,0.9) | 0 | n/a |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 264 ms |
| p95 | 546 ms |
| p99 | 594 ms |
| Input tokens | 29421 |
| Output tokens | 2873 |
| insufficient_evidence rate | 0.048 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_775532a6-012d-46ba-be48-17772b327b08 | legit | branch_mining | review | 0.430 | 0.240 |
| session_1268ce97-b82b-4398-bf1a-0f9e10f9f1da | legit | branch_mining | review | 0.400 | 0.200 |
| session_3c1e0339-ceab-477e-8cb6-237d09cbbfab | legit | branch_mining | review | 0.460 | 0.280 |
| session_99ce1546-26bb-48a9-acd2-b1beaa9ed02a | legit | branch_mining | review | 0.420 | 0.240 |
| session_b9b3189f-d891-49d3-943d-b93f78b10e58 | legit | branch_mining | review | 0.350 | 0.230 |
| session_ab3004b3-dac4-4f39-a64c-1a65b7ea2525 | legit | branch_mining | review | 0.450 | 0.260 |
| session_cff998d5-cc07-4903-8f14-f295ea457bfd | legit | branch_mining | review | 0.580 | 0.440 |
| session_f80d4322-b3ec-4eb0-9440-3a6c20a1a38f | legit | branch_mining | review | 0.560 | 0.420 |
| session_2493479b-4139-4981-ad4b-63e60fd15f9e | legit | branch_mining | review | 0.370 | 0.170 |

## False negatives

(none)
