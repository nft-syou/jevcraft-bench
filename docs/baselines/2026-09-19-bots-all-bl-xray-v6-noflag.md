# JevCraft evaluation report: bots-all-bl-xray-v6-noflag

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

Model / question set / feature extractor: jev-1.13.0 / xray-v6-noflag / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 29 | 0 | 13 | 14 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.674 |
| FPR | 0.000 |
| FNR | 0.326 |
| F1 | 0.806 |
| Accuracy | 0.750 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 3 | 0 | 13 | 40 | 1.000 | 0.070 | 0.000 | 0.130 |
| 0.55 | 3 | 0 | 13 | 40 | 1.000 | 0.070 | 0.000 | 0.130 |
| 0.60 | 1 | 0 | 13 | 42 | 1.000 | 0.023 | 0.000 | 0.045 |
| 0.65 | 1 | 0 | 13 | 42 | 1.000 | 0.023 | 0.000 | 0.045 |
| 0.70 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.75 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.80 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 13 | 43 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 43 | 0 / 13 |
| 0.40 | 0 / 43 | 1 / 13 |
| 0.50 | 0 / 43 | 1 / 13 |
| 0.55 | 0 / 43 | 1 / 13 |
| 0.60 | 0 / 43 | 1 / 13 |
| 0.65 | 0 / 43 | 1 / 13 |
| 0.70 | 0 / 43 | 1 / 13 |
| 0.75 | 0 / 43 | 1 / 13 |
| 0.80 | 1 / 43 | 1 / 13 |

## Review gate sweep (policy variant)

A `review` outcome additionally requires P(likely_xray) >= t; `high_priority_review` is unchanged.

| min P(likely_xray) for review | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.00 | 29 | 0 | 13 | 14 | 1.000 | 0.674 | 0.000 |
| 0.20 | 24 | 0 | 13 | 19 | 1.000 | 0.558 | 0.000 |
| 0.25 | 17 | 0 | 13 | 26 | 1.000 | 0.395 | 0.000 |
| 0.30 | 11 | 0 | 13 | 32 | 1.000 | 0.256 | 0.000 |
| 0.35 | 7 | 0 | 13 | 36 | 1.000 | 0.163 | 0.000 |
| 0.40 | 6 | 0 | 13 | 37 | 1.000 | 0.140 | 0.000 |
| 0.45 | 4 | 0 | 13 | 39 | 1.000 | 0.093 | 0.000 |
| 0.50 | 3 | 0 | 13 | 40 | 1.000 | 0.070 | 0.000 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 13 | 0 | 0 | 13 | 0 | n/a | n/a | 0.000 |
| detour_xray | 14 | 9 | 0 | 0 | 5 | 1.000 | 0.643 | n/a |
| direct_xray | 15 | 12 | 0 | 0 | 3 | 1.000 | 0.800 | n/a |
| humanized_xray | 14 | 8 | 0 | 0 | 6 | 1.000 | 0.571 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 48 | 0.750 |
| [0.5,0.7) | 7 | 0.857 |
| [0.7,0.9) | 1 | 0.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 258 ms |
| p95 | 534 ms |
| p99 | 697 ms |
| Input tokens | 77939 |
| Output tokens | 7667 |
| insufficient_evidence rate | 0.196 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_20d7c723-6ffe-4661-be9f-155f795596a5 | simulated_xray | humanized_xray | insufficient_evidence | 0.220 | 0.340 |
| session_86bd1fee-41f0-4426-bd9a-f5bf1486a597 | simulated_xray | direct_xray | insufficient_evidence | 0.000 | 0.710 |
| session_ef612444-2ced-4c90-b910-41c43d74a7c5 | simulated_xray | detour_xray | insufficient_evidence | 0.000 | 0.510 |
| session_12398cc1-e1ae-410b-9960-aa071065c91d | simulated_xray | detour_xray | no_action | 0.140 | 0.360 |
| session_357027f8-df45-4073-8a0b-9c1098fc67f9 | simulated_xray | humanized_xray | no_action | 0.180 | 0.420 |
| session_d022ec69-7623-4c41-a9cc-e5f92c568c2a | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.360 |
| session_ace49b3d-bdb4-42a2-a651-4eb5cc7d811f | simulated_xray | humanized_xray | no_action | 0.170 | 0.410 |
| session_bdb43c61-36ca-4ade-a6c6-60471914a913 | simulated_xray | direct_xray | insufficient_evidence | 0.060 | 0.360 |
| session_a453e271-cc58-4cde-a7d7-ee97f6e92ee8 | simulated_xray | direct_xray | insufficient_evidence | 0.110 | 0.240 |
| session_575a134a-8612-4472-b9a0-6d2257f72145 | simulated_xray | detour_xray | insufficient_evidence | 0.420 | 0.230 |
| session_6845d280-cebc-43a5-9b97-a08d12409feb | simulated_xray | detour_xray | no_action | 0.140 | 0.450 |
| session_ac5bd4bf-74b7-4f45-b322-fad983227a28 | simulated_xray | detour_xray | no_action | 0.060 | 0.420 |
| session_c1cea18d-bc2c-4bdc-aead-b222d2f08324 | simulated_xray | humanized_xray | insufficient_evidence | 0.000 | 0.410 |
| session_aa0c2829-dfa3-4148-8ecf-bd8b5415fa0f | simulated_xray | humanized_xray | no_action | 0.150 | 0.420 |
