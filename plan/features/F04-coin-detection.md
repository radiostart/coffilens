# F04 — Coin Detection & Calibration

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D5)
**Dependencies**: F00 (그라운드 트루스 fixture), F03 (MatScope, errors)
**Blocks**: F05, F06
**plain.md 참조**: Section 6 (파이프라인 0~2단계), Section 11 (no_coin/multi_coin/partial_coin/노이즈 오인식/밝기/블러), Section 13 (테스트 전략)

---

## 목표

이미지 다운샘플링 + 입력 검증(밝기/블러) + **HoughCircles 동전 검출 (모든 분기)** + mm/pixel 캘리브레이션 + **그라운드 트루스 회귀 테스트 셋업**.

> **컨셉 변경 (2026-05-01, Option A)**: 동전 종류는 사용자가 F02 `coin-select` 에서 사전 선택 → `detectCoin(canvas, coinType)` 인자로 전달. **auto-classify 휴리스틱 (`chooseCoinType` ratio 0.2 임계) 제거**. 이유: 100원(24mm) vs 500원(26.5mm) 직경 차가 ~10% 라 잘못 분류하면 모든 입자 크기가 ±10% 편향. 사용자 선택을 single source of truth 로 사용.

---

## 산출물

### 신규 파일
- `src/lib/image-downsample.ts` — canvas API, 1080×1920 → 1280px 긴변
- `src/opencv/coin-detect.ts` — HoughCircles + 0/1/2+/잘림 + 노이즈 분기
- `scripts/build-reject-fixtures.ts` — anchor 로부터 reject 합성 fixture 생성 (no-coin/two-coins/partial-coin/cup-edge)
- `fixtures/synthetic/` — 합성 결과 보관 디렉토리 (`.gitkeep` 으로 트래킹, 산출물은 ignore)
- `tests/opencv/coin-detect.test.ts` — 단위 + 회귀
- `tests/opencv/regression.test.ts` — anchor + 합성 reject (실제 D50 검증은 F06 까지 가야 가능, 여기는 동전 검출 회귀만)

### 수정 파일
- `src/opencv/errors.ts` — `no_coin`, `multi_coin`, `partial_coin`, `low_brightness`, `blur` 추가 + switch 확장

---

## 구현 디테일

### lib/image-downsample.ts
```ts
const TARGET_LONG_EDGE = 1280;

export function downsampleImage(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const srcW = source.width;
  const srcH = source.height;
  const longEdge = Math.max(srcW, srcH);

  if (longEdge <= TARGET_LONG_EDGE) {
    // 이미 작음 → 원본 canvas 로 변환만
    return toCanvas(source);
  }

  const scale = TARGET_LONG_EDGE / longEdge;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, dstW, dstH);
  return canvas;
}
```

### opencv/coin-detect.ts
```ts
import { withMatScope } from './mat-pool';
import { AnalysisError } from './errors';

export interface CoinDetection {
  centerX: number;
  centerY: number;
  radiusPx: number;
  coinType: '100' | '500';
  diameterMm: number;        // 24 or 26.5
  mmPerPixel: number;
  confidence: number;        // 0~1, 검출 신뢰도
}

const COIN_100_RADIUS_MM = 12;   // 직경 24mm
const COIN_500_RADIUS_MM = 13.25; // 직경 26.5mm
const CLASSIFY_THRESHOLD_MM = 12.625; // 두 동전 중간값

const EDGE_MARGIN_PX = 20; // 화면 가장자리 마진 (잘림 검출)

export async function detectCoin(
  canvas: HTMLCanvasElement,
  coinType: '100' | '500',  // 사용자가 F02 coin-select 에서 사전 지정
): Promise<CoinDetection> {
  return withMatScope(async (scope) => {
    const src = scope.track(cv.imread(canvas));
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);

    const circles = scope.track(new cv.Mat());
    cv.HoughCircles(
      gray, circles,
      cv.HOUGH_GRADIENT,
      1,                  // dp
      gray.rows / 4,      // minDist
      100,                // param1 (Canny 상위 임계)
      30,                 // param2 (검출 임계, 낮을수록 검출 ↑)
      Math.round(gray.rows * 0.05),  // minRadius (이미지 5% 이상)
      Math.round(gray.rows * 0.4)    // maxRadius (이미지 40% 이하)
    );

    const numCircles = circles.cols;

    // 1. 동전 0개
    if (numCircles === 0) {
      throw { kind: 'no_coin' } satisfies AnalysisError;
    }

    // 2. 동전 2개+
    if (numCircles > 1) {
      throw { kind: 'multi_coin', count: numCircles } satisfies AnalysisError;
    }

    // 3. 동전 1개 → 검증
    const cx = circles.data32F[0];
    const cy = circles.data32F[1];
    const r = circles.data32F[2];

    // 가장자리 잘림 체크
    if (cx - r < EDGE_MARGIN_PX || cy - r < EDGE_MARGIN_PX
        || cx + r > gray.cols - EDGE_MARGIN_PX || cy + r > gray.rows - EDGE_MARGIN_PX) {
      throw { kind: 'partial_coin' } satisfies AnalysisError;
    }

    // 4. mm/pixel 환산 — 사용자가 사전 지정한 coinType 의 직경 사용
    const diameterMm = coinType === '100' ? 24 : 26.5;
    const mmPerPixel = diameterMm / (r * 2);

    // 5. 검출 신뢰도 (HoughCircles 자체는 신뢰도 안 주므로 휴리스틱)
    // - 반지름이 minRadius/maxRadius 중간 영역에 있으면 ↑
    // - 이미지 중앙에 가까우면 ↑
    const confidence = computeCoinConfidence(cx, cy, r, gray.cols, gray.rows);

    return { centerX: cx, centerY: cy, radiusPx: r, coinType, diameterMm, mmPerPixel, confidence };
  });
}

function computeCoinConfidence(cx: number, cy: number, r: number, w: number, h: number): number {
  const centerDx = Math.abs(cx - w/2) / (w/2);
  const centerDy = Math.abs(cy - h/2) / (h/2);
  const centerScore = 1 - Math.min(1, (centerDx + centerDy) / 2);
  const sizeScore = Math.min(1, r / (h * 0.15));
  return Math.round((centerScore * 0.4 + sizeScore * 0.6) * 100) / 100;
}
```

