# Changelog

Notable changes to the bench and, more importantly, to the claims it makes. Findings are listed
with what was measured and what was later withdrawn, because a research bench that quietly edits
its own conclusions is not worth reading.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has no
released versions yet; everything below is unreleased work on `main`.

## 0.1.1 - 2026-09-22

Patch release. The only functional change is the plugin's declared API version; everything else
below shipped in 0.1.0 and is repeated here because 0.1.0 was the first tag.

- `plugin.yml` now declares `api-version: "26.2"`, matching the `paper-api` it compiles against.
  The 0.1.0 jar declared `1.21`, which asked the server for legacy conversion this plugin has
  never been tested under.

## Unreleased

### Added

- `scripts/vpt-ingest.mjs` and the VPT section of `docs/external-data.md`. OpenAI's VPT contractor
  data does carry world coordinates, and its `stats` block gives per-block mined counters, so the
  counting features come straight out of it. On 35 segments of real humans mining, the ore ratio
  has median 0.00 and p90 1.90 against this project's 0.33 and 2.45, and 1 of 35 crosses the
  ore-ratio threshold against 5 of 71 here. The bot-heavy legitimate class was conservative, not
  flattering.
- `scripts/raw-vs-summary.mjs` and `docs/representation.md`: the same question asked from the
  summarised features and from the raw approach trace. AUC on detour X-Ray goes 0.682 to 0.771,
  which misses the pre-registered +0.10 bar, and a paired bootstrap puts the interval at
  [-0.113, +0.312]. The experiment was underpowered before it ran: resolving a difference that
  size needs about 490 sessions, not 42. Direction is as predicted; nothing is established.
- `scripts/ablation-llm.mjs` and `scripts/ablation-llm-matched.mjs`: the ablation that isolates
  the language model. Once the feature-only baseline is fitted on the same 134 sessions the
  policy's thresholds saw, the two flag **exactly the same** confirmation sessions, 9 of 10, and
  the baseline spends one fewer false positive. The first, pre-registered run showed the policy
  ahead by 7; that gap was an information asymmetry, since the development split holds no
  throttled sessions while the policy's decisive threshold was set after seeing 15 of them. The
  pre-registered script is kept unedited beside the corrected one.

### Added

- `xray-throttled` adversary: an X-Ray bot that digs plain tunnel between targets to hold its ore
  ratio inside the legitimate range. Built because every earlier X-Ray bot was greedy enough for
  ore counting to catch, which made the benchmark unable to show anything.
- `throttled_xray` behaviour subtype, so ratio-diluted sessions stop being pooled with the
  humanized ones in per-style tables.
- `jevcraft benchmark`: classic heuristics, a fitted logistic baseline and the shipped policy on
  the same sessions at a shared false-positive ceiling, with development/held-out splits.
- `scripts/window-count.mjs`: a windowed reveal-count detector, kept as the counter-example to
  "counting cannot work".
- `scripts/ratio-best-case.mjs`: gives the ore-ratio baseline its best possible threshold, chosen
  on the evaluation set, to show the ceiling rather than the threshold is what defeats it.
- Measured operating cost: 1,402 billable input tokens per judged window.

### Changed

- `jevcraft try`: one command that extracts, evaluates and prints the shortlist, so a first run
  needs no API key, no labels and no second tool. Defaults to the mock backend and says loudly
  that mock answers are not judgements.
- A `Dockerfile` and a GHCR image, so an operator can analyse a recording with one `docker run`
  and no Node, pnpm or clone. 312 MB: Alpine, production dependencies only, no pnpm store, and
  without the bot recorder's 390 MB of per-version game data. It runs the analysis commands only.
- `docs/deployment.md`: how to install the plugin on a server someone actually runs, and what it
  will not do there. Measured 6.71 MiB of JSONL per player-hour of mining, with no rotation.
- `scripts/flagged.mjs`: the shortlist of sessions marked for review. `jevcraft report` cannot
  produce one because it requires labels, which a live server does not have.
- A release workflow that attaches the plugin jar to a tagged GitHub Release, so an operator does
  not have to clone and build. Nothing is published to npm, Hangar or Modrinth.

- Default question set is `xray-v6`, which adds `approach_targeting` judged from the approach
  features alone.
- The policy can promote a session to review on strong approach evidence by itself
  (`reviewApproachTargetingAlone`).

### Fixed

- `enoughEvidence` no longer requires an ore reveal, which had been suppressing legitimate
  sessions from evaluation entirely.

### Withdrawn

- **The first advantage claim** ("policy recall 0.789 vs classic 0.702 at FPR 0.065 over 119
  sessions"). The evaluation set contained the policy's own development data. Review found the
  leak; the corrected held-out result is a dead heat with a plain reveal-count rule.
- **"Ore counting catches 100% of greedy bots."** It catches 10 of 14 held-out greedy sessions.
- **"The approach path survives evasion."** It survives ratio dilution. The `detour` bot, which
  wanders on the way to ore it already knows about, defeats the directness rule 0 of 5.
- **"The language model is not what wins"** as a settled conclusion. The Jev approach question and
  the hand-written directness rule flag the same sessions; no ablation has isolated the model's
  contribution either way.

### Corrected

- `docs/external-data.md` said VPT had no world coordinates. It does. The claim came from assuming
  VPT was MineRL-shaped instead of reading its data-format section, and was caught by a second
  opinion rather than by re-checking.

- `plugin.yml` declared `api-version: "1.21"` while the plugin compiles against
  `paper-api:26.2.build.124-stable` and the README requires Paper 26.2. The Paper jar itself
  reports `currentApiVersion: "26.2"`, so that is what it now declares. An older value asks the
  server for legacy conversion the plugin has never been tested under.

- **The operating-cost table assumed a saving the code does not make.** It was computed as if the
  local `enoughEvidence` gate skipped 16% of API calls. `evaluate-session.ts` calls the backend
  first and applies the policy to the answer, so every window is paid for. The table now states
  today's cost, and the gate and pre-filter appear as what they would be worth if implemented.
- **"scored offline against human labels"** in the opening line. Labels are scenario assignments;
  no one reviewed a recording and ruled on it.
- The benchmark example read `datasets/features/all.jsonl`, which is gitignored, so it could not
  run from a clone. It now uses the committed `datasets/splits2/`.
- The compose server publishes Minecraft on loopback only. It is offline-mode and grants operator
  to 16 fixed bot UUIDs, so reaching the port was enough to hold operator.

### Disclosed

- `reviewApproachTargetingAlone = 0.35` was committed after the sessions it was first measured on
  had been scored, so its 10/15 was a hypothesis, not a measurement. A 22-session confirmation set
  recorded after the rule was frozen gives 9/10 against 3/10 for the policy without it. Both
  numbers, and the timeline, are in `docs/evasion.md`.
