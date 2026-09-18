# JevCraft Offline Vertical Slice (Phase 0 + Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 採掘セッション特徴量JSON → TypeSafe Jev（またはmock）→ 型付き確率を持つDecision Record → ラベル付き評価レポート、というオフライン縦切りをpnpm monorepoとして完成させる。

**Architecture:** 4つのTypeScriptパッケージ（`schema` / `jev-evaluator` / `eval-runner` / `cli`）を pnpm workspace に置き、パッケージ間はソース直参照（`exports` が `src/index.ts` を指す）で結ぶ。Jev呼び出しは `JevBackend` インターフェースで抽象化し、公式SDK `@typesafe-ai/sdk` を包む `typesafe` backend と、特徴量から決定論的に分布を作る `mock` backend を差し替え可能にする。全入出力はZodで検証してから保存する。

**Tech Stack:** Node.js 24 / pnpm / TypeScript 5.9 (strict, ESM) / Zod 4 / Vitest 4 / Biome 2 / tsx / `@typesafe-ai/sdk` 0.6

**Spec:** `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`（特に §3, §6 Phase 0–1, §9–§14, §19 Epic 1, §20, §21 PR 1, §24）

## Global Constraints

- Node.js 24系で固定（`engines.node: ">=24"`、`.node-version` = `24`）。公式SDKはNode 20以上を要求。
- pnpm workspace の monorepo。パッケージマネージャーは `package.json` の `packageManager` で固定。
- TypeScript strict。全パッケージ ESM（`"type": "module"`）。
- Feature / Decision / Label schema は Zod で定義し、保存前に必ず `parse` する。
- 欠損値は原則 `null`。`0` で埋めない（「観測した結果ゼロ」と区別するため）。
- TypeSafe公式 JavaScript/TypeScript SDK `@typesafe-ai/sdk` を使う。エンドポイント `POST https://api.typesafe.ai/v1/systemone`、モデル `jev-latest`。
- `TYPESAFE_API_KEY` は環境変数だけで受ける。コードにも設定ファイルにも書かない。
- `TYPESAFE_API_KEY` がないテスト・CIでは mock backend を使う。live evalはCIでデフォルト無効。
- Jevへの質問は1つの巨大判断にせず `behavior_class` / `hidden_information_use` / `route_naturalness` / `evidence_sufficiency` の4つに分解する。
- `choice` だけでなく `probabilities` と `confidence` を必ず保存する。`confidence` は分布形状から得られる確信度であり、`P(likely_xray)` とは別物。
- Decision Record には `model`、`questionSetVersion`、`featureExtractorVersion` を必ず残す。
- 自動BAN・自動kick・Paper plugin には着手しない。
- ライセンスは MIT。
- `datasets/private/`、実プレイヤーUUID、API応答の未加工ログ、APIキーはGitへ入れない。
- コミットメッセージ末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` を付ける。

## 前提となるSDK仕様（`@typesafe-ai/sdk@0.6.0` の型定義から確認済み）

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
// choice(instructions, { label: description, ... }) -> ChoiceQuestion
// noul(instructions?, { true?: desc, false?: desc }) -> NoulQuestion
// score(instructions, [desc0, desc1, ...]) -> ScoreQuestion  (index 0 から始まる順序付きrubric)
// new TypeSafeClient({ apiKey?, baseURL?, defaultModel?, timeout?, retry?, fetch? })
//   apiKey 省略時は TYPESAFE_API_KEY を読む。fetch を注入するとテストで差し替えられる。
// client.systemOne({ state, questions, model? }) -> Promise<{ model, answers, usage }>
//   answers.<key> は質問型ごとに:
//     noul   -> { type: "noul", noul: number }
//     choice -> { type: "choice", choice: string, confidence: number, probabilities: Record<label, number> }
//     score  -> { type: "score", score: number, confidence: number, legend, probabilities: Record<"0"|"1"|..., number> }
//   usage -> { input_tokens, output_tokens }
// エラー: APIError(status, body), APIConnectionError, APITimeoutError, TypeSafeError
```

## ファイル構成

```text
jevcraft-bench/
  package.json                      # root scripts, devDependencies, packageManager
  pnpm-workspace.yaml
  tsconfig.json                     # 全パッケージを noEmit で型検査
  vitest.config.ts
  biome.json
  .node-version
  .gitignore
  .env.example
  LICENSE                           # MIT
  README.md
  CONTRIBUTING.md
  SECURITY.md
  .github/workflows/ci.yml
  docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md   # spec（コピー済み）
  docs/superpowers/plans/2026-09-19-offline-vertical-slice.md  # this plan

  packages/schema/                  # データ契約（Zod）
    package.json
    src/index.ts
    src/features.ts                 # MiningSessionFeaturesSchema
    src/decision.ts                 # DecisionRecordSchema, JevAnswersSchema, PolicyOutcomeSchema
    src/labels.ts                   # SessionLabelSchema
    test/features.test.ts
    test/decision.test.ts
    test/labels.test.ts

  packages/jev-evaluator/           # Jev 呼び出しと判定
    package.json
    src/index.ts
    src/backend.ts                  # JevBackend interface
    src/questions/xray-v1.ts        # 質問セット xray-v1 と state 構築
    src/mock-backend.ts             # 決定論的 mock
    src/typesafe-backend.ts         # 公式SDK wrapper
    src/policy.ts                   # 閾値ポリシー
    src/evaluate-session.ts         # features -> DecisionRecord
    test/xray-v1.test.ts
    test/mock-backend.test.ts
    test/typesafe-backend.test.ts
    test/policy.test.ts
    test/evaluate-session.test.ts

  packages/eval-runner/             # ラベルとの突合と指標
    package.json
    src/index.ts
    src/join.ts                     # decisions × labels
    src/metrics.ts                  # confusion matrix, P/R/FPR/FNR/F1, sweep, percentile
    src/report.ts                   # Markdown レポート
    test/join.test.ts
    test/metrics.test.ts
    test/report.test.ts

  packages/cli/                     # `pnpm jevcraft <command>`
    package.json
    src/main.ts
    src/io.ts                       # json / jsonl / directory 読み書き
    src/commands/evaluate.ts
    src/commands/report.ts
    test/io.test.ts
    test/evaluate-command.test.ts
    test/report-command.test.ts

  datasets/
    README.md
    fixtures/legit-001.json
    fixtures/legit-002.json
    fixtures/xray-direct-001.json
    fixtures/xray-evasive-001.json
    fixtures/insufficient-001.json
    labels/fixtures.jsonl
    decisions/.gitkeep              # 出力先（中身はGit管理外）
  reports/.gitkeep                  # 出力先（中身はGit管理外）
```

---

### Task 1: Monorepo 基盤と toolchain の疎通

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `biome.json`, `.node-version`, `.gitignore`, `.env.example`, `LICENSE`, `.github/workflows/ci.yml`
- Create: `packages/schema/package.json`, `packages/schema/src/index.ts`, `packages/schema/test/smoke.test.ts`
- Create: `datasets/decisions/.gitkeep`, `reports/.gitkeep`

**Interfaces:**
- Produces: root scripts `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm check` / `pnpm jevcraft`（`jevcraft` は Task 9 で実体ができるまで失敗してよい）
- Produces: パッケージ名 `@jevcraft/schema`（後続タスクは `workspace:*` で参照）

- [ ] **Step 1: ブランチを切る**

```bash
git checkout -b feat/offline-vertical-slice
```

- [ ] **Step 2: pnpm を導入する**

```bash
npm install -g pnpm@12.4.2
pnpm --version
```

Expected: `12.4.2`

- [ ] **Step 3: root ファイルを作る**

`package.json`:

```json
{
  "name": "jevcraft-bench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.4.2",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "jevcraft": "tsx packages/cli/src/main.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "biome check .",
    "format": "biome check --write .",
    "check": "pnpm lint && pnpm typecheck && pnpm test"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.5.14",
    "@types/node": "^24.0.0",
    "tsx": "^4.23.13",
    "typescript": "^5.9.3",
    "vitest": "^4.1.11"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["packages/*/src/**/*.ts", "packages/*/test/**/*.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
```

`biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.14/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!**/node_modules", "!**/dist", "!reports/**", "!datasets/decisions/**"]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

`.node-version`:

```text
24
```

`.gitignore`:

```text
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
datasets/private/
datasets/decisions/*
!datasets/decisions/.gitkeep
reports/*
!reports/.gitkeep
*.log
.DS_Store
```

`.env.example`:

```text
# TypeSafe API key. Never commit a real key. When absent, the CLI falls back to the mock backend.
TYPESAFE_API_KEY=
# Optional overrides (defaults shown)
# TYPESAFE_BASE_URL=https://api.typesafe.ai
# TYPESAFE_DEFAULT_MODEL=jev-latest
```

`LICENSE`:

```text
MIT License

Copyright (c) 2026 nft-syou

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      # Live Jev evaluation is intentionally not run in CI. The mock backend proves the pipeline.
      - run: pnpm jevcraft evaluate datasets/fixtures --backend mock --out /tmp/ci-decisions.jsonl
```

`datasets/decisions/.gitkeep` と `reports/.gitkeep` は空ファイル。

- [ ] **Step 4: schema パッケージの骨組みと smoke test を書く**

`packages/schema/package.json`:

```json
{
  "name": "@jevcraft/schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^4.6.5"
  }
}
```

`packages/schema/src/index.ts`:

```ts
export const SCHEMA_VERSION = 1 as const;
```

`packages/schema/test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@jevcraft/schema";

describe("schema package", () => {
  it("exposes schema version 1", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
```

- [ ] **Step 5: install と全チェックを通す**

```bash
pnpm install
pnpm check
```

Expected: lint / typecheck / test すべて成功。test は `1 passed`。
もし `tsc` が `@jevcraft/schema` を解決できない場合は、`tsconfig.json` の `compilerOptions` に `"paths": { "@jevcraft/*": ["./packages/*/src/index.ts"] }` と `"baseUrl": "."` を追加する。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: initialize pnpm monorepo, toolchain, and CI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Feature schema（`MiningSessionFeatures`）

**Files:**
- Create: `packages/schema/src/features.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/features.test.ts`

**Interfaces:**
- Produces: `MiningSessionFeaturesSchema` (Zod), `type MiningSessionFeatures`。spec §9 のJSONに `sessionId: string` を加えたもの。欠損は `null`。

- [ ] **Step 1: 失敗するテストを書く**

`packages/schema/test/features.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";

export const validFeatures = {
  schemaVersion: 1,
  featureExtractorVersion: "0.1.0",
  sessionId: "session_test_001",
  session: {
    durationSec: 603,
    movementDistance: 311.4,
    blocksBroken: 428,
    valuableOreReveals: 31,
    valuableOreBlocksBroken: 34,
  },
  exploration: {
    branchMiningLikelihood: 0.18,
    caveExposureRatio: 0.07,
    uniqueTunnelDirections: 6,
    turnCount: 34,
  },
  hiddenOreApproach: {
    sampleCount: 28,
    meanDirectness: 0.89,
    medianDetourRatio: 1.12,
    aimAlignmentBeforeRevealRatio: 0.76,
    turnsTowardHiddenOre: 17,
    directionChangesNearOre: 27,
  },
  timing: {
    meanBreakIntervalMs: 438,
    breakIntervalStdDevMs: 143,
    medianSecondsBetweenReveals: 13.2,
  },
  efficiency: {
    valuableOrePer100Blocks: 7.24,
    nonOreBlocksPerHiddenReveal: 12.8,
    baselinePercentile: 99.4,
  },
  quality: {
    trajectoryCoverage: 0.96,
    droppedEventCount: 0,
    enoughEvidence: true,
    knownConfounders: [],
  },
};

describe("MiningSessionFeaturesSchema", () => {
  it("accepts the spec example", () => {
    expect(MiningSessionFeaturesSchema.parse(validFeatures)).toEqual(validFeatures);
  });

  it("keeps null distinct from zero", () => {
    const parsed = MiningSessionFeaturesSchema.parse({
      ...validFeatures,
      efficiency: { ...validFeatures.efficiency, baselinePercentile: null },
      hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: null },
    });
    expect(parsed.efficiency.baselinePercentile).toBeNull();
    expect(parsed.hiddenOreApproach.meanDirectness).toBeNull();
  });

  it("rejects undefined for a nullable metric (missing must be explicit null)", () => {
    const { baselinePercentile: _omit, ...efficiency } = validFeatures.efficiency;
    expect(() =>
      MiningSessionFeaturesSchema.parse({ ...validFeatures, efficiency }),
    ).toThrow();
  });

  it("rejects unknown schema versions", () => {
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, schemaVersion: 2 })).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => MiningSessionFeaturesSchema.parse({ ...validFeatures, extra: 1 })).toThrow();
  });

  it("rejects ratios outside 0..1 and detour ratios below 1", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, meanDirectness: 1.2 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        hiddenOreApproach: { ...validFeatures.hiddenOreApproach, medianDetourRatio: 0.9 },
      }),
    ).toThrow();
  });

  it("rejects negative counts and non-integer counts", () => {
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: -1 },
      }),
    ).toThrow();
    expect(() =>
      MiningSessionFeaturesSchema.parse({
        ...validFeatures,
        session: { ...validFeatures.session, blocksBroken: 1.5 },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/schema/test/features.test.ts
```

Expected: FAIL（`MiningSessionFeaturesSchema` が export されていない）

- [ ] **Step 3: schema を実装する**

`packages/schema/src/features.ts`:

```ts
import { z } from "zod";

// Missing observations are `null`, never 0. See spec §9.
const nullableRatio = z.number().min(0).max(1).nullable();
const nullableNonNegative = z.number().min(0).nullable();
const nullableCount = z.number().int().min(0).nullable();
const count = z.number().int().min(0);

export const MiningSessionFeaturesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  featureExtractorVersion: z.string().min(1),
  sessionId: z.string().min(1),
  session: z.strictObject({
    durationSec: z.number().min(0),
    movementDistance: nullableNonNegative,
    blocksBroken: count,
    valuableOreReveals: count,
    valuableOreBlocksBroken: count,
  }),
  exploration: z.strictObject({
    branchMiningLikelihood: nullableRatio,
    caveExposureRatio: nullableRatio,
    uniqueTunnelDirections: nullableCount,
    turnCount: nullableCount,
  }),
  hiddenOreApproach: z.strictObject({
    sampleCount: count,
    /** straight-line distance / actual path length; 1 = perfectly direct */
    meanDirectness: nullableRatio,
    /** actual path length / straight-line distance; 1 = shortest */
    medianDetourRatio: z.number().min(1).nullable(),
    aimAlignmentBeforeRevealRatio: nullableRatio,
    turnsTowardHiddenOre: nullableCount,
    directionChangesNearOre: nullableCount,
  }),
  timing: z.strictObject({
    meanBreakIntervalMs: nullableNonNegative,
    breakIntervalStdDevMs: nullableNonNegative,
    medianSecondsBetweenReveals: nullableNonNegative,
  }),
  efficiency: z.strictObject({
    valuableOrePer100Blocks: nullableNonNegative,
    nonOreBlocksPerHiddenReveal: nullableNonNegative,
    /** null until a baseline population exists */
    baselinePercentile: z.number().min(0).max(100).nullable(),
  }),
  quality: z.strictObject({
    trajectoryCoverage: z.number().min(0).max(1),
    droppedEventCount: count,
    enoughEvidence: z.boolean(),
    knownConfounders: z.array(z.string()),
  }),
});

export type MiningSessionFeatures = z.infer<typeof MiningSessionFeaturesSchema>;
```

`packages/schema/src/index.ts`:

```ts
export const SCHEMA_VERSION = 1 as const;
export { MiningSessionFeaturesSchema, type MiningSessionFeatures } from "./features";
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/schema/test/features.test.ts
```

Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): define mining session feature schema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Decision record schema と Label schema

