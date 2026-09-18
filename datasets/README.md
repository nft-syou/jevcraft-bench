# datasets

| Path | Tracked in Git | Purpose |
| --- | --- | --- |
| `fixtures/*.json` | yes | Hand-written `MiningSessionFeatures` documents for wiring tests. Not proof of accuracy. |
| `labels/*.jsonl` | yes | One `SessionLabel` per line. `unknown` rows are excluded from precision/recall and counted separately. |
| `decisions/*.jsonl` | no | Output of `pnpm jevcraft evaluate`. |
| `private/` | no | Real-server telemetry. Never commit. |

Player identifiers in any dataset must be pseudonymous (HMAC). Never store real UUIDs, names, chat, or IPs.