### 입력 검증 (밝기/블러)

`opencv/coin-detect.ts` 또는 `opencv/preflight.ts` 분리 가능 (단순하면 같은 파일):

```ts
const MIN_BRIGHTNESS = 80;
const MIN_LAPLACIAN_VAR = 100; // 임계는 fixture 기반 튜닝

export interface InputQualityResult {
  meanBrightness: number;     // 0~255
  laplacianVariance: number;  // 블러 점수 (높을수록 sharp)
}

export async function checkInputQuality(canvas: HTMLCanvasElement): Promise<InputQualityResult> {
  return withMatScope(async (scope) => {
    const src = scope.track(cv.imread(canvas));
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 밝기
    const meanBrightness = cv.mean(gray)[0];
    if (meanBrightness < MIN_BRIGHTNESS) {
      throw { kind: 'low_brightness', meanBrightness } satisfies AnalysisError;
    }

    // 블러 (Laplacian variance)
    const laplacian = scope.track(new cv.Mat());
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    const mean = scope.track(new cv.Mat());
    const stddev = scope.track(new cv.Mat());
    cv.meanStdDev(laplacian, mean, stddev);
    const variance = stddev.data64F[0] ** 2;
    if (variance < MIN_LAPLACIAN_VAR) {
      throw { kind: 'blur', laplacianVariance: variance } satisfies AnalysisError;
    }

    // 합격 시 confidence 입력으로 사용할 측정값 반환
    return { meanBrightness, laplacianVariance: variance };
  });
}
```

### scripts/build-reject-fixtures.ts

D0 의 anchor fixture (`fixtures/grind-anchor-{NNN}.jpg`) 를 base 로 4개 reject 합성 fixture 를 생성. F04 작업 시작 전에 한 번 실행 → `fixtures/synthetic/` 에 결과 저장.