**Files:**
- Create: `packages/schema/src/decision.ts`, `packages/schema/src/labels.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/decision.test.ts`, `packages/schema/test/labels.test.ts`

**Interfaces:**
- Produces:
  - `BehaviorClassSchema` = enum `legit | suspicious | likely_xray | insufficient_evidence`
  - `PolicyOutcomeSchema` = enum `no_action | review | high_priority_review | insufficient_evidence | error`
  - `JevAnswersSchema` / `type JevAnswers`: `{ behaviorClass: { choice, probabilities, confidence }, hiddenInformationUse: number, routeNaturalness: { score, normalized, confidence, probabilities }, evidenceSufficiency: number }`
  - `DecisionRecordSchema` / `type DecisionRecord`: `{ schemaVersion: 1, evaluationId, sessionId, evaluatedAt, model, backend: "typesafe"|"mock", questionSetVersion, featureExtractorVersion, answers: JevAnswers|null, policyOutcome, latencyMs, usage: {inputTokens, outputTokens}|null, error: string|null }`
  - `GroundTruthLabelSchema` = enum `legit | simulated_xray | known_cheat | unknown`
  - `BehaviorSubtypeSchema`, `ReviewStatusSchema`, `SessionLabelSchema` / `type SessionLabel`: `{ sessionId, label, subtype: subtype|null, reviewStatus, notes?: string }`
- `routeNaturalness.normalized` は `score / 4`。**1 が自然、0 が不自然**（rubric index 0 = "Highly unnatural"）。

- [ ] **Step 1: 失敗するテストを書く**

`packages/schema/test/decision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DecisionRecordSchema, JevAnswersSchema } from "@jevcraft/schema";

export const validAnswers = {
  behaviorClass: {
    choice: "likely_xray",
    probabilities: { legit: 0.03, suspicious: 0.15, likely_xray: 0.8, insufficient_evidence: 0.02 },
    confidence: 0.72,
  },
  hiddenInformationUse: 0.88,
  routeNaturalness: {
    score: 0.6,
    normalized: 0.15,
    confidence: 0.7,
    probabilities: { "0": 0.5, "1": 0.4, "2": 0.1, "3": 0, "4": 0 },
  },
  evidenceSufficiency: 0.96,
} as const;

export const validDecision = {
  schemaVersion: 1,
  evaluationId: "eval_test_001",
  sessionId: "session_test_001",
  evaluatedAt: "2026-09-18T12:40:00.000Z",
  model: "jev-latest",
  backend: "typesafe",
  questionSetVersion: "xray-v1",
  featureExtractorVersion: "0.1.0",
  answers: validAnswers,
  policyOutcome: "review",
  latencyMs: 143,
  usage: { inputTokens: 512, outputTokens: 40 },
  error: null,
} as const;

describe("JevAnswersSchema", () => {
  it("accepts a full answer set", () => {
    expect(JevAnswersSchema.parse(validAnswers)).toEqual(validAnswers);
  });

  it("requires every behavior class probability", () => {
    const { insufficient_evidence: _omit, ...probabilities } = validAnswers.behaviorClass.probabilities;
    expect(() =>
      JevAnswersSchema.parse({
        ...validAnswers,
        behaviorClass: { ...validAnswers.behaviorClass, probabilities },
      }),
    ).toThrow();
  });

  it("rejects a choice outside the behavior classes", () => {
    expect(() =>
      JevAnswersSchema.parse({
        ...validAnswers,
        behaviorClass: { ...validAnswers.behaviorClass, choice: "cheater" },
      }),
    ).toThrow();
  });

  it("rejects probabilities outside 0..1", () => {
    expect(() => JevAnswersSchema.parse({ ...validAnswers, hiddenInformationUse: 1.5 })).toThrow();
  });
});

describe("DecisionRecordSchema", () => {
  it("accepts a successful evaluation", () => {
    expect(DecisionRecordSchema.parse(validDecision)).toEqual(validDecision);
  });

  it("accepts a failed evaluation with null answers and an error message", () => {
    const failed = {
      ...validDecision,
      backend: "mock",
      answers: null,
      usage: null,
      policyOutcome: "error",
      error: "APIConnectionError: fetch failed",
    };
    expect(DecisionRecordSchema.parse(failed)).toEqual(failed);
  });

  it("rejects an unknown policy outcome", () => {
    expect(() => DecisionRecordSchema.parse({ ...validDecision, policyOutcome: "ban" })).toThrow();
  });

  it("rejects a non-ISO evaluatedAt", () => {
    expect(() => DecisionRecordSchema.parse({ ...validDecision, evaluatedAt: "yesterday" })).toThrow();
  });
});
```

`packages/schema/test/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SessionLabelSchema } from "@jevcraft/schema";

describe("SessionLabelSchema", () => {
  it("accepts a reviewed label with subtype", () => {
    const label = {
      sessionId: "session_test_001",
      label: "simulated_xray",
      subtype: "direct_xray",
      reviewStatus: "single_review",
    };
    expect(SessionLabelSchema.parse(label)).toEqual(label);
  });

  it("accepts unknown labels with null subtype and optional notes", () => {
    const label = {
      sessionId: "session_test_002",
      label: "unknown",
      subtype: null,
      reviewStatus: "double_review_disagree",
      notes: "reviewers disagreed on cave exposure",
    };
    expect(SessionLabelSchema.parse(label)).toEqual(label);
  });

  it("rejects 'suspicious' as a ground truth label (it is a model output)", () => {
    expect(() =>
      SessionLabelSchema.parse({
        sessionId: "session_test_003",
        label: "suspicious",
        subtype: null,
        reviewStatus: "unreviewed",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/schema
```

Expected: decision / labels のテストが FAIL（export 不在）

- [ ] **Step 3: 実装する**

`packages/schema/src/decision.ts`:

```ts
import { z } from "zod";

const probability = z.number().min(0).max(1);

export const BehaviorClassSchema = z.enum([
  "legit",
  "suspicious",
  "likely_xray",
  "insufficient_evidence",
]);
export type BehaviorClass = z.infer<typeof BehaviorClassSchema>;

export const PolicyOutcomeSchema = z.enum([
  "no_action",
  "review",
  "high_priority_review",
  "insufficient_evidence",
  "error",
]);
export type PolicyOutcome = z.infer<typeof PolicyOutcomeSchema>;

export const EvaluationBackendSchema = z.enum(["typesafe", "mock"]);
export type EvaluationBackend = z.infer<typeof EvaluationBackendSchema>;

export const JevAnswersSchema = z.strictObject({
  behaviorClass: z.strictObject({
    choice: BehaviorClassSchema,
    // z.record with an enum key is exhaustive: every class must be present.
    probabilities: z.record(BehaviorClassSchema, probability),
    confidence: probability,
  }),
  /** P(player acted on hidden ore-location information) */
  hiddenInformationUse: probability,
  routeNaturalness: z.strictObject({
    /** expected rubric level, 0 (highly unnatural) .. 4 (strongly natural) */
    score: z.number().min(0).max(4),
    /** score / 4; 1 = natural, 0 = unnatural */
    normalized: probability,
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  }),
  /** P(enough high-quality evidence to classify) */
  evidenceSufficiency: probability,
});
export type JevAnswers = z.infer<typeof JevAnswersSchema>;

export const UsageSchema = z.strictObject({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
});

export const DecisionRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evaluationId: z.string().min(1),
  sessionId: z.string().min(1),
  evaluatedAt: z.iso.datetime(),
  model: z.string().min(1),
  backend: EvaluationBackendSchema,
  questionSetVersion: z.string().min(1),
  featureExtractorVersion: z.string().min(1),
  answers: JevAnswersSchema.nullable(),
  policyOutcome: PolicyOutcomeSchema,
  latencyMs: z.number().int().min(0),
  usage: UsageSchema.nullable(),
  error: z.string().nullable(),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
```

`packages/schema/src/labels.ts`:

```ts
import { z } from "zod";

/** Ground truth. `suspicious` is a model output and is deliberately not a label. */
export const GroundTruthLabelSchema = z.enum(["legit", "simulated_xray", "known_cheat", "unknown"]);
export type GroundTruthLabel = z.infer<typeof GroundTruthLabelSchema>;

export const BehaviorSubtypeSchema = z.enum([
  "branch_mining",
  "cave_mining",
  "lucky_streak",
  "direct_xray",
  "detour_xray",
  "humanized_xray",
  "mixed",
]);
export type BehaviorSubtype = z.infer<typeof BehaviorSubtypeSchema>;

export const ReviewStatusSchema = z.enum([
  "unreviewed",
  "single_review",
  "double_review_agree",
  "double_review_disagree",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const SessionLabelSchema = z.strictObject({
  sessionId: z.string().min(1),
  label: GroundTruthLabelSchema,
  subtype: BehaviorSubtypeSchema.nullable(),
  reviewStatus: ReviewStatusSchema,
  notes: z.string().optional(),
});
export type SessionLabel = z.infer<typeof SessionLabelSchema>;
```

`packages/schema/src/index.ts`（全体を置き換え）:

```ts
export const SCHEMA_VERSION = 1 as const;
export { MiningSessionFeaturesSchema, type MiningSessionFeatures } from "./features";
export {
  BehaviorClassSchema,
  type BehaviorClass,
  PolicyOutcomeSchema,
  type PolicyOutcome,
  EvaluationBackendSchema,
  type EvaluationBackend,
  JevAnswersSchema,
  type JevAnswers,
  UsageSchema,
  DecisionRecordSchema,
  type DecisionRecord,
} from "./decision";
export {
  GroundTruthLabelSchema,
  type GroundTruthLabel,
  BehaviorSubtypeSchema,
  type BehaviorSubtype,
  ReviewStatusSchema,
  type ReviewStatus,
  SessionLabelSchema,
  type SessionLabel,
} from "./labels";
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/schema && pnpm typecheck
```

Expected: PASS（features 7 + decision 8 + labels 3 + smoke 1）

- [ ] **Step 5: Commit**

```bash
git add packages/schema
git commit -m "feat(schema): add decision record and session label schemas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Fixture データセットとラベル

**Files:**
- Create: `datasets/fixtures/legit-001.json`, `datasets/fixtures/legit-002.json`, `datasets/fixtures/xray-direct-001.json`, `datasets/fixtures/xray-evasive-001.json`, `datasets/fixtures/insufficient-001.json`
- Create: `datasets/labels/fixtures.jsonl`
- Create: `datasets/README.md`
- Test: `packages/schema/test/fixtures.test.ts`

**Interfaces:**
- Produces: 5件の `MiningSessionFeatures` JSON（sessionId は `session_fixture_<name>`）と対応ラベル。後続の mock backend は、この5件で `no_action` ×2 / `high_priority_review` / `review` / `insufficient_evidence` を返すよう設計する（Task 6 で検証）。

- [ ] **Step 1: 失敗するテストを書く**

`packages/schema/test/fixtures.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MiningSessionFeaturesSchema, SessionLabelSchema } from "@jevcraft/schema";

const root = join(import.meta.dirname, "../../..");
const fixtureDir = join(root, "datasets/fixtures");
const labelFile = join(root, "datasets/labels/fixtures.jsonl");

