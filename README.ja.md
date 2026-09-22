# JevCraft

[![CI](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](.node-version)
[![Paper](https://img.shields.io/badge/paper-26.2%20%C2%B7%20java%2025-orange)](plugin/)
![Shadow mode](https://img.shields.io/badge/shadow%20mode-never%20bans%20or%20kicks-8250df)
![Corpus](https://img.shields.io/badge/corpus-156%20labelled%20sessions-informational)

[English](README.md) · **日本語** · [简体中文](README.zh-CN.md) · [한국어](README.ko.md) · [Español](README.es.md)

> 翻訳版です。内容が食い違った場合は [英語版](README.md) が正です。

Minecraft (Paper) サーバ向けの、挙動ベース不正検知の研究用ベンチです。採掘セッションのテレメトリを小さな特徴量オブジェクトに落とし、TypeSafe Jev に型付きの質問をいくつか答えさせ、その結果をラベル付きセッションに対してオフラインで採点します。

ラベルはシナリオの割り当てであって、観測された不正に対する人手の判定ではありません。あるセッションが X-Ray 扱いなのは、それを生成したボットが X-Ray シナリオで動いていたからです。合法扱いなのは、合法シナリオか人間のプレイヤーが生成したからです。誰も録画を見て判定していません。

このリポジトリは概念実証です。プレイヤーを BAN・キック・ロールバックすることは**一切ありません**。最も強い出力でも「人間によるレビュー要求」です。

## 現状

フェーズ 0 から 3 まで実装済みです。オフラインの縦切り、Paper テレメトリプラグイン、特徴量抽出器、そして固定シードのワールドでの実収録です。コーパスは 2 つのワールドシードにまたがる **156 件のラベル付きセッション**で、Mineflayer ボットと人間プレイヤー 1 名によるものです。

![壊されたブロックがレビュー要求になるまで](docs/images/pipeline.svg)

プラグインが Jev API を呼ぶことはありません。評価はプラグインが書いた JSONL に対する独立したオフライン工程です。元の仕様は `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`、現時点の結果は `docs/evasion.md` を参照してください。

## 必要なもの

- Node.js 24 (`.node-version`)
- pnpm (バージョンは `package.json` の `packageManager` に固定)
- 任意: ライブ評価を行う場合は `TYPESAFE_API_KEY` に TypeSafe の API キー

## クイックスタート

```bash
pnpm install
pnpm test
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
```

`TYPESAFE_API_KEY` が無い場合、CLI は決定的なモックバックエンドを使い、その旨を stderr に出します。判定結果は `datasets/decisions/<input>.jsonl` に書かれます (Git 管理外)。

### ライブ評価

```bash
cp .env.example .env   # その後 TYPESAFE_API_KEY にキーを書く
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

`pnpm jevcraft` は `.env` があれば読み込みます (Node の `--env-file-if-exists`)。環境変数として export された `TYPESAFE_API_KEY` でも動きます。キーは環境変数からしか読みません。絶対にコミットしないでください。

### 評価レポート

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

`reports/fixtures.md` が生成されます。混同行列、Precision / Recall / **FPR** / FNR / F1、`P(likely_xray)` の閾値スイープ、サブタイプ別と確信度帯別の内訳、レイテンシのパーセンタイル、トークン合計、偽陽性と偽陰性の一覧が含まれます。

### 試行回数を増やす: 反復と合成セッション

```bash
# 同じ 5 件のフィクスチャを 10 回ずつ評価し、Jev の回答のばらつきを測る
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --repeat 10 --out datasets/decisions/fixtures-x10.jsonl

# 7 シナリオ x 20 合成セッション (シードごとに決定的)、その後評価とレポート
pnpm jevcraft generate scenarios --count 20 --seed 1   --out-features datasets/generated/seed1-features.jsonl --out-labels datasets/generated/seed1-labels.jsonl
pnpm jevcraft evaluate datasets/generated/seed1-features.jsonl --backend typesafe --out datasets/decisions/seed1.jsonl
pnpm jevcraft report --decisions datasets/decisions/seed1.jsonl --labels datasets/generated/seed1-labels.jsonl
```

このときレポートには反復ばらつきの表と `minEvidenceSufficiency` のスイープも載ります。実走行の結果は `docs/baselines/` に保存してあります。

## Paper プラグイン (フェーズ 2)

`plugin/` は Paper サーバのプラグインで、シャドウモードでのみ以下を記録します。

- サンプリングされた移動 (時間・距離・回転のゲート。セッション開始時に流し込まれる 90 秒のリングバッファ付き)
- 採掘セッション中のブロック破壊
- 隠れていた貴重鉱石の初回露出 (6 近傍ルール、仕様 §7)
- 採掘セッションの境界 (地下の石破壊または鉱石露出で開始。無操作タイムアウト、ログアウト、ワールド変更、遠距離テレポート、ゲームモード変更、`/jevcraft flush` で終了)

すべては境界付きキューとデーモンのライタースレッドを通って `plugins/JevCraft/data/<serverRunId>.jsonl` に書かれます。キューが満杯のときは行を捨てて数え、ティックをブロックすることはありません。プレイヤー ID は `JEVCRAFT_HMAC_SECRET` から導出した `hmac-sha256:<hex>` です。生の UUID や名前は書きません。プラグインが BAN・キック・ロールバックを行うことはありません。

> **compose のサーバは隔離されたベンチ専用で、インターネット向けではありません。** `ONLINE_MODE: "false"` で動くため接続者を検証しません。加えて収録ボットがテレポートや `/fill` を使えるよう、16 個の固定オフライン UUID に OP を付与しています。ポートに到達できる者は誰でも `jevbotNN` として参加し、その権限を得られます。そのため `127.0.0.1` にバインドしています。公開インターフェースに出さないでください。この compose ファイルを実サーバに流用しないでください。

**JVM 関連の作業はすべて Docker 上で実行します。ホストに JDK は入れません。**

```bash
pnpm plugin:test     # docker compose -f infra/docker-compose.yml run --rm gradle test
pnpm plugin:build    # ... gradle build  -> plugin/build/libs/JevCraft-<version>.jar
docker compose -f infra/docker-compose.yml up paper   # jar をマウントしたローカル Paper サーバ
```

サーバの走行を特徴量に変換して評価する:

```bash
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/run-001.jsonl
pnpm jevcraft evaluate datasets/features/run-001.jsonl --out datasets/decisions/run-001.jsonl
```

`extract` はイベントをセッション単位にまとめ、`--window-minutes` (既定 15) より長いセッションを `<sessionId>:w<n>` の窓に分割し、仕様 §9 の特徴量を計算します。各隠れ鉱石の露出前 60 秒の移動から直進度・迂回率・視線の一致、破壊の幾何からブランチマイニング尤度とトンネル方向、隣接面の開放から洞窟露出度、破壊リズム、軌跡カバレッジです。観測できなかったものは `null` です。

### ボット収録 (人間なしのフェーズ 3)

`@jevcraft/bot-recorder` は compose サーバに対して Mineflayer ボットを走らせ、*実物*のプラグインテレメトリを大量に生成します。X-Ray ボットはシミュレーションではありません。正規の手段では見えないチャンクデータから鉱石位置を読みます。これは不正クライアントがやっていることそのものです。合法ボットは開いた面を持つブロックにしか反応しません。

```bash
docker compose -f infra/docker-compose.yml up -d paper       # 固定シード、ピースフル、ボットは OP
JEVCRAFT_HMAC_SECRET=change-me-local-only   pnpm jevcraft record --scenario all --count 5 --budget-seconds 240 --out datasets/recordings/batch1.jsonl
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/batch1.jsonl
pnpm jevcraft label-runs --raw infra/paper/data/plugins/JevCraft/data --manifest datasets/recordings/batch1.jsonl --out datasets/labels/batch1.jsonl
# 任意: すでにある合法セッションから efficiency.baselinePercentile の基準を作る
pnpm jevcraft baseline --features datasets/features/batch1.jsonl --labels datasets/labels/batch1.jsonl --out datasets/baselines/legit.json
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --baseline datasets/baselines/legit.json --out datasets/features/batch1.jsonl
pnpm jevcraft evaluate datasets/features/batch1.jsonl --out datasets/decisions/batch1.jsonl
pnpm jevcraft report --decisions datasets/decisions/batch1.jsonl --labels datasets/labels/batch1.jsonl
```

シナリオは `legit-branch-mining`、`xray-direct`、`xray-detour`、`xray-humanized`、`xray-throttled` です (`packages/bot-recorder/src/scenarios.ts`)。最後のものは意図的に鉱石比率を合法の範囲に収めます。`docs/evasion.md` を参照してください。

各走行は `jevbotNN` として参加し、未使用の 64 ブロック区画にテレポートし、制限時間まで採掘して退出します。マニフェストにはボットの仮名 ID (プラグインと同じ HMAC を、オフライン UUID とシークレットから計算したもの) と時間窓が記録されるので、`label-runs` はプラグインに名前を一切書かせずにセッションへ正解を付与できます。Mineflayer はプロトコル 26.1 を話します。サーバは ViaVersion + ViaBackwards を動かしているので 26.2 に接続できます。

別ワールド: `JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2 docker compose -f infra/docker-compose.yml up -d paper` (シードはレベルフォルダが初めて作られるときにのみ効きます)。`scripts/session-table.mjs` と `scripts/gate-sweep.mjs` は、API 呼び出しなしで保存済み判定からセッション別の表を出し、接近ゲートをスイープします。

ボットは人間より規則的に動き、規則的に視線を向けます (`--human-noise` で緩和できます)。配線・抽出器・閾値の作業にはボットデータを主力として使い、最終的な誤検知チェック用に人間のプレイデータを少量保つ運用にしてください (引き継ぎ仕様 §22)。

管理コマンド (`jevcraft.admin`、既定は OP): `/jevcraft status`、`/jevcraft session <player>`、`/jevcraft flush <player>`、`/jevcraft metrics`。設定は `plugin/src/main/resources/config.yml` です。JSONL の行形式は `@jevcraft/schema` の `RawTelemetryEventSchema` が写し取っており、`datasets/fixtures/raw/sample.jsonl` (プラグインの MockBukkit テストが書いたもの) はこれで検証されます。

引き継ぎ仕様からの逸脱は `docs/superpowers/plans/2026-09-19-paper-telemetry-plugin.md` に記録しています。Paper `26.2.build.124-stable` は Java 25 を要求すること (仕様は 21 と書いていた)、コマンドを `paper-plugin.yml` ではなく `plugin.yml` で宣言していることです。

## 既存ヒューリスティクスとのベンチマーク

`jevcraft benchmark` は、既存の対 X-Ray ツールが依存するヒューリスティクス (鉱石比率、露出比率、効率パーセンタイル、露出ペース、直進度、手書きの組み合わせ、開発分割で学習したロジスティック回帰) を JevCraft と同じラベル付きセッション上で、同じ誤検知率上限のもとで走らせます。保存済みの Jev 回答のみを使います。

`datasets/splits2/` はコミット済みなので、以下はサーバも収録も API キーも無しに、クローンしただけで動きます。

```bash
pnpm jevcraft benchmark   --features datasets/splits2/holdout-features.jsonl   --labels   datasets/splits2/holdout-labels.jsonl   --decisions datasets/splits2/holdout-decisions.jsonl   --dev-features datasets/splits2/dev-features.jsonl   --dev-labels   datasets/splits2/dev-labels.jsonl   --dev-decisions datasets/splits2/dev-decisions.jsonl   --max-fpr 0.072 --out reports/benchmark-evasive.md
```

この分割は 156 件のうち 134 件を含みます。開発 77 件、ホールドアウト 57 件です。残る 22 件は確認用セットで、`docs/evasion.md` で別に採点しており、このベンチマークからは意図的に外しています。`scripts/make-splits.mjs` は完全な特徴量と判定のセットから分割を作り直しますが、それを持っているのは収録を実際に走らせた人だけです。

閾値は開発分割で選んで固定します。`--dev-*` を付けない場合、レポートのヘッダに「この数値は汎化ではなく当てはまりを表す」と書かれます。

貪欲な X-Ray ボットに対しては優位性はありません。鉱石を数えるだけで解けるからです。面白いのは数字を平凡に保つ不正者で、`xray-throttled` がそれです。他の X-Ray ボットと同じくチャンクデータから鉱石位置を読みますが、目標の間に素掘りのトンネルを掘り、鉱石比率を合法の範囲まで戻します。

![セッション種別ごとの、100 ブロックあたり採掘貴重鉱石数の分布](docs/images/ore-ratio-distribution.svg)

これは機能します。間引き型 25 件のうち鉱石比率の閾値に届いたものは 1 件もなく、しかも合法な採掘より狭い帯に収まっています。つまり普通のプレイヤーを巻き込まずに切り分ける閾値が存在しません。この不正が隠せないのは、鉱石までの歩き方です。

![検出器とコホート別の、間引き型 X-Ray セッション検出率](docs/images/throttled-detection.svg)

ホールドアウトの 15 件は、ポリシーの接近ルールを追加する動機になったセッションなので、そのルールを裏付けることはできません。確認用の 10 件は、そのルールを固定したあとに収録したものです。

これは 1 つの回避手口であって、回避一般ではありません。すでに場所を知っている鉱石へ蛇行して向かえば、比率を薄めることがカウントを無力化するのと同じくらい完全に、接近ルールを無力化します。

![X-Ray 回避手口別の再現率](docs/images/detector-complementarity.svg)

つまり貢献しているのは接近テレメトリであって言語モデルではありません。手書きの直進度ルールが、このデータでは Jev と同等に働きます。どこまでが事前登録済みだったかを含む完全な結果は `docs/evasion.md`、手法は `docs/benchmark.md` にあります。

## 運用コスト

156 回のライブ評価 (`xray-v6`、`jev-1.13.0`) で実測: **セッション窓あたり入力 1,402 トークン、出力 137 トークン**、ばらつきは 3% 未満です。TypeSafe は入力のみ 100 万トークンあたり $0.042 で課金し、出力は無料です。したがって 1 窓の判定は **$0.000059**、1 ドルでおよそ 17,000 窓です。

呼び出し量はプレイヤー数ではなく地下採掘時間に従います。プラグインは y=40 以下での石破壊 10 回、または対象鉱石の露出でセッションを開き、無操作 120 秒で閉じます。抽出器はそれを 15 分の窓に切ります。これまでに収録した唯一の人間プレイヤーは採掘 66 分で 11 窓を生んだので、おおよそ**採掘 1 プレイヤー時間あたり 10 窓**です。この 82 分の 1 サンプルが見積もりの中で最も弱い数字であり、表全体を線形にスケールさせます。

**現在のコードの挙動における**月額です。現状はすべての窓を送ります。`evaluate-session.ts` は先にバックエンドを呼び、そのあとでポリシーを適用するため、`enoughEvidence` は結果を決めますが節約はしません。使える証拠が無いセッションにも課金されます。

| サーバ規模 | 月間プレイヤー時間 | 地下 25% | 地下 50% | 50% 時の年額 |
| --- | --- | --- | --- | --- |
| 身内のみ、4 人が 1 日 4 時間 | 480 | $0.07 | $0.14 | $1.70 |
| 小規模公開、平均同接 5 | 3,650 | $0.54 | $1.07 | $13 |
| 小規模公開、平均同接 10 | 7,300 | $1.07 | $2.15 | $26 |
| 繁盛、平均同接 30 | 21,900 | $3.22 | $6.45 | $77 |
| 大規模、平均同接 100 | 73,000 | $11 | $21 | $258 |

この費用は継続的な従量課金で、プレイヤーの活動に連動するため事前に上限を決められません。サーバが現在使っている X-Ray 対策は従量課金ではありません。Paper は anti-X-Ray の難読化を同梱しており、Orebfuscator はオープンソースで、確立した挙動ベース対策プラグインは無料か買い切りです。

出力が無料なので、費用を下げる手段は呼び出しを減らすかプロンプトを短くするかです。どちらも未実装です。平均同接 100、地下 25% の場合、それぞれの価値は次の通りです。

| | 月額 |
| --- | --- |
| 全窓を送る (現状) | $11 |
| ローカルで `enoughEvidence` に落ちる窓 (全体の 16%) を送らない | $9.03 |
| さらに直進度と鉱石比率の事前フィルタを足す (134 件のセットで検出 59/59 を維持) | $6.77 |
| 全窓を 3 回ずつ評価して回答のばらつきを抑える | $32 |

## パッケージ

| パッケージ | 責務 |
| --- | --- |
| `@jevcraft/schema` | Zod の契約: `MiningSessionFeatures`、`DecisionRecord`、`SessionLabel` |
| `@jevcraft/jev-evaluator` | `xray-v1` 質問セット、TypeSafe SDK バックエンド、モックバックエンド、判定ポリシー |
| `@jevcraft/eval-runner` | ラベル結合、指標、Markdown レポート |
| `@jevcraft/feature-extractor` | 生のプラグイン JSONL -> `MiningSessionFeatures` (仕様 §9 の定義、15 分窓) |
| `@jevcraft/scenario-generator` | `scenarios/*.json` からの特徴量レベルの合成セッション (仕様 §13A) |
| `@jevcraft/bot-recorder` | compose サーバ上で合法 / X-Ray シナリオを演じる Mineflayer ボット (仕様 §13B) |
| `@jevcraft/cli` | `pnpm jevcraft extract` / `evaluate` / `report` / `generate` / `record` / `label-runs` |

## セッションの判定方法

採掘セッションごとに 1 リクエストです。Jev には独立した 5 つの質問をします。

| キー | 型 | 意味 |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence` を、完全な確率分布と確信度つきで |
| `hidden_information_use` | noul | P(プレイヤーが隠れた鉱石位置情報に基づいて行動した) |
| `route_naturalness` | score 0..4 | 0 = 極めて不自然、4 = 強く自然 (`normalized = score / 4`) |
| `evidence_sufficiency` | noul | P(分類に足る証拠がある) |
| `approach_targeting` (v6 以降) | noul | P(露出前の移動が意図的な接近だった。`hiddenOreApproach` のみから判断) |

質問セットはバージョン管理されており (`--questions xray-v1` … `xray-v6`、既定は v6)、そのバージョンはすべての判定レコードに保存されるので、同じデータセット上でセット同士を比較できます。各バージョンの選定経緯は `docs/baselines/README.md` にあります。

ポリシー (`packages/jev-evaluator/src/policy.ts`) はこれらを `insufficient_evidence` / `high_priority_review` / `review` / `no_action` に変換します。`jevcraft repolicy` は保存済みの判定を別の閾値で書き換え、適用した内容を出力の隣の `.meta.json` に記録します。`confidence` は分布の形状に関する統計量であって `P(likely_xray)` ではありません。

閾値は 77 件の開発分割から取っていますが、重要な例外が 1 つあります。`reviewApproachTargetingAlone = 0.35` は、最初にそれを測ったセッションがすでに採点されたあとに追加されました。そこでの効果は測定ではなく仮説です。ルール固定後に収録した 22 件のセットでは、このルールありで 10 件中 9 件、なしで 10 件中 3 件を検出しました。経緯と前後比較は `docs/evasion.md` にあります。

## データ衛生

- 欠損値は `null` です。`0` にはしません。
- プレイヤー ID は仮名でなければなりません。どのデータセットにも実 UUID・名前・チャット・IP を入れません。
- `datasets/private/`、`datasets/decisions/`、`reports/` は Git 管理外です。
- `datasets/fixtures` 以下のフィクスチャは配線の検証用です。精度の証拠ではありません。

## 開発

```bash
pnpm check            # lint + typecheck + test
pnpm format           # Biome の整形を適用
pnpm figures          # docs/figure-data.json から docs/images/*.svg を再描画
pnpm figures:refresh  # 先にデータセットから集計値を作り直してから描画
```

CI は同じコマンドとモック評価を実行し、図を再描画します。コミット済みの SVG がコミット済みの集計値からずれている場合、またはバッジと現状節に書かれたコーパス件数がデータと合わなくなった場合、この工程が落ちます。CI から実際の Jev 呼び出しを行うことはありません。

図は生成物であり、手で編集しません。セッション単位のデータセットは Git 管理外なので、`scripts/make-figures.mjs` は入力を `docs/figure-data.json` に保持します。これはコミット済みで、CI が必要とする唯一のものです。

## プロジェクトのファイル

| ファイル | 用途 |
| --- | --- |
| `CONTRIBUTING.md` | 変更の出し方と、変更が満たすべき規則 |
| `CODE_OF_CONDUCT.md` | コミュニティ標準に加え、動作するチート禁止とプレイヤーデータ禁止の規則 |
| `SECURITY.md` | 脆弱性やプライバシー問題を非公開で報告する方法 |
| `CHANGELOG.md` | 何が変わったか、どの主張をなぜ撤回したか |
| `CITATION.cff` | このベンチの引用方法 |

## ライセンス

MIT。`LICENSE` を参照してください。
