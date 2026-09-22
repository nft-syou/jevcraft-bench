# JevCraft

[![CI](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](.node-version)
[![Paper](https://img.shields.io/badge/paper-26.2%20%C2%B7%20java%2025-orange)](plugin/)
![Shadow mode](https://img.shields.io/badge/shadow%20mode-never%20bans%20or%20kicks-8250df)
![Corpus](https://img.shields.io/badge/corpus-156%20labelled%20sessions-informational)

[English](README.md) · [日本語](README.ja.md) · **简体中文** · [한국어](README.ko.md) · [Español](README.es.md)

> 本文是译文。如有出入，以[英文版](README.md)为准。

面向 Minecraft (Paper) 服务器的行为式反作弊研究台。挖矿会话的遥测数据被压缩成一个小的特征对象，由 TypeSafe Jev 回答若干带类型的问题，结果再离线地对照已标注的会话打分。

标签来自场景指派，而不是人工对观察到的作弊所作的判断：一个会话被算作 X-Ray，是因为产生它的机器人当时在跑 X-Ray 场景；被算作正常，是因为它来自正常场景或真人玩家。没有人看过录像再下结论。

本仓库是概念验证。它**从不**封禁、踢出或回滚玩家。它能产生的最强结果，只是一次人工复核请求。

## 现状

阶段 0 到 3 已实现：离线纵切、Paper 遥测插件、特征提取器，以及在固定种子世界上的真实录制。语料为跨两个世界种子的 **156 个已标注会话**，来自 Mineflayer 机器人和一名真人玩家。

![一次方块破坏如何变成一次复核请求](docs/images/pipeline.svg)

插件从不调用 Jev API；评估是针对插件写出的 JSONL 的独立离线步骤。原始规格见 `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`，当前结果见 `docs/evasion.md`。

## 环境要求

- Node.js 24 (`.node-version`)
- pnpm（版本固定在 `package.json` 的 `packageManager`）
- 可选：进行实时评估时，在 `TYPESAFE_API_KEY` 中放入 TypeSafe 的 API 密钥

## 快速开始

```bash
pnpm install
pnpm test
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
```

没有 `TYPESAFE_API_KEY` 时，CLI 会使用确定性的 mock 后端，并在 stderr 上说明这一点。判定结果写入 `datasets/decisions/<input>.jsonl`（不纳入 Git）。

### 实时评估

```bash
cp .env.example .env   # 然后把密钥填进 TYPESAFE_API_KEY
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

`pnpm jevcraft` 会在 `.env` 存在时读取它（Node 的 `--env-file-if-exists`）；导出的环境变量 `TYPESAFE_API_KEY` 同样有效。密钥只从环境变量读取。切勿提交。

### 评估报告

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

生成 `reports/fixtures.md`，内含混淆矩阵、Precision / Recall / **FPR** / FNR / F1、对 `P(likely_xray)` 的阈值扫描、按子类型与置信度区间的分解、延迟分位数、token 合计，以及误报与漏报清单。

### 增加试验次数：重复与合成会话

```bash
# 同样的 5 个 fixture，各评估 10 次，用来衡量 Jev 回答的方差
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --repeat 10 --out datasets/decisions/fixtures-x10.jsonl

# 7 个场景 x 20 个合成会话（按种子确定），随后评估并生成报告
pnpm jevcraft generate scenarios --count 20 --seed 1   --out-features datasets/generated/seed1-features.jsonl --out-labels datasets/generated/seed1-labels.jsonl
pnpm jevcraft evaluate datasets/generated/seed1-features.jsonl --backend typesafe --out datasets/decisions/seed1.jsonl
pnpm jevcraft report --decisions datasets/decisions/seed1.jsonl --labels datasets/generated/seed1-labels.jsonl
```

此时报告还会包含重复方差表和对 `minEvidenceSufficiency` 的扫描。真实运行的归档结果放在 `docs/baselines/`。

## Paper 插件（阶段 2）

`plugin/` 是一个 Paper 服务器插件，仅在影子模式下记录：

- 采样的移动（时间 / 距离 / 转角三种触发条件，带一个 90 秒环形缓冲，会话开始时冲刷写出）
- 挖矿会话内的方块破坏
- 隐藏贵重矿石的首次暴露（六邻面规则，规格 §7）
- 挖矿会话的边界（地下石块破坏或任一矿石暴露开启；空闲超时、登出、切换世界、远距离传送、切换游戏模式、`/jevcraft flush` 结束）

所有内容经由一个有界队列和一个守护写入线程写入 `plugins/JevCraft/data/<serverRunId>.jsonl`；队列满时丢弃并计数，绝不阻塞 tick。玩家 ID 是由 `JEVCRAFT_HMAC_SECRET` 派生的 `hmac-sha256:<hex>`；原始 UUID 和名称从不写出。插件从不封禁、踢出或回滚。

> **compose 里的服务器是给隔离实验台用的，不是给公网用的。** 它以 `ONLINE_MODE: "false"` 运行，因此不校验连接者身份；同时它把 OP 授予 16 个固定的离线 UUID，好让录制机器人可以传送和 `/fill`。任何能访问该端口的人都能以 `jevbotNN` 身份加入并取得这些权限。正因如此它绑定在 `127.0.0.1`。不要把它发布到公网接口，也不要把这份 compose 文件挪用到真实服务器上。

**所有 JVM 相关工作都在 Docker 中进行；宿主机不安装 JDK。**

```bash
pnpm plugin:test     # docker compose -f infra/docker-compose.yml run --rm gradle test
pnpm plugin:build    # ... gradle build  -> plugin/build/libs/JevCraft-<version>.jar
docker compose -f infra/docker-compose.yml up paper   # 挂载 jar 的本地 Paper 服务器
```

把一次服务器运行转成特征并评估：

```bash
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/run-001.jsonl
pnpm jevcraft evaluate datasets/features/run-001.jsonl --out datasets/decisions/run-001.jsonl
```

`extract` 按会话归组事件，把超过 `--window-minutes`（默认 15）的会话切成 `<sessionId>:w<n>` 窗口，并计算规格 §9 的特征：从每次隐藏矿石暴露之前 60 秒的移动得出直线度 / 绕路比 / 视线一致度，从破坏几何得出分支挖矿可能性与隧道方向，从相邻开放面得出洞穴暴露度，以及破坏节奏和轨迹覆盖率。未观测到的一律为 `null`。

### 机器人录制（不用真人的阶段 3）

`@jevcraft/bot-recorder` 驱动 Mineflayer 机器人在 compose 服务器上跑，从而大量产出*真实的*插件遥测。X-Ray 机器人不是模拟：它从正当途径绝无可能看到的区块数据中读取矿石坐标，这正是作弊客户端在做的事。正常机器人只对拥有开放面的方块作出反应。

```bash
docker compose -f infra/docker-compose.yml up -d paper       # 固定种子、和平模式、机器人为 OP
JEVCRAFT_HMAC_SECRET=change-me-local-only   pnpm jevcraft record --scenario all --count 5 --budget-seconds 240 --out datasets/recordings/batch1.jsonl
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/batch1.jsonl
pnpm jevcraft label-runs --raw infra/paper/data/plugins/JevCraft/data --manifest datasets/recordings/batch1.jsonl --out datasets/labels/batch1.jsonl
# 可选：用已有的正常会话建立 efficiency.baselinePercentile 的基准
pnpm jevcraft baseline --features datasets/features/batch1.jsonl --labels datasets/labels/batch1.jsonl --out datasets/baselines/legit.json
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --baseline datasets/baselines/legit.json --out datasets/features/batch1.jsonl
pnpm jevcraft evaluate datasets/features/batch1.jsonl --out datasets/decisions/batch1.jsonl
pnpm jevcraft report --decisions datasets/decisions/batch1.jsonl --labels datasets/labels/batch1.jsonl
```

场景有 `legit-branch-mining`、`xray-direct`、`xray-detour`、`xray-humanized`、`xray-throttled`（`packages/bot-recorder/src/scenarios.ts`）。最后一个会刻意把矿石比率压在正常区间内；见 `docs/evasion.md`。

每次运行以 `jevbotNN` 身份加入，传送到一块全新的 64 格区域，按预算时长挖矿，然后离开；清单文件记录机器人的假名 ID（与插件相同的 HMAC，由离线 UUID 和密钥计算）以及时间窗口，因此 `label-runs` 能在插件从不写出名称的前提下，把真值附加到插件的会话上。Mineflayer 使用协议 26.1；服务器运行 ViaVersion + ViaBackwards，所以它能连入 26.2。

换一个世界：`JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2 docker compose -f infra/docker-compose.yml up -d paper`（种子只在首次创建 level 目录时生效）。`scripts/session-table.mjs` 和 `scripts/gate-sweep.mjs` 无需任何 API 调用，即可对归档判定打印逐会话表格并扫描接近门限。

机器人的移动和视角比真人规律（`--human-noise` 可以缓和）。请把机器人数据当作打通链路、调试提取器和确定阈值的主力数据，并保留一小份真人游玩数据用于最终的误报检查（交接规格 §22）。

管理命令（`jevcraft.admin`，默认 OP）：`/jevcraft status`、`/jevcraft session <player>`、`/jevcraft flush <player>`、`/jevcraft metrics`。配置在 `plugin/src/main/resources/config.yml`。JSONL 的行格式由 `@jevcraft/schema` 中的 `RawTelemetryEventSchema` 镜像定义，`datasets/fixtures/raw/sample.jsonl`（由插件的 MockBukkit 测试写出）会用它来校验。

与交接规格的偏差记录在 `docs/superpowers/plans/2026-09-19-paper-telemetry-plugin.md`：Paper `26.2.build.124-stable` 需要 Java 25（规格写的是 21），命令在 `plugin.yml` 而非 `paper-plugin.yml` 中声明。

## 与既有启发式规则的对比基准

`jevcraft benchmark` 把既有反 X-Ray 工具所依赖的启发式规则（矿石比率、暴露比率、效率百分位、暴露速度、直线接近、一个手写组合规则，以及在开发集上拟合的逻辑回归）与 JevCraft 放在同一批已标注会话上、同一误报率上限下运行，并且只使用归档的 Jev 回答。

`datasets/splits2/` 已提交，所以下面这条命令在全新克隆上即可运行，不需要服务器、录制数据或 API 密钥：

```bash
pnpm jevcraft benchmark   --features datasets/splits2/holdout-features.jsonl   --labels   datasets/splits2/holdout-labels.jsonl   --decisions datasets/splits2/holdout-decisions.jsonl   --dev-features datasets/splits2/dev-features.jsonl   --dev-labels   datasets/splits2/dev-labels.jsonl   --dev-decisions datasets/splits2/dev-decisions.jsonl   --max-fpr 0.072 --out reports/benchmark-evasive.md
```

这些划分包含 156 个会话中的 134 个：开发集 77 个，留出集 57 个。剩下的 22 个是确认集，在 `docs/evasion.md` 中单独打分，并刻意排除在本基准之外。`scripts/make-splits.mjs` 可以从完整的特征与判定集合重建划分，但只有真正跑过录制的人才会有那份数据。

阈值在开发集上选定并冻结；不加 `--dev-*` 时，报告会在页首声明其数字描述的是拟合而非泛化。

面对贪婪的 X-Ray 机器人没有任何优势：单是数矿石就能解决。有意思的是那种把自身数字保持得很平常的作弊者，`xray-throttled` 就是这种作弊者。它和其他 X-Ray 机器人一样从区块数据读取矿石坐标，然后在目标之间挖普通隧道，直到自己的矿石比率回落到正常区间内。

![按会话类型划分的每 100 个破坏方块所采贵重矿石数量分布](docs/images/ore-ratio-distribution.svg)

这招管用。25 个受限会话里没有一个达到矿石比率阈值，而且它们占据的区间比正常挖矿还要窄，因此不存在既能把它们分出来、又不误伤普通玩家的切分点。这种作弊藏不住的，是走向矿石的那段路。

![按检测器与队列划分的受限 X-Ray 会话检出比例](docs/images/throttled-detection.svg)

留出集中的 15 个，正是促使我们给策略加上接近规则的那批会话，所以它们无法用来确认该规则。10 个确认会话是在该规则冻结之后才录制的。

这只是一种规避手段，不是规避的全部。对着你早已知道位置的矿石绕路前进，能像稀释比率瓦解计数那样，同样彻底地瓦解接近规则：

![按 X-Ray 规避风格划分的召回率](docs/images/detector-complementarity.svg)

所以真正的贡献来自接近遥测，而不是语言模型：在这批数据上，一条手写的直线度规则和 Jev 表现相当。完整结果（包括其中有多少是预先登记的）见 `docs/evasion.md`，方法见 `docs/benchmark.md`。

## 运行成本

在 156 次实时评估（`xray-v6`、`jev-1.13.0`）上实测：**每个会话窗口输入 1,402 token、输出 137 token**，离散度不到 3%。TypeSafe 只按输入计费，每百万 token $0.042，输出免费，因此判定一个窗口的成本是 **$0.000059**，大约 1 美元 17,000 个窗口。

调用量取决于地下挖矿时长，而不是玩家数量。插件在 y=40 及以下发生 10 次石块破坏、或出现任一目标矿石暴露时开启会话，空闲 120 秒后关闭，提取器再把它切成 15 分钟的窗口。目前录制到的唯一真人玩家在 66 分钟挖矿中产生了 11 个窗口，即大约**每人每小时挖矿 10 个窗口**。这个来自单次 82 分钟样本的数字是整份估算中最薄弱的一环，而且它会线性地放大整张表。

以下是**按当前代码行为**计算的月度成本，也就是每个窗口都会发送。`evaluate-session.ts` 先调用后端，然后才应用策略，所以 `enoughEvidence` 决定结果却不节省任何调用；一个没有可用证据的会话照样要付费。

| 服务器规模 | 每月玩家小时 | 地下占比 25% | 地下占比 50% | 50% 时的年度成本 |
| --- | --- | --- | --- | --- |
| 仅好友，4 人每天 4 小时 | 480 | $0.07 | $0.14 | $1.70 |
| 小型公开服，平均同时在线 5 | 3,650 | $0.54 | $1.07 | $13 |
| 小型公开服，平均同时在线 10 | 7,300 | $1.07 | $2.15 | $26 |
| 繁忙服，平均同时在线 30 | 21,900 | $3.22 | $6.45 | $77 |
| 大型服，平均同时在线 100 | 73,000 | $11 | $21 | $258 |

这笔费用是持续性的按量计费，并且跟随玩家活动波动，因此无法事先封顶。服务器如今采用的 X-Ray 对策都不是按量计费的：Paper 自带 anti-X-Ray 混淆，Orebfuscator 是开源的，成熟的行为式反作弊插件要么免费、要么一次性买断。

由于输出免费，降低成本就意味着减少调用或缩短提示词。两者都尚未实现。在平均同时在线 100、地下占比 25% 的条件下，各自的价值是：

| | 每月 |
| --- | --- |
| 发送每个窗口（当前行为） | $11 |
| 跳过本地已判定 `enoughEvidence` 不通过的窗口（占 16%） | $9.03 |
| 再加上基于直线度与矿石比率的廉价预筛（在 134 个会话的集合上保持 59/59 的检出） | $6.77 |
| 每个窗口评估三次以抑制回答方差 | $32 |

## 软件包

| 软件包 | 职责 |
| --- | --- |
| `@jevcraft/schema` | Zod 契约：`MiningSessionFeatures`、`DecisionRecord`、`SessionLabel` |
| `@jevcraft/jev-evaluator` | `xray-v1` 问题集、TypeSafe SDK 后端、mock 后端、判定策略 |
| `@jevcraft/eval-runner` | 标签关联、指标、Markdown 报告 |
| `@jevcraft/feature-extractor` | 原始插件 JSONL -> `MiningSessionFeatures`（规格 §9 的定义；15 分钟窗口） |
| `@jevcraft/scenario-generator` | 由 `scenarios/*.json` 生成特征层面的合成会话（规格 §13A） |
| `@jevcraft/bot-recorder` | 在 compose 服务器上扮演正常 / X-Ray 场景的 Mineflayer 机器人（规格 §13B） |
| `@jevcraft/cli` | `pnpm jevcraft extract` / `evaluate` / `report` / `generate` / `record` / `label-runs` |

## 一个会话如何被判定

每个挖矿会话发起一次请求。向 Jev 提出五个彼此独立的问题：

| 键 | 类型 | 含义 |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence`，附完整概率分布与置信度 |
| `hidden_information_use` | noul | P(玩家依据隐藏的矿石位置信息行动) |
| `route_naturalness` | score 0..4 | 0 = 极不自然，4 = 非常自然（`normalized = score / 4`） |
| `evidence_sufficiency` | noul | P(证据足以分类) |
| `approach_targeting`（v6 起） | noul | P(暴露之前的移动是刻意接近，仅依据 `hiddenOreApproach` 判断) |

问题集带版本号（`--questions xray-v1` … `xray-v6`，默认 v6），版本会记录在每一条判定记录上，因此可以在同一数据集上比较不同问题集。各版本的选定依据见 `docs/baselines/README.md`。

策略（`packages/jev-evaluator/src/policy.ts`）把这些转换成 `insufficient_evidence` / `high_priority_review` / `review` / `no_action`。`jevcraft repolicy` 能用不同阈值重写归档判定，并把所应用的内容记录在输出旁的 `.meta.json` 中。`confidence` 是关于分布形状的统计量，并不是 `P(likely_xray)`。

阈值取自 77 个会话的开发集，但有一个重要的例外：`reviewApproachTargetingAlone = 0.35` 是在它首次被测量的那批会话已经打过分之后才加上去的。它在那里的效果是假设，不是测量。在规则冻结之后录制的 22 个会话集合上，有该规则时 10 中检出 9，没有时 10 中检出 3。时间线与前后对比见 `docs/evasion.md`。

## 数据卫生

- 缺失值一律为 `null`，绝不用 `0`。
- 玩家 ID 必须是假名。任何数据集中都不得出现真实 UUID、名称、聊天记录或 IP。
- `datasets/private/`、`datasets/decisions/` 和 `reports/` 不纳入 Git。
- `datasets/fixtures` 下的 fixture 用于验证链路打通，不构成准确性的证据。

## 开发

```bash
pnpm check            # lint + typecheck + test
pnpm format           # 应用 Biome 格式化
pnpm figures          # 从 docs/figure-data.json 重绘 docs/images/*.svg
pnpm figures:refresh  # 先从数据集重新计算聚合值，再重绘
```

CI 运行同样的命令，外加一次 mock 评估，并重绘图表。如果已提交的 SVG 与已提交的聚合值不一致，或者徽章和「现状」一节中写的语料规模已经对不上数据，这一步就会失败。CI 从不发起真实的 Jev 调用。

图表是生成物，绝不手工编辑。会话级数据集不纳入 Git，因此 `scripts/make-figures.mjs` 把它的输入保存在 `docs/figure-data.json` 中；该文件已提交，也是 CI 唯一需要的东西。

## 项目文件

| 文件 | 用途 |
| --- | --- |
| `CONTRIBUTING.md` | 如何提交改动，以及改动必须遵守的规则 |
| `CODE_OF_CONDUCT.md` | 社区准则，以及禁止发布可用作弊程序和真实玩家数据的规定 |
| `SECURITY.md` | 如何私下报告漏洞或隐私问题 |
| `CHANGELOG.md` | 有哪些变化，以及哪些结论被撤回、为什么 |
| `CITATION.cff` | 如何引用本研究台 |

## 许可证

MIT。见 `LICENSE`。
