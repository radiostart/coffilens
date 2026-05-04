# F00 Fixture 전략 채택 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [F00 fixture 전략 디자인 spec](../specs/2026-05-01-f00-fixture-strategy-design.md) 의 §9 액션 아이템을 적용해 `features/F00-project-setup.md`, `features/F04-coin-detection.md`, `plain.md` 의 fixture 관련 부분을 일관되게 갱신.

**Architecture:** 이 프로젝트는 plan SSOT 워크스페이스 (코드 없음, git 미사용). "구현" = markdown spec 파일 편집. 각 task 는 한 파일의 한 섹션을 편집하고 grep 으로 검증한다.

**Tech Stack:** Markdown (Read/Edit tools), bash grep 검증.

**No-git note:** 이 워크스페이스는 git 저장소가 아님. 커밋 단계 없음. 각 task 마지막에 "검증" 단계로 grep 으로 변경 적용 확인.

**Parent spec:** [docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md](../specs/2026-05-01-f00-fixture-strategy-design.md)

---

## File Structure

수정 대상 (모두 기존 파일):
- `features/F00-project-setup.md` — 산출물 § / 수용 기준 § / Handoff Notes §
- `features/F04-coin-detection.md` — 신규 파일 § / 구현 디테일 § / 수용 기준 § / 테스트 § / 위험·함정 §
- `plain.md` — Section 8 (D0 라인) / Section 12 (디렉토리 트리 fixtures/) / Section 13 (회귀 테스트 코드)

변경 없음:
- `features/README.md`
- `features/F01~F03, F05~F11.md` (직접 fixture 참조 없음 가정)
- `DESIGN.md`

검증 후 처리:
- `features/F05/F06.md` 안에 `varia-dial-*` 또는 `no-coin/two-coins/...` 참조가 있다면 별도 task 로 추가 (Task 4 에서 grep)

---

## Task 1: `features/F00-project-setup.md` 갱신

**Files:**
- Modify: `features/F00-project-setup.md` (산출물 §, 수용 기준 §, Handoff Notes §)

### Step 1.1: 산출물 § 외부 액션 (D0) 의 fixture 항목 교체

- [ ] **산출물 § 의 그라운드 트루스 사진 촬영 블록 교체**

기존 (현 spec 24~29번 라인 부근):
```markdown
- [ ] **그라운드 트루스 사진 촬영**:
  - `fixtures/varia-dial-{1,2,3,4,5}.jpg` — Varia 5단계 분쇄도 (또는 가용한 다른 그라인더)
  - `fixtures/no-coin.jpg` — 동전 없음 reject
  - `fixtures/two-coins.jpg` — 동전 2개 reject
  - `fixtures/partial-coin.jpg` — 동전 가장자리 잘림 reject
  - `fixtures/cup-edge.jpg` — 컵받침 등 원형 노이즈
```

교체:
```markdown
- [ ] **Anchor fixture 준비** (디자인 spec [docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md](../docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md) §3 참조):
  - 보유 체 mesh 페어 확인 → anchor μm 값 계산 (예: 600/850 → 725, 500/710 → 605)
  - 분쇄물을 mesh 페어로 분급 → 두 mesh 사이 fraction 만 회수 (~10g)
  - 흰 A4 또는 흰 접시 위에 평평하게 깔고 500원 동전과 함께 촬영
  - `fixtures/grind-anchor-{NNN}.jpg` 저장 (NNN = 계산된 midpoint μm)
  - `fixtures/manifest.json` 작성 (스키마는 디자인 spec §3.4 참조)
- Reject fixture (no-coin/two-coins/partial-coin/cup-edge) 는 **F00 에서 촬영하지 않음** — F04 에서 anchor 로부터 합성으로 생성
```

### Step 1.2: 수용 기준 § 갱신

- [ ] **수용 기준 § 의 fixture 항목 교체**

