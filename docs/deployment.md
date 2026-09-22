# Running this on a live server

This page is for someone who operates a real Paper server and wants to install the telemetry
plugin on it. Read the first section before the rest: what you get today is narrower than the
project's goal, and installing it under the wrong expectation wastes your disk and your time.

## What you get, and what you do not

**You get a recorder.** The plugin observes mining sessions and writes JSON Lines to disk. That is
all it does on a running server. It is genuinely safe in the sense that matters: it has no code
path that bans, kicks, rolls back, messages a player, or changes the world.

**You do not get a detector.** Nothing calls the Jev API at runtime. There is no scheduler, no
alerting, no review queue, no admin UI, no scoreboard. `evaluation.enabled` in the plugin config
is a placeholder for a sidecar that does not exist. To get a judgement you copy the JSONL to a
machine with the CLI and run the pipeline by hand or from cron, then read the shortlist it prints.

**You do not get proven detection.** On held-out data this project's policy is level with a plain
hand-written rule on approach directness, and behind classic ore-counting on threshold-free
ranking. Its one clear result is negative: session-wide ore counting fails completely against a
cheater who dilutes their ore ratio. See `benchmark.md` and `evasion.md`. Do not install this
expecting it to catch X-Ray today. Install it if you want to collect the telemetry that might make
that possible, or if you want to test the claims on your own server's data.

**It has never run on a public server.** Everything measured so far comes from a local Docker
server with Mineflayer bots and one human player. There is no load test, no soak test, and no
report from anyone else's deployment.

## Before you install

- **Paper 26.2, Java 25.** The plugin targets the Paper API at `26.2.build.124-stable`. Java 21
  will not load it.
- **A secret.** `JEVCRAFT_HMAC_SECRET` must be set in the server process's environment. Player ids
  are `hmac-sha256:<hex>` of the real UUID under this secret. If it is unset the plugin still
  starts: it logs a warning and generates ids that are random for that run, so the same player
  gets a different id after every restart and nothing can be tracked across sessions. Check the
  startup log the first time. If you later change the secret, old and new recordings can no longer
  be joined to the same player.
- **Disk.** See the next section. This is the part that surprises people.
- **A decision about your players.** You are about to record every underground movement of
  everyone who plays on your server, several times a second. The ids are pseudonymous, but you
  hold the secret and the account list, so you can re-identify anyone. Tell your players, in
  whatever way your community expects, and check what your local rules require. This project
  cannot give you legal advice, and it does not ship a consent mechanism or a per-player opt-out.

## Disk, which has no rotation

The writer appends to one file per server run, `plugins/JevCraft/data/run_<timestamp>_<id>.jsonl`.
It never rotates that file, never compresses it, and never deletes anything. A server that stays
up for a month produces one file that grew for a month.

Measured on the one human player recorded so far: **6.71 MiB per player-hour of mining**, at 536
bytes per line, dominated by movement samples. Compressing with gzip gives about 10.2x, so 0.66
MiB per mining-hour once archived.

Monthly, assuming a quarter of online time is spent underground:

| Server profile | Uncompressed | gzipped |
| --- | --- | --- |
| Friends only, 4 players 4 h/day | 805 MiB | 79 MiB |
| Small public, 10 average concurrent | 12.0 GiB | 1.2 GiB |
| Busy, 30 average concurrent | 35.9 GiB | 3.5 GiB |
| Large, 100 average concurrent | 119.6 GiB | 11.8 GiB |

Those figures scale linearly off a single 83-minute sample, so treat them as an order of
magnitude, not a budget. Two things follow:

- **Set up rotation yourself.** The plugin will not do it. A cron job that gzips and moves files
  older than a day off the server is the minimum.
- **Turn the sampling down if you only want the approach features.** In
  `plugin/src/main/resources/config.yml`, `movementSampleMs` (150), `movementSampleDistance`
  (0.75) and `movementSampleDegrees` (10.0) are what generate the volume. Raising them shrinks
  files and coarsens directness, detour ratio and aim alignment. Nobody has measured how much
  accuracy each step costs, so if you change them, you are off the tested path.
- `undergroundYMax` (40) decides what counts as underground at all. Lowering it records less.

## Install

Take the jar from the GitHub Releases page, or build it yourself. All JVM work runs in Docker, so
building needs no JDK on the machine:

