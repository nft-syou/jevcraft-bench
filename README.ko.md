# JevCraft

[![CI](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml/badge.svg)](https://github.com/nft-syou/jevcraft-bench/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen)](.node-version)
[![Paper](https://img.shields.io/badge/paper-26.2%20%C2%B7%20java%2025-orange)](plugin/)
![Shadow mode](https://img.shields.io/badge/shadow%20mode-never%20bans%20or%20kicks-8250df)
![Corpus](https://img.shields.io/badge/corpus-156%20labelled%20sessions-informational)

[English](README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **한국어** · [Español](README.es.md)

> 번역본입니다. 내용이 어긋나면 [영문판](README.md)이 기준입니다.

마인크래프트(Paper) 서버를 위한 행동 기반 안티치트 연구용 벤치입니다. 채굴 세션 텔레메트리를 작은 특징 객체로 줄이고, TypeSafe Jev가 타입이 정해진 질문 몇 가지에 답하며, 그 결과를 라벨이 붙은 세션에 대해 오프라인으로 채점합니다.

라벨은 시나리오 배정이지, 관측된 부정행위에 대한 사람의 판정이 아닙니다. 어떤 세션이 X-Ray로 분류되는 것은 그것을 만들어낸 봇이 X-Ray 시나리오로 돌고 있었기 때문이고, 정상으로 분류되는 것은 정상 시나리오나 사람 플레이어가 만들었기 때문입니다. 누구도 녹화를 보고 판정하지 않았습니다.

이 저장소는 개념 증명입니다. 플레이어를 밴하거나 추방하거나 되돌리는 일은 **절대** 하지 않습니다. 가장 강한 결과물이라도 사람의 검토 요청입니다.

## 현재 상태

0단계부터 3단계까지 구현되어 있습니다. 오프라인 수직 슬라이스, Paper 텔레메트리 플러그인, 특징 추출기, 그리고 고정 시드 월드에서의 실제 녹화입니다. 코퍼스는 두 개의 월드 시드에 걸친 **156개의 라벨링된 세션**이며, Mineflayer 봇과 사람 플레이어 한 명에게서 나왔습니다.

![부서진 블록 하나가 검토 요청이 되기까지](docs/images/pipeline.svg)

플러그인은 Jev API를 호출하지 않습니다. 평가는 플러그인이 기록한 JSONL에 대한 별도의 오프라인 단계입니다. 원래 명세는 `docs/handoff/JevCraft_IMPLEMENTATION_HANDOFF.md`, 현재 결과는 `docs/evasion.md`를 보세요.

## 요구 사항

- Node.js 24 (`.node-version`)
- pnpm (버전은 `package.json`의 `packageManager`에 고정)
- 선택 사항: 실시간 평가를 하려면 `TYPESAFE_API_KEY`에 TypeSafe API 키

## 빠른 시작

```bash
pnpm install
pnpm test
pnpm jevcraft evaluate datasets/fixtures/xray-direct-001.json
```

`TYPESAFE_API_KEY`가 없으면 CLI는 결정적인 mock 백엔드를 사용하고 그 사실을 stderr에 알립니다. 판정은 `datasets/decisions/<input>.jsonl`에 기록됩니다(Git 관리 대상 아님).

### 실시간 평가

```bash
cp .env.example .env   # 그 다음 TYPESAFE_API_KEY에 키를 넣습니다
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --out datasets/decisions/fixtures-live.jsonl
```

`pnpm jevcraft`는 `.env`가 있으면 읽어 들입니다(Node의 `--env-file-if-exists`). export한 `TYPESAFE_API_KEY`도 동작합니다. 키는 환경 변수에서만 읽습니다. 절대 커밋하지 마세요.

### 평가 리포트

```bash
pnpm jevcraft evaluate datasets/fixtures --backend mock --out datasets/decisions/fixtures.jsonl
pnpm jevcraft report --decisions datasets/decisions/fixtures.jsonl --labels datasets/labels/fixtures.jsonl
```

`reports/fixtures.md`가 생성됩니다. 혼동 행렬, Precision / Recall / **FPR** / FNR / F1, `P(likely_xray)`에 대한 임계값 스윕, 하위 유형별과 신뢰도 구간별 분해, 지연 시간 백분위, 토큰 합계, 그리고 오탐과 미탐 목록이 들어갑니다.

### 시행 횟수 늘리기: 반복과 합성 세션

```bash
# 같은 5개 픽스처를 각각 10번씩 평가해 Jev 응답의 분산을 측정
pnpm jevcraft evaluate datasets/fixtures --backend typesafe --repeat 10 --out datasets/decisions/fixtures-x10.jsonl

# 7개 시나리오 x 20개 합성 세션(시드별로 결정적), 이후 평가와 리포트
pnpm jevcraft generate scenarios --count 20 --seed 1   --out-features datasets/generated/seed1-features.jsonl --out-labels datasets/generated/seed1-labels.jsonl
pnpm jevcraft evaluate datasets/generated/seed1-features.jsonl --backend typesafe --out datasets/decisions/seed1.jsonl
pnpm jevcraft report --decisions datasets/decisions/seed1.jsonl --labels datasets/generated/seed1-labels.jsonl
```

이때 리포트에는 반복 분산 표와 `minEvidenceSufficiency` 스윕도 포함됩니다. 실제 실행 결과는 `docs/baselines/`에 보관되어 있습니다.

## Paper 플러그인 (2단계)

`plugin/`은 섀도 모드에서만 다음을 기록하는 Paper 서버 플러그인입니다.

- 샘플링된 이동 (시간 / 거리 / 회전 게이트, 세션 시작 시 비워내는 90초 링 버퍼 포함)
- 채굴 세션 안에서의 블록 파괴
- 숨겨져 있던 귀중 광석의 최초 노출 (6면 이웃 규칙, 명세 §7)
- 채굴 세션 경계 (지하 돌 파괴 또는 광석 노출로 시작. 유휴 타임아웃, 로그아웃, 월드 변경, 원거리 텔레포트, 게임 모드 변경, `/jevcraft flush`로 종료)

모든 것은 경계가 있는 큐와 데몬 기록 스레드를 거쳐 `plugins/JevCraft/data/<serverRunId>.jsonl`로 들어갑니다. 큐가 가득 차면 줄을 버리고 세며, 절대 틱을 막지 않습니다. 플레이어 ID는 `JEVCRAFT_HMAC_SECRET`에서 파생한 `hmac-sha256:<hex>`입니다. 원본 UUID와 이름은 기록하지 않습니다. 플러그인은 밴, 추방, 되돌리기를 하지 않습니다.

> **compose 서버는 격리된 벤치용이며 인터넷용이 아닙니다.** `ONLINE_MODE: "false"`로 동작하므로 접속자를 확인하지 않고, 녹화 봇이 텔레포트와 `/fill`을 쓸 수 있도록 고정된 오프라인 UUID 16개에 OP를 부여합니다. 포트에 닿을 수 있는 사람은 누구나 `jevbotNN`으로 접속해 그 권한을 얻습니다. 그래서 `127.0.0.1`에 바인딩합니다. 공개 인터페이스에 노출하지 마시고, 이 compose 파일을 실제 서버에 재사용하지 마세요.

**JVM 관련 작업은 모두 Docker에서 실행합니다. 호스트에는 JDK를 설치하지 않습니다.**

```bash
pnpm plugin:test     # docker compose -f infra/docker-compose.yml run --rm gradle test
pnpm plugin:build    # ... gradle build  -> plugin/build/libs/JevCraft-<version>.jar
docker compose -f infra/docker-compose.yml up paper   # jar를 마운트한 로컬 Paper 서버
```

서버 실행을 특징으로 바꾸고 평가하기:

```bash
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/run-001.jsonl
pnpm jevcraft evaluate datasets/features/run-001.jsonl --out datasets/decisions/run-001.jsonl
```

`extract`는 이벤트를 세션별로 묶고, `--window-minutes`(기본 15)보다 긴 세션을 `<sessionId>:w<n>` 창으로 나누며, 명세 §9의 특징을 계산합니다. 각 숨은 광석 노출 직전 60초의 이동에서 직진도 / 우회율 / 시선 일치도, 파괴 형태에서 브랜치 마이닝 가능성과 터널 방향, 열린 이웃 면에서 동굴 노출도, 그리고 파괴 리듬과 궤적 커버리지입니다. 관측되지 않은 값은 모두 `null`입니다.

### 봇 녹화 (사람 없는 3단계)

`@jevcraft/bot-recorder`는 compose 서버를 상대로 Mineflayer 봇을 돌려 *실제* 플러그인 텔레메트리를 대량으로 만들어냅니다. X-Ray 봇은 시뮬레이션이 아닙니다. 정당한 방법으로는 결코 볼 수 없는 청크 데이터에서 광석 위치를 읽습니다. 이것이 바로 치트 클라이언트가 하는 일입니다. 정상 봇은 열린 면이 있는 블록에만 반응합니다.

```bash
docker compose -f infra/docker-compose.yml up -d paper       # 고정 시드, 평화 모드, 봇은 OP
JEVCRAFT_HMAC_SECRET=change-me-local-only   pnpm jevcraft record --scenario all --count 5 --budget-seconds 240 --out datasets/recordings/batch1.jsonl
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --out datasets/features/batch1.jsonl
pnpm jevcraft label-runs --raw infra/paper/data/plugins/JevCraft/data --manifest datasets/recordings/batch1.jsonl --out datasets/labels/batch1.jsonl
# 선택: 이미 가진 정상 세션으로 efficiency.baselinePercentile 기준을 만듭니다
pnpm jevcraft baseline --features datasets/features/batch1.jsonl --labels datasets/labels/batch1.jsonl --out datasets/baselines/legit.json
pnpm jevcraft extract infra/paper/data/plugins/JevCraft/data --baseline datasets/baselines/legit.json --out datasets/features/batch1.jsonl
pnpm jevcraft evaluate datasets/features/batch1.jsonl --out datasets/decisions/batch1.jsonl
pnpm jevcraft report --decisions datasets/decisions/batch1.jsonl --labels datasets/labels/batch1.jsonl
```

시나리오는 `legit-branch-mining`, `xray-direct`, `xray-detour`, `xray-humanized`, `xray-throttled`입니다(`packages/bot-recorder/src/scenarios.ts`). 마지막 것은 의도적으로 광석 비율을 정상 범위 안에 유지합니다. `docs/evasion.md`를 보세요.

각 실행은 `jevbotNN`으로 접속해 새로운 64블록 구역으로 텔레포트한 뒤, 주어진 시간만큼 채굴하고 나갑니다. 매니페스트에는 봇의 가명 ID(플러그인과 같은 HMAC을 오프라인 UUID와 시크릿으로 계산한 값)와 시간 구간이 기록되므로, `label-runs`는 플러그인이 이름을 전혀 기록하지 않아도 플러그인의 세션에 정답을 붙일 수 있습니다. Mineflayer는 프로토콜 26.1을 사용합니다. 서버는 ViaVersion + ViaBackwards를 돌리므로 26.2에 접속할 수 있습니다.

다른 월드: `JEVCRAFT_SEED=jevcraft-arena-2 JEVCRAFT_LEVEL=arena2 docker compose -f infra/docker-compose.yml up -d paper` (시드는 레벨 폴더가 처음 만들어질 때만 적용됩니다). `scripts/session-table.mjs`와 `scripts/gate-sweep.mjs`는 API 호출 없이 보관된 판정에서 세션별 표를 출력하고 접근 게이트를 스윕합니다.

봇은 사람보다 규칙적으로 움직이고 규칙적으로 시선을 돌립니다(`--human-noise`로 완화할 수 있습니다). 배선, 추출기, 임계값 작업에는 봇 데이터를 주력으로 쓰고, 최종 오탐 확인용으로 사람이 플레이한 데이터를 소량 유지하세요(인계 명세 §22).

관리 명령(`jevcraft.admin`, 기본 OP): `/jevcraft status`, `/jevcraft session <player>`, `/jevcraft flush <player>`, `/jevcraft metrics`. 설정은 `plugin/src/main/resources/config.yml`입니다. JSONL 한 줄의 형식은 `@jevcraft/schema`의 `RawTelemetryEventSchema`가 그대로 반영하며, `datasets/fixtures/raw/sample.jsonl`(플러그인의 MockBukkit 테스트가 기록)이 이것으로 검증됩니다.

인계 명세에서 벗어난 점은 `docs/superpowers/plans/2026-09-19-paper-telemetry-plugin.md`에 기록해 두었습니다. Paper `26.2.build.124-stable`은 Java 25를 요구하며(명세는 21이라고 했습니다), 명령은 `paper-plugin.yml`이 아니라 `plugin.yml`에서 선언합니다.

## 기존 휴리스틱과의 벤치마크

`jevcraft benchmark`는 기존 안티 X-Ray 도구가 의존하는 휴리스틱(광석 비율, 노출 비율, 효율 백분위, 노출 속도, 직선 접근, 손으로 만든 조합 규칙, 개발 분할에서 학습한 로지스틱 회귀)을 JevCraft와 같은 라벨링된 세션 위에서, 같은 오탐률 상한 아래에서 돌립니다. 보관된 Jev 응답만 사용합니다.

`datasets/splits2/`는 커밋되어 있으므로, 아래 명령은 서버도 녹화 데이터도 API 키도 없이 새로 클론한 상태에서 그대로 동작합니다.

```bash
pnpm jevcraft benchmark   --features datasets/splits2/holdout-features.jsonl   --labels   datasets/splits2/holdout-labels.jsonl   --decisions datasets/splits2/holdout-decisions.jsonl   --dev-features datasets/splits2/dev-features.jsonl   --dev-labels   datasets/splits2/dev-labels.jsonl   --dev-decisions datasets/splits2/dev-decisions.jsonl   --max-fpr 0.072 --out reports/benchmark-evasive.md
```

이 분할은 156개 중 134개를 담고 있습니다. 개발 77개, 홀드아웃 57개입니다. 남은 22개는 확인용 세트로 `docs/evasion.md`에서 따로 채점하며 이 벤치마크에서는 의도적으로 제외했습니다. `scripts/make-splits.mjs`는 완전한 특징과 판정 집합에서 분할을 다시 만들지만, 그 데이터를 가진 사람은 녹화를 실제로 돌려본 사람뿐입니다.

임계값은 개발 분할에서 정해 고정합니다. `--dev-*`를 주지 않으면 리포트 머리말에 그 수치가 일반화가 아니라 적합도를 나타낸다고 적힙니다.

탐욕스러운 X-Ray 봇에 대해서는 우위가 없습니다. 광석을 세는 것만으로 풀리기 때문입니다. 흥미로운 쪽은 자기 수치를 평범하게 유지하는 치터이고, `xray-throttled`가 바로 그런 치터입니다. 다른 X-Ray 봇과 마찬가지로 청크 데이터에서 광석 위치를 읽되, 목표 사이에 평범한 터널을 파서 광석 비율을 정상 범위로 되돌립니다.

![세션 유형별, 파괴 블록 100개당 채굴한 귀중 광석 분포](docs/images/ore-ratio-distribution.svg)

이 방법은 통합니다. 25개의 억제된 세션 중 광석 비율 임계값에 닿은 것은 하나도 없고, 오히려 정상 채굴보다 좁은 구간에 모여 있습니다. 즉 평범한 플레이어를 함께 걸지 않고 이들을 갈라내는 기준선이 존재하지 않습니다. 이 치트가 숨기지 못하는 것은 광석까지 걸어가는 경로입니다.

![탐지기와 코호트별, 억제된 X-Ray 세션 탐지 비율](docs/images/throttled-detection.svg)

홀드아웃의 15개는 정책에 접근 규칙을 넣게 만든 바로 그 세션들이므로 그 규칙을 확인해 줄 수 없습니다. 확인용 10개는 그 규칙을 고정한 뒤에 녹화한 것입니다.

이것은 하나의 회피 수법이지 회피 일반이 아닙니다. 이미 위치를 아는 광석을 향해 구불구불 이동하면, 비율을 희석해 계수를 무력화하는 것만큼이나 완전하게 접근 규칙이 무력화됩니다.

![X-Ray 회피 유형별 재현율](docs/images/detector-complementarity.svg)

그러므로 기여하는 것은 접근 텔레메트리이지 언어 모델이 아닙니다. 이 데이터에서는 손으로 쓴 직진도 규칙이 Jev와 같은 수준으로 동작합니다. 무엇이 사전 등록되어 있었는지를 포함한 전체 결과는 `docs/evasion.md`, 방법론은 `docs/benchmark.md`에 있습니다.

## 운영 비용

156회의 실시간 평가(`xray-v6`, `jev-1.13.0`)에서 측정: **세션 창당 입력 1,402 토큰, 출력 137 토큰**이며 편차는 3% 미만입니다. TypeSafe는 입력만 100만 토큰당 $0.042로 과금하고 출력은 무료이므로, 창 하나를 판정하는 비용은 **$0.000059**, 즉 1달러에 약 17,000개 창입니다.

호출량은 플레이어 수가 아니라 지하 채굴 시간을 따릅니다. 플러그인은 y=40 이하에서 돌 파괴가 10회 일어나거나 대상 광석이 노출되면 세션을 열고, 120초 유휴 후 닫습니다. 추출기는 이를 15분 창으로 자릅니다. 지금까지 녹화된 유일한 사람 플레이어는 채굴 66분 동안 11개의 창을 만들었으므로, 대략 **채굴 1인 시간당 10개 창**입니다. 82분짜리 단일 표본에서 나온 이 숫자가 추정 전체에서 가장 약한 고리이며, 표 전체를 선형으로 확대합니다.

**현재 코드가 동작하는 대로** 계산한 월 비용입니다. 지금은 모든 창을 전송합니다. `evaluate-session.ts`가 백엔드를 먼저 호출하고 그다음에 정책을 적용하므로, `enoughEvidence`는 결과를 정하되 비용을 아끼지는 않습니다. 쓸 만한 증거가 없는 세션에도 요금이 붙습니다.

| 서버 규모 | 월 플레이어 시간 | 지하 25% | 지하 50% | 50%일 때 연간 |
| --- | --- | --- | --- | --- |
| 지인만, 4명이 하루 4시간 | 480 | $0.07 | $0.14 | $1.70 |
| 소규모 공개, 평균 동시 접속 5 | 3,650 | $0.54 | $1.07 | $13 |
| 소규모 공개, 평균 동시 접속 10 | 7,300 | $1.07 | $2.15 | $26 |
| 활발한 서버, 평균 동시 접속 30 | 21,900 | $3.22 | $6.45 | $77 |
| 대규모, 평균 동시 접속 100 | 73,000 | $11 | $21 | $258 |

이 비용은 계속 발생하는 종량제이고 플레이어 활동을 따라가므로 미리 상한을 정할 수 없습니다. 서버들이 지금 쓰는 X-Ray 대책은 종량제가 아닙니다. Paper는 anti-X-Ray 난독화를 기본 포함하고, Orebfuscator는 오픈 소스이며, 자리 잡은 행동 기반 안티치트 플러그인은 무료이거나 한 번 사면 끝입니다.

출력이 무료이므로 비용을 줄이려면 호출을 줄이거나 프롬프트를 짧게 해야 합니다. 둘 다 아직 구현되어 있지 않습니다. 평균 동시 접속 100, 지하 25% 조건에서 각각의 가치는 다음과 같습니다.

| | 월 |
| --- | --- |
| 모든 창을 전송 (현재 동작) | $11 |
| 로컬에서 `enoughEvidence`에 걸리는 창(전체의 16%)을 건너뜀 | $9.03 |
| 여기에 직진도와 광석 비율 기반의 값싼 사전 필터 추가 (134개 세션 집합에서 탐지 59/59 유지) | $6.77 |
| 응답 분산을 줄이기 위해 모든 창을 세 번씩 평가 | $32 |

## 패키지

| 패키지 | 역할 |
| --- | --- |
| `@jevcraft/schema` | Zod 계약: `MiningSessionFeatures`, `DecisionRecord`, `SessionLabel` |
| `@jevcraft/jev-evaluator` | `xray-v1` 질문 세트, TypeSafe SDK 백엔드, mock 백엔드, 판정 정책 |
| `@jevcraft/eval-runner` | 라벨 결합, 지표, Markdown 리포트 |
| `@jevcraft/feature-extractor` | 원본 플러그인 JSONL -> `MiningSessionFeatures` (명세 §9 정의, 15분 창) |
| `@jevcraft/scenario-generator` | `scenarios/*.json`에서 만든 특징 수준의 합성 세션 (명세 §13A) |
| `@jevcraft/bot-recorder` | compose 서버에서 정상 / X-Ray 시나리오를 연기하는 Mineflayer 봇 (명세 §13B) |
| `@jevcraft/cli` | `pnpm jevcraft extract` / `evaluate` / `report` / `generate` / `record` / `label-runs` |

## 세션을 판정하는 방법

채굴 세션당 요청 한 번입니다. Jev에게 서로 독립적인 다섯 가지 질문을 합니다.

| 키 | 타입 | 의미 |
| --- | --- | --- |
| `behavior_class` | choice | `legit` / `suspicious` / `likely_xray` / `insufficient_evidence`를 전체 확률 분포와 신뢰도와 함께 |
| `hidden_information_use` | noul | P(플레이어가 숨겨진 광석 위치 정보에 따라 행동했다) |
| `route_naturalness` | score 0..4 | 0 = 매우 부자연스러움, 4 = 매우 자연스러움 (`normalized = score / 4`) |
| `evidence_sufficiency` | noul | P(분류하기에 충분한 증거가 있다) |
| `approach_targeting` (v6 이상) | noul | P(노출 직전의 이동이 의도적인 접근이었다. `hiddenOreApproach`만으로 판단) |

질문 세트는 버전 관리되며(`--questions xray-v1` … `xray-v6`, 기본 v6), 그 버전은 모든 판정 레코드에 저장되므로 같은 데이터셋 위에서 세트끼리 비교할 수 있습니다. 각 버전을 어떻게 골랐는지는 `docs/baselines/README.md`에 있습니다.

정책(`packages/jev-evaluator/src/policy.ts`)은 이것들을 `insufficient_evidence` / `high_priority_review` / `review` / `no_action`으로 바꿉니다. `jevcraft repolicy`는 보관된 판정을 다른 임계값으로 다시 쓰고, 무엇을 적용했는지 출력 옆의 `.meta.json`에 기록합니다. `confidence`는 분포 형태에 관한 통계량이며 `P(likely_xray)`가 아닙니다.

임계값은 77개 세션의 개발 분할에서 왔지만, 중요한 예외가 하나 있습니다. `reviewApproachTargetingAlone = 0.35`는 그것을 처음 측정한 세션들이 이미 채점된 뒤에 추가되었습니다. 거기서의 효과는 측정이 아니라 가설입니다. 규칙을 고정한 뒤 녹화한 22개 세션 집합에서는 이 규칙이 있을 때 10개 중 9개, 없을 때 10개 중 3개를 잡았습니다. 시간 순서와 전후 비교는 `docs/evasion.md`에 있습니다.

## 데이터 위생

- 결측값은 언제나 `null`이며 `0`이 아닙니다.
- 플레이어 ID는 반드시 가명이어야 합니다. 어떤 데이터셋에도 실제 UUID, 이름, 채팅, IP를 넣지 않습니다.
- `datasets/private/`, `datasets/decisions/`, `reports/`는 Git 관리 대상이 아닙니다.
- `datasets/fixtures` 아래의 픽스처는 연결을 확인하기 위한 것이며 정확도의 증거가 아닙니다.

## 개발

```bash
pnpm check            # lint + typecheck + test
pnpm format           # Biome 포매팅 적용
pnpm figures          # docs/figure-data.json에서 docs/images/*.svg 다시 그리기
pnpm figures:refresh  # 먼저 데이터셋에서 집계값을 다시 계산한 뒤 그리기
```

CI는 같은 명령과 mock 평가를 실행하고 그림을 다시 그립니다. 커밋된 SVG가 커밋된 집계값과 어긋나거나, 배지와 「현재 상태」 절에 적힌 코퍼스 크기가 데이터와 맞지 않게 되면 이 단계가 실패합니다. CI에서 실제 Jev 호출은 하지 않습니다.

그림은 생성물이며 손으로 편집하지 않습니다. 세션 단위 데이터셋은 Git 관리 대상이 아니므로 `scripts/make-figures.mjs`는 입력을 `docs/figure-data.json`에 보관합니다. 이 파일은 커밋되어 있고 CI가 필요로 하는 유일한 것입니다.

## 프로젝트 파일

| 파일 | 용도 |
| --- | --- |
| `CONTRIBUTING.md` | 변경을 제안하는 방법과 변경이 지켜야 할 규칙 |
| `CODE_OF_CONDUCT.md` | 커뮤니티 기준, 그리고 동작하는 치트와 실제 플레이어 데이터 게시 금지 규정 |
| `SECURITY.md` | 취약점이나 프라이버시 문제를 비공개로 신고하는 방법 |
| `CHANGELOG.md` | 무엇이 바뀌었고 어떤 주장이 왜 철회되었는지 |
| `CITATION.cff` | 이 벤치를 인용하는 방법 |

## 라이선스

MIT. `LICENSE`를 보세요.
