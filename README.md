# JevCraft

Behavioral anti-cheat research bench for Minecraft (Paper) servers. Mining-session
telemetry is reduced to a small feature object, TypeSafe Jev answers a few typed
questions about it, and the results are scored offline against human labels.

This repository is a proof of concept. It **never** bans, kicks, or rolls back
players. The strongest outcome it produces is a request for human review.

## Status

Phase 0 + Phase 1 (offline vertical slice) are implemented:

```text
MiningSessionFeatures -> Jev questions (xray-v1) -> typed probabilities
  -> versioned DecisionRecord -> reproducible evaluation report
```

Phase 2 (Paper telemetry plugin, `plugin/`) and the feature extractor that turns its JSONL into
`MiningSessionFeatures` are implemented, so the whole chain runs end to end:

```text
Paper plugin JSONL -> jevcraft extract -> jevcraft evaluate -> jevcraft report
```

Next is Phase 3: recording real legit and simulated-X-Ray sessions on a fixed-seed world.
See `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`.

## Requirements

- Node.js 24 (`.node-version`)
- pnpm (version pinned in `package.json` `packageManager`)
- Optional: a TypeSafe API key in `TYPESAFE_API_KEY` for live evaluation

## Quick start

```bash
pnpm install
pnpm test
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
```

Without `TYPESAFE_API_KEY` the CLI uses a deterministic mock backend and says so on stderr.
Decisions are written to `datasets/decisions/<input>.jsonl` (ignored by Git).

### Live evaluation

```bash
cp .env.example .env   # then put your key in TYPESAFE_API_KEY
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

`pnpm jevcraft` loads `.env` if it exists (Node's `--env-file-if-exists`); an exported
`TYPESAFE_API_KEY` works too. The key is read only from the environment. Never commit it.

### Evaluation report

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

Produces `reports/fixtures.md` with the confusion matrix, Precision / Recall / **FPR** / FNR / F1,
a threshold sweep over `P(likely_xray)`, per-subtype and per-confidence-band breakdowns,
latency percentiles, token totals, and the list of false positives and false negatives.

### More trials: repeats and synthetic sessions

```bash
# Same 5 fixtures, 10 times each, to measure Jev's answer variance
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --repeat 10 --out datasets/decisions/fixtures-x10.jsonl