기존 (현 spec 의 수용 기준 마지막 항목):
```markdown
- [ ] 그라운드 트루스 fixture 9개 모두 `fixtures/` 에 위치
```

교체:
```markdown
- [ ] `fixtures/grind-anchor-{NNN}.jpg` 존재 (NNN 은 보유 체 mesh 페어 midpoint, 예: 725)
- [ ] `fixtures/manifest.json` 존재, 스키마: `version`, `fixtures[]` (각 entry: `file`, `kind: "anchor"`, `ground_truth_d50_um`, `tolerance_um`, `source`, `shooting{}`)
- [ ] `manifest.json` 의 `ground_truth_d50_um` 이 실제 사용한 mesh 페어 midpoint 와 일치
```

### Step 1.3: Handoff Notes § 갱신

- [ ] **Handoff Notes § 에서 fixture 관련 문단만 교체** (SDK 조사 관련 마지막 문단은 보존)

기존 — Handoff Notes 의 첫 두 문단만 (즉, "이 feature는..." 부터 "...통째로 흔들림." 까지). 그 다음 SDK 조사 결과 문단 ("D1 의 SDK 조사 결과는 F01...") 은 **그대로 둘 것**:
```markdown
이 feature는 **외부 액션 + 환경 셋업** 위주. 코드 산출물은 최소 (스캐폴드 골격만). 핵심 산출물은 다음 두 가지:
1. 토스 콘솔 등록된 미니앱 + API 키
2. 그라운드 트루스 fixture 9개 (F04~F06 회귀 테스트의 근간)

특히 **fixture 촬영은 가능한 한 다양한 조건**(밝기, 각도, 동전 종류)으로. 한 번 잘못 찍으면 D5~D7 알고리즘 튜닝이 통째로 흔들림.
```

교체 (위 두 문단만 다음으로):
```markdown
이 feature는 **외부 액션 + 환경 셋업** 위주. 코드 산출물은 최소 (스캐폴드 골격만). 핵심 산출물은 다음 두 가지:
1. 토스 콘솔 등록된 미니앱 + API 키
2. **anchor fixture 1장 + manifest.json** (알고리즘 절대 정확도 회귀 잠금)

**Fixture 전략 핵심**: anchor 1장이 알고리즘의 D50 절대 정확도를 보장. 단조성 / 다른 그라인더 / 다른 폰 검증은 **베타 D13~17 이후 자연 추가** (Phase 1). 디자인 결정 근거는 디자인 spec 참조.

**보유 체 mesh 확인**: D0 시작 직후 보유 체 mesh 사이즈를 확인하고 anchor μm 값을 그에 맞게 결정. mesh 가 600/850 이면 anchor=725μm, 500/710 이면 anchor=605μm 식. manifest 의 `ground_truth_d50_um` 과 파일명 (`grind-anchor-{NNN}.jpg`) 둘 다 그 값으로.

Reject 검증은 F04 의 합성 fixture + 단위 테스트가 담당. F00 책임 아님.
```

### Step 1.4: 검증

- [ ] **grep 으로 변경 적용 확인**

Run:
```bash
grep -n "varia-dial\|no-coin\|two-coins\|partial-coin\|cup-edge" features/F00-project-setup.md
```
Expected: 출력 없음 (모든 옛 fixture 이름이 사라짐)

Run:
```bash
grep -n "grind-anchor\|manifest.json" features/F00-project-setup.md
```
Expected: 최소 4 hits (산출물 §, 수용 기준 § 의 2 hits, Handoff Notes § — 각각 1번 이상)

---

## Task 2: `features/F04-coin-detection.md` 갱신

**Files:**
- Modify: `features/F04-coin-detection.md` (산출물 §, 구현 디테일 §, 테스트 §, 수용 기준 §, 위험·함정 §)

### Step 2.1: 산출물 § 신규 파일 항목 추가

- [ ] **신규 파일 목록에 합성 스크립트 추가**

