# JevCraft Phase 2: Paper Telemetry Plugin Implementation Plan

> **For agentic workers:** Executed inline in the session that wrote it. Tasks are listed with their tests; full code lives in the repository, not in this document (unlike the Phase 0–1 plan), because every class here is small and the tests are the specification.

**Goal:** A Paper plugin that records sampled movement, block breaks, first exposure of hidden valuable ores and mining-session boundaries to JSONL, pseudonymously, off the main thread, without ever punishing a player.

**Architecture:** Pure-Java core (`ore/`, `session/`, `telemetry/`) with no Bukkit imports, unit-tested with JUnit 5. A thin Bukkit layer (`listener/`, `command/`, `JevCraftPlugin`) adapts events to the core and is integration-tested with MockBukkit. JSONL lines follow the raw telemetry schema in spec §8, mirrored as a Zod schema in `@jevcraft/schema` so the TypeScript side can validate plugin output.

**Tech Stack:** Java 25 (Paper 26.2 requires it; spec said 21 when 1.21 was current), Gradle 9.7.1 (wrapper), Paper API `26.2.build.124-stable`, MockBukkit `mockbukkit-v26.2` 4.116.1, JUnit 5, Gson (provided by Paper at runtime). **All JVM work runs in Docker** (`gradle:9.7.1-jdk25`); no JDK is installed on the developer machine.

**Spec:** `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md` §6 Phase 2, §7, §8, §16, §17, §18, §21 PR 2.

## Global Constraints

- Java 25 / Paper `26.2.build.124-stable` (latest stable at planning time; spec §23 left the pin open). Paper 26.2 refuses JVM < 25. Bukkit world reads happen on the main thread only.
- File I/O, hashing of nothing heavy, and queue draining happen off the main thread. If the queue is full, drop and count; never block the tick.
- No automatic BAN/kick/rollback. Commands are admin-only (`jevcraft.admin`) and read-only except `flush`.
- Player ids are `hmac-sha256:<hex>` using the secret from the env var named in config (`JEVCRAFT_HMAC_SECRET`). Real UUIDs and names never reach the JSONL.
- Missing values are `null`, never 0.
- Server stop, missing secret, missing API key, or writer saturation must not crash the server.
- Target ores default to diamond / deepslate diamond / ancient debris / emerald / deepslate emerald (spec §7).
- `./gradlew test` and `./gradlew build` must pass (inside Docker); CI uses `actions/setup-java` (JDK 25) for the same commands.

## Decisions taken while planning

- **`plugin.yml` instead of `paper-plugin.yml`.** Paper supports both; `plugin.yml` lets commands be declared without the Brigadier lifecycle API, which keeps the command layer trivial for a PoC. Recorded as a deviation from spec §5.
- **Hidden-ore rule.** When block B is broken, each of its 6 neighbours N that is a target ore is checked: N is *hidden* if every face of N other than the one touching B is occluding (`Material.isOccluding()`). Water and air both count as exposure. Because the broken block becomes air, a later break next to the same ore sees an exposed face, so veins are not double-reported without extra state.
- **Movement ring buffer.** Samples are kept per player for the last `trajectoryBufferSeconds`; when a session starts the buffer is flushed to JSONL so the trajectory *before* the first suspicious block is preserved (spec §7 "block break直前"). While a session is active every sample is written directly.
- **Session start rule.** `undergroundStoneBreaksToStart` (default 10) stone-like breaks below `undergroundYMax` (default 40) *or* any target-ore reveal/break.
- **Output file.** `plugins/JevCraft/data/<serverRunId>.jsonl`, one file per server run, append-only.

## File Structure

```text
infra/
  docker-compose.yml            # gradle (build/test) and paper (manual test server) services
  paper/.gitignore              # server data is not committed
plugin/
  settings.gradle.kts
  build.gradle.kts
  gradlew, gradlew.bat, gradle/wrapper/*
  src/main/resources/plugin.yml
  src/main/resources/config.yml
  src/main/java/dev/jevcraft/plugin/
    JevCraftPlugin.java                 # wiring, lifecycle, flush on disable
    config/JevCraftConfig.java          # record parsed from config.yml
    telemetry/PlayerPseudonymizer.java  # HMAC ids
    telemetry/TelemetryEvent.java       # JSON line builder (Gson)
    telemetry/JsonlWriter.java          # bounded queue + daemon writer thread + drop counter
    telemetry/MovementSampler.java      # per-player gating + ring buffer
    ore/BlockAccess.java                # interface: isTargetOre / isOccluding
    ore/HiddenOreDetector.java          # 6-neighbour first-exposure rule
    session/SessionTracker.java         # per-player lifecycle with injected clock
    session/MiningSession.java          # counters + ids
    listener/MiningListener.java        # Bukkit events -> core
    command/JevCraftCommand.java        # /jevcraft status|session|flush|metrics
  src/test/java/dev/jevcraft/plugin/... # one test class per core class + PluginIntegrationTest
packages/schema/src/raw-event.ts        # Zod mirror of the JSONL line
datasets/fixtures/raw/sample.jsonl      # produced by the integration test, validated by TS test
```

## Tasks

1. **Docker + Gradle skeleton.** compose file, `build.gradle.kts` with Paper/MockBukkit/JUnit, wrapper generated inside the container, a smoke test, root scripts `pnpm plugin:test` / `pnpm plugin:build`. Verify: `docker compose run --rm gradle test` passes.
2. **Core: pseudonymizer + JSONL writer.** Tests: stable per secret, different across secrets, prefix format; writer writes lines in order, drops and counts when full, `close()` flushes, `offer` never blocks.
3. **Core: hidden-ore detector.** Tests: hidden ore on each of 6 sides is reported; ore with any other exposed face (air or water) is not; non-target material ignored; several ores around one break are all reported; the face toward the broken block is excluded from the check.
4. **Core: session tracker + movement sampler.** Tests: start after N underground stone breaks; start on ore reveal; no start above `undergroundYMax`; idle timeout ends; teleport beyond distance ends; world change / quit / game-mode change end; fresh id per session; sampler gates on time, distance and angle; ring buffer evicts samples older than the window.
5. **Bukkit layer.** Config record, listener, command, plugin class. MockBukkit integration test: load plugin, build a small stone world with a hidden diamond ore, player breaks 10 stone then the block next to the ore, then quits; the JSONL contains `session_start`, `block_break`, `hidden_ore_reveal`, `session_end` with pseudonymous ids and no raw UUID. Copy that file to `datasets/fixtures/raw/sample.jsonl`.
6. **TypeScript mirror.** `RawTelemetryEventSchema` in `@jevcraft/schema` with a test that validates every line of the sample. README (Docker-only build steps, deviations), CI job for the plugin.
7. **Paper boot check (best effort).** `docker compose up paper` with the built jar; confirm the server logs the plugin enabling; stop. No player interaction is possible here, so this only proves the jar loads on real Paper.

## Out of scope for this plan

- Feature extractor (raw JSONL → `MiningSessionFeatures`). Needed before Phase 3; next plan.
- `/jevcraft review|label|export` (Epic 3 item 18) and any live Jev call from the plugin.
- Packet replay (spec §15).