# 7 scenarios x 20 synthetic sessions (deterministic per seed), then evaluate and report
pnpm jevcraft generate scenarios --count 20 --seed 1   --out-features datasets/generated/seed1-features.jsonl --out-labels datasets/generated/seed1-labels.jsonl
pnpm jevcraft evaluate datasets/generated/seed1-features.jsonl --backend typesafe --out datasets/decisions/seed1.jsonl
pnpm jevcraft report --decisions datasets/decisions/seed1.jsonl --labels datasets/generated/seed1-labels.jsonl
```

The report then also contains a repeat-variance table and a sweep over `minEvidenceSufficiency`.
Archived results from real runs live in `docs/baselines/`.

## Paper plugin (Phase 2)

`plugin/` is a Paper server plugin that records, in shadow mode only:

- sampled movement (time / distance / rotation gates, with a 90 s ring buffer flushed when a session starts),
- block breaks inside a mining session,
- the first exposure of hidden valuable ores (6-neighbour rule, spec §7),
- mining-session boundaries (underground stone breaks or an ore reveal start one; idle timeout,
  logout, world change, far teleport, game-mode change, `/jevcraft flush` end one).

Everything goes to `plugins/JevCraft/data/<serverRunId>.jsonl` through a bounded queue and a
daemon writer thread; when the queue is full lines are dropped and counted, never blocking the
tick. Player ids are `hmac-sha256:<hex>` derived from `JEVCRAFT_HMAC_SECRET`; raw UUIDs and
names are never written. The plugin never bans, kicks, or rolls back.

**All JVM work runs in Docker; no JDK is installed on the host.**

```bash
pnpm plugin:test     # docker compose -f infra/docker-compose.yml run --rm gradle test
pnpm plugin:build    # ... gradle build  -> plugin/build/libs/JevCraft-<version>.jar
docker compose -f infra/docker-compose.yml up paper   # local Paper server with the jar mounted
```

Turn a server run into features and evaluate it:

```bash
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/run-001.jsonl
pnpm jevcraft evaluate datasets/features/run-001.jsonl --out datasets/decisions/run-001.jsonl
```

`extract` groups events by session, splits sessions longer than `--window-minutes` (default 15)
into `<sessionId>:w<n>` windows, and computes the spec §9 features: directness / detour ratio /
aim alignment from the 60 s of movement before each hidden-ore reveal, branch-mining likelihood
and tunnel directions from break geometry, cave exposure from open neighbour faces, break rhythm,
and trajectory coverage. Anything unobserved is `null`.

### Bot recordings (Phase 3 without humans)

`@jevcraft/bot-recorder` drives Mineflayer bots against the compose server to produce *real*
plugin telemetry at scale. An X-Ray bot is not a simulation: it reads ore positions from chunk
data it could never legitimately see, which is exactly what a cheating client does. The legit
bot only reacts to blocks with an open face.

```bash
docker compose -f infra/docker-compose.yml up -d paper       # fixed seed, peaceful, bots are ops
JEVCRAFT_HMAC_SECRET=change-me-local-only   pnpm jevcraft record --scenario all --count 5 --budget-seconds 240 --out datasets/recordings/batch1.jsonl
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/batch1.jsonl
pnpm jevcraft label-runs --raw infra/paper/data/plugins/JevCraft/data --manifest datasets/recordings/batch1.jsonl --out datasets/labels/batch1.jsonl
# optional: efficiency.baselinePercentile against the legit sessions you already have
pnpm jevcraft baseline --features datasets/features/batch1.jsonl --labels datasets/labels/batch1.jsonl --out datasets/baselines/legit.json
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --baseline datasets/baselines/legit.json --out datasets/features/batch1.jsonl
pnpm jevcraft evaluate datasets/features/batch1.jsonl --out datasets/decisions/batch1.jsonl
pnpm jevcraft report --decisions datasets/decisions/batch1.jsonl --labels datasets/labels/batch1.jsonl
```

Scenarios: `legit-branch-mining`, `xray-direct`, `xray-detour`, `xray-humanized`
(`packages/bot-recorder/src/scenarios.ts`). Each run joins as `jevbotNN`, teleports to a fresh
64-block cell, mines for the budget, and leaves; the manifest records the bot's pseudonymous id
(same HMAC as the plugin, computed from the offline UUID and the secret) and the time window, so
`label-runs` can attach ground truth to the plugin's sessions without the plugin ever writing names.
Mineflayer speaks protocol 26.1; the server runs ViaVersion + ViaBackwards so it can join 26.2.

Another world: `JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2 docker compose -f infra/docker-compose.yml up -d paper`
(the seed only applies when a level folder is first created). `scripts/session-table.mjs` and
`scripts/gate-sweep.mjs` print per-session tables and sweep the approach gate over archived
decisions without API calls.

Bots move and look more regularly than people (`--human-noise` softens this). Treat bot data as
the bulk set for wiring, extractor and threshold work, and keep a small human-played set for the
final false-positive check (handoff spec §22).

Admin commands (`jevcraft.admin`, default op): `/jevcraft status`, `/jevcraft session <player>`,
`/jevcraft flush <player>`, `/jevcraft metrics`. Config: `plugin/src/main/resources/config.yml`.
The JSONL line format is mirrored by `RawTelemetryEventSchema` in `@jevcraft/schema`, and
`datasets/fixtures/raw/sample.jsonl` (written by the plugin's MockBukkit test) is validated by it.

Deviations from the handoff spec, recorded in `docs/superpowers/plans/2026-09-19-paper-telemetry-plugin.md`:
Paper `26.2.build.124-stable` requires Java 25 (spec said 21), and commands are declared in
`plugin.yml` rather than `paper-plugin.yml`.

## Benchmark against existing heuristics

`jevcraft benchmark` runs the heuristics existing anti-X-Ray tooling relies on (ore ratio, reveal
ratio, efficiency percentile, reveal pace, straight-line approach, a hand-written combination and
a logistic regression fitted on the development split) against JevCraft on the same labelled
sessions, at the same false-positive ceiling, using archived Jev answers only:

```bash
node scripts/make-splits.mjs --dev-ids datasets/labels/bots-77.jsonl   --features datasets/features/all.jsonl --labels datasets/labels/all.jsonl   --decisions datasets/decisions/all-gated.jsonl --out-dir datasets/splits

