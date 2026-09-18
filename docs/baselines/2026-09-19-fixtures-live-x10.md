# JevCraft evaluation report: fixtures-live-x10

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

Model / question set / feature extractor: jev-1.13.0 / xray-v1 / 0.1.0

## Policy outcome

| TP | FP | TN | FN |
| --- | --- | --- | --- |
| 15 | 0 | 20 | 5 |

| Metric | Value |
| --- | --- |
| Precision | 1.000 |
| Recall | 0.750 |
| FPR | 0.000 |
| FNR | 0.250 |
| F1 | 0.857 |
| Accuracy | 0.875 |

## Threshold sweep on P(likely_xray)

| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.50 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.55 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.60 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.65 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.70 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.75 | 10 | 0 | 20 | 10 | 1.000 | 0.500 | 0.000 | 0.667 |
| 0.80 | 5 | 0 | 20 | 15 | 1.000 | 0.250 | 0.000 | 0.400 |
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
| 0.55 | 0 / 20 | 9 / 20 |
| 0.60 | 0 / 20 | 13 / 20 |
| 0.65 | 5 / 20 | 19 / 20 |
| 0.70 | 10 / 20 | 20 / 20 |
| 0.75 | 11 / 20 | 20 / 20 |
| 0.80 | 20 / 20 | 20 / 20 |

## Repeat variance

Same session evaluated more than once. Values are mean ± population std [min, max].

| Session | Runs | P(likely_xray) | hidden_information_use | evidence_sufficiency | route_naturalness (norm) | Outcomes |
| --- | --- | --- | --- | --- | --- | --- |
| session_fixture_insufficient_001 | 10 | 0.000 ± 0.000 [0.000, 0.000] | 0.079 ± 0.003 [0.070, 0.080] | 0.056 ± 0.005 [0.050, 0.060] | 0.546 ± 0.006 [0.540, 0.557] | insufficient_evidence=10 |
| session_fixture_legit_001 | 10 | 0.206 ± 0.025 [0.170, 0.250] | 0.270 ± 0.020 [0.240, 0.300] | 0.608 ± 0.019 [0.580, 0.650] | 0.589 ± 0.015 [0.565, 0.610] | insufficient_evidence=9, no_action=1 |
| session_fixture_legit_002 | 10 | 0.094 ± 0.014 [0.070, 0.120] | 0.342 ± 0.009 [0.330, 0.360] | 0.525 ± 0.014 [0.500, 0.550] | 0.566 ± 0.016 [0.542, 0.590] | insufficient_evidence=10 |
| session_fixture_xray_direct_001 | 10 | 0.790 ± 0.026 [0.750, 0.840] | 0.711 ± 0.009 [0.690, 0.720] | 0.758 ± 0.013 [0.730, 0.780] | 0.087 ± 0.007 [0.080, 0.105] | review=10 |
| session_fixture_xray_evasive_001 | 10 | 0.237 ± 0.028 [0.200, 0.280] | 0.473 ± 0.011 [0.460, 0.490] | 0.645 ± 0.008 [0.630, 0.660] | 0.381 ± 0.012 [0.362, 0.400] | insufficient_evidence=5, review=5 |

## By scenario subtype

| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| branch_mining | 10 | 0 | 0 | 10 | 0 | n/a | n/a | 0.000 |
| cave_mining | 10 | 0 | 0 | 10 | 0 | n/a | n/a | 0.000 |
| detour_xray | 10 | 5 | 0 | 0 | 5 | 1.000 | 0.500 | n/a |
| direct_xray | 10 | 10 | 0 | 0 | 0 | 1.000 | 1.000 | n/a |

## Accuracy by confidence band

| Band | Count | Accuracy |
| --- | --- | --- |
| [0,0.5) | 28 | 0.821 |
| [0.5,0.7) | 4 | 1.000 |
| [0.7,0.9) | 8 | 1.000 |
| [0.9,1] | 0 | n/a |

## Latency and cost

| Item | Value |
| --- | --- |
| p50 | 238 ms |
| p95 | 421 ms |
| p99 | 667 ms |
| Input tokens | 52890 |
| Output tokens | 5831 |
| insufficient_evidence rate | 0.680 |

Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).

## False positives

(none)

## False negatives

| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |
| --- | --- | --- | --- | --- | --- |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | insufficient_evidence | 0.260 | 0.470 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | insufficient_evidence | 0.230 | 0.460 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | insufficient_evidence | 0.270 | 0.430 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | insufficient_evidence | 0.280 | 0.450 |
| session_fixture_xray_evasive_001 | simulated_xray | detour_xray | insufficient_evidence | 0.210 | 0.490 |