```ts
// scripts/build-reject-fixtures.ts
// 사용: npx tsx scripts/build-reject-fixtures.ts
// 입력: fixtures/grind-anchor-{NNN}.jpg (manifest.json 의 첫 anchor entry)
// 출력: fixtures/synthetic/no-coin.synth.jpg, two-coins.synth.jpg, partial-coin.synth.jpg, cup-edge.synth.jpg

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
    .toFile(path.join(OUT_DIR, 'no-coin.synth.jpg'));

  // 2. two-coins: anchor 를 좌우로 반전·합성 (동전이 두 개로 보이도록)
  const meta = await sharp(SRC).metadata();
  const half = await sharp(SRC).extract({ left: 0, top: 0, width: Math.floor(meta.width!/2), height: meta.height! }).toBuffer();
  const flipped = await sharp(SRC).flop().extract({ left: 0, top: 0, width: Math.floor(meta.width!/2), height: meta.height! }).toBuffer();
  await sharp({ create: { width: meta.width!, height: meta.height!, channels: 3, background: 'white' }})
    .composite([{ input: half, left: 0, top: 0 }, { input: flipped, left: Math.floor(meta.width!/2), top: 0 }])
    .toFile(path.join(OUT_DIR, 'two-coins.synth.jpg'));

  // 3. partial-coin: anchor 를 25% 우측으로 잘라낸 crop (동전이 우측 가장자리에 걸림)
  await sharp(SRC).extract({
    left: Math.floor(meta.width! * 0.25),
    top: 0,
    width: Math.floor(meta.width! * 0.75),
    height: meta.height!,
  }).toFile(path.join(OUT_DIR, 'partial-coin.synth.jpg'));

  // 4. cup-edge: anchor 위에 큰 호(arc) 합성 — sharp SVG composite 로 검정 호 그리기
  const arcSvg = `<svg width="${meta.width}" height="${meta.height}"><path d="M 0 ${meta.height!/2} Q ${meta.width!/2} ${meta.height!} ${meta.width} ${meta.height!/2}" stroke="black" stroke-width="40" fill="none"/></svg>`;
  await sharp(SRC).composite([{ input: Buffer.from(arcSvg), blend: 'multiply' }])
    .toFile(path.join(OUT_DIR, 'cup-edge.synth.jpg'));

  console.log(`Generated 4 synthetic reject fixtures in ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

> **주의**: 위 코드의 `no-coin` 좌표는 placeholder. anchor 촬영 후 실제 동전 위치를 측정하거나 HoughCircles 로 1차 검출한 결과를 사용. 첫 실행 시 출력 검토하고 필요 시 좌표 조정.

> **합성 fixture 의 D50 ground truth 는 anchor 와 동일** (no-coin 제외). 합성 후 manifest.json 에 reject entry 추가:

```json
{
  "file": "synthetic/no-coin.synth.jpg",
  "kind": "reject",
  "expected_error": "no_coin",
  "source": "synthesized from grind-anchor-{NNN}.jpg"
}
```

> **cup-edge 는 다름** — `detectCoin()` 이 throw 하지 않고 통과시키되 신뢰도 점수가 낮음. manifest entry 는 `expected_error` 대신 `expected_low_confidence: true` 사용:

```json
{
  "file": "synthetic/cup-edge.synth.jpg",
  "kind": "reject",
  "expected_low_confidence": true,
  "source": "synthesized from grind-anchor-{NNN}.jpg"
}
```

### errors.ts 확장
```ts
export type AnalysisError =
  | { kind: 'opencv_load_fail'; cause: 'network' | 'cors' | 'timeout' }
  | { kind: 'aborted' }
  | { kind: 'no_coin' }
  | { kind: 'multi_coin'; count: number }
  | { kind: 'partial_coin' }
  | { kind: 'low_brightness'; meanBrightness: number }
  | { kind: 'blur'; laplacianVariance: number };

export function userMessage(e: AnalysisError): string {
  switch (e.kind) {
    case 'opencv_load_fail': return 'OpenCV 로드 실패. 와이파이 확인 후 재시도해주세요.';
    case 'aborted': return '';
    case 'no_coin': return '동전이 보이지 않아요. 100원 또는 500원 동전을 함께 놓고 다시 촬영해주세요.';
    case 'multi_coin': return '동전이 여러 개 보여요. 1개만 놓아주세요.';
    case 'partial_coin': return '동전이 화면 가장자리에 잘렸어요. 동전 전체가 보이도록 다시 촬영해주세요.';
    case 'low_brightness': return '너무 어두워요. 더 밝은 곳에서 촬영해주세요.';
    case 'blur': return '흔들렸어요. 폰을 고정하고 다시 촬영해주세요.';
  }
}
```

---

## 수용 기준

- [ ] `downsampleImage()` 가 1080×1920 → 1280×720 (긴변 1280) 정확히 변환
- [ ] `detectCoin(canvas, coinType)` 가 모든 분기 (0/1/2+/잘림) 에 대해 적절한 AnalysisError 또는 결과 반환
- [ ] **사용자 지정 `coinType` 인자**로 직경(24mm/26.5mm) 결정 — auto-classify 로직 없음
- [ ] mm/pixel 환산 결과가 합리적 (0.05~0.15 mm/pixel 범위)
- [ ] 동전 검출 신뢰도 (0~1) 반환
- [ ] `checkInputQuality()` 가 밝기/블러 reject 정확히 수행 + 합격 시 `{meanBrightness, laplacianVariance}` 반환
- [ ] `errors.ts` switch exhaustive — 신규 에러 추가 시 컴파일러 강제
- [ ] `scripts/build-reject-fixtures.ts` 실행 시 `fixtures/synthetic/{no-coin,two-coins,partial-coin,cup-edge}.synth.jpg` 4개 생성
- [ ] 합성 fixture 4개가 `manifest.json` 의 `kind: "reject"` entry 로 등록됨

