# JevCraft evaluation report: human-legit-live

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 11 |
| Labels | 11 |
| Usable for metrics | 11 |
| Excluded: unknown label | 0 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v6 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 0 | 1 | 10 | 0 |

| Metric | Value |
| --- | --- |
| Precision | 0.000 |
| Recall | n/a |
| FPR | 0.091 |
| FNR | n/a |
| F1 | n/a |
| Accuracy | 0.909 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.55 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.60 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.65 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.70 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.75 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.80 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.85 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.90 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |
| 0.95 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 0 | 0 / 11 |
| 0.40 | 0 / 0 | 0 / 11 |
| 0.50 | 0 / 0 | 0 / 11 |
| 0.55 | 0 / 0 | 0 / 11 |
| 0.60 | 0 / 0 | 0 / 11 |
| 0.65 | 0 / 0 | 1 / 11 |
| 0.70 | 0 / 0 | 1 / 11 |
| 0.75 | 0 / 0 | 3 / 11 |
| 0.80 | 0 / 0 | 3 / 11 |

## Review gate sweep (policy variant)

A `review` outcome additionally requires P(likely_xray) >= t; `high_priority_review` is unchanged.

| min P(likely_xray) for review | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 0 | 1 | 10 | 0 | 0.000 | n/a | 0.091 |
| 0.20 | 0 | 1 | 10 | 0 | 0.000 | n/a | 0.091 |
| 0.25 | 0 | 1 | 10 | 0 | 0.000 | n/a | 0.091 |
| 0.30 | 0 | 1 | 10 | 0 | 0.000 | n/a | 0.091 |
| 0.35 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 |
| 0.40 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 |
| 0.45 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 |
| 0.50 | 0 | 0 | 11 | 0 | n/a | n/a | 0.000 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 5 | 0 | 0 | 5 | 0 | n/a | n/a | 0.000 |
| cave_mining | 6 | 0 | 1 | 5 | 0 | 0.000 | n/a | 0.167 |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 5 | 0.800 |
| [0.5,0.7) | 5 | 1.000 |
| [0.7,0.9) | 1 | 1.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 306 ms |
| p95 | 692 ms |
| p99 | 692 ms |
| Input tokens | 15346 |
| Output tokens | 1505 |
| insufficient_evidence rate | 0.273 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_018c397b-3148-4950-a3f9-4a148b0ac418 | legit | cave_mining | review | 0.340 | 0.290 |

## False negatives

(none)