pnpm jevcraft benchmark   --features datasets/splits/holdout-features.jsonl   --labels   datasets/splits/holdout-labels.jsonl   --decisions datasets/splits/holdout-decisions.jsonl   --dev-features datasets/splits/dev-features.jsonl   --dev-labels   datasets/splits/dev-labels.jsonl   --dev-decisions datasets/splits/dev-decisions.jsonl   --max-fpr 0.072 --out reports/benchmark-holdout.md
```

Thresholds are chosen on the development split and frozen; without `--dev-*` the report says in
its header that its numbers describe fit rather than generalisation.

Against greedy X-Ray bots there is no advantage: counting ore already solves that case. The
interesting case is a cheater who dilutes their ore ratio into the legitimate range. Against 15
such sessions (`xray-throttled`), at thresholds fixed on the development split:

| Detector | Caught |
| --- | --- |
| approach directness (from this project's telemetry) | 12 / 15 |
| JevCraft policy | 10 / 15 |
| ore ratio, the dominant existing heuristic | **0 / 15** |

So the contribution is the approach telemetry, not the language model: a hand-written directness
rule does as well as Jev on this data. See `docs/evasion.md` for the full result and
`docs/benchmark.md` for the method.

## Operating cost, and who pays it

Measured over 156 live evaluations (`xray-v6`, `jev-1.13.0`): **1,402 input tokens and 137 output
tokens per session window**, with a spread of under 3%. TypeSafe bills input only, at $0.042 per
million tokens, and output is free, so one judged window costs about **$0.000059**, or roughly
17,000 judged windows per dollar.

Call volume follows underground mining time, not player count directly. The plugin opens a session
after 10 stone breaks at or below y=40 or on any target-ore reveal, closes it after 120 s idle, and
the extractor cuts it into 15-minute windows. The one human player recorded so far produced 11
windows in 66 minutes of mining, so roughly **10 windows per player-hour of mining**. That single
82-minute sample is the weakest number in this estimate and it scales everything linearly.

Monthly cost, after the free local `enoughEvidence` gate drops 16% of windows:

| Server profile | Player-hours/month | 25% underground | 50% underground | Per year at 50% |
| --- | --- | --- | --- | --- |
| Friends only, 4 players for 4 h/day | 480 | $0.06 | $0.12 | $1.42 |
| Small public, 5 average concurrent | 3,650 | $0.45 | $0.90 | $11 |
| Small public, 10 average concurrent | 7,300 | $0.90 | $1.81 | $22 |
| Busy, 30 average concurrent | 21,900 | $2.71 | $5.42 | $65 |
| Large, 100 average concurrent | 73,000 | $9.03 | $18 | $217 |

**These are small absolute numbers, and that does not make them cheap for this audience.** Most
Paper servers are run by one person paying for hosting out of their own pocket, and the
alternatives they are choosing between are not metered:

- Paper ships anti-X-Ray obfuscation in the box, for free, and Orebfuscator is open source. Those
  prevent rather than detect, but they cost nothing per month and need no account.
- The established behavioural anti-cheat plugins are free or a one-time purchase. A recurring bill
  is a different commitment, even a small one.
- The bill tracks player activity, so the operator cannot cap it in advance. A busy weekend or a
  bot raid raises it.
- It requires a payment method and an external account, which a hobbyist running a server for
  friends may simply decline to set up.

So the honest framing is that inference price is not the obstacle; the billing model is. Any
deployment aimed at individual operators needs a hard spend cap, sampling, or a free tier, not a
cheaper model.

Because output is free and input is the only cost, the usual savings do not apply. Trimming the
prompt or pre-filtering which windows to send buys very little: at 100 average concurrent, adding a
cheap pre-filter on top of the evidence gate saves about $2.26 a month. Spending more is the
better trade. Evaluating every window costs $11 a month at that size, and repeating each
evaluation three times to damp the variance in Jev's probabilities costs $32.

## Packages

| Package | Responsibility |
| --- | --- |
| `@jevcraft/schema` | Zod contracts: `MiningSessionFeatures`, `DecisionRecord`, `SessionLabel` |
| `@jevcraft/jev-evaluator` | `xray-v1` question set, TypeSafe SDK backend, mock backend, decision policy |
| `@jevcraft/eval-runner` | Label join, metrics, Markdown report |
| `@jevcraft/feature-extractor` | Raw plugin JSONL -> `MiningSessionFeatures` (spec §9 definitions; 15-min windows) |
| `@jevcraft/scenario-generator` | Feature-level synthetic sessions from `scenarios/*.json` (spec §13A) |
| `@jevcraft/bot-recorder` | Mineflayer bots that play legit / X-Ray scenarios on the compose server (spec §13B) |
| `@jevcraft/cli` | `pnpm jevcraft extract` / `evaluate` / `report` / `generate` / `record` / `label-runs` |

## How a session is judged

One request per mining session. Jev is asked four independent questions:

| Key | Type | Meaning |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence` with a full probability distribution and a confidence |
| `hidden_information_use` | noul | P(player acted on hidden ore-location information) |
| `route_naturalness` | score 0..4 | 0 = highly unnatural, 4 = strongly natural (`normalized = score / 4`) |
| `evidence_sufficiency` | noul | P(enough evidence to classify) |
| `approach_targeting` (v6+) | noul | P(movement before reveals was a deliberate approach, judged from `hiddenOreApproach` only) |

Question sets are versioned (`--questions xray-v1` … `xray-v6`, default v6) and the version is
stored on every decision record, so sets can be compared on the same dataset. See
`docs/baselines/README.md` for how each version was chosen.

The policy (`packages/jev-evaluator/src/policy.ts`) turns these into
`insufficient_evidence` / `high_priority_review` / `review` / `no_action`.
Thresholds are provisional and must be tuned from labeled data.
`confidence` is a statistic of the distribution shape and is not `P(likely_xray)`.

## Data hygiene

- Missing values are `null`, never `0`.
- Player ids must be pseudonymous. No real UUIDs, names, chat, or IPs in any dataset.
- `datasets/private/`, `datasets/decisions/`, and `reports/` are ignored by Git.
- Fixtures under `datasets/fixtures` test the wiring; they are not proof of accuracy.

## Development

```bash
pnpm check        # lint + typecheck + test
pnpm format       # apply Biome formatting
```

CI runs the same commands plus a mock evaluation. Live Jev calls are never made in CI.

## License

MIT. See `LICENSE`.
