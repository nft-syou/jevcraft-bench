# scenarios

Feature-level scenario specs (spec §13A) for `pnpm jevcraft generate`. Each JSON file describes
the *distribution* of a session's features; no Minecraft runs. Generated data exercises the API
wiring, question sets, thresholds and reports. It is **not** proof of detection accuracy
(spec §22: tuning only on synthetic data learns the generator, not players).

| Dir | Label | Scenarios |
| --- | --- | --- |
| `legit/` | legit | branch-mining, cave-mining, lucky-streak, mixed-legit |
| `blatant-xray/` | simulated_xray | direct |
| `evasive-xray/` | simulated_xray | detour, humanized |

```bash
pnpm jevcraft generate scenarios --count 20 --seed 1 \
  --out-features datasets/generated/seed1-features.jsonl \
  --out-labels datasets/generated/seed1-labels.jsonl
```