---

## 테스트

### tests/opencv/coin-detect.test.ts (회귀)
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

// reject 검증: expected_error 가 있는 fixture 는 throw 검증, 없는 (cup-edge 등) 은 신뢰도 검증
for (const fx of rejects) {
  if (fx.expected_error) {
    it(`${fx.file} → ${fx.expected_error}`, async () => {
      await expect(detectCoin(loadFixture(fx.file))).rejects.toMatchObject({ kind: fx.expected_error });
    });
  } else if (fx.expected_low_confidence) {
    it(`${fx.file} → 신뢰도 < 0.5`, async () => {
      const result = await detectCoin(loadFixture(fx.file));
      expect(result.confidence).toBeLessThan(0.5);
    });
  }
}
```

### tests/lib/image-downsample.test.ts
```ts
- 1080×1920 → 720×1280 (긴변 1280)
- 1280×720 → 그대로 (이미 임계 이하)
- 정사각형 2000×2000 → 1280×1280
- 메모리 free 확인
```

### tests/opencv/preflight.test.ts (밝기/블러)
- 밝은 fixture → pass
- 어두운 fixture (또는 합성 이미지) → low_brightness
- 흐릿한 fixture → blur

---

## 검수 영향

- 직접 검수 항목 없음 (내부 로직)
- 단, 동전 오인식 시 잘못된 측정값 → 사용자 클레임 → 검수 외 평판 위험. 회귀 테스트 필수.

---

## 위험 / 함정

- ⚠️ **HoughCircles 파라미터 튜닝**: minRadius/maxRadius/param2 가 fixture 기반 튜닝 필요. D5 일정 안에 5~10 회 시행착오 가능
- ⚠️ **사용자 동전 오선택**: 100원과 500원을 잘못 선택하면 모든 입자 크기가 ~10% 편향. F02 coin-select 카드 디자인이 명확해야 함 (라벨 + 직경 mm 명시)
- ⚠️ **컵받침/그릇 등 원형 노이즈**: HoughCircles 가 잘 잡음. 신뢰도 점수로 fallback. Phase 1에 ML 분류기 도입 검토
- ⚠️ **anchor fixture 미준비 시 합성 스크립트 + 회귀 테스트 둘 다 불가**: F00 D0 의 anchor 촬영이 D5 진입 전 완료 필수. 합성 스크립트는 anchor 좌표(동전 위치)를 입력으로 쓰므로 placeholder 좌표 그대로 두지 말 것.
- ⚠️ **합성 fixture 가 실 사진 노이즈 못 흉내**: 베타 D13~17 의 실제 reject 사진은 Phase 1 에 fixture 화 검토.
- ⚠️ **Laplacian variance 임계**: 폰마다 카메라 노이즈 다름. 임계 100 은 보수적 추정. fixture 로 캘리브레이션

---

## 참조

- [plain.md Section 6 (파이프라인 0~2단계)](../plain.md)
- [plain.md Section 11 (Failure Modes)](../plain.md)
- [OpenCV HoughCircles](https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html)

---

## Handoff Notes

이 feature 가 **알고리즘 노트(D7) 의 첫 페이지**. HoughCircles 파라미터(minDist, param1, param2, minRadius, maxRadius) 와 입력 검증 임계값(MIN_BRIGHTNESS, MIN_LAPLACIAN_VAR) 모두 fixture 기반으로 튜닝.

**튜닝 결과 ALGORITHM_NOTES.md 에 기록**: 어떤 fixture 에서 어떤 파라미터로 잘 작동, 실패 케이스는 무엇.

동전 종류는 사용자가 F02 coin-select 에서 사전 지정 → `detectCoin(canvas, coinType)` 인자로 전달. auto-classify 휴리스틱은 사용 안 함 (잘못 분류하면 모든 입자 크기 ±10% 편향, 사용자 선택을 신뢰).

다음 feature (F05) 는 검출된 동전을 마스킹하고 입자 영역 추출. 이 feature 의 출력 (mm/pixel + 동전 위치) 이 정확해야 입자 통계가 의미 있음.

---

## 추가 (2026-05-02, Phase 1) — `coinHint` 파라미터 + multi_coin/partial_coin 우회

### 배경

D9~D12 fixture QC 에서 HoughCircles + intensity 필터 만으로는 napkin 텍스처 / sparse coffee 분포 fixture 의 false positive 분리 불가 — fundamental ambiguity (mean/stddev/exterior/rim gradient 모두 진짜 동전과 분포 동급). [F02 추가 섹션](F02-home-routing.md) 의 `/coin-locate` 라우트에서 사용자가 동전 위치 탭 → 상대 좌표 hint 전달.

### 시그니처 변경 (`detectCoin`)

```ts
export interface CoinHint { x: number; y: number; } // 상대 좌표 0~1

