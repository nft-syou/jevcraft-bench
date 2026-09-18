# JevCraft evaluation report: fixtures-live-x10-v2

Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.
FPR is the primary metric: flagging skilled or lucky players costs operator trust.

## Summary

| Item | Count |
| --- | --- |
| Decisions | 50 |
| Labels | 5 |
| Usable for metrics | 40 |
| Excluded: unknown label | 10 |
| Excluded: evaluation error | 0 |
| Excluded: no label | 0 |
| Excluded: duplicate label | 0 |

Model / question set / feature extractor: jev-1.13.0 / xray-v2 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 10 | 0 | 20 | 10 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.500 |
| FPR | 0.000 |
| FNR | 0.500 |
| F1 | 0.667 |
| Accuracy | 0.750 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.55 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.60 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.65 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.70 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.75 | 3 | 0 | 20 | 17 | 1.000 | 0.150 | 0.000 | 0.261 |
| 0.80 | 0 | 0 | 20 | 20 | n/a | 0.000 | 0.000 | n/a |
| 0.85 | 0 | 0 | 20 | 20 | n/a | 0.000 | 0.000 | n/a |
| 0.90 | 0 | 0 | 20 | 20 | n/a | 0.000 | 0.000 | n/a |
| 0.95 | 0 | 0 | 20 | 20 | n/a | 0.000 | 0.000 | n/a |

## Sufficiency threshold sweep

Rows whose `evidence_sufficiency` falls below the threshold become `insufficient_evidence` (dropped / total).

| minEvidenceSufficiency | Dropped positives | Dropped negatives |
| --- | --- | --- |
| 0.30 | 0 / 20 | 0 / 20 |
| 0.40 | 0 / 20 | 0 / 20 |
| 0.50 | 0 / 20 | 0 / 20 |
| 0.55 | 0 / 20 | 0 / 20 |
| 0.60 | 0 / 20 | 0 / 20 |
| 0.65 | 0 / 20 | 0 / 20 |
| 0.70 | 0 / 20 | 0 / 20 |
| 0.75 | 0 / 20 | 0 / 20 |
| 0.80 | 0 / 20 | 0 / 20 |

## Repeat variance

Same session evaluated more than once. Values are mean ± population std [min, max].

| Session | Runs | P(likely_xray) | hidden_information_use | evidence_sufficiency | route_naturalness (norm) | Outcomes |
| --- | --- | --- | --- | --- | --- | --- |
| session_fixture_insufficient_001 | 10 | 0.000 ± 0.000 [0.000, 0.000] | 0.086 ± 0.005 [0.080, 0.090] | 0.057 ± 0.005 [0.050, 0.060] | 0.519 ± 0.003 [0.515, 0.525] | insufficient_evidence=10 |
| session_fixture_legit_001 | 10 | 0.147 ± 0.009 [0.130, 0.160] | 0.217 ± 0.010 [0.200, 0.230] | 0.932 ± 0.006 [0.920, 0.940] | 0.658 ± 0.016 [0.635, 0.693] | no_action=10 |
| session_fixture_legit_002 | 10 | 0.067 ± 0.008 [0.050, 0.080] | 0.297 ± 0.008 [0.280, 0.310] | 0.922 ± 0.004 [0.920, 0.930] | 0.640 ± 0.014 [0.620, 0.660] | no_action=10 |
| session_fixture_xray_direct_001 | 10 | 0.741 ± 0.014 [0.720, 0.770] | 0.666 ± 0.009 [0.650, 0.680] | 0.960 ± 0.000 [0.960, 0.960] | 0.127 ± 0.010 [0.102, 0.138] | review=10 |
| session_fixture_xray_evasive_001 | 10 | 0.190 ± 0.013 [0.170, 0.210] | 0.428 ± 0.007 [0.420, 0.440] | 0.949 ± 0.003 [0.940, 0.950] | 0.438 ± 0.009 [0.422, 0.455] | no_action=10 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 10 | 0 | 0 | 10 | 0 | n/a | n/a | 0.000 |
| cave_mining | 10 | 0 | 0 | 10 | 0 | n/a | n/a | 0.000 |
| detour_xray | 10 | 0 | 0 | 0 | 10 | n/a | 0.000 | n/a |
| direct_xray | 10 | 10 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 29 | 0.655 |
| [0.5,0.7) | 11 | 1.000 |
| [0.7,0.9) | 0 | n/a |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 243 ms |
| p95 | 459 ms |
| p99 | 642 ms |
| Input tokens | 59590 |
| Output tokens | 5820 |
| insufficient_evidence rate | 0.200 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.170 | 0.360 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.180 | 0.370 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.190 | 0.380 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.210 | 0.370 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.210 | 0.320 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.190 | 0.380 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.180 | 0.360 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.200 | 0.360 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.190 | 0.370 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | no_action | 0.180 | 0.360 |