```bash
git clone <this repository>
cd jevcraft-bench
pnpm install
pnpm plugin:build       # -> plugin/build/libs/JevCraft-<version>.jar
```

The plugin is not on Hangar, Modrinth or SpigotMC, and the CLI is not on npm. Nothing here is
distributed through a package manager yet.

Copy the jar into your server's `plugins/`, set the secret in the server's environment, and
restart. On a systemd unit that is an `Environment=` line; with itzg/minecraft-server it is an
entry under `environment:` in your compose file.

```bash
JEVCRAFT_HMAC_SECRET='<a long random string you keep>'
```

Check it came up:

```
/jevcraft status     # sessions currently open
/jevcraft metrics    # events written, events dropped, queue depth
```

`/jevcraft metrics` is the one to watch for the first few days. The writer uses a bounded queue
(`queueCapacity`, 10000) and a daemon thread, and drops lines rather than blocking the server
tick. A non-zero drop count means the disk is not keeping up and your recordings have holes in
them; `trajectoryCoverage` in the extracted features is how you see that damage later.

Other commands: `/jevcraft session <player>` and `/jevcraft flush <player>`. All are gated behind
`jevcraft.admin`, which defaults to operator.

## Getting a judgement out of it

Copy the JSONL somewhere with Node 24 and the repository checked out. Nothing in this step needs
to run on the game server, and the game server never needs network access to TypeSafe.

```bash
pnpm jevcraft extract /path/to/run_*.jsonl --out features.jsonl
pnpm jevcraft evaluate features.jsonl --backend typesafe --out decisions.jsonl
```

`evaluate` is the only step that costs money and the only one that leaves your machine. It sends
the feature object, which contains no names, no chat, and no raw coordinates. Cost is about
$0.000059 per 15-minute session window; see the operating-cost section of the main README for what
that adds up to.

There is no third step. `jevcraft report` requires `--labels`, and on a real server you have no
ground truth to give it, so it is a benchmarking tool rather than an operations one. The shortlist
you actually want is a filter over the decisions:

```bash
node scripts/flagged.mjs decisions.jsonl
node scripts/flagged.mjs decisions.jsonl --min-probability 0.3   # a shorter list
```

```
10 flagged of 22 scored session windows
outcome  P(xray)  hidden  approach  session
review   0.36     0.48    0.59      session_2ca40624-62b4-4aa9-931b-de719ba6b1e1
review   0.33     0.50    0.40      session_e1ee8ea3-1aa6-4c23-ab94-08fa229b3f67
```

Highest suspicion first. Mapping a session id back to an account is your job and needs your own
record of who was online; the plugin deliberately never writes a name.

A weekly cron over yesterday's archived files is a reasonable shape. There is no supported daemon
mode, so write the loop yourself.

## What to do with a `review`

Treat it as a prompt to look, not as a verdict, and nothing in this project is calibrated to your
server. A review outcome means the model, on a feature summary of one 15-minute window, thought
the approach to hidden ore looked deliberate. On the development data the shipped operating point
sits near a 7% false-positive rate, which on a busy server means flagging ordinary players
regularly. Watch the player, check the region, use your own judgement.

Do not automate punishment on this signal. The project refuses to ship that path on purpose, and
the measured accuracy does not come close to justifying it.

## Removing it

Delete the jar and restart. The plugin holds no database, registers no recipes, and changes no
world data, so nothing is left behind inside the world. `plugins/JevCraft/` keeps the config and
whatever JSONL you have not archived; delete the directory if you want the recordings gone.

If you promised your players you would stop recording, deleting the secret matters as much as
deleting the files: without it the pseudonymous ids in any copies you handed out cannot be linked
back to accounts.

## Known limits

- No runtime detection, no alerting, no review queue.
- No log rotation, compression or retention.
- No operations-facing report: `jevcraft report` needs labels you will not have.
- No mapping from a flagged session back to an account; you keep that record yourself.
- No per-player opt-out and no consent mechanism.
- One Paper version, one Java version, no compatibility matrix.
- Never run on a public server; no load or soak testing.
- Detection quality unproven, and level with a hand-written rule on the data that exists.
- Sessions are 15-minute windows; a cheater who mines for five minutes at a time produces windows
  the feature extractor often marks as having insufficient evidence.