기존 (현 F04 spec 19~23번 라인):
```markdown
### 신규 파일
- `src/lib/image-downsample.ts` — canvas API, 1080×1920 → 1280px 긴변
- `src/opencv/coin-detect.ts` — HoughCircles + 0/1/2+/잘림 + 노이즈 분기
- `tests/opencv/coin-detect.test.ts` — 단위 + 회귀
- `tests/opencv/regression.test.ts` — 그라운드 트루스 5단계 (실제 검증은 F06 에서 D50까지 가야 가능, 여기는 동전 검출 회귀만)
```

교체:
```markdown
### 신규 파일
- `src/lib/image-downsample.ts` — canvas API, 1080×1920 → 1280px 긴변
- `src/opencv/coin-detect.ts` — HoughCircles + 0/1/2+/잘림 + 노이즈 분기
- `scripts/build-reject-fixtures.ts` — anchor 로부터 reject 합성 fixture 생성 (no-coin/two-coins/partial-coin/cup-edge)
- `fixtures/synthetic/` — 합성 결과 보관 디렉토리 (`.gitkeep` 으로 트래킹, 산출물은 ignore)
- `tests/opencv/coin-detect.test.ts` — 단위 + 회귀
- `tests/opencv/regression.test.ts` — anchor + 합성 reject (실제 D50 검증은 F06 까지 가야 가능, 여기는 동전 검출 회귀만)
```

### Step 2.2: 구현 디테일 § 에 합성 스크립트 절차 섹션 추가

- [ ] **`### errors.ts 확장` 섹션 바로 앞에 새 섹션 삽입**

기존 (현 F04 spec 에서 `### 입력 검증 (밝기/블러)` 섹션 바로 다음, `### errors.ts 확장` 바로 앞 위치):

삽입할 새 섹션:
```markdown
### scripts/build-reject-fixtures.ts

D0 의 anchor fixture (`fixtures/grind-anchor-{NNN}.jpg`) 를 base 로 4개 reject 합성 fixture 를 생성. F04 작업 시작 전에 한 번 실행 → `fixtures/synthetic/` 에 결과 저장.

```ts
// scripts/build-reject-fixtures.ts
// 사용: npx tsx scripts/build-reject-fixtures.ts
// 입력: fixtures/grind-anchor-{NNN}.jpg (manifest.json 의 첫 anchor entry)
// 출력: fixtures/synthetic/no-coin.jpg, two-coins.jpg, partial-coin.jpg, cup-edge.jpg

import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp'; // npm i -D sharp

