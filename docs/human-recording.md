# Recording sessions played by a person

Every X-Ray session in the corpus so far was produced by a bot, and so was nearly every legitimate
one. A model that separates them may be reading how the bots move rather than whether the player
knew where the ore was. Sessions played by a person, with and without X-Ray, are the only way to
tell those apart.

This is done on the local recording server only. An X-Ray client on a public server breaks that
server's rules.

## What is needed

| | |
|---|---|
| Server | the compose Paper 26.2 server, `docker compose -f infra/docker-compose.yml up -d paper` |
| Client | Minecraft Java Edition 26.2 or 26.3, no mods. ViaVersion on the server lets a 26.3 client join; the sessions of 2026-09-20 were played that way |
| X-Ray | a resource pack that makes stone and deepslate transparent, for example Xray Ultimate 5.4.2, which declares support for 26.0 and later |
| Anti-xray | off. `infra/paper/data/config/paper-world-defaults.yml` has `anti-xray.enabled: false`; with it on, the pack shows fake ore |

The server listens on `127.0.0.1:25565` and runs in offline mode, so the client has to be on the
same machine. The player id in the telemetry is derived from the player name, so use the same
name for every session.

A resource pack is enough. It is also the most common way X-Ray is used in practice, because it
needs no mod loader. A Fabric X-Ray mod for 26.2 works the same way as far as the server can see.

Ore in a transparent world is hard to see in the dark. Give the player night vision along with the
tools:

```sh
docker exec infra-paper-1 rcon-cli give <name> netherite_pickaxe
docker exec infra-paper-1 rcon-cli give <name> cooked_beef 64
docker exec infra-paper-1 rcon-cli effect give <name> night_vision infinite
```

## One session

1. Pick the kind of session and start the helper. It notes the time.

   ```sh
   node scripts/human-session.mjs start --name <name> --kind xray-detour
   ```

2. For an X-Ray kind, enable the resource pack. For a legitimate kind, disable it.
3. Join the server and mine for 10 to 15 minutes, below y = 40.
4. Leave the server, then run `node scripts/human-session.mjs stop`. It appends one line to
   `datasets/recordings/human-<name>.jsonl`.

Leave the server between sessions. The plugin closes a session when the player leaves, and one
session must not contain two kinds of play.

## Kinds

| Kind | What to do | Label |
|---|---|---|
| `legit-branch` | branch mining: a main tunnel with side branches | legit / branch_mining |
| `legit-cave` | explore caves and mine what is visible | legit / cave_mining |
| `xray-direct` | go straight to each ore | known_cheat / direct_xray |
| `xray-detour` | take a side turn or wander before each ore | known_cheat / detour_xray |
| `xray-throttled` | dig ordinary tunnel between ores so the ore rate looks normal | known_cheat / throttled_xray |
| `xray-free` | try not to get caught, any way you like | known_cheat / mixed |

`xray-free` is the one that matters most. The other three reproduce what the bots were told to do;
this one is what a person comes up with.

## How many

| | Sessions | Play time |
|---|---|---|
| legitimate, both kinds | 10 to 20 | 2.5 to 5 hours |
| X-Ray, all kinds | 10 to 20 | 2.5 to 5 hours |

The same person plays both sides. If one person plays only the X-Ray sessions, the model can
separate the classes by recognising the player.

Mine in a different place each session. A session that starts in tunnels left by the previous one
meets ore that is already exposed.

## Labelling

```sh
pnpm jevcraft label-runs \
  --raw infra/paper/data/plugins/JevCraft/data \
  --manifest datasets/recordings/human-<name>.jsonl \
  --out datasets/labels/human-<name>.jsonl
```

The label is what the player said they were doing. Nothing in the telemetry is used to decide it.

## Access

New sessions played by a person are recorded as `sealed` in `datasets/access.json` and are read
once, by `scripts/confirm-frozen.mjs`, after the questions are frozen. See `datasets/ACCESS.md`.

The 11 sessions recorded on 2026-09-20 are all legitimate and all `spent`. Five of them contain an
ore reveal. They can be reported on and cannot be used to decide anything.

## Limits

- One player is one style of play. Results from a single person say little about players in
  general.
- The player knows they are being recorded, and knows what the detector looks at if they have read
  this repository.
- A label of `known_cheat` means X-Ray was enabled for the session, not that every ore in it was
  found with X-Ray.
