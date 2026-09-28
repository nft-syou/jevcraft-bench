# Looking for data we did not record ourselves

The legitimate half of this corpus is 63 bot sessions and 11 from a single human player. That is
the weakest thing about every false-positive rate on this page and in `benchmark.md`, and the
obvious fix is to borrow real human mining from somewhere. This records what was checked, so the
next person does not repeat it.

## VPT contractor demonstrations: usable, and the correction to this page

**Verdict: OpenAI's VPT contractor data does carry world coordinates. An earlier version of this
page said it did not, on the assumption that it was MineRL-shaped. That was wrong, and it was
caught by a second opinion rather than by re-reading the documentation.**

Every tick of a [VPT](https://github.com/openai/Video-Pre-Training) action file carries:

```json
"yaw": -112.35, "pitch": 8.10,
"xpos": 841.36, "ypos": 63.0, "zpos": 24.96,
"tick": 0, "milli": 1649575088006,
"inventory": [...], "stats": {...}
```

`stats` is the full Minecraft statistics block, which means `minecraft.mine_block:<block>` gives a
per-block-type cumulative counter. Blocks broken and valuable ore mined therefore come straight
out of the record, with no world save and no block-break events needed.

The **10.x index is the Obtain Diamond Pickaxe task**, which is humans mining:
`https://openaipublic.blob.core.windows.net/minecraft-rl/snapshots/all_10xx_Jun_29.json`, 5,661
segments of five minutes each, downloaded anonymously from the same blob store. The repository is
MIT. Some segments listed in the index were never uploaded and return an XML error; the README
warns about this.

`scripts/vpt-ingest.mjs` turns a segment into the counting features. On 55 downloaded segments,
35 of which clear a floor of 60 blocks broken, 120 seconds and half the time underground:

| Valuable ore per 100 blocks broken | n | median | p90 | max | at or above 4.13 |
| --- | --- | --- | --- | --- | --- |
| VPT human contractors | 35 | 0.00 | 1.90 | 8.00 | 1 (2.9%) |
| This project's legitimate sessions | 71 | 0.33 | 2.45 | 8.26 | 5 (7.0%) |

The distributions agree, and the real humans sit slightly *lower*. So the bot-heavy legitimate
class here was not flattering its own false-positive rate; if anything it was conservative.

The floor is not optional. VPT segments are cut at five minutes regardless of what the player is
doing, so a segment that begins inside a vein reports an absurd ratio: the worst unfiltered value
is 75.0, from 39 seconds and 8 blocks broken. Ten of the 55 fall under 60 blocks.

**What VPT cannot do.** It has no cheaters, so the positive class must still be recorded here. And
it cannot support the approach features: hidden-ore first exposure needs the surrounding blocks,
which the record does not carry, and ore position has to be estimated by casting a ray along the
player's view at the tick their counter increments. Mixing VPT sessions into an approach-feature
experiment would let a detector separate the classes on pipeline artefacts rather than behaviour.
It belongs in the counting comparison and nowhere else.

## MineRL: downloadable, and unusable here

**Verdict: the data exists, is MIT licensed, and does not contain player coordinates.**

The original mirrors are gone; the maintainers put copies on
[Zenodo record 12659939](https://zenodo.org/records/12659939). Checked 2026-09-27:

| | |
| --- | --- |
| `MineRLObtainDiamond-v0.zip` | 3.65 GB, HTTP 206 on a range request, valid ZIP |
| Contents | 122 human trajectories, each `metadata.json`, `recording.mp4`, `rendered.npz` |
| Licence | MIT |

`ObtainDiamond` is humans mining for diamond, which is exactly the population we are missing. The
archive's central directory and two member files were read over HTTP without downloading the
3.6 GB, and `rendered.npz` holds 36 arrays:

- actions: `attack`, `camera`, `forward`, `back`, `left`, `right`, `jump`, `sneak`, `sprint`,
  `place`, `craft`, `nearbyCraft`, `nearbySmelt`, `equip`
- observations: inventory counts per item, `equipped_items.mainhand.*`, `reward`

**There is no world position.** The observation is the video frame in `recording.mp4`; the state
arrays never carry x, y, z. Every feature this project computes needs the player's position
relative to a specific ore block, so directness, detour ratio and aim alignment cannot be derived,
and hidden-ore first exposure cannot be detected at all without block coordinates.

Two workarounds were considered and rejected. Dead reckoning from the action stream accumulates
error through collisions, water, falls and lag, and directness is exactly the quantity that error
destroys. Recovering coordinates from 3.6 GB of video is a research project of its own. MineRL is
also Minecraft 1.11-era against our 26.2, so ore distribution and world generation differ.

## HeapCraft: the right shape, availability unknown

[HeapCraft](https://cgl.ethz.ch/publications/papers/paperMul15d.php) (ETH Zurich, 2015) is
server-side telemetry from **43 servers, 908 players, 3451 player-hours**. That is the same kind of
data this plugin produces, at a scale we cannot reach alone. The papers say data is available to
researchers on request rather than by download, it is ten years old, and whether the records carry
block-level coordinates is not established here. Worth an email; not worth planning around.

## Everything else that was checked

All of these were looked at on 2026-09-27 and none of them carries server-side world coordinates,
which is the one field that decides whether the data is usable here.

| Source | What it is | Why it does not work |
| --- | --- | --- |
| [MineDojo](https://docs.minedojo.org/sections/getting_started/data.html) | YouTube video, Reddit posts, wiki text | No game state at all |
| OpenAI contractor data (VPT) | Video plus action sequences, same shape as MineRL | No world position, for the same reason |
| [pixelLOG](https://github.com/NMIL230/nmil-p-mc-pixelLOG) | Spigot plugin, MIT, logs coordinates and target block | A collection tool, not a dataset. The same category as this project's own plugin |
| [WAT-mod](https://github.com/AIP21/WAT-mod) | Mod that logs every player's position | Also a tool, and positions only, no block events |
| [BEACON](https://huggingface.co/datasets/beacon-gui/BEACON-Dataset) | Behavioural fingerprints, CC-BY-4.0 | Valorant, not Minecraft |
| [Minecraft Screenshots](https://www.kaggle.com/datasets/sqdartemy/minecraft-screenshots-dataset-with-features) | About 6,000 screenshots | Images only |

pixelLOG is worth knowing about for a different reason: it is an independent, actively maintained
Spigot plugin recording much the same thing this one does, under MIT. If this project ever wants
its telemetry format to be something other than a private convention, that is the obvious thing to
compare notes with.

## What does not exist

No public dataset of labelled Minecraft cheating was found. The labelled cheat-detection datasets
that do exist are first-person shooters and target aimbots and triggerbots, for example
[NVlabs/deep-anticheat](https://github.com/NVlabs/deep-anticheat) and
[Cheating in Multiplayer Online Games: a Dataset](https://arxiv.org/html/2606.06013v1). Neither the
task nor the telemetry transfers.

That absence is why the bot adversaries in `packages/bot-recorder` exist, and it is the reason the
positive class here is scenario-assigned rather than observed.

## Where that leaves the legitimate class

Recording more human play ourselves remains the only confirmed route. The plugin runs, and
`jevcraft try` gives a volunteer their own result in one command, so the cost per additional
participant is an hour of their time rather than any engineering.