export function detectCoin(
  canvas: HTMLCanvasElement,
  coinType: CoinType,
  coinHint?: CoinHint | null,  // 신규 — Phase 1 UX
): Promise<CoinDetection>;
```

### Hint-aware candidate 선택 로직

원 spec 의 candidate filter (intensity / stddev / exterior / rim gradient) 통과 후:

```ts
let selectedCandidate: Candidate;
if (coinHint && coinCandidates.length > 0) {
  // hint 있으면 hint 가장 가까운 candidate 채택
  const hintX = coinHint.x * gray.cols;  // 상대 → 절대 변환
  const hintY = coinHint.y * gray.rows;
  selectedCandidate = [...coinCandidates].sort((a, b) => {
    const da = Math.hypot(a.cx - hintX, a.cy - hintY);
    const db = Math.hypot(b.cx - hintX, b.cy - hintY);
    return da - db;
  })[0];
} else {
  // hint 없으면 기존 로직 (가장 신뢰도 높은 candidate)
  selectedCandidate = pickBestCandidate(coinCandidates);
}
```

### multi_coin / partial_coin 우회

```ts
// hint 있으면 multi_coin 검사 우회 (사용자가 가리킨 1개만 사용)
if (!coinHint && coinCandidates.length > 1) {
  throw { kind: "multi_coin", count: coinCandidates.length } satisfies AnalysisError;
}

// hint 있으면 partial_coin 검사도 우회 (사용자 의도 우선)
if (!coinHint && isPartialCoin(selectedCandidate, gray)) {
  throw { kind: "partial_coin" } satisfies AnalysisError;
}
```

### Pipeline 통합 (`pipeline.ts`)

```ts
export async function runPipeline(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  coinType: CoinType,
  signal: AbortSignal,
  callbacks: PipelineCallbacks = {},
  coinHint?: CoinHint | null,  // 신규 5번째 인자
): Promise<PipelineResult> {
  // ...
  const coin = await detectCoin(canvas, coinType, coinHint);
  // ...
}
```

`AnalyzingRoute` 에서 store 의 `coinHint` 를 5번째 인자로 전달.

### 일관성 검증 (consistency_check)

vs3-100 vs vs3-500 페어 fixture (같은 분쇄, 다른 동전) 로 검증:

| 지표 | hint 없음 | hint 있음 |
|---|---|---|
| vs3-100 검출 | ✓ (1986 particles) | ✓ |
| vs3-500 검출 | ✗ (multi_coin, false napkin) | ✓ |
| `\|D50_500 − D50_100\| / mean` | N/A | **11%** (target ≤15%) |

→ Phase 1 UX 로 페어 일관성 검증 가능. fixture manifest `consistency_check` 항목 참조.

### 수용 기준

- [ ] `detectCoin()` 시그니처에 optional `coinHint` 파라미터 추가
- [ ] hint 있을 때: hint 가장 가까운 candidate 선택 (Math.hypot 거리 기반)
- [ ] hint 있을 때: multi_coin / partial_coin 검사 모두 우회
- [ ] hint 없을 때: 기존 로직 그대로 (backward compat)
- [ ] hint 좌표는 상대 (0~1) — 다운샘플 invariant
- [ ] vs3-500 fixture (multi_coin reject) 가 hint 와 함께 검출 성공
- [ ] vs3-100/500 페어 일관성 |Δ| ≤ 15% (manifest consistency_check 통과)

### 위험 / 함정

- ⚠️ **multi_coin 우회의 책임 위임**: hint 있어도 진짜 동전 여러 개인 경우 (vs3-multi 같은) → 사용자 의도 우선. 가장 가까운 candidate 만 채택, 나머지 무시.
- ⚠️ **hint 가 candidate 영역 밖**: 사용자가 동전이 아닌 곳을 탭한 경우 → 가장 가까운 candidate 선택 (조용한 fallback). 정확도 저하 가능.
- ⚠️ **Phase 1 anchor 의존**: vs3-100 anchor 1점으로 calibration 보정 — 절대 정확도는 베타 D13~17 fixture 추가 시 재검증.
- ⚠️ **detectCoin 단위 테스트 mock**: hint 인자 추가로 기존 mock 영향 — `coinHint` undefined 일 때 backward-compat 동작 보존.