describe("datasets/fixtures", () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith(".json"));

  it("contains the two fixtures required by the spec", () => {
    expect(files).toContain("legit-001.json");
    expect(files).toContain("xray-direct-001.json");
  });

  it.each(files)("%s is a valid MiningSessionFeatures document", (file) => {
    const raw = JSON.parse(readFileSync(join(fixtureDir, file), "utf8"));
    const parsed = MiningSessionFeaturesSchema.parse(raw);
    expect(parsed.sessionId).toBe(`session_fixture_${file.replace(".json", "").replace(/-/g, "_")}`);
  });

  it("has exactly one label per fixture", () => {
    const labels = readFileSync(labelFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => SessionLabelSchema.parse(JSON.parse(line)));
    const labeled = new Set(labels.map((l) => l.sessionId));
    const expected = new Set(
      files.map((f) => `session_fixture_${f.replace(".json", "").replace(/-/g, "_")}`),
    );
    expect(labeled).toEqual(expected);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/schema/test/fixtures.test.ts
```

Expected: FAIL（ディレクトリが存在しない）

- [ ] **Step 3: fixture を作る**

`datasets/fixtures/legit-001.json`（通常の branch mining）:

```json
{
  "schemaVersion": 1,
  "featureExtractorVersion": "0.1.0",
  "sessionId": "session_fixture_legit_001",
  "session": {
    "durationSec": 900,
    "movementDistance": 420.5,
    "blocksBroken": 610,
    "valuableOreReveals": 4,
    "valuableOreBlocksBroken": 7
  },
  "exploration": {
    "branchMiningLikelihood": 0.91,
    "caveExposureRatio": 0.04,
    "uniqueTunnelDirections": 2,
    "turnCount": 9
  },
  "hiddenOreApproach": {
    "sampleCount": 4,
    "meanDirectness": 0.35,
    "medianDetourRatio": 2.85,
    "aimAlignmentBeforeRevealRatio": 0.3,
    "turnsTowardHiddenOre": 1,
    "directionChangesNearOre": 2
  },
  "timing": {
    "meanBreakIntervalMs": 520,
    "breakIntervalStdDevMs": 210,
    "medianSecondsBetweenReveals": 180
  },
  "efficiency": {
    "valuableOrePer100Blocks": 0.66,
    "nonOreBlocksPerHiddenReveal": 150.8,
    "baselinePercentile": null
  },
  "quality": {
    "trajectoryCoverage": 0.98,
    "droppedEventCount": 0,
    "enoughEvidence": true,
    "knownConfounders": []
  }
}
```

`datasets/fixtures/legit-002.json`（洞窟探索、露出鉱石が多い）:

```json
{
  "schemaVersion": 1,
  "featureExtractorVersion": "0.1.0",
  "sessionId": "session_fixture_legit_002",
  "session": {
    "durationSec": 720,
    "movementDistance": 610.2,
    "blocksBroken": 240,
    "valuableOreReveals": 9,
    "valuableOreBlocksBroken": 15
  },
  "exploration": {
    "branchMiningLikelihood": 0.05,
    "caveExposureRatio": 0.62,
    "uniqueTunnelDirections": 11,
    "turnCount": 58
  },
  "hiddenOreApproach": {
    "sampleCount": 9,
    "meanDirectness": 0.55,
    "medianDetourRatio": 1.7,
    "aimAlignmentBeforeRevealRatio": 0.45,
    "turnsTowardHiddenOre": 4,
    "directionChangesNearOre": 12
  },
  "timing": {
    "meanBreakIntervalMs": 810,
    "breakIntervalStdDevMs": 460,
    "medianSecondsBetweenReveals": 62.5
  },
  "efficiency": {
    "valuableOrePer100Blocks": 3.5,
    "nonOreBlocksPerHiddenReveal": 25.0,
    "baselinePercentile": null
  },
  "quality": {
    "trajectoryCoverage": 0.94,
    "droppedEventCount": 3,
    "enoughEvidence": true,
    "knownConfounders": ["large_cave_system"]
  }
}
```

`datasets/fixtures/xray-direct-001.json`（鉱石座標へ最短掘削）:

```json
{
  "schemaVersion": 1,
  "featureExtractorVersion": "0.1.0",
  "sessionId": "session_fixture_xray_direct_001",
  "session": {
    "durationSec": 603,
    "movementDistance": 311.4,
    "blocksBroken": 430,
    "valuableOreReveals": 31,
    "valuableOreBlocksBroken": 39
  },
  "exploration": {
    "branchMiningLikelihood": 0.12,
    "caveExposureRatio": 0.03,
    "uniqueTunnelDirections": 14,
    "turnCount": 41
  },
  "hiddenOreApproach": {
    "sampleCount": 28,
    "meanDirectness": 0.92,
    "medianDetourRatio": 1.08,
    "aimAlignmentBeforeRevealRatio": 0.85,
    "turnsTowardHiddenOre": 24,
    "directionChangesNearOre": 27
  },
  "timing": {
    "meanBreakIntervalMs": 438,
    "breakIntervalStdDevMs": 143,
    "medianSecondsBetweenReveals": 13.2
  },
  "efficiency": {
    "valuableOrePer100Blocks": 9.0,
    "nonOreBlocksPerHiddenReveal": 12.8,
    "baselinePercentile": null
  },
  "quality": {
    "trajectoryCoverage": 0.97,
    "droppedEventCount": 0,
    "enoughEvidence": true,
    "knownConfounders": []
  }
}
```

`datasets/fixtures/xray-evasive-001.json`（detour を混ぜた回避型）:

```json
{
  "schemaVersion": 1,
  "featureExtractorVersion": "0.1.0",
  "sessionId": "session_fixture_xray_evasive_001",
  "session": {
    "durationSec": 840,
    "movementDistance": 520.7,
    "blocksBroken": 560,
    "valuableOreReveals": 18,
    "valuableOreBlocksBroken": 23
  },
  "exploration": {
    "branchMiningLikelihood": 0.3,
    "caveExposureRatio": 0.08,
    "uniqueTunnelDirections": 9,
    "turnCount": 47
  },
  "hiddenOreApproach": {
    "sampleCount": 18,
    "meanDirectness": 0.72,
    "medianDetourRatio": 1.45,
    "aimAlignmentBeforeRevealRatio": 0.55,
    "turnsTowardHiddenOre": 11,
    "directionChangesNearOre": 20
  },
  "timing": {
    "meanBreakIntervalMs": 495,
    "breakIntervalStdDevMs": 260,
    "medianSecondsBetweenReveals": 31.0
  },
  "efficiency": {
    "valuableOrePer100Blocks": 5.0,
    "nonOreBlocksPerHiddenReveal": 29.8,
    "baselinePercentile": null
  },
  "quality": {
    "trajectoryCoverage": 0.95,
    "droppedEventCount": 1,
    "enoughEvidence": true,
    "knownConfounders": []
  }
}
```

`datasets/fixtures/insufficient-001.json`（telemetry 欠落）:

```json
{
  "schemaVersion": 1,
  "featureExtractorVersion": "0.1.0",
  "sessionId": "session_fixture_insufficient_001",
  "session": {
    "durationSec": 150,
    "movementDistance": null,
    "blocksBroken": 38,
    "valuableOreReveals": 2,
    "valuableOreBlocksBroken": 2
  },
  "exploration": {
    "branchMiningLikelihood": null,
    "caveExposureRatio": null,
    "uniqueTunnelDirections": null,
    "turnCount": null
  },
  "hiddenOreApproach": {
    "sampleCount": 2,
    "meanDirectness": null,
    "medianDetourRatio": null,
    "aimAlignmentBeforeRevealRatio": null,
    "turnsTowardHiddenOre": null,
    "directionChangesNearOre": null
  },
  "timing": {
    "meanBreakIntervalMs": 610,
    "breakIntervalStdDevMs": null,
    "medianSecondsBetweenReveals": null
  },
  "efficiency": {
    "valuableOrePer100Blocks": 5.26,
    "nonOreBlocksPerHiddenReveal": null,
    "baselinePercentile": null
  },
  "quality": {
    "trajectoryCoverage": 0.41,
    "droppedEventCount": 340,
    "enoughEvidence": false,
    "knownConfounders": ["queue_overflow"]
  }
}
```

`datasets/labels/fixtures.jsonl`:

```jsonl
{"sessionId":"session_fixture_legit_001","label":"legit","subtype":"branch_mining","reviewStatus":"single_review"}
{"sessionId":"session_fixture_legit_002","label":"legit","subtype":"cave_mining","reviewStatus":"single_review"}
{"sessionId":"session_fixture_xray_direct_001","label":"simulated_xray","subtype":"direct_xray","reviewStatus":"single_review"}
{"sessionId":"session_fixture_xray_evasive_001","label":"simulated_xray","subtype":"detour_xray","reviewStatus":"single_review"}
{"sessionId":"session_fixture_insufficient_001","label":"unknown","subtype":null,"reviewStatus":"unreviewed","notes":"telemetry queue overflow; not usable as ground truth"}
```

`datasets/README.md`:

```markdown
# datasets

| Path | Tracked in Git | Purpose |
| --- | --- | --- |
| `fixtures/*.json` | yes | Hand-written `MiningSessionFeatures` documents for wiring tests. Not proof of accuracy. |
| `labels/*.jsonl` | yes | One `SessionLabel` per line. `unknown` rows are excluded from precision/recall and counted separately. |
| `decisions/*.jsonl` | no | Output of `pnpm jevcraft evaluate`. |
| `private/` | no | Real-server telemetry. Never commit. |

Player identifiers in any dataset must be pseudonymous (HMAC). Never store real UUIDs, names, chat, or IPs.
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/schema/test/fixtures.test.ts
```

Expected: PASS（7 tests: 2 + 5 fixtures）

- [ ] **Step 5: Commit**

```bash
git add datasets packages/schema/test/fixtures.test.ts
git commit -m "test: add initial legit, xray, and insufficient-evidence fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 質問セット `xray-v1` と Backend interface

**Files:**
- Create: `packages/jev-evaluator/package.json`, `packages/jev-evaluator/src/index.ts`, `packages/jev-evaluator/src/backend.ts`, `packages/jev-evaluator/src/questions/xray-v1.ts`
- Test: `packages/jev-evaluator/test/xray-v1.test.ts`

**Interfaces:**
- Consumes: `MiningSessionFeatures` (Task 2)
- Produces:
  - `interface JevBackend { readonly kind: "typesafe" | "mock"; systemOne<const Q extends Questions>(request: SystemOneRequest<Q>, options?: RequestOptions): Promise<SystemOneResult<Q>> }`
  - `XRAY_V1_VERSION = "xray-v1"`
  - `xrayV1Questions`（`behavior_class` choice / `hidden_information_use` noul / `route_naturalness` score 5段階 / `evidence_sufficiency` noul）
  - `type XrayV1Questions`, `type XrayV1Answers = SystemOneResult<XrayV1Questions>["answers"]`
  - `buildXrayV1State(features): { task: string; importantContext: string[]; features: JsonValue }`（`sessionId` は送らない）

- [ ] **Step 1: パッケージを作る**

`packages/jev-evaluator/package.json`:

```json
{
  "name": "@jevcraft/jev-evaluator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@jevcraft/schema": "workspace:*",
    "@typesafe-ai/sdk": "^0.6.0",
    "zod": "^4.6.5"
  }
}
```

```bash
pnpm install
```

- [ ] **Step 2: 失敗するテストを書く**

`packages/jev-evaluator/test/xray-v1.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { XRAY_V1_VERSION, buildXrayV1State, xrayV1Questions } from "@jevcraft/jev-evaluator";
import { validFeatures } from "../../schema/test/features.test";

describe("xray-v1 question set", () => {
  it("is versioned", () => {
    expect(XRAY_V1_VERSION).toBe("xray-v1");
  });

  it("decomposes the judgement into four independent questions", () => {
    expect(Object.keys(xrayV1Questions).sort()).toEqual([
      "behavior_class",
      "evidence_sufficiency",
      "hidden_information_use",
      "route_naturalness",
    ]);
    expect(xrayV1Questions.behavior_class.type).toBe("choice");
    expect(xrayV1Questions.hidden_information_use.type).toBe("noul");
    expect(xrayV1Questions.route_naturalness.type).toBe("score");
    expect(xrayV1Questions.evidence_sufficiency.type).toBe("noul");
  });

  it("uses the four behavior classes as choice labels", () => {
    expect(Object.keys(xrayV1Questions.behavior_class.criteria).sort()).toEqual([
      "insufficient_evidence",
      "legit",
      "likely_xray",
      "suspicious",
    ]);
  });

  it("orders route naturalness from unnatural (0) to natural (4)", () => {
    const rubric = xrayV1Questions.route_naturalness.criteria;
    expect(rubric).toHaveLength(5);
    expect(rubric[0]).toMatch(/unnatural/i);
    expect(rubric[4]).toMatch(/legitimate/i);
  });

  it("builds state without the session id and with the guard-rail context", () => {
    const features = MiningSessionFeaturesSchema.parse(validFeatures);
    const state = buildXrayV1State(features);
    expect(state.task).toMatch(/hidden ore knowledge/);
    expect(state.importantContext).toContain("Judge only from the supplied observations.");
    expect(state.features).not.toHaveProperty("sessionId");
    expect(state.features).toHaveProperty("hiddenOreApproach");
  });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
pnpm vitest run packages/jev-evaluator/test/xray-v1.test.ts
```

Expected: FAIL（モジュール未解決）

- [ ] **Step 4: 実装する**

`packages/jev-evaluator/src/backend.ts`:

```ts
import type {
  Questions,
  RequestOptions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";

/**
 * Minimal surface of the TypeSafe client that evaluation depends on.
 * `TypeSafeClient#systemOne` satisfies it structurally; the mock implements it directly.
 */
export interface JevBackend {
  readonly kind: "typesafe" | "mock";
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): Promise<SystemOneResult<Q>>;
}
```

`packages/jev-evaluator/src/questions/xray-v1.ts`:

```ts
import type { MiningSessionFeatures } from "@jevcraft/schema";
import { type JsonValue, type SystemOneResult, choice, noul, score } from "@typesafe-ai/sdk";

export const XRAY_V1_VERSION = "xray-v1";

export const XRAY_V1_TASK =
  "Evaluate a Minecraft mining session for behavioral evidence of hidden ore knowledge.";

export const XRAY_V1_IMPORTANT_CONTEXT = [
  "High skill and high efficiency alone are not cheating.",
  "Cave exposure and branch-mining patterns can legitimately produce ore streaks.",
  "Judge only from the supplied observations.",
  "Insufficient telemetry must remain insufficient evidence.",
];

export const xrayV1Questions = {
  behavior_class: choice("Which class best describes this mining session?", {
    legit:
      "Consistent with ordinary exploration, cave mining, branch mining, or plausible luck.",
    suspicious:
      "Contains meaningful anomalies but not enough evidence for likely hidden ore knowledge.",
    likely_xray:
      "Strongly consistent with acting on locations of ores that were not yet legitimately visible.",
    insufficient_evidence:
      "Telemetry quantity or quality is too weak for a reliable classification.",
  }),
  hidden_information_use: noul(
    "Does the path provide evidence that the player acted on hidden ore-location information?",
    {
      true: "Repeated pre-reveal movement, turning, or tunneling is unusually targeted toward hidden valuable ores.",
      false:
        "The route is plausibly explained by visible terrain, ordinary mining patterns, chance, or insufficient data.",
    },
  ),
  // Index 0 = most unnatural, index 4 = most natural. `normalized = score / 4`.
  route_naturalness: score("How natural is the route for legitimate mining?", [
    "Highly unnatural and repeatedly target-directed",
    "Noticeably unnatural",
    "Ambiguous or mixed",
    "Mostly natural",
    "Strongly consistent with legitimate mining",
  ]),
  evidence_sufficiency: noul(
    "Is there enough high-quality behavioral evidence to classify this session?",
  ),
};

export type XrayV1Questions = typeof xrayV1Questions;
export type XrayV1Answers = SystemOneResult<XrayV1Questions>["answers"];

/** Highest rubric index of route_naturalness; used to normalize the score to 0..1. */
export const ROUTE_NATURALNESS_MAX = xrayV1Questions.route_naturalness.criteria.length - 1;

export interface XrayV1State {
  task: string;
  importantContext: string[];
  features: JsonValue;
  [key: string]: JsonValue;
}

/** State sent to Jev. The session id is an opaque handle for our records and is not sent. */
export function buildXrayV1State(features: MiningSessionFeatures): XrayV1State {
  const { sessionId: _omit, ...rest } = features;
  return {
    task: XRAY_V1_TASK,
    importantContext: XRAY_V1_IMPORTANT_CONTEXT,
    features: rest as unknown as JsonValue,
  };
}
```

`packages/jev-evaluator/src/index.ts`:

```ts
export type { JevBackend } from "./backend";
export {
  XRAY_V1_VERSION,
  XRAY_V1_TASK,
  XRAY_V1_IMPORTANT_CONTEXT,
  ROUTE_NATURALNESS_MAX,
  xrayV1Questions,
  buildXrayV1State,
  type XrayV1Questions,
  type XrayV1Answers,
  type XrayV1State,
} from "./questions/xray-v1";
```

- [ ] **Step 5: テストを通す**

```bash
pnpm vitest run packages/jev-evaluator && pnpm typecheck
```

Expected: PASS（5 tests）。`rubric[0]` の型が `string | undefined` になるため `toMatch` で問題ないことを確認。

- [ ] **Step 6: Commit**

```bash
git add packages/jev-evaluator pnpm-lock.yaml
git commit -m "feat(evaluator): add xray-v1 question set and backend interface

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Mock backend（決定論的）

**Files:**
- Create: `packages/jev-evaluator/src/mock-backend.ts`
- Modify: `packages/jev-evaluator/src/index.ts`
- Test: `packages/jev-evaluator/test/mock-backend.test.ts`

**Interfaces:**
- Consumes: `JevBackend`, `MiningSessionFeaturesSchema`
- Produces: `createMockBackend(): JevBackend`（`kind: "mock"`）。`state.features` から疑わしさ `s ∈ [0,1]` を決定論的に算出し、質問型ごとに分布を返す。API形状は SDK の `SystemOneResult` と同一。

**Mock のヒューリスティック（テストで固定する）:**

```text
directness = meanDirectness ?? 0.5
aim        = aimAlignmentBeforeRevealRatio ?? 0.5
eff        = clamp((valuableOrePer100Blocks ?? 1) / 8, 0, 1)
cave       = caveExposureRatio ?? 0.3
samples    = sampleCount
raw = 0.45*directness + 0.35*aim + 0.20*eff
s   = clamp((raw - 0.15) / 0.70, 0, 1) * (1 - 0.5*cave) * clamp(samples / 10, 0, 1)

choice (legit/suspicious/likely_xray/insufficient_evidence):
  enoughEvidence == false -> weights {0.05, 0.08, 0.02, 0.85}
  otherwise               -> weights {(1-s)^2, 2s(1-s), s^2, 0.02}
  probabilities = weights / sum; choice = argmax; confidence = max probability
noul hidden_information_use  -> s
noul evidence_sufficiency    -> enoughEvidence ? trajectoryCoverage : 0.2
noul (other keys)            -> 0.5
score (n levels): center c = (1-s)*(n-1); p_i ∝ exp(-(i-c)^2 / 0.5); score = Σ i·p_i; confidence = max p
```

- [ ] **Step 1: 失敗するテストを書く**

`packages/jev-evaluator/test/mock-backend.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { buildXrayV1State, createMockBackend, xrayV1Questions } from "@jevcraft/jev-evaluator";

const fixtureDir = join(import.meta.dirname, "../../../datasets/fixtures");
const loadFixture = (name: string) =>
  MiningSessionFeaturesSchema.parse(JSON.parse(readFileSync(join(fixtureDir, name), "utf8")));

const ask = (name: string) =>
  createMockBackend().systemOne({
    state: buildXrayV1State(loadFixture(name)),
    questions: xrayV1Questions,
    model: "jev-latest",
  });

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("mock backend", () => {
  it("reports kind mock", () => {
    expect(createMockBackend().kind).toBe("mock");
  });

  it("returns answers shaped like the SDK result for every question", async () => {
    const result = await ask("xray-direct-001.json");
    expect(result.model).toBe("jev-latest");
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.answers.behavior_class.type).toBe("choice");
    expect(result.answers.hidden_information_use.type).toBe("noul");
    expect(result.answers.route_naturalness.type).toBe("score");
    expect(result.answers.evidence_sufficiency.type).toBe("noul");
    expect(Object.keys(result.answers.route_naturalness.probabilities)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("produces probability distributions that sum to one", async () => {
    const result = await ask("xray-evasive-001.json");
    expect(sum(Object.values(result.answers.behavior_class.probabilities))).toBeCloseTo(1, 6);
    expect(sum(Object.values(result.answers.route_naturalness.probabilities))).toBeCloseTo(1, 6);
    expect(result.answers.behavior_class.confidence).toBeCloseTo(
      Math.max(...Object.values(result.answers.behavior_class.probabilities)),
      6,
    );
  });

  it("is deterministic", async () => {
    const a = await ask("legit-002.json");
    const b = await ask("legit-002.json");
    expect(a).toEqual(b);
  });

  it("flags direct xray strongly", async () => {
    const { answers } = await ask("xray-direct-001.json");
    expect(answers.behavior_class.choice).toBe("likely_xray");
    expect(answers.behavior_class.probabilities.likely_xray).toBeGreaterThanOrEqual(0.9);
    expect(answers.hidden_information_use.noul).toBeGreaterThanOrEqual(0.85);
    expect(answers.route_naturalness.score).toBeLessThan(1);
  });

  it("keeps branch mining legit", async () => {
    const { answers } = await ask("legit-001.json");
    expect(answers.behavior_class.choice).toBe("legit");
    expect(answers.behavior_class.probabilities.likely_xray).toBeLessThan(0.1);
    expect(answers.route_naturalness.score).toBeGreaterThan(3);
  });

  it("marks weak telemetry as insufficient evidence", async () => {
    const { answers } = await ask("insufficient-001.json");
    expect(answers.behavior_class.choice).toBe("insufficient_evidence");
    expect(answers.evidence_sufficiency.noul).toBeLessThan(0.65);
  });

  it("answers 0.5 for unknown noul questions and uniform for unknown choice labels", async () => {
    const result = await createMockBackend().systemOne({
      state: { unrelated: true },
      questions: {
        anything: { type: "noul", instructions: "?" },
        pick: { type: "choice", instructions: "?", criteria: { a: null, b: null } },
      },
    });
    expect(result.answers.anything.noul).toBe(0.5);
    expect(result.answers.pick.probabilities).toEqual({ a: 0.5, b: 0.5 });
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/jev-evaluator/test/mock-backend.test.ts
```

Expected: FAIL（`createMockBackend` 不在）

- [ ] **Step 3: 実装する**

`packages/jev-evaluator/src/mock-backend.ts`:

```ts
import { MiningSessionFeaturesSchema } from "@jevcraft/schema";
import type {
  ChoiceQuestion,
  Question,
  Questions,
  ScoreQuestion,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import type { JevBackend } from "./backend";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const StateFeaturesSchema = MiningSessionFeaturesSchema.omit({ sessionId: true });

interface MockSignals {
  /** 0 = clearly legit, 1 = clearly acting on hidden information */
  suspicion: number;
  evidenceSufficiency: number;
  enoughEvidence: boolean;
}

const NEUTRAL: MockSignals = { suspicion: 0.5, evidenceSufficiency: 0.5, enoughEvidence: true };

function deriveSignals(state: unknown): MockSignals {
  if (typeof state !== "object" || state === null || !("features" in state)) return NEUTRAL;
  const parsed = StateFeaturesSchema.safeParse((state as { features: unknown }).features);
  if (!parsed.success) return NEUTRAL;
  const f = parsed.data;

  const directness = f.hiddenOreApproach.meanDirectness ?? 0.5;
  const aim = f.hiddenOreApproach.aimAlignmentBeforeRevealRatio ?? 0.5;
  const eff = clamp((f.efficiency.valuableOrePer100Blocks ?? 1) / 8, 0, 1);
  const cave = f.exploration.caveExposureRatio ?? 0.3;
  const samples = f.hiddenOreApproach.sampleCount;

  const raw = 0.45 * directness + 0.35 * aim + 0.2 * eff;
  const suspicion =
    clamp((raw - 0.15) / 0.7, 0, 1) * (1 - 0.5 * cave) * clamp(samples / 10, 0, 1);

  return {
    suspicion,
    evidenceSufficiency: f.quality.enoughEvidence ? f.quality.trajectoryCoverage : 0.2,
    enoughEvidence: f.quality.enoughEvidence,
  };
}

function normalize<K extends string>(weights: Record<K, number>): Record<K, number> {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  const out = {} as Record<K, number>;
  for (const key of Object.keys(weights) as K[]) out[key] = weights[key] / total;
  return out;
}

function argmax<K extends string>(probabilities: Record<K, number>): K {
  let best: K | undefined;
  for (const key of Object.keys(probabilities) as K[]) {
    if (best === undefined || probabilities[key] > probabilities[best]) best = key;
  }
  if (best === undefined) throw new Error("mock backend: empty choice criteria");
  return best;
}

const BEHAVIOR_LABELS = ["legit", "suspicious", "likely_xray", "insufficient_evidence"] as const;

function answerChoice(question: ChoiceQuestion, signals: MockSignals) {
  const labels = Object.keys(question.criteria);
  const isBehaviorClass =
    labels.length === BEHAVIOR_LABELS.length && BEHAVIOR_LABELS.every((l) => labels.includes(l));

  let probabilities: Record<string, number>;
  if (isBehaviorClass) {
    const s = signals.suspicion;
    probabilities = normalize(
      signals.enoughEvidence
        ? { legit: (1 - s) ** 2, suspicious: 2 * s * (1 - s), likely_xray: s ** 2, insufficient_evidence: 0.02 }
        : { legit: 0.05, suspicious: 0.08, likely_xray: 0.02, insufficient_evidence: 0.85 },
    );
  } else {
    probabilities = normalize(Object.fromEntries(labels.map((l) => [l, 1])) as Record<string, number>);
  }
  const choice = argmax(probabilities);
  return { type: "choice" as const, choice, confidence: probabilities[choice] ?? 0, probabilities };
}

function answerNoul(name: string, signals: MockSignals) {
  const noul =
    name === "hidden_information_use"
      ? signals.suspicion
      : name === "evidence_sufficiency"
        ? signals.evidenceSufficiency
        : 0.5;
  return { type: "noul" as const, noul };
}

function answerScore(question: ScoreQuestion, signals: MockSignals) {
  const levels = question.criteria.length;
  const center = (1 - signals.suspicion) * (levels - 1);
  const weights: Record<string, number> = {};
  for (let i = 0; i < levels; i++) weights[String(i)] = Math.exp(-((i - center) ** 2) / 0.5);
  const probabilities = normalize(weights);
  let score = 0;
  for (let i = 0; i < levels; i++) score += i * (probabilities[String(i)] ?? 0);
  const legend = Object.fromEntries(question.criteria.map((desc, i) => [String(i), desc]));
  const confidence = Math.max(...Object.values(probabilities));
  return { type: "score" as const, score, confidence, legend, probabilities };
}

function answer(name: string, question: Question, signals: MockSignals) {
  switch (question.type) {
    case "choice":
      return answerChoice(question, signals);
    case "noul":
      return answerNoul(name, signals);
    case "score":
      return answerScore(question, signals);
  }
}

/** Deterministic stand-in for Jev. Uses only the supplied features; never calls the network. */
export function createMockBackend(): JevBackend {
  return {
    kind: "mock",
    async systemOne<const Q extends Questions>(
      request: SystemOneRequest<Q>,
    ): Promise<SystemOneResult<Q>> {
      const signals = deriveSignals(request.state);
      const answers: Record<string, unknown> = {};
      for (const [name, question] of Object.entries(request.questions)) {
        answers[name] = answer(name, question, signals);
      }
      const inputTokens = Math.ceil(JSON.stringify(request.state ?? "").length / 4);
      return {
        model: request.model ?? "mock-jev",
        answers: answers as SystemOneResult<Q>["answers"],
        usage: { input_tokens: inputTokens, output_tokens: 0 },
      };
    },
  };
}
```

`packages/jev-evaluator/src/index.ts` に追記:

```ts
export { createMockBackend } from "./mock-backend";
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/jev-evaluator/test/mock-backend.test.ts && pnpm typecheck
```

Expected: PASS（8 tests）。「direct xray strongly」で `likely_xray ≥ 0.90` が出ない場合は、mock の係数ではなく fixture の `meanDirectness` / `aimAlignmentBeforeRevealRatio` を上げるのではなく、計算過程を `console.log` で確認してヒューリスティック節の式との差を直す（設計値: direct → s≈0.985 → P(likely_xray)≈0.95）。

- [ ] **Step 5: Commit**

```bash
git add packages/jev-evaluator
git commit -m "feat(evaluator): add deterministic mock Jev backend

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Decision policy

**Files:**
- Create: `packages/jev-evaluator/src/policy.ts`
- Modify: `packages/jev-evaluator/src/index.ts`
- Test: `packages/jev-evaluator/test/policy.test.ts`

**Interfaces:**
- Consumes: `JevAnswers`, `PolicyOutcome` (Task 3)
- Produces:
  - `interface PolicyThresholds { minEvidenceSufficiency; highPriorityXrayProbability; highPriorityHiddenInfo; highPriorityConfidence; reviewCombinedProbability }`
  - `DEFAULT_THRESHOLDS = { 0.65, 0.90, 0.85, 0.60, 0.75 }`
  - `applyPolicy(answers: JevAnswers, quality: { enoughEvidence: boolean }, thresholds = DEFAULT_THRESHOLDS): PolicyOutcome`

- [ ] **Step 1: 失敗するテストを書く**

`packages/jev-evaluator/test/policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { JevAnswers } from "@jevcraft/schema";
import { DEFAULT_THRESHOLDS, applyPolicy } from "@jevcraft/jev-evaluator";

function answers(overrides: {
  legit?: number;
  suspicious?: number;
  likely_xray?: number;
  insufficient_evidence?: number;
  confidence?: number;
  hidden?: number;
  sufficiency?: number;
}): JevAnswers {
  const probabilities = {
    legit: overrides.legit ?? 0,
    suspicious: overrides.suspicious ?? 0,
    likely_xray: overrides.likely_xray ?? 0,
    insufficient_evidence: overrides.insufficient_evidence ?? 0,
  };
  const remaining = 1 - Object.values(probabilities).reduce((a, b) => a + b, 0);
  probabilities.legit += remaining;
  return {
    behaviorClass: {
      choice: "legit",
      probabilities,
      confidence: overrides.confidence ?? 0.9,
    },
    hiddenInformationUse: overrides.hidden ?? 0.1,
    routeNaturalness: { score: 3, normalized: 0.75, confidence: 0.8, probabilities: { "3": 1 } },
    evidenceSufficiency: overrides.sufficiency ?? 0.95,
  };
}

const ok = { enoughEvidence: true };

describe("applyPolicy", () => {
  it("exposes the spec's provisional thresholds", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      minEvidenceSufficiency: 0.65,
      highPriorityXrayProbability: 0.9,
      highPriorityHiddenInfo: 0.85,
      highPriorityConfidence: 0.6,
      reviewCombinedProbability: 0.75,
    });
  });

  it("returns insufficient_evidence when the extractor says evidence is not enough, regardless of Jev", () => {
    expect(applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99 }), { enoughEvidence: false })).toBe(
      "insufficient_evidence",
    );
  });

  it("returns insufficient_evidence when Jev's evidence sufficiency is below 0.65", () => {
    expect(applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99, sufficiency: 0.64 }), ok)).toBe(
      "insufficient_evidence",
    );
    expect(applyPolicy(answers({ likely_xray: 0.99, hidden: 0.99, sufficiency: 0.65 }), ok)).toBe(
      "high_priority_review",
    );
  });

  it("returns high_priority_review only when all three strong signals hold", () => {
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.85, confidence: 0.6 }), ok)).toBe(
      "high_priority_review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.89, hidden: 0.85, confidence: 0.6 }), ok)).toBe(
      "review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.84, confidence: 0.6 }), ok)).toBe(
      "review",
    );
    expect(applyPolicy(answers({ likely_xray: 0.9, hidden: 0.85, confidence: 0.59 }), ok)).toBe(
      "review",
    );
  });

  it("returns review when likely_xray + suspicious reaches 0.75", () => {
    expect(applyPolicy(answers({ likely_xray: 0.4, suspicious: 0.35 }), ok)).toBe("review");
    expect(applyPolicy(answers({ likely_xray: 0.4, suspicious: 0.3499 }), ok)).toBe("no_action");
  });

  it("returns no_action for clearly legit sessions", () => {
    expect(applyPolicy(answers({ legit: 0.9, suspicious: 0.05, likely_xray: 0.03 }), ok)).toBe(
      "no_action",
    );
  });

  it("honours custom thresholds", () => {
    const strict = { ...DEFAULT_THRESHOLDS, reviewCombinedProbability: 0.5 };
    expect(applyPolicy(answers({ likely_xray: 0.3, suspicious: 0.25 }), ok, strict)).toBe("review");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/jev-evaluator/test/policy.test.ts
```

Expected: FAIL

- [ ] **Step 3: 実装する**

`packages/jev-evaluator/src/policy.ts`:

```ts
import type { JevAnswers, PolicyOutcome } from "@jevcraft/schema";

export interface PolicyThresholds {
  /** Below this evidence_sufficiency the session is not classified. */
  minEvidenceSufficiency: number;
  /** P(likely_xray) needed for high priority review. */
  highPriorityXrayProbability: number;
  /** hidden_information_use needed for high priority review. */
  highPriorityHiddenInfo: number;
  /** behavior_class confidence (distribution shape, not P(likely_xray)) needed for high priority. */
  highPriorityConfidence: number;
  /** P(likely_xray) + P(suspicious) needed for ordinary review. */
  reviewCombinedProbability: number;
}

/** Provisional values from spec §10. Tune from labeled data; never treat as final. */
export const DEFAULT_THRESHOLDS: PolicyThresholds = {
  minEvidenceSufficiency: 0.65,
  highPriorityXrayProbability: 0.9,
  highPriorityHiddenInfo: 0.85,
  highPriorityConfidence: 0.6,
  reviewCombinedProbability: 0.75,
};

/**
 * Maps Jev answers to an admin-facing outcome. This never bans, kicks, or rolls back;
 * the strongest outcome is a request for human review.
 */
export function applyPolicy(
  answers: JevAnswers,
  quality: { enoughEvidence: boolean },
  thresholds: PolicyThresholds = DEFAULT_THRESHOLDS,
): PolicyOutcome {
  if (!quality.enoughEvidence) return "insufficient_evidence";
  if (answers.evidenceSufficiency < thresholds.minEvidenceSufficiency) return "insufficient_evidence";

  const p = answers.behaviorClass.probabilities;
  if (
    p.likely_xray >= thresholds.highPriorityXrayProbability &&
    answers.hiddenInformationUse >= thresholds.highPriorityHiddenInfo &&
    answers.behaviorClass.confidence >= thresholds.highPriorityConfidence
  ) {
    return "high_priority_review";
  }
  if (p.likely_xray + p.suspicious >= thresholds.reviewCombinedProbability) return "review";
  return "no_action";
}
```

`packages/jev-evaluator/src/index.ts` に追記:

```ts
export { DEFAULT_THRESHOLDS, applyPolicy, type PolicyThresholds } from "./policy";
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/jev-evaluator/test/policy.test.ts
```

Expected: PASS（7 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/jev-evaluator
git commit -m "feat(evaluator): add provisional decision policy with boundary tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `evaluateSession` と TypeSafe backend wrapper

**Files:**
- Create: `packages/jev-evaluator/src/evaluate-session.ts`, `packages/jev-evaluator/src/typesafe-backend.ts`
- Modify: `packages/jev-evaluator/src/index.ts`
- Test: `packages/jev-evaluator/test/evaluate-session.test.ts`, `packages/jev-evaluator/test/typesafe-backend.test.ts`

**Interfaces:**
- Consumes: `JevBackend`, `xrayV1Questions`, `buildXrayV1State`, `applyPolicy`, `DecisionRecordSchema`, `JevAnswersSchema`
- Produces:
  - `interface EvaluateSessionOptions { backend: JevBackend; model?: string; thresholds?: PolicyThresholds; now?: () => Date; newEvaluationId?: () => string }`
  - `evaluateSession(features: MiningSessionFeatures, options): Promise<DecisionRecord>` — 失敗時も throw せず `answers: null, policyOutcome: "error", error: "<Name>: <message>"` のレコードを返す（fail-open）。
  - `toJevAnswers(raw: XrayV1Answers): JevAnswers`
  - `createTypeSafeBackend(config?: TypeSafeClientConfig): JevBackend`（`kind: "typesafe"`）。API key は `config.apiKey` か環境変数 `TYPESAFE_API_KEY`。
  - `DEFAULT_MODEL = "jev-latest"`

- [ ] **Step 1: 失敗するテストを書く**

`packages/jev-evaluator/test/evaluate-session.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DecisionRecordSchema, MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { type JevBackend, createMockBackend, evaluateSession } from "@jevcraft/jev-evaluator";

const fixtureDir = join(import.meta.dirname, "../../../datasets/fixtures");
const loadFixture = (name: string) =>
  MiningSessionFeaturesSchema.parse(JSON.parse(readFileSync(join(fixtureDir, name), "utf8")));

const fixedOptions = {
  backend: createMockBackend(),
  now: () => new Date("2026-09-19T00:00:00.000Z"),
  newEvaluationId: () => "eval_fixed",
};

describe("evaluateSession", () => {
  it("produces a schema-valid decision record with versions and probabilities", async () => {
    const record = await evaluateSession(loadFixture("xray-direct-001.json"), fixedOptions);
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      schemaVersion: 1,
      evaluationId: "eval_fixed",
      sessionId: "session_fixture_xray_direct_001",
      evaluatedAt: "2026-09-19T00:00:00.000Z",
      model: "jev-latest",
      backend: "mock",
      questionSetVersion: "xray-v1",
      featureExtractorVersion: "0.1.0",
      policyOutcome: "high_priority_review",
      error: null,
    });
    expect(record.answers?.behaviorClass.probabilities.likely_xray).toBeGreaterThanOrEqual(0.9);
    expect(record.answers?.behaviorClass.confidence).toBeGreaterThan(0);
    expect(record.usage?.inputTokens).toBeGreaterThan(0);
  });

  it("normalizes route naturalness so that 1 means natural", async () => {
    const legit = await evaluateSession(loadFixture("legit-001.json"), fixedOptions);
    const xray = await evaluateSession(loadFixture("xray-direct-001.json"), fixedOptions);
    expect(legit.answers?.routeNaturalness.normalized).toBeGreaterThan(0.75);
    expect(xray.answers?.routeNaturalness.normalized).toBeLessThan(0.25);
    expect(legit.answers?.routeNaturalness.normalized).toBeCloseTo(
      (legit.answers?.routeNaturalness.score ?? 0) / 4,
      10,
    );
  });

  it.each([
    ["legit-001.json", "no_action"],
    ["legit-002.json", "no_action"],
    ["xray-direct-001.json", "high_priority_review"],
    ["xray-evasive-001.json", "review"],
    ["insufficient-001.json", "insufficient_evidence"],
  ])("%s -> %s with the mock backend", async (file, outcome) => {
    const record = await evaluateSession(loadFixture(file), fixedOptions);
    expect(record.policyOutcome).toBe(outcome);
  });

  it("passes the model override to the backend", async () => {
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      model: "jev-2026-09",
    });
    expect(record.model).toBe("jev-2026-09");
  });

  it("fails open: backend errors become an error record instead of throwing", async () => {
    const failing: JevBackend = {
      kind: "typesafe",
      systemOne: async () => {
        throw new Error("boom");
      },
    };
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      backend: failing,
    });
    expect(DecisionRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      backend: "typesafe",
      answers: null,
      usage: null,
      policyOutcome: "error",
      error: "Error: boom",
    });
  });

  it("treats a malformed backend response as an error record", async () => {
    const malformed: JevBackend = {
      kind: "typesafe",
      // biome-ignore lint/suspicious/noExplicitAny: intentionally malformed
      systemOne: async () => ({ model: "x", answers: {}, usage: { input_tokens: 1, output_tokens: 1 } }) as any,
    };
    const record = await evaluateSession(loadFixture("legit-001.json"), {
      ...fixedOptions,
      backend: malformed,
    });
    expect(record.policyOutcome).toBe("error");
    expect(record.error).toMatch(/behavior_class|ZodError|Cannot read/);
  });
});
```

`packages/jev-evaluator/test/typesafe-backend.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTypeSafeBackend, xrayV1Questions } from "@jevcraft/jev-evaluator";