const FIX_DIR = 'fixtures';
const OUT_DIR = path.join(FIX_DIR, 'synthetic');
const manifest = JSON.parse(fs.readFileSync(path.join(FIX_DIR, 'manifest.json'), 'utf8'));
const anchor = manifest.fixtures.find((f: any) => f.kind === 'anchor');
if (!anchor) throw new Error('manifest.json: anchor fixture not found');
const SRC = path.join(FIX_DIR, anchor.file);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. no-coin: 동전 영역을 흰 픽셀로 마스킹 (수동 좌표 입력 또는 HoughCircles 사용)
  //    안전한 fallback: 이미지의 우측 30% crop (동전 일반적으로 좌측·중앙 가정 시)
  await sharp(SRC).extract({ left: 0, top: 0, width: 100, height: 100 }) // placeholder; 실제 좌표는 anchor 촬영 시 결정
    .toFile(path.join(OUT_DIR, 'no-coin.jpg'));

  // 2. two-coins: anchor 를 좌우로 반전·합성 (동전이 두 개로 보이도록)
  const meta = await sharp(SRC).metadata();
  const half = await sharp(SRC).extract({ left: 0, top: 0, width: Math.floor(meta.width!/2), height: meta.height! }).toBuffer();
  const flipped = await sharp(SRC).flop().extract({ left: 0, top: 0, width: Math.floor(meta.width!/2), height: meta.height! }).toBuffer();
  await sharp({ create: { width: meta.width!, height: meta.height!, channels: 3, background: 'white' }})
    .composite([{ input: half, left: 0, top: 0 }, { input: flipped, left: Math.floor(meta.width!/2), top: 0 }])
    .toFile(path.join(OUT_DIR, 'two-coins.jpg'));

  // 3. partial-coin: anchor 를 25% 우측으로 잘라낸 crop (동전이 우측 가장자리에 걸림)
  await sharp(SRC).extract({
    left: Math.floor(meta.width! * 0.25),
    top: 0,
    width: Math.floor(meta.width! * 0.75),
    height: meta.height!,
  }).toFile(path.join(OUT_DIR, 'partial-coin.jpg'));

  // 4. cup-edge: anchor 위에 큰 호(arc) 합성 — sharp SVG composite 로 검정 호 그리기
  const arcSvg = `<svg width="${meta.width}" height="${meta.height}"><path d="M 0 ${meta.height!/2} Q ${meta.width!/2} ${meta.height!} ${meta.width} ${meta.height!/2}" stroke="black" stroke-width="40" fill="none"/></svg>`;
  await sharp(SRC).composite([{ input: Buffer.from(arcSvg), blend: 'multiply' }])
    .toFile(path.join(OUT_DIR, 'cup-edge.jpg'));

  console.log(`Generated 4 synthetic reject fixtures in ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

> **주의**: 위 코드의 `no-coin` 좌표는 placeholder. anchor 촬영 후 실제 동전 위치를 측정하거나 HoughCircles 로 1차 검출한 결과를 사용. 첫 실행 시 출력 검토하고 필요 시 좌표 조정.

> **합성 fixture 의 D50 ground truth 는 anchor 와 동일** (no-coin 제외). 합성 후 manifest.json 에 reject entry 추가:

```json
{
  "file": "synthetic/no-coin.jpg",
  "kind": "reject",
  "expected_error": "no_coin",
  "source": "synthesized from grind-anchor-{NNN}.jpg"
}
```

```

### Step 2.3: 테스트 § fixture 참조 갱신

- [ ] **테스트 코드의 fixture 이름 교체**

기존 (현 F04 spec 의 `tests/opencv/coin-detect.test.ts (회귀)` 블록):
```ts
const fixtures = [
  { file: 'varia-dial-3.jpg', expected: { coinType: '500', confidenceMin: 0.7 } },
  { file: 'no-coin.jpg', expectedError: 'no_coin' },
  { file: 'two-coins.jpg', expectedError: 'multi_coin' },
  { file: 'partial-coin.jpg', expectedError: 'partial_coin' },
  { file: 'cup-edge.jpg', expected: { confidenceMax: 0.5 } }, // 검출되지만 신뢰도 낮음
];
```

교체:
```ts
// 회귀: anchor + 합성 reject (manifest 에서 동적 로드 권장)
import manifest from '../../fixtures/manifest.json';

const anchor = manifest.fixtures.find((f: any) => f.kind === 'anchor')!;
const rejects = manifest.fixtures.filter((f: any) => f.kind === 'reject');

// anchor 검증: 정상 동전 검출 + 신뢰도
it(`${anchor.file} → 정상 동전 검출 + 신뢰도 >= 0.7`, async () => {
  const result = await detectCoin(loadFixture(anchor.file));
  expect(result.confidence).toBeGreaterThanOrEqual(0.7);
});

// reject 검증: 각 합성 fixture 가 기대 에러 발생
for (const fx of rejects) {
  it(`${fx.file} → ${fx.expected_error}`, async () => {
    await expect(detectCoin(loadFixture(fx.file))).rejects.toMatchObject({ kind: fx.expected_error });
  });
}
```

### Step 2.4: 수용 기준 § 갱신

- [ ] **수용 기준 § 의 마지막에 항목 2개 추가**

기존 마지막 항목 (현 F04 spec):
```markdown
- [ ] `errors.ts` switch exhaustive — 신규 에러 추가 시 컴파일러 강제
```

교체 (해당 항목 유지 + 다음 줄 2개 추가):
```markdown
- [ ] `errors.ts` switch exhaustive — 신규 에러 추가 시 컴파일러 강제
- [ ] `scripts/build-reject-fixtures.ts` 실행 시 `fixtures/synthetic/{no-coin,two-coins,partial-coin,cup-edge}.jpg` 4개 생성
- [ ] 합성 fixture 4개가 `manifest.json` 의 `kind: "reject"` entry 로 등록됨
```

### Step 2.5: 위험·함정 § 갱신

- [ ] **fixtures 미준비 위험 라인 교체**

기존 (현 F04 spec 의 위험 항목):
```markdown
- ⚠️ **fixtures 미준비 시 회귀 테스트 작성 불가**: F00 D0 의 fixture 촬영이 D5 진입 전 완료 필수
```

교체:
```markdown
- ⚠️ **anchor fixture 미준비 시 합성 스크립트 + 회귀 테스트 둘 다 불가**: F00 D0 의 anchor 촬영이 D5 진입 전 완료 필수. 합성 스크립트는 anchor 좌표(동전 위치)를 입력으로 쓰므로 placeholder 좌표 그대로 두지 말 것.
- ⚠️ **합성 fixture 가 실 사진 노이즈 못 흉내**: 베타 D13~17 의 실제 reject 사진은 Phase 1 에 fixture 화 검토.
```

### Step 2.6: 검증

- [ ] **grep 으로 변경 적용 확인**

Run:
```bash
grep -n "varia-dial" features/F04-coin-detection.md
```
Expected: 출력 없음

Run:
```bash
grep -n "grind-anchor\|build-reject-fixtures\|synthetic" features/F04-coin-detection.md
```
Expected: 최소 5 hits (신규 파일 §, 합성 스크립트 §, 테스트 §, 수용 기준 §, 위험 §)

---

## Task 3: `plain.md` 갱신

**Files:**
- Modify: `plain.md` (Section 8 D0, Section 12 디렉토리 트리, Section 13 회귀 테스트 코드 + reject 케이스)

### Step 3.1: Section 8 (D0 라인) 갱신

- [ ] **D0 행의 fixture 부분 교체**

기존 (plain.md:337):
```
| **D0** | **프리체크**: 토스 콘솔 가입 + 미니앱 등록 + "커피렌즈" 이름 선점 확인 + Varia 5단계 그라운드 트루스 사진 촬영 + 노이즈 케이스 4종 (no-coin/two-coins/partial-coin/cup-edge) |
```

교체:
```
| **D0** | **프리체크**: 토스 콘솔 가입 + 미니앱 등록 + "커피렌즈" 이름 선점 확인 + **anchor fixture 1장 준비** (sieve 분급 → `fixtures/grind-anchor-{NNN}.jpg` + `manifest.json`). Reject fixture 는 F04 에서 합성 (디자인 spec: docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md) |
```

### Step 3.2: Section 12 디렉토리 트리 갱신

- [ ] **fixtures/ 트리 교체**

기존 (plain.md:514~523):
```
fixtures/                         # 그라운드 트루스 + 합성 이미지
├── varia-dial-1.jpg              # 매우 곱음
├── varia-dial-2.jpg
├── varia-dial-3.jpg              # V60 적정
├── varia-dial-4.jpg
├── varia-dial-5.jpg              # 매우 굵음
├── no-coin.jpg                   # reject 케이스
├── two-coins.jpg                 # reject 케이스
├── partial-coin.jpg              # reject 케이스
└── cup-edge.jpg                  # 노이즈 (컵받침)
```

교체:
```
fixtures/                         # 회귀 테스트 anchor + 합성 reject
├── grind-anchor-{NNN}.jpg        # sieve 분급 anchor (NNN = mesh 페어 midpoint, 예: 725)
├── manifest.json                 # 메타데이터 (ground truth, 촬영 정보)
└── synthetic/                    # F04 가 anchor 로부터 생성
    ├── no-coin.jpg               # 동전 마스킹
    ├── two-coins.jpg             # 동전 복제
    ├── partial-coin.jpg          # 우측 25% crop
    └── cup-edge.jpg              # 큰 호 합성
```

### Step 3.3: Section 13 회귀 테스트 헤더 + 코드 블록 통째 교체

- [ ] **헤더 `### 그라운드 트루스 회귀 테스트 (D5 ~ D7 진행)` 부터 그 다음 헤더 (`### Reject 케이스 테스트`) 직전까지 통째 교체**

기존 (헤더 + 빈 줄 + ```typescript 블록):
````markdown
### 그라운드 트루스 회귀 테스트 (D5 ~ D7 진행)

```typescript
// tests/opencv/regression.test.ts
const fixtures = [
  { file: 'varia-dial-1.jpg', expectedD50: 480, tolerance: 50 },
  { file: 'varia-dial-2.jpg', expectedD50: 600, tolerance: 50 },
  { file: 'varia-dial-3.jpg', expectedD50: 720, tolerance: 50 }, // V60 적정
  { file: 'varia-dial-4.jpg', expectedD50: 850, tolerance: 50 },
  { file: 'varia-dial-5.jpg', expectedD50: 980, tolerance: 50 },
];

describe('Ground truth regression', () => {
  for (const { file, expectedD50, tolerance } of fixtures) {
    it(`${file} → D50 ${expectedD50}±${tolerance}μm`, async () => {
      const result = await runPipeline(loadFixture(file), new AbortController().signal);
      expect(Math.abs(result.d50 - expectedD50)).toBeLessThan(tolerance);
    });
  }
});
```

````

교체:
````markdown
### Anchor 회귀 테스트 (D5 ~ D7 진행)

Anchor fixture 1장이 알고리즘의 D50 절대 정확도를 회귀 잠금. 단조성 / 다른 그라인더 / 다른 폰 검증은 베타 D13~17 이후 자연 추가 (Phase 1).

```typescript
// tests/opencv/regression.test.ts
import manifest from '../../fixtures/manifest.json';

describe('Anchor regression', () => {
  for (const fx of manifest.fixtures.filter(f => f.kind === 'anchor')) {
    it(`${fx.file} → D50 ${fx.ground_truth_d50_um}±${fx.tolerance_um}μm`, async () => {
      const result = await runPipeline(loadFixture(fx.file), new AbortController().signal);
      expect(Math.abs(result.d50 - fx.ground_truth_d50_um)).toBeLessThan(fx.tolerance_um);
    });
  }
});
```

> manifest 기반 동적 루프 — Phase 1 에서 베타 사진 fixture 가 추가되면 테스트 코드 변경 없이 자동 포함.

````

### Step 3.4: Section 13 Reject 케이스 코드 블록 갱신

- [ ] **Reject 케이스 fixture 참조 교체**

기존 (plain.md:582~589):
```typescript
const rejects = [
  { file: 'no-coin.jpg', expectedKind: 'no_coin' },
  { file: 'two-coins.jpg', expectedKind: 'multi_coin' },
  { file: 'partial-coin.jpg', expectedKind: 'partial_coin' },
  { file: 'cup-edge.jpg', expectedConfidence: { lt: 5 } }, // 신뢰도 점수로 처리
];
```

교체:
```typescript
// F04 의 scripts/build-reject-fixtures.ts 가 anchor 로부터 합성한 4개를 manifest 에서 로드
const rejects = manifest.fixtures.filter(f => f.kind === 'reject');
// expected_error 가 manifest entry 에 명시됨 — 'no_coin' | 'multi_coin' | 'partial_coin' | 또는 신뢰도 임계 (cup-edge)
```

### Step 3.5: 검증

- [ ] **grep 으로 변경 적용 확인**

Run:
```bash
grep -n "varia-dial" plain.md
```
Expected: 출력 없음

Run:
```bash
grep -n "no-coin.jpg\|two-coins.jpg\|partial-coin.jpg\|cup-edge.jpg" plain.md
```
Expected: 출력 없음 (또는 합성 디렉토리 트리의 4 hits 만 — `synthetic/` 하위)

확인:
```bash
grep -n "synthetic/" plain.md
```
Expected: 4 hits (디렉토리 트리)

```bash
grep -n "grind-anchor\|manifest.json" plain.md
```
Expected: 최소 5 hits (D0 라인, 트리 2개, anchor 회귀 코드, reject 코드)

---

## Task 4: 누락된 fixture 참조 sweep

**Files:**
- Read-only sweep across all `features/*.md` and root `*.md` files.

### Step 4.1: 전체 워크스페이스 grep

- [ ] **남은 옛 fixture 참조 탐색**

Run:
```bash
grep -rn "varia-dial\|no-coin\.jpg\|two-coins\.jpg\|partial-coin\.jpg\|cup-edge\.jpg" features/ plain.md README.md DESIGN.md 2>/dev/null
```
Expected: 출력 없음 (모든 옛 참조 제거됨)

### Step 4.2: 누락된 곳이 발견되면 추가 task

- [ ] **만약 출력이 있다면**:
  - 출력된 각 파일·라인을 확인
  - 컨텍스트에 맞춰 디자인 spec §3 (anchor) 또는 §4 (합성 reject) 의 명명으로 교체
  - 이 plan 의 Task 1~3 패턴 (옛 → 새 + grep 검증) 그대로 적용

> 출력이 없으면 이 step skip.

### Step 4.3: 디자인 spec 링크 일관성 확인

- [ ] **디자인 spec 으로의 링크가 모든 갱신된 파일에 있는지 확인**

Run:
```bash
grep -rn "2026-05-01-f00-fixture-strategy-design" features/F00-project-setup.md features/F04-coin-detection.md plain.md
```
Expected: 최소 3 hits (각 파일에 한 번 이상)

만약 plain.md 에 링크가 빠져 있으면 D0 라인의 `(디자인 spec: ...)` 부분이 살아 있는지 재확인.

---

## Self-Review Checklist (계획 작성자 셀프 리뷰 — 실행 전에)

이 plan 자체에 대한 셀프 리뷰. 실행 시 이 섹션은 skip 해도 OK.

- [ ] **Spec coverage**: 디자인 spec §9 의 4개 액션 아이템 (F00 갱신 / F04 갱신 / plain.md 갱신 / README 변경 없음) 모두 task 가 있는가?
  - F00 → Task 1 ✓
  - F04 → Task 2 ✓
  - plain.md → Task 3 ✓
  - README 변경 없음 → action 없음 (의도) ✓
  - 추가: Task 4 sweep — 누락 케이스 보완 ✓

- [ ] **Placeholder scan**: TBD/TODO/"적절히"/"필요시" 등 vague language 없는가?
  - 합성 스크립트의 `no-coin` 좌표는 placeholder 인데, 이건 "anchor 촬영 후 실제 좌표 측정" 으로 명시됨 — 의도된 placeholder, OK.

- [ ] **Type/이름 일관성**: 파일명·필드명 일관?
  - `grind-anchor-{NNN}.jpg` — 4개 task 에서 동일 ✓
  - `manifest.json` 필드: `kind`, `ground_truth_d50_um`, `tolerance_um`, `source`, `shooting`, `expected_error` — 디자인 spec §3.4 와 일치 ✓
  - `fixtures/synthetic/` 경로 — Task 2.1, 2.2, 3.2 모두 동일 ✓

---

## 실행 순서

Task 1 → 2 → 3 → 4 순차 실행 권장 (의존성 거의 없음, 순서는 영향 범위 작은 것부터).

각 task 끝의 grep 검증이 통과해야 다음 task 진입.