const apiResponse = {
  model: "jev-latest",
  answers: {
    behavior_class: {
      type: "choice",
      choice: "legit",
      confidence: 0.8,
      probabilities: { legit: 0.85, suspicious: 0.1, likely_xray: 0.03, insufficient_evidence: 0.02 },
    },
    hidden_information_use: { type: "noul", noul: 0.1 },
    route_naturalness: {
      type: "score",
      score: 3.4,
      confidence: 0.6,
      legend: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
      probabilities: { "0": 0, "1": 0.05, "2": 0.1, "3": 0.25, "4": 0.6 },
    },
    evidence_sufficiency: { type: "noul", noul: 0.9 },
  },
  usage: { input_tokens: 300, output_tokens: 20 },
};

describe("createTypeSafeBackend", () => {
  it("posts to /v1/systemone with a bearer token and returns the parsed answers", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const backend = createTypeSafeBackend({
      apiKey: "test-key",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(apiResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(backend.kind).toBe("typesafe");
    const result = await backend.systemOne({
      state: { task: "t" },
      questions: xrayV1Questions,
      model: "jev-latest",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.model).toBe("jev-latest");
    expect(Object.keys(body.questions).sort()).toEqual([
      "behavior_class",
      "evidence_sufficiency",
      "hidden_information_use",
      "route_naturalness",
    ]);
    expect(result.answers.behavior_class.choice).toBe("legit");
    expect(result.answers.route_naturalness.score).toBe(3.4);
  });

  it("throws when no API key is available", () => {
    const saved = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(() => createTypeSafeBackend()).toThrow();
    } finally {
      if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
    }
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/jev-evaluator
```

Expected: 新規2ファイルが FAIL

- [ ] **Step 3: 実装する**

`packages/jev-evaluator/src/typesafe-backend.ts`:

```ts
import { TypeSafeClient, type TypeSafeClientConfig } from "@typesafe-ai/sdk";
import type { JevBackend } from "./backend";

export const DEFAULT_MODEL = "jev-latest";

/**
 * Wraps the official SDK. The API key comes from `config.apiKey` or the
 * `TYPESAFE_API_KEY` environment variable; it is never read from files.
 * Retries (429/5xx, backoff) are handled by the SDK's RetryPolicy.
 */
export function createTypeSafeBackend(config: TypeSafeClientConfig = {}): JevBackend {
  const client = new TypeSafeClient({ defaultModel: DEFAULT_MODEL, ...config });
  return {
    kind: "typesafe",
    systemOne: (request, options) => client.systemOne(request, options),
  };
}
```

`packages/jev-evaluator/src/evaluate-session.ts`:

```ts
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  type DecisionRecord,
  DecisionRecordSchema,
  type JevAnswers,
  JevAnswersSchema,
  type MiningSessionFeatures,
  MiningSessionFeaturesSchema,
} from "@jevcraft/schema";
import type { JevBackend } from "./backend";
import { DEFAULT_THRESHOLDS, type PolicyThresholds, applyPolicy } from "./policy";
import {
  ROUTE_NATURALNESS_MAX,
  XRAY_V1_VERSION,
  type XrayV1Answers,
  buildXrayV1State,
  xrayV1Questions,
} from "./questions/xray-v1";
import { DEFAULT_MODEL } from "./typesafe-backend";

export interface EvaluateSessionOptions {
  backend: JevBackend;
  /** Model override; defaults to `jev-latest`. */
  model?: string;
  thresholds?: PolicyThresholds;
  /** Injectable clock for reproducible records. */
  now?: () => Date;
  /** Injectable id factory for reproducible records. */
  newEvaluationId?: () => string;
}

/** Converts the SDK answer shape into the stored, validated shape. */
export function toJevAnswers(raw: XrayV1Answers): JevAnswers {
  return JevAnswersSchema.parse({
    behaviorClass: {
      choice: raw.behavior_class.choice,
      probabilities: raw.behavior_class.probabilities,
      confidence: raw.behavior_class.confidence,
    },
    hiddenInformationUse: raw.hidden_information_use.noul,
    routeNaturalness: {
      score: raw.route_naturalness.score,
      normalized: raw.route_naturalness.score / ROUTE_NATURALNESS_MAX,
      confidence: raw.route_naturalness.confidence,
      probabilities: raw.route_naturalness.probabilities,
    },
    evidenceSufficiency: raw.evidence_sufficiency.noul,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Evaluates one mining session. Never throws for backend or validation failures:
 * those become a record with `policyOutcome: "error"` so batch runs and any future
 * live path stay fail-open.
 */
export async function evaluateSession(
  input: MiningSessionFeatures,
  options: EvaluateSessionOptions,
): Promise<DecisionRecord> {
  const features = MiningSessionFeaturesSchema.parse(input);
  const now = options.now ?? (() => new Date());
  const newId = options.newEvaluationId ?? (() => `eval_${randomUUID()}`);
  const model = options.model ?? DEFAULT_MODEL;

  const base = {
    schemaVersion: 1 as const,
    evaluationId: newId(),
    sessionId: features.sessionId,
    evaluatedAt: now().toISOString(),
    backend: options.backend.kind,
    questionSetVersion: XRAY_V1_VERSION,
    featureExtractorVersion: features.featureExtractorVersion,
  };

  const started = performance.now();
  try {
    const result = await options.backend.systemOne({
      state: buildXrayV1State(features),
      questions: xrayV1Questions,
      model,
    });
    const latencyMs = Math.round(performance.now() - started);
    const answers = toJevAnswers(result.answers);
    return DecisionRecordSchema.parse({
      ...base,
      model: result.model,
      answers,
      policyOutcome: applyPolicy(answers, features.quality, options.thresholds ?? DEFAULT_THRESHOLDS),
      latencyMs,
      usage: { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens },
      error: null,
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    return DecisionRecordSchema.parse({
      ...base,
      model,
      answers: null,
      policyOutcome: "error",
      latencyMs,
      usage: null,
      error: describeError(error),
    });
  }
}
```

`packages/jev-evaluator/src/index.ts` に追記:

```ts
export { DEFAULT_MODEL, createTypeSafeBackend } from "./typesafe-backend";
export { evaluateSession, toJevAnswers, type EvaluateSessionOptions } from "./evaluate-session";
```

- [ ] **Step 4: テストを通す**

```bash
pnpm vitest run packages/jev-evaluator && pnpm typecheck && pnpm lint
```

Expected: PASS。`typesafe-backend.test.ts` の `fetch` 型が SDK の `Fetch`（`(input: string, init?) => Promise<Response>`）と一致すること。SDK が `Response` の `content-type` を要求する場合はテストのヘッダーが満たしている。

- [ ] **Step 5: Commit**

```bash
git add packages/jev-evaluator
git commit -m "feat(evaluator): add TypeSafe backend wrapper and fail-open evaluateSession

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: CLI `evaluate` コマンド

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/src/main.ts`, `packages/cli/src/io.ts`, `packages/cli/src/commands/evaluate.ts`
- Test: `packages/cli/test/io.test.ts`, `packages/cli/test/evaluate-command.test.ts`

**Interfaces:**
- Consumes: `evaluateSession`, `createMockBackend`, `createTypeSafeBackend`, `MiningSessionFeaturesSchema`, `DecisionRecordSchema`
- Produces:
  - `resolveInputFiles(paths: string[]): Promise<string[]>` — ファイルはそのまま、ディレクトリは配下の `*.json` / `*.jsonl` をソート順で
  - `readRecords(path: string): Promise<unknown[]>` — `.jsonl` は行ごと、`.json` は配列なら要素、オブジェクトなら1件
  - `writeJsonl(path: string, rows: unknown[]): Promise<void>` — 親ディレクトリを作成
  - `runEvaluate(args: string[], deps?: { env?: NodeJS.ProcessEnv; stderr?: (line: string) => void }): Promise<{ outPath: string; records: DecisionRecord[] }>`
  - CLI: `pnpm jevcraft evaluate <input...> [--out <file>] [--backend auto|typesafe|mock] [--model <name>]`。`--backend auto`（既定）は `TYPESAFE_API_KEY` があれば typesafe、なければ mock を使い stderr に告知。`--out` 既定は `datasets/decisions/<最初の入力のbasename>.jsonl`。

- [ ] **Step 1: パッケージを作る**

`packages/cli/package.json`:

```json
{
  "name": "@jevcraft/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/main.ts"
  },
  "dependencies": {
    "@jevcraft/eval-runner": "workspace:*",
    "@jevcraft/jev-evaluator": "workspace:*",
    "@jevcraft/schema": "workspace:*",
    "zod": "^4.6.5"
  }
}
```

`@jevcraft/eval-runner` は Task 10 で作るため、**この時点では依存から外しておき、Task 11 で追加する**。上記JSONから `"@jevcraft/eval-runner": "workspace:*",` の行を除いた状態で保存し、`pnpm install` を実行する。

- [ ] **Step 2: 失敗するテストを書く**

`packages/cli/test/io.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRecords, resolveInputFiles, writeJsonl } from "../src/io";

const dir = mkdtempSync(join(tmpdir(), "jevcraft-io-"));

describe("io", () => {
  it("reads a single json object as one record", async () => {
    const file = join(dir, "one.json");
    writeFileSync(file, JSON.stringify({ a: 1 }));
    expect(await readRecords(file)).toEqual([{ a: 1 }]);
  });

  it("reads a json array as many records", async () => {
    const file = join(dir, "many.json");
    writeFileSync(file, JSON.stringify([{ a: 1 }, { a: 2 }]));
    expect(await readRecords(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads jsonl line by line and skips blank lines", async () => {
    const file = join(dir, "rows.jsonl");
    writeFileSync(file, '{"a":1}\n\n{"a":2}\n');
    expect(await readRecords(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("writes jsonl and creates parent directories", async () => {
    const file = join(dir, "nested/out.jsonl");
    await writeJsonl(file, [{ a: 1 }, { b: 2 }]);
    expect(readFileSync(file, "utf8")).toBe('{"a":1}\n{"b":2}\n');
  });

  it("expands directories to their json/jsonl files in sorted order", async () => {
    const sub = join(dir, "inputs");
    await writeJsonl(join(sub, "b.jsonl"), [{}]);
    writeFileSync(join(sub, "a.json"), "{}");
    writeFileSync(join(sub, "README.md"), "ignored");
    const files = await resolveInputFiles([sub, join(dir, "one.json")]);
    expect(files).toEqual([join(sub, "a.json"), join(sub, "b.jsonl"), join(dir, "one.json")]);
  });
});
```

`packages/cli/test/evaluate-command.test.ts`:

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DecisionRecordSchema } from "@jevcraft/schema";
import { runEvaluate } from "../src/commands/evaluate";

const root = join(import.meta.dirname, "../../..");
const fixtures = join(root, "datasets/fixtures");
const outDir = mkdtempSync(join(tmpdir(), "jevcraft-eval-"));

describe("jevcraft evaluate", () => {
  it("evaluates a single fixture with the mock backend and writes schema-valid jsonl", async () => {
    const out = join(outDir, "single.jsonl");
    const notes: string[] = [];
    const { records } = await runEvaluate(
      [join(fixtures, "xray-direct-001.json"), "--out", out, "--backend", "mock"],
      { env: {}, stderr: (line) => notes.push(line) },
    );
    expect(records).toHaveLength(1);
    const lines = readFileSync(out, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const stored = DecisionRecordSchema.parse(JSON.parse(lines[0] ?? ""));
    expect(stored.policyOutcome).toBe("high_priority_review");
    expect(stored.backend).toBe("mock");
  });

  it("evaluates a whole directory", async () => {
    const out = join(outDir, "dir.jsonl");
    const { records } = await runEvaluate([fixtures, "--out", out, "--backend", "mock"], { env: {} });
    expect(records.map((r) => r.sessionId).sort()).toEqual([
      "session_fixture_insufficient_001",
      "session_fixture_legit_001",
      "session_fixture_legit_002",
      "session_fixture_xray_direct_001",
      "session_fixture_xray_evasive_001",
    ]);
  });

  it("falls back to mock when --backend auto and no API key, and says so", async () => {
    const notes: string[] = [];
    const { records } = await runEvaluate(
      [join(fixtures, "legit-001.json"), "--out", join(outDir, "auto.jsonl")],
      { env: {}, stderr: (line) => notes.push(line) },
    );
    expect(records[0]?.backend).toBe("mock");
    expect(notes.join("\n")).toMatch(/TYPESAFE_API_KEY/);
  });

  it("rejects --backend typesafe without an API key", async () => {
    await expect(
      runEvaluate([join(fixtures, "legit-001.json"), "--backend", "typesafe", "--out", join(outDir, "x.jsonl")], {
        env: {},
      }),
    ).rejects.toThrow(/TYPESAFE_API_KEY/);
  });

  it("rejects input that is not a valid feature document", async () => {
    await expect(
      runEvaluate([join(root, "datasets/labels/fixtures.jsonl"), "--backend", "mock", "--out", join(outDir, "bad.jsonl")], {
        env: {},
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
pnpm vitest run packages/cli
```

Expected: FAIL（モジュール不在）

- [ ] **Step 4: 実装する**

`packages/cli/src/io.ts`:

```ts
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function resolveInputFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const path of paths) {
    const info = await stat(path);
    if (info.isDirectory()) {
      const entries = (await readdir(path))
        .filter((name) => name.endsWith(".json") || name.endsWith(".jsonl"))
        .sort();
      for (const name of entries) files.push(join(path, name));
    } else {
      files.push(path);
    }
  }
  return files;
}

export async function readRecords(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  if (path.endsWith(".jsonl")) {
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as unknown);
  }
  const parsed = JSON.parse(text) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(path, body.length > 0 ? `${body}\n` : "", "utf8");
}
```

`packages/cli/src/commands/evaluate.ts`:

```ts
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  type JevBackend,
  createMockBackend,
  createTypeSafeBackend,
  evaluateSession,
} from "@jevcraft/jev-evaluator";
import { type DecisionRecord, MiningSessionFeaturesSchema } from "@jevcraft/schema";
import { readRecords, resolveInputFiles, writeJsonl } from "../io";

export interface EvaluateDeps {
  env?: NodeJS.ProcessEnv;
  stderr?: (line: string) => void;
}

export const EVALUATE_USAGE =
  "usage: jevcraft evaluate <input.json|input.jsonl|dir>... [--out <file.jsonl>] [--backend auto|typesafe|mock] [--model <name>]";

function chooseBackend(
  requested: string,
  env: NodeJS.ProcessEnv,
  stderr: (line: string) => void,
): JevBackend {
  const hasKey = (env.TYPESAFE_API_KEY ?? "").trim() !== "";
  switch (requested) {
    case "mock":
      return createMockBackend();
    case "typesafe":
      if (!hasKey) throw new Error("--backend typesafe requires TYPESAFE_API_KEY in the environment");
      return createTypeSafeBackend({ apiKey: env.TYPESAFE_API_KEY });
    case "auto":
      if (hasKey) return createTypeSafeBackend({ apiKey: env.TYPESAFE_API_KEY });
      stderr("TYPESAFE_API_KEY is not set; using the mock backend (no network calls).");
      return createMockBackend();
    default:
      throw new Error(`unknown backend "${requested}". ${EVALUATE_USAGE}`);
  }
}

export async function runEvaluate(
  args: string[],
  deps: EvaluateDeps = {},
): Promise<{ outPath: string; records: DecisionRecord[] }> {
  const env = deps.env ?? process.env;
  const stderr = deps.stderr ?? ((line) => console.error(line));

  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      backend: { type: "string", default: "auto" },
      model: { type: "string" },
    },
  });
  if (positionals.length === 0) throw new Error(EVALUATE_USAGE);

  const files = await resolveInputFiles(positionals);
  const features = [];
  for (const file of files) {
    for (const raw of await readRecords(file)) {
      const parsed = MiningSessionFeaturesSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`invalid MiningSessionFeatures in ${file}: ${parsed.error.message}`);
      }
      features.push(parsed.data);
    }
  }

  const backend = chooseBackend(values.backend, env, stderr);
  const firstInput = positionals[0] ?? "decisions";
  const outPath =
    values.out ?? join("datasets", "decisions", `${basename(firstInput, extname(firstInput))}.jsonl`);

  const records: DecisionRecord[] = [];
  for (const f of features) {
    const record = await evaluateSession(f, {
      backend,
      ...(values.model !== undefined ? { model: values.model } : {}),
    });
    records.push(record);
    if (record.error !== null) stderr(`${record.sessionId}: ${record.error}`);
  }
  await writeJsonl(outPath, records);

  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.policyOutcome, (counts.get(r.policyOutcome) ?? 0) + 1);
  stderr(
    `evaluated ${records.length} session(s) with ${backend.kind} -> ${outPath} ` +
      `[${[...counts].map(([k, v]) => `${k}=${v}`).join(", ")}]`,
  );
  return { outPath, records };
}
```

`packages/cli/src/main.ts`:

```ts
import { EVALUATE_USAGE, runEvaluate } from "./commands/evaluate";

const USAGE = `jevcraft <command>

commands:
  evaluate   ${EVALUATE_USAGE}
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "evaluate":
      await runEvaluate(rest);
      return 0;
    default:
      console.error(USAGE);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
```

- [ ] **Step 5: テストと実コマンドを通す**

```bash
pnpm vitest run packages/cli && pnpm typecheck && pnpm lint
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json --backend mock
cat datasets/decisions/xray-direct-001.jsonl
```

Expected: テスト PASS（10 tests）。CLI は stderr に `evaluated 1 session(s) with mock -> datasets/decisions/xray-direct-001.jsonl [high_priority_review=1]` を出し、JSONL 1行が書かれる。`git status` で `datasets/decisions/xray-direct-001.jsonl` が untracked に**出ない**こと（.gitignore 確認）。

- [ ] **Step 6: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): add evaluate command with mock fallback and jsonl output

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Eval runner — ラベル突合と指標

**Files:**
- Create: `packages/eval-runner/package.json`, `packages/eval-runner/src/index.ts`, `packages/eval-runner/src/join.ts`, `packages/eval-runner/src/metrics.ts`
- Test: `packages/eval-runner/test/join.test.ts`, `packages/eval-runner/test/metrics.test.ts`

**Interfaces:**
- Consumes: `DecisionRecord`, `SessionLabel`, `GroundTruthLabel`
- Produces:
  - `interface LabeledDecision { sessionId: string; decision: DecisionRecord; label: SessionLabel }`
  - `interface JoinResult { rows: LabeledDecision[]; unknownCount: number; errorCount: number; unlabeledSessionIds: string[]; duplicateLabelSessionIds: string[] }`
  - `joinDecisionsWithLabels(decisions: DecisionRecord[], labels: SessionLabel[]): JoinResult` — `unknown` ラベルと `answers === null` の行は `rows` から除外して数える
  - `isTruthPositive(label: GroundTruthLabel): boolean` = `simulated_xray | known_cheat`
  - `policyPredictsPositive(d: DecisionRecord): boolean` = `review | high_priority_review`
  - `xrayProbabilityAtLeast(threshold: number): (d: DecisionRecord) => boolean`
  - `interface ConfusionMatrix { tp; fp; tn; fn }`, `confusionMatrix(rows, predictPositive): ConfusionMatrix`
  - `interface BinaryMetrics { precision; recall; fpr; fnr; f1; accuracy }`（分母0は `null`）、`metricsFrom(cm): BinaryMetrics`
  - `thresholdSweep(rows, thresholds: number[]): { threshold; cm; metrics }[]`
  - `DEFAULT_SWEEP = [0.5, 0.55, ..., 0.95]`
  - `groupBySubtype(rows): { subtype: string; count: number; cm; metrics }[]`（`subtype ?? "unspecified"`）
  - `accuracyByConfidenceBand(rows): { band: string; count: number; accuracy: number | null }[]`（帯: `[0,0.5)`, `[0.5,0.7)`, `[0.7,0.9)`, `[0.9,1]`）
  - `percentile(values: number[], p: number): number | null`（nearest-rank、空なら null）
  - `latencyStats(decisions): { p50; p95; p99 }`
  - `tokenTotals(decisions): { inputTokens; outputTokens }`
  - `insufficientEvidenceRate(decisions): number | null`

- [ ] **Step 1: パッケージを作る**

`packages/eval-runner/package.json`:

```json
{
  "name": "@jevcraft/eval-runner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@jevcraft/schema": "workspace:*"
  }
}
```

```bash
pnpm install
```

- [ ] **Step 2: 失敗するテストを書く**

`packages/eval-runner/test/helpers.ts`（テスト用ビルダー）:

```ts
import type { DecisionRecord, GroundTruthLabel, PolicyOutcome, SessionLabel } from "@jevcraft/schema";

export function decision(
  sessionId: string,
  policyOutcome: PolicyOutcome,
  overrides: { likelyXray?: number; confidence?: number; latencyMs?: number; error?: string } = {},
): DecisionRecord {
  const likelyXray = overrides.likelyXray ?? (policyOutcome === "no_action" ? 0.1 : 0.8);
  const failed = overrides.error !== undefined;
  return {
    schemaVersion: 1,
    evaluationId: `eval_${sessionId}`,
    sessionId,
    evaluatedAt: "2026-09-19T00:00:00.000Z",
    model: "mock-jev",
    backend: "mock",
    questionSetVersion: "xray-v1",
    featureExtractorVersion: "0.1.0",
    answers: failed
      ? null
      : {
          behaviorClass: {
            choice: likelyXray >= 0.5 ? "likely_xray" : "legit",
            probabilities: {
              legit: 1 - likelyXray - 0.1,
              suspicious: 0.1,
              likely_xray: likelyXray,
              insufficient_evidence: 0,
            },
            confidence: overrides.confidence ?? 0.8,
          },
          hiddenInformationUse: likelyXray,
          routeNaturalness: { score: 2, normalized: 0.5, confidence: 0.5, probabilities: { "2": 1 } },
          evidenceSufficiency: 0.9,
        },
    policyOutcome: failed ? "error" : policyOutcome,
    latencyMs: overrides.latencyMs ?? 100,
    usage: failed ? null : { inputTokens: 100, outputTokens: 10 },
    error: overrides.error ?? null,
  };
}

export function label(
  sessionId: string,
  value: GroundTruthLabel,
  subtype: SessionLabel["subtype"] = null,
): SessionLabel {
  return { sessionId, label: value, subtype, reviewStatus: "single_review" };
}
```

`packages/eval-runner/test/join.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { joinDecisionsWithLabels } from "@jevcraft/eval-runner";
import { decision, label } from "./helpers";

describe("joinDecisionsWithLabels", () => {
  it("pairs decisions with labels by session id", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review"), decision("b", "no_action")],
      [label("a", "simulated_xray"), label("b", "legit")],
    );
    expect(result.rows.map((r) => r.sessionId)).toEqual(["a", "b"]);
    expect(result.unknownCount).toBe(0);
    expect(result.errorCount).toBe(0);
    expect(result.unlabeledSessionIds).toEqual([]);
  });

  it("excludes unknown labels and counts them", () => {
    const result = joinDecisionsWithLabels([decision("a", "review")], [label("a", "unknown")]);
    expect(result.rows).toEqual([]);
    expect(result.unknownCount).toBe(1);
  });

  it("excludes error records and counts them", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review", { error: "boom" })],
      [label("a", "legit")],
    );
    expect(result.rows).toEqual([]);
    expect(result.errorCount).toBe(1);
  });

  it("reports decisions without labels and duplicate labels", () => {
    const result = joinDecisionsWithLabels(
      [decision("a", "review"), decision("b", "review")],
      [label("a", "legit"), label("a", "simulated_xray")],
    );
    expect(result.unlabeledSessionIds).toEqual(["b"]);
    expect(result.duplicateLabelSessionIds).toEqual(["a"]);
    expect(result.rows).toEqual([]);
  });
});
```

`packages/eval-runner/test/metrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  accuracyByConfidenceBand,
  confusionMatrix,
  groupBySubtype,
  insufficientEvidenceRate,
  joinDecisionsWithLabels,
  latencyStats,
  metricsFrom,
  percentile,
  policyPredictsPositive,
  thresholdSweep,
  tokenTotals,
  xrayProbabilityAtLeast,
} from "@jevcraft/eval-runner";
import { decision, label } from "./helpers";

const rows = joinDecisionsWithLabels(
  [
    decision("tp", "review", { likelyXray: 0.9, confidence: 0.95 }),
    decision("fn", "no_action", { likelyXray: 0.3, confidence: 0.4 }),
    decision("fp", "high_priority_review", { likelyXray: 0.7, confidence: 0.75 }),
    decision("tn", "no_action", { likelyXray: 0.05, confidence: 0.6 }),
  ],
  [
    label("tp", "simulated_xray", "direct_xray"),
    label("fn", "known_cheat", "humanized_xray"),
    label("fp", "legit", "cave_mining"),
    label("tn", "legit", "branch_mining"),
  ],
).rows;

describe("confusion matrix and metrics", () => {
  it("counts tp/fp/tn/fn from the policy outcome", () => {
    expect(confusionMatrix(rows, policyPredictsPositive)).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
  });

  it("computes precision, recall, fpr, fnr, f1, accuracy", () => {
    expect(metricsFrom({ tp: 1, fp: 1, tn: 1, fn: 1 })).toEqual({
      precision: 0.5,
      recall: 0.5,
      fpr: 0.5,
      fnr: 0.5,
      f1: 0.5,
      accuracy: 0.5,
    });
  });

  it("returns null instead of NaN when a denominator is zero", () => {
    expect(metricsFrom({ tp: 0, fp: 0, tn: 0, fn: 0 })).toEqual({
      precision: null,
      recall: null,
      fpr: null,
      fnr: null,
      f1: null,
      accuracy: null,
    });
  });

  it("sweeps P(likely_xray) thresholds", () => {
    const sweep = thresholdSweep(rows, [0.5, 0.8]);
    expect(sweep[0]).toMatchObject({ threshold: 0.5, cm: { tp: 1, fp: 1, tn: 1, fn: 1 } });
    expect(sweep[1]).toMatchObject({ threshold: 0.8, cm: { tp: 1, fp: 0, tn: 2, fn: 1 } });
    expect(xrayProbabilityAtLeast(0.8)(rows[0]?.decision ?? decision("x", "no_action"))).toBe(true);
  });

  it("groups by label subtype", () => {
    const groups = groupBySubtype(rows);
    expect(groups.map((g) => g.subtype)).toEqual([
      "branch_mining",
      "cave_mining",
      "direct_xray",
      "humanized_xray",
    ]);
    expect(groups.find((g) => g.subtype === "cave_mining")).toMatchObject({
      count: 1,
      cm: { tp: 0, fp: 1, tn: 0, fn: 0 },
    });
  });

  it("reports accuracy per confidence band", () => {
    const bands = accuracyByConfidenceBand(rows);
    expect(bands.map((b) => b.band)).toEqual(["[0,0.5)", "[0.5,0.7)", "[0.7,0.9)", "[0.9,1]"]);
    expect(bands[0]).toEqual({ band: "[0,0.5)", count: 1, accuracy: 0 });
    expect(bands[3]).toEqual({ band: "[0.9,1]", count: 1, accuracy: 1 });
  });
});

describe("operational stats", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([30, 10, 20], 100)).toBe(30);
  });

  it("summarizes latency and tokens over all decisions, including errors", () => {
    const decisions = [
      decision("a", "review", { latencyMs: 100 }),
      decision("b", "no_action", { latencyMs: 300 }),
      decision("c", "review", { latencyMs: 50, error: "boom" }),
    ];
    expect(latencyStats(decisions)).toEqual({ p50: 100, p95: 300, p99: 300 });
    expect(tokenTotals(decisions)).toEqual({ inputTokens: 200, outputTokens: 20 });
  });

  it("computes the insufficient_evidence rate over non-error decisions", () => {
    expect(
      insufficientEvidenceRate([
        decision("a", "insufficient_evidence"),
        decision("b", "no_action"),
        decision("c", "review", { error: "boom" }),
      ]),
    ).toBe(0.5);
    expect(insufficientEvidenceRate([])).toBeNull();
  });
});
```

- [ ] **Step 3: 失敗を確認する**

```bash
pnpm vitest run packages/eval-runner
```

Expected: FAIL

- [ ] **Step 4: 実装する**

`packages/eval-runner/src/join.ts`:

```ts
import type { DecisionRecord, SessionLabel } from "@jevcraft/schema";

export interface LabeledDecision {
  sessionId: string;
  decision: DecisionRecord;
  label: SessionLabel;
}

export interface JoinResult {
  /** Rows usable for precision/recall: labeled, not `unknown`, and successfully evaluated. */
  rows: LabeledDecision[];
  unknownCount: number;
  errorCount: number;
  unlabeledSessionIds: string[];
  duplicateLabelSessionIds: string[];
}

export function joinDecisionsWithLabels(
  decisions: DecisionRecord[],
  labels: SessionLabel[],
): JoinResult {
  const bySession = new Map<string, SessionLabel>();
  const duplicates = new Set<string>();
  for (const label of labels) {
    if (bySession.has(label.sessionId)) duplicates.add(label.sessionId);
    else bySession.set(label.sessionId, label);
  }

  const result: JoinResult = {
    rows: [],
    unknownCount: 0,
    errorCount: 0,
    unlabeledSessionIds: [],
    duplicateLabelSessionIds: [...duplicates].sort(),
  };

  for (const decision of decisions) {
    const label = bySession.get(decision.sessionId);
    if (label === undefined) {
      result.unlabeledSessionIds.push(decision.sessionId);
      continue;
    }
    if (duplicates.has(decision.sessionId)) continue;
    if (label.label === "unknown") {
      result.unknownCount++;
      continue;
    }
    if (decision.answers === null) {
      result.errorCount++;
      continue;
    }
    result.rows.push({ sessionId: decision.sessionId, decision, label });
  }
  return result;
}
```

`packages/eval-runner/src/metrics.ts`:

```ts
import type { DecisionRecord, GroundTruthLabel } from "@jevcraft/schema";
import type { LabeledDecision } from "./join";

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface BinaryMetrics {
  precision: number | null;
  recall: number | null;
  fpr: number | null;
  fnr: number | null;
  f1: number | null;
  accuracy: number | null;
}

export const isTruthPositive = (label: GroundTruthLabel): boolean =>
  label === "simulated_xray" || label === "known_cheat";

export const policyPredictsPositive = (d: DecisionRecord): boolean =>
  d.policyOutcome === "review" || d.policyOutcome === "high_priority_review";

export const xrayProbabilityAtLeast =
  (threshold: number) =>
  (d: DecisionRecord): boolean =>
    d.answers !== null && d.answers.behaviorClass.probabilities.likely_xray >= threshold;

export function confusionMatrix(
  rows: LabeledDecision[],
  predictPositive: (d: DecisionRecord) => boolean,
): ConfusionMatrix {
  const cm: ConfusionMatrix = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const row of rows) {
    const truth = isTruthPositive(row.label.label);
    const predicted = predictPositive(row.decision);
    if (truth && predicted) cm.tp++;
    else if (!truth && predicted) cm.fp++;
    else if (truth && !predicted) cm.fn++;
    else cm.tn++;
  }
  return cm;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export function metricsFrom(cm: ConfusionMatrix): BinaryMetrics {
  const precision = ratio(cm.tp, cm.tp + cm.fp);
  const recall = ratio(cm.tp, cm.tp + cm.fn);
  const f1 =
    precision === null || recall === null
      ? null
      : precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
  return {
    precision,
    recall,
    fpr: ratio(cm.fp, cm.fp + cm.tn),
    fnr: ratio(cm.fn, cm.fn + cm.tp),
    f1,
    accuracy: ratio(cm.tp + cm.tn, cm.tp + cm.fp + cm.tn + cm.fn),
  };
}

export const DEFAULT_SWEEP = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export interface SweepPoint {
  threshold: number;
  cm: ConfusionMatrix;
  metrics: BinaryMetrics;
}

export function thresholdSweep(rows: LabeledDecision[], thresholds: number[]): SweepPoint[] {
  return thresholds.map((threshold) => {
    const cm = confusionMatrix(rows, xrayProbabilityAtLeast(threshold));
    return { threshold, cm, metrics: metricsFrom(cm) };
  });
}

export interface SubtypeGroup {
  subtype: string;
  count: number;
  cm: ConfusionMatrix;
  metrics: BinaryMetrics;
}

export function groupBySubtype(rows: LabeledDecision[]): SubtypeGroup[] {
  const groups = new Map<string, LabeledDecision[]>();
  for (const row of rows) {
    const key = row.label.subtype ?? "unspecified";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subtype, list]) => {
      const cm = confusionMatrix(list, policyPredictsPositive);
      return { subtype, count: list.length, cm, metrics: metricsFrom(cm) };
    });
}

export interface ConfidenceBand {
  band: string;
  count: number;
  accuracy: number | null;
}

const BANDS: { band: string; min: number; max: number; inclusiveMax: boolean }[] = [
  { band: "[0,0.5)", min: 0, max: 0.5, inclusiveMax: false },
  { band: "[0.5,0.7)", min: 0.5, max: 0.7, inclusiveMax: false },
  { band: "[0.7,0.9)", min: 0.7, max: 0.9, inclusiveMax: false },
  { band: "[0.9,1]", min: 0.9, max: 1, inclusiveMax: true },
];

export function accuracyByConfidenceBand(rows: LabeledDecision[]): ConfidenceBand[] {
  return BANDS.map(({ band, min, max, inclusiveMax }) => {
    const inBand = rows.filter((row) => {
      const c = row.decision.answers?.behaviorClass.confidence ?? Number.NaN;
      return c >= min && (inclusiveMax ? c <= max : c < max);
    });
    const correct = inBand.filter(
      (row) => isTruthPositive(row.label.label) === policyPredictsPositive(row.decision),
    ).length;
    return { band, count: inBand.length, accuracy: ratio(correct, inBand.length) };
  });
}

/** Nearest-rank percentile. `p` is 0..100. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? null;
}

export function latencyStats(decisions: DecisionRecord[]) {
  const latencies = decisions.map((d) => d.latencyMs);
  return {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
}

export function tokenTotals(decisions: DecisionRecord[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const d of decisions) {
    inputTokens += d.usage?.inputTokens ?? 0;
    outputTokens += d.usage?.outputTokens ?? 0;
  }
  return { inputTokens, outputTokens };
}

export function insufficientEvidenceRate(decisions: DecisionRecord[]): number | null {
  const evaluated = decisions.filter((d) => d.answers !== null);
  const insufficient = evaluated.filter((d) => d.policyOutcome === "insufficient_evidence").length;
  return ratio(insufficient, evaluated.length);
}
```

`packages/eval-runner/src/index.ts`:

```ts
export { joinDecisionsWithLabels, type JoinResult, type LabeledDecision } from "./join";
export {
  DEFAULT_SWEEP,
  accuracyByConfidenceBand,
  confusionMatrix,
  groupBySubtype,
  insufficientEvidenceRate,
  isTruthPositive,
  latencyStats,
  metricsFrom,
  percentile,
  policyPredictsPositive,
  thresholdSweep,
  tokenTotals,
  xrayProbabilityAtLeast,
  type BinaryMetrics,
  type ConfidenceBand,
  type ConfusionMatrix,
  type SubtypeGroup,
  type SweepPoint,
} from "./metrics";
```

- [ ] **Step 5: テストを通す**

```bash
pnpm vitest run packages/eval-runner && pnpm typecheck && pnpm lint
```

Expected: PASS（join 4 + metrics 9）

- [ ] **Step 6: Commit**

```bash
git add packages/eval-runner pnpm-lock.yaml
git commit -m "feat(eval): add labeled dataset join and confusion matrix metrics

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Markdown レポートと CLI `report` コマンド

**Files:**
- Create: `packages/eval-runner/src/report.ts`, `packages/cli/src/commands/report.ts`
- Modify: `packages/eval-runner/src/index.ts`, `packages/cli/src/main.ts`, `packages/cli/package.json`
- Test: `packages/eval-runner/test/report.test.ts`, `packages/cli/test/report-command.test.ts`

**Interfaces:**
- Consumes: Task 10 の全関数、`readRecords` / `resolveInputFiles`（Task 9）
- Produces:
  - `interface ReportInput { title: string; decisions: DecisionRecord[]; labels: SessionLabel[]; sweep?: number[] }`
  - `buildReport(input: ReportInput): string`（Markdown）
  - `runReport(args: string[]): Promise<{ outPath: string; markdown: string }>`
  - CLI: `pnpm jevcraft report --decisions <file|dir> --labels <file|dir> [--out <file.md>] [--title <text>]`。`--out` 既定は `reports/<decisions basename>.md`。

**レポートに必須の節（spec §14）:** Summary（件数、unknown/error/unlabeled）、Policy outcome confusion matrix + Precision/Recall/FPR/FNR/F1/Accuracy、Threshold sweep 表、By subtype、By confidence band、Latency p50/p95/p99、Token totals、insufficient_evidence rate、False positives 一覧、False negatives 一覧。

- [ ] **Step 1: 失敗するテストを書く**

`packages/eval-runner/test/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReport } from "@jevcraft/eval-runner";
import { decision, label } from "./helpers";

describe("buildReport", () => {
  const markdown = buildReport({
    title: "run-test",
    decisions: [
      decision("tp", "review", { likelyXray: 0.9, confidence: 0.95, latencyMs: 120 }),
      decision("fn", "no_action", { likelyXray: 0.3, confidence: 0.4, latencyMs: 80 }),
      decision("fp", "high_priority_review", { likelyXray: 0.7, confidence: 0.75, latencyMs: 200 }),
      decision("tn", "no_action", { likelyXray: 0.05, confidence: 0.6, latencyMs: 90 }),
      decision("unk", "insufficient_evidence", { likelyXray: 0.1 }),
      decision("err", "review", { error: "APIConnectionError: fetch failed" }),
    ],
    labels: [
      label("tp", "simulated_xray", "direct_xray"),
      label("fn", "known_cheat", "humanized_xray"),
      label("fp", "legit", "cave_mining"),
      label("tn", "legit", "branch_mining"),
      label("unk", "unknown"),
      label("err", "legit"),
    ],
    sweep: [0.5, 0.8],
  });

  it("starts with the title and summary counts", () => {
    expect(markdown).toMatch(/^# JevCraft evaluation report: run-test/);
    expect(markdown).toContain("| Decisions | 6 |");
    expect(markdown).toContain("| Usable for metrics | 4 |");
    expect(markdown).toContain("| Excluded: unknown label | 1 |");
    expect(markdown).toContain("| Excluded: evaluation error | 1 |");
  });

  it("includes the policy confusion matrix and headline metrics with FPR", () => {
    expect(markdown).toContain("## Policy outcome");
    expect(markdown).toContain("| TP | FP | TN | FN |");
    expect(markdown).toContain("| 1 | 1 | 1 | 1 |");
    expect(markdown).toMatch(/\| FPR \| 0\.500 \|/);
    expect(markdown).toMatch(/\| Precision \| 0\.500 \|/);
  });

  it("includes a threshold sweep table", () => {
    expect(markdown).toContain("## Threshold sweep on P(likely_xray)");
    expect(markdown).toMatch(/\| 0\.50 \| 1 \| 1 \| 1 \| 1 \|/);
    expect(markdown).toMatch(/\| 0\.80 \| 1 \| 0 \| 2 \| 1 \|/);
  });

  it("includes subtype, confidence band, latency, tokens and insufficient rate", () => {
    expect(markdown).toContain("## By scenario subtype");
    expect(markdown).toContain("| cave_mining | 1 |");
    expect(markdown).toContain("## Accuracy by confidence band");
    expect(markdown).toContain("| [0.9,1] | 1 | 1.000 |");
    expect(markdown).toContain("## Latency and cost");
    expect(markdown).toMatch(/\| p95 \| 200 ms \|/);
    expect(markdown).toMatch(/\| Input tokens \| 500 \|/);
    expect(markdown).toMatch(/\| insufficient_evidence rate \| 0\.200 \|/);
  });

  it("lists false positives and false negatives by session id", () => {
    expect(markdown).toContain("## False positives");
    expect(markdown).toMatch(/\| fp \| legit \| cave_mining \| high_priority_review \| 0\.700 \|/);
    expect(markdown).toContain("## False negatives");
    expect(markdown).toMatch(/\| fn \| known_cheat \| humanized_xray \| no_action \| 0\.300 \|/);
  });

  it("prints n/a instead of NaN when there is nothing to measure", () => {
    const empty = buildReport({ title: "empty", decisions: [], labels: [] });
    expect(empty).toContain("| Precision | n/a |");
    expect(empty).not.toContain("NaN");
  });
});
```

`packages/cli/test/report-command.test.ts`:

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEvaluate } from "../src/commands/evaluate";
import { runReport } from "../src/commands/report";

const root = join(import.meta.dirname, "../../..");
const dir = mkdtempSync(join(tmpdir(), "jevcraft-report-"));

describe("jevcraft report", () => {
  it("renders a report from evaluate output and the fixture labels", async () => {
    const decisions = join(dir, "fixtures.jsonl");
    await runEvaluate([join(root, "datasets/fixtures"), "--backend", "mock", "--out", decisions], { env: {} });

    const out = join(dir, "fixtures.md");
    const { markdown } = await runReport([
      "--decisions",
      decisions,
      "--labels",
      join(root, "datasets/labels/fixtures.jsonl"),
      "--out",
      out,
    ]);

    expect(readFileSync(out, "utf8")).toBe(markdown);
    expect(markdown).toContain("| Decisions | 5 |");
    expect(markdown).toContain("| Usable for metrics | 4 |");
    // The mock is designed to separate the fixtures perfectly; the report must say so.
    expect(markdown).toMatch(/\| FPR \| 0\.000 \|/);
    expect(markdown).toMatch(/\| Recall \| 1\.000 \|/);
  });

  it("requires --decisions and --labels", async () => {
    await expect(runReport(["--decisions", "x.jsonl"])).rejects.toThrow(/--labels/);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

```bash
pnpm vitest run packages/eval-runner/test/report.test.ts packages/cli/test/report-command.test.ts
```

Expected: FAIL

- [ ] **Step 3: 実装する**

`packages/eval-runner/src/report.ts`:

```ts
import type { DecisionRecord, SessionLabel } from "@jevcraft/schema";
import { type LabeledDecision, joinDecisionsWithLabels } from "./join";
import {
  type BinaryMetrics,
  type ConfusionMatrix,
  DEFAULT_SWEEP,
  accuracyByConfidenceBand,
  confusionMatrix,
  groupBySubtype,
  insufficientEvidenceRate,
  isTruthPositive,
  latencyStats,
  metricsFrom,
  policyPredictsPositive,
  thresholdSweep,
  tokenTotals,
} from "./metrics";

export interface ReportInput {
  title: string;
  decisions: DecisionRecord[];
  labels: SessionLabel[];
  sweep?: number[];
}

const fmt = (value: number | null, digits = 3): string =>
  value === null ? "n/a" : value.toFixed(digits);
const ms = (value: number | null): string => (value === null ? "n/a" : `${value} ms`);

function cmRow(cm: ConfusionMatrix): string {
  return `| ${cm.tp} | ${cm.fp} | ${cm.tn} | ${cm.fn} |`;
}

function metricsTable(m: BinaryMetrics): string[] {
  return [
    "| Metric | Value |",
    "| --- | --- |",
    `| Precision | ${fmt(m.precision)} |`,
    `| Recall | ${fmt(m.recall)} |`,
    `| FPR | ${fmt(m.fpr)} |`,
    `| FNR | ${fmt(m.fnr)} |`,
    `| F1 | ${fmt(m.f1)} |`,
    `| Accuracy | ${fmt(m.accuracy)} |`,
  ];
}

function mistakeRows(rows: LabeledDecision[]): string[] {
  if (rows.length === 0) return ["(none)"];
  return [
    "| Session | Label | Subtype | Outcome | P(likely_xray) | Confidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => {
      const a = row.decision.answers;
      return `| ${row.sessionId} | ${row.label.label} | ${row.label.subtype ?? "unspecified"} | ${row.decision.policyOutcome} | ${fmt(a?.behaviorClass.probabilities.likely_xray ?? null)} | ${fmt(a?.behaviorClass.confidence ?? null)} |`;
    }),
  ];
}

export function buildReport(input: ReportInput): string {
  const join = joinDecisionsWithLabels(input.decisions, input.labels);
  const rows = join.rows;
  const policyCm = confusionMatrix(rows, policyPredictsPositive);
  const policyMetrics = metricsFrom(policyCm);
  const sweep = thresholdSweep(rows, input.sweep ?? DEFAULT_SWEEP);
  const subtypes = groupBySubtype(rows);
  const bands = accuracyByConfidenceBand(rows);
  const latency = latencyStats(input.decisions);
  const tokens = tokenTotals(input.decisions);
  const falsePositives = rows.filter(
    (r) => !isTruthPositive(r.label.label) && policyPredictsPositive(r.decision),
  );
  const falseNegatives = rows.filter(
    (r) => isTruthPositive(r.label.label) && !policyPredictsPositive(r.decision),
  );
  const versions = new Set(
    input.decisions.map((d) => `${d.model} / ${d.questionSetVersion} / ${d.featureExtractorVersion}`),
  );

  const lines: string[] = [
    `# JevCraft evaluation report: ${input.title}`,
    "",
    "Positive class = ground truth `simulated_xray` or `known_cheat`. Predicted positive = policy outcome `review` or `high_priority_review`.",
    "FPR is the primary metric: flagging skilled or lucky players costs operator trust.",
    "",
    "## Summary",
    "",
    "| Item | Count |",
    "| --- | --- |",
    `| Decisions | ${input.decisions.length} |`,
    `| Labels | ${input.labels.length} |`,
    `| Usable for metrics | ${rows.length} |`,
    `| Excluded: unknown label | ${join.unknownCount} |`,
    `| Excluded: evaluation error | ${join.errorCount} |`,
    `| Excluded: no label | ${join.unlabeledSessionIds.length} |`,
    `| Excluded: duplicate label | ${join.duplicateLabelSessionIds.length} |`,
    "",
    `Model / question set / feature extractor: ${versions.size === 0 ? "n/a" : [...versions].join("; ")}`,
    "",
    "## Policy outcome",
    "",
    "| TP | FP | TN | FN |",
    "| --- | --- | --- | --- |",
    cmRow(policyCm),
    "",
    ...metricsTable(policyMetrics),
    "",
    "## Threshold sweep on P(likely_xray)",
    "",
    "| Threshold | TP | FP | TN | FN | Precision | Recall | FPR | F1 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sweep.map(
      (p) =>
        `| ${p.threshold.toFixed(2)} | ${p.cm.tp} | ${p.cm.fp} | ${p.cm.tn} | ${p.cm.fn} | ${fmt(p.metrics.precision)} | ${fmt(p.metrics.recall)} | ${fmt(p.metrics.fpr)} | ${fmt(p.metrics.f1)} |`,
    ),
    "",
    "## By scenario subtype",
    "",
    "| Subtype | Count | TP | FP | TN | FN | Precision | Recall | FPR |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(subtypes.length === 0
      ? ["| (none) | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |"]
      : subtypes.map(
          (g) =>
            `| ${g.subtype} | ${g.count} | ${g.cm.tp} | ${g.cm.fp} | ${g.cm.tn} | ${g.cm.fn} | ${fmt(g.metrics.precision)} | ${fmt(g.metrics.recall)} | ${fmt(g.metrics.fpr)} |`,
        )),
    "",
    "## Accuracy by confidence band",
    "",
    "| Band | Count | Accuracy |",
    "| --- | --- | --- |",
    ...bands.map((b) => `| ${b.band} | ${b.count} | ${fmt(b.accuracy)} |`),
    "",
    "## Latency and cost",
    "",
    "| Item | Value |",
    "| --- | --- |",
    `| p50 | ${ms(latency.p50)} |`,
    `| p95 | ${ms(latency.p95)} |`,
    `| p99 | ${ms(latency.p99)} |`,
    `| Input tokens | ${tokens.inputTokens} |`,
    `| Output tokens | ${tokens.outputTokens} |`,
    `| insufficient_evidence rate | ${fmt(insufficientEvidenceRate(input.decisions))} |`,
    "",
    "Cost is not estimated: TypeSafe pricing is not pinned yet (spec §22, Jev dependency).",
    "",
    "## False positives",
    "",
    ...mistakeRows(falsePositives),
    "",
    "## False negatives",
    "",
    ...mistakeRows(falseNegatives),
    "",
  ];
  return lines.join("\n");
}
```

`packages/eval-runner/src/index.ts` に追記:

```ts
export { buildReport, type ReportInput } from "./report";
```

`packages/cli/package.json` の `dependencies` に `"@jevcraft/eval-runner": "workspace:*"` を追加し、`pnpm install` を実行する。

`packages/cli/src/commands/report.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { buildReport } from "@jevcraft/eval-runner";
import { DecisionRecordSchema, SessionLabelSchema } from "@jevcraft/schema";
import { readRecords, resolveInputFiles } from "../io";

export const REPORT_USAGE =
  "usage: jevcraft report --decisions <file|dir> --labels <file|dir> [--out <file.md>] [--title <text>]";

async function loadAll<T>(paths: string[], parse: (raw: unknown, file: string) => T): Promise<T[]> {
  const out: T[] = [];
  for (const file of await resolveInputFiles(paths)) {
    for (const raw of await readRecords(file)) out.push(parse(raw, file));
  }
  return out;
}

export async function runReport(args: string[]): Promise<{ outPath: string; markdown: string }> {
  const { values } = parseArgs({
    args,
    options: {
      decisions: { type: "string" },
      labels: { type: "string" },
      out: { type: "string" },
      title: { type: "string" },
    },
  });
  if (values.decisions === undefined) throw new Error(`--decisions is required. ${REPORT_USAGE}`);
  if (values.labels === undefined) throw new Error(`--labels is required. ${REPORT_USAGE}`);

  const decisions = await loadAll([values.decisions], (raw, file) => {
    const parsed = DecisionRecordSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`invalid DecisionRecord in ${file}: ${parsed.error.message}`);
    return parsed.data;
  });
  const labels = await loadAll([values.labels], (raw, file) => {
    const parsed = SessionLabelSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`invalid SessionLabel in ${file}: ${parsed.error.message}`);
    return parsed.data;
  });

  const title = values.title ?? basename(values.decisions, extname(values.decisions));
  const markdown = buildReport({ title, decisions, labels });
  const outPath = values.out ?? join("reports", `${title}.md`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, "utf8");
  console.error(`report written -> ${outPath}`);
  return { outPath, markdown };
}
```

`packages/cli/src/main.ts`（全体を置き換え）:

```ts
import { EVALUATE_USAGE, runEvaluate } from "./commands/evaluate";
import { REPORT_USAGE, runReport } from "./commands/report";

const USAGE = `jevcraft <command>

commands:
  evaluate   ${EVALUATE_USAGE}
  report     ${REPORT_USAGE}
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "evaluate":
      await runEvaluate(rest);
      return 0;
    case "report":
      await runReport(rest);
      return 0;
    default:
      console.error(USAGE);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
```

- [ ] **Step 4: テストと実コマンドを通す**

```bash
pnpm vitest run && pnpm typecheck && pnpm lint
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
cat reports/fixtures.md
```

Expected: 全テスト PASS。`reports/fixtures.md` に FPR 0.000 / Recall 1.000、False positives と False negatives が `(none)`、Excluded: unknown label が 1。`git status` に `reports/fixtures.md` が出ないこと。

- [ ] **Step 5: Commit**

```bash
git add packages/eval-runner packages/cli pnpm-lock.yaml
git commit -m "feat(eval): generate markdown report with confusion matrix and threshold sweep

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: README・貢献ガイド・最終検証

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`
- Verify: `.github/workflows/ci.yml` の最終ステップが通ること

**Interfaces:**
- Produces: spec §21 PR 1 の受け入れ手順（`pnpm install` → `pnpm test` → `pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json`）を README に記載

- [ ] **Step 1: README を書く**

`README.md`:

```markdown
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

The Paper plugin (Phase 2) is not started. See `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`.

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
export TYPESAFE_API_KEY=...   # or use your shell's dotenv loader
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

The key is read only from the environment. Never commit it.

### Evaluation report

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

Produces `reports/fixtures.md` with the confusion matrix, Precision / Recall / **FPR** / FNR / F1,
a threshold sweep over `P(likely_xray)`, per-subtype and per-confidence-band breakdowns,
latency percentiles, token totals, and the list of false positives and false negatives.

## Packages

| Package | Responsibility |
| --- | --- |
| `@jevcraft/schema` | Zod contracts: `MiningSessionFeatures`, `DecisionRecord`, `SessionLabel` |
| `@jevcraft/jev-evaluator` | `xray-v1` question set, TypeSafe SDK backend, mock backend, decision policy |
| `@jevcraft/eval-runner` | Label join, metrics, Markdown report |
| `@jevcraft/cli` | `pnpm jevcraft evaluate` / `report` |

## How a session is judged

One request per mining session. Jev is asked four independent questions:

| Key | Type | Meaning |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence` with a full probability distribution and a confidence |
| `hidden_information_use` | noul | P(player acted on hidden ore-location information) |
| `route_naturalness` | score 0..4 | 0 = highly unnatural, 4 = strongly natural (`normalized = score / 4`) |
| `evidence_sufficiency` | noul | P(enough evidence to classify) |

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
```

- [ ] **Step 2: CONTRIBUTING と SECURITY を書く**

`CONTRIBUTING.md`:

```markdown
# Contributing

- Branch from `main`; open a pull request. `pnpm check` must pass.
- Write the failing test first. Every schema change needs a test that shows what is now rejected.
- Never commit API keys, real player identifiers, raw API responses, or anything under `datasets/private/`.
- Keep Jev requests decomposed into independent questions; do not merge them into one big prompt.
- Do not add automatic punishments (ban, kick, rollback). Review outcomes are the ceiling.
- Record `model`, `questionSetVersion`, and `featureExtractorVersion` in every decision record.
```

`SECURITY.md`:

```markdown
# Security

Report vulnerabilities privately to the repository owner via GitHub's security advisory
feature rather than a public issue.

Scope notes:

- The API key is only ever read from `TYPESAFE_API_KEY`. If you find a code path that
  reads it from a file or logs it, that is a bug.
- Datasets must not contain personal data. Player identifiers are HMAC pseudonyms.
- This project produces review requests only. Any change that acts on players automatically
  is out of scope and should be rejected in review.
```

- [ ] **Step 3: 受け入れ手順をクリーンな状態で再現する**

```bash
rm -rf node_modules packages/*/node_modules
pnpm install
pnpm check
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
pnpm jevcraft evaluate datasets/fixtures --backend mock --out /tmp/ci-decisions.jsonl
git status --short
```

Expected: `pnpm check` 全成功。evaluate は mock fallback の告知とともに成功。`git status` は README / CONTRIBUTING / SECURITY 以外に未追跡ファイルがない（decisions と reports が ignore されている）。

- [ ] **Step 4: Commit**

```bash
git add README.md CONTRIBUTING.md SECURITY.md
git commit -m "docs: add README with local run steps, contributing and security notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: ブランチの仕上げ**

`superpowers:finishing-a-development-branch` に従って `main` へのマージまたは PR 作成を判断する。PR を作る場合の本文末尾は `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

---

## Self-Review

**Spec coverage（§24 開始プロンプトの要件）**

| 要件 | タスク |
| --- | --- |
| pnpm workspace の monorepo | Task 1 |
| Node.js 24 系 | Task 1（`.node-version`, `engines`, CI `node-version: 24`） |
| TypeScript strict | Task 1 |
| Zod で Feature / Decision schema | Task 2, 3 |
| TypeSafe 公式 SDK を使用 | Task 5（質問ヘルパー）, Task 8（`TypeSafeClient`） |
| API キーなしのテストでは mock | Task 6, Task 9（`--backend auto`）, CI |
| fixture 2 件以上 | Task 4（5 件） |
| evaluate CLI | Task 9 |
| JSON 結果保存 | Task 9（JSONL、schema validation 後） |
| unit test | 全タスク |
| README | Task 12 |
| 4 質問への分解 | Task 5 |
| probabilities と confidence の保存 | Task 3, 8 |
| 自動 BAN / Paper plugin に着手しない | 全タスク（policy の上限は review） |
| §6 Phase 1「Eval runner で混同行列」 | Task 10, 11 |
| §14 必須メトリクス | Task 10, 11（コスト推定は価格未確定のため tokens のみ、レポートに明記） |
| §21 PR 1 受け入れコマンド | Task 12 Step 3 |
| §19 Epic 1 の 6 issue | 1→Task 1, 2→Task 2–3, 3→Task 5–8, 4→Task 10, 5→Task 11, 6→Task 4 |

**意図的に含めないもの:** Paper plugin、scenario generator（Phase 4）、live sidecar、コスト推定（価格未確定）、`docs/architecture.md` 等（README と handoff で代替、Phase 2 で追加）。

**型整合性の確認ポイント**

- `JevBackend.systemOne` の戻りは `Promise<SystemOneResult<Q>>`。SDK の `APIPromise` は `Promise` のサブクラスなので Task 8 の wrapper はそのまま返せる。
- `toJevAnswers` の `probabilities` は SDK 側が `readonly` だが、Zod の `parse` を通すので出力型は `JevAnswers` に一致する。
- `ROUTE_NATURALNESS_MAX` は rubric 長 − 1 = 4。`normalized = score / 4`、1 が自然。Task 3 のコメント、Task 6 の mock、Task 8 のテストが同じ向き。
- `PolicyOutcome` に `error` を含めるのは Task 3。Task 8 の fail-open と Task 10 の `errorCount` がそれに依存。
- Task 9 の `runEvaluate` は Task 11 のテストでも使う。シグネチャ `(args, deps?) => Promise<{ outPath, records }>` を変えない。
- `datasets/fixtures/README.md` は置かない（`resolveInputFiles` は `.json/.jsonl` だけ拾うが、fixture テストは `readdirSync` で `.json` を絞っているので問題ない）。
