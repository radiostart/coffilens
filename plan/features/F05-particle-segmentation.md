# F05 — Particle Segmentation

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D6)
**Dependencies**: F04 (CoinDetection 출력)
**Blocks**: F06
**plain.md 참조**: Section 6 (파이프라인 3~4단계), Section 11 (no_particles, Watershed sanity, memory_oom)

---

## 목표

검출된 동전을 마스킹하고 5mm 마진 추가 → adaptive threshold + watershed 로 입자 분리 → **sanity check (분쇄 안 됨/단일 거대 입자)** + **OOM fallback**.

---

## 산출물

### 신규 파일
- `src/opencv/particle-segment.ts` — threshold + watershed + sanity + OOM fallback
- `tests/opencv/particle-segment.test.ts` — fixture 기반 회귀 + sanity 케이스

### 수정 파일
- `src/opencv/errors.ts` — `no_particles`, `memory_oom` 추가

---

## 구현 디테일

### opencv/particle-segment.ts
```ts
import { withMatScope } from './mat-pool';
import { CoinDetection } from './coin-detect';
import { AnalysisError } from './errors';

const MASK_MARGIN_MM = 5;       // 동전 주변 5mm 마진
const ADAPT_BLOCK_SIZE = 51;
const ADAPT_C = 10;
const MORPH_KERNEL_SIZE = 3;

const SANITY_MIN_AREA_RATIO = 0.005;   // 입자 면적 합 / 동전 면적 < 0.5% → 분쇄 안 됨
const SANITY_MAX_SINGLE_RATIO = 0.5;   // 단일 입자 > 50% → 분쇄 안 됨

export interface ParticleSegmentation {
  contours: any;       // cv.MatVector
  hierarchy: any;      // cv.Mat
  mask: any;           // cv.Mat (디버그용, 선택)
  totalArea: number;
}

export async function segmentParticles(
  canvas: HTMLCanvasElement,
  coin: CoinDetection
): Promise<ParticleSegmentation> {
  return withMatScope(async (scope) => {
    try {
      const src = scope.track(cv.imread(canvas));
      const gray = scope.track(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 1. 동전 마스킹 (반지름 + 5mm 마진)
      const marginPx = MASK_MARGIN_MM / coin.mmPerPixel;
      const maskRadius = coin.radiusPx + marginPx;
      const coinMask = scope.track(cv.Mat.ones(gray.rows, gray.cols, cv.CV_8U));
      cv.circle(coinMask, new cv.Point(coin.centerX, coin.centerY), Math.round(maskRadius), new cv.Scalar(0), -1);

      // 2. Adaptive threshold
      const binary = scope.track(new cv.Mat());
      cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, ADAPT_BLOCK_SIZE, ADAPT_C);

      // 동전 영역 mask out
      const masked = scope.track(new cv.Mat());
      cv.bitwise_and(binary, binary, masked, coinMask);

      // 3. Morphological opening (노이즈 제거)
      const kernel = scope.track(cv.Mat.ones(MORPH_KERNEL_SIZE, MORPH_KERNEL_SIZE, cv.CV_8U));
      const opened = scope.track(new cv.Mat());
      cv.morphologyEx(masked, opened, cv.MORPH_OPEN, kernel);

      // 4. Distance transform → 시드 추출
      const dist = scope.track(new cv.Mat());
      cv.distanceTransform(opened, dist, cv.DIST_L2, 5);

      const distNorm = scope.track(new cv.Mat());
      cv.normalize(dist, distNorm, 0, 1.0, cv.NORM_MINMAX);
      const seeds = scope.track(new cv.Mat());
      cv.threshold(distNorm, seeds, 0.5, 1, cv.THRESH_BINARY);
      seeds.convertTo(seeds, cv.CV_8U, 255);

      // 5. Marker labels
      const markers = scope.track(new cv.Mat());
      cv.connectedComponents(seeds, markers);
      // 배경을 1, foreground 를 2 이상으로 시프트
      markers.convertTo(markers, cv.CV_32S);
      // (cv.watershed 가 markers 에 결과 채움)

      // 6. Watershed 적용
      const colorSrc = scope.track(new cv.Mat());
      cv.cvtColor(src, colorSrc, cv.COLOR_RGBA2RGB); // watershed 는 RGB 필요
      cv.watershed(colorSrc, markers);

      // 7. Contour 추출 (마커 별로)
      // ESLint 예외: 반환값으로 escape 하므로 scope.track 불가. 호출자(F06 pipeline finally) 가 disposeSegmentation() 으로 dispose
      // eslint-disable-next-line no-direct-mat -- escapes scope, caller-managed lifecycle
      const contours = new cv.MatVector();
      // eslint-disable-next-line no-direct-mat -- escapes scope, caller-managed lifecycle
      const hierarchy = new cv.Mat();
      // markers 기반 mask 생성 → findContours
      const finalMask = scope.track(new cv.Mat());
      cv.compare(markers, new cv.Mat(markers.rows, markers.cols, markers.type(), [1, 0, 0, 0]), finalMask, cv.CMP_GT);
      finalMask.convertTo(finalMask, cv.CV_8U);
      cv.findContours(finalMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      // 8. Sanity check
      const coinArea = Math.PI * coin.radiusPx ** 2;
      let totalArea = 0;
      let maxArea = 0;
      for (let i = 0; i < contours.size(); i++) {
        const area = cv.contourArea(contours.get(i));
        totalArea += area;
        if (area > maxArea) maxArea = area;
      }

      if (contours.size() === 0 || totalArea / coinArea < SANITY_MIN_AREA_RATIO) {
        contours.delete();
        hierarchy.delete();
        throw { kind: 'no_particles' } satisfies AnalysisError;
      }

      if (maxArea / totalArea > SANITY_MAX_SINGLE_RATIO) {
        contours.delete();
        hierarchy.delete();
        throw { kind: 'no_particles' } satisfies AnalysisError; // "분쇄가 안 된 것 같아요"
      }

      return { contours, hierarchy, mask: finalMask, totalArea };
    } catch (e: any) {
      // OpenCV OOM 검출 (메시지 패턴: 'memory access out of bounds' 또는 'std::bad_alloc')
      if (typeof e?.message === 'string' && /memory|alloc/i.test(e.message)) {
        throw { kind: 'memory_oom', phase: 'segment' } satisfies AnalysisError;
      }
      throw e;
    }
  });
}

/** 호출자가 contours/hierarchy 반환 후 반드시 dispose */
export function disposeSegmentation(seg: ParticleSegmentation): void {
  try { seg.contours.delete(); } catch (_) {}
  try { seg.hierarchy.delete(); } catch (_) {}
}
```

### errors.ts 확장
```ts
export type AnalysisError =
  | ... // 기존
  | { kind: 'no_particles' }
  | { kind: 'memory_oom'; phase: string };

export function userMessage(e: AnalysisError): string {
  switch (e.kind) {
    // ... 기존
    case 'no_particles': return '입자가 검출되지 않았어요. 분쇄가 안 됐거나 원두가 너무 적을 수 있어요.';
    case 'memory_oom': return '사진 크기가 너무 커요. 다시 촬영해주세요.';
  }
}
```

---

## 수용 기준

- [ ] `segmentParticles()` 가 정상 fixture 에서 입자 contour 다수 반환
- [ ] 동전 영역 + 5mm 마진 마스킹 정확
- [ ] 빈 fixture (no_particles) → reject 정확
- [ ] 단일 거대 입자 fixture (분쇄 안 됨 시뮬레이션) → reject 정확
- [ ] OOM 시뮬레이션 (큰 이미지) → memory_oom 분류
- [ ] 호출자가 `disposeSegmentation()` 호출 시 contours/hierarchy 메모리 해제

---

## 테스트

### tests/opencv/particle-segment.test.ts
```ts
import manifest from '../../fixtures/manifest.json';

const anchor = manifest.fixtures.find(f => f.kind === 'anchor')!;

// anchor 1장으로 segmentation 회귀 — minContours 임계는 anchor 의 입자 분포에 맞춰 보정
it(`${anchor.file} → minContours >= 50`, async () => {
  const result = await segmentParticles(loadFixture(anchor.file), mockCoin500);
  expect(result.contours.length).toBeGreaterThanOrEqual(50);
});

// 합성 reject (no-coin 변형) 으로 빈 종이 케이스 simulate — F04 의 build-reject-fixtures 결과 사용
it('synthetic/no-coin.synth.jpg → no_particles', async () => {
  await expect(
    segmentParticles(loadFixture('synthetic/no-coin.synth.jpg'), mockCoin500)
  ).rejects.toMatchObject({ kind: 'no_particles' });
});
```

### Sanity 단위 테스트
- 합성 이미지: 동전만 있고 입자 0 → no_particles
- 합성 이미지: 동전 + 단일 거대 사각형 (분쇄 안 됨 시뮬) → no_particles

---

## 검수 영향

- 직접 검수 항목 없음
- 단, no_particles reject 시 사용자 안내가 명확해야 (재촬영 가이드)

---

## 위험 / 함정

- ⚠️ **adaptive threshold 파라미터 (blockSize=51, C=10)**: fixture 기반 튜닝. 다양한 조명 조건에서 검증
- ⚠️ **distance transform threshold (0.5)**: 너무 높으면 시드 부족 (oversegment), 너무 낮으면 입자 합쳐짐. 0.3~0.7 범위 튜닝
- ⚠️ **watershed oversegmentation**: 큰 입자가 여러 조각으로 분리되는 흔한 문제. distanceTransform threshold + minArea 필터로 완화. F06 statistics 에서 100μm 미만 필터로 노이즈 추가 제거.
- ⚠️ **WebView OOM**: 큰 이미지 + 여러 Mat 동시 보유 시. F04 다운샘플링 (1280px) 보장, MatScope 즉시 dispose. OOM 검출은 메시지 패턴 의존 (불안정) — try/catch 로 감지
- ⚠️ **반환값 contours/hierarchy 메모리 책임**: 호출자가 disposeSegmentation 호출 안 하면 누수. F06 pipeline 에서 finally 강제. ESLint `no-direct-mat` 룰은 인라인 disable comment 로 예외 처리 (escape 패턴 명시).

---

## 참조

- [plain.md Section 6 (파이프라인 3~4단계)](../plain.md)
- [OpenCV Watershed Tutorial](https://docs.opencv.org/4.x/d3/db4/tutorial_py_watershed.html)
- [OpenCV Adaptive Threshold](https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html)

---

## Handoff Notes

가장 알고리즘 의존성 큰 feature. **D6 하루로 부족할 수도** — 파라미터 튜닝이 anchor fixture 1장에 의존. 곱기 범위 다양성 검증은 베타 D13~17 에서 자연 추가 (Phase 1).

watershed 가 oversegment 잘 일으킴 → 통계 단계 (F06) 에서 100μm 미만 필터로 노이즈 제거. 그래도 입자 분포가 이상하면 watershed 파라미터 재튜닝.

**반환값 메모리 관리 주의**: `contours`/`hierarchy` 가 함수 외부로 나가는 Mat → MatScope 패턴 안 됨. 호출자(F06) 가 finally 에서 `disposeSegmentation()` 호출 강제.

---

## 추가 (2026-05-02, Phase 1) — Fine grind 우선 튜닝 (watershed/MORPH 우회 + 배경 필터)

### 배경

D9~D12 fixture QC 에서 **fine grind (1~2px 미분)** 측정 정확도 우선 결정. 원 spec 의 watershed + MORPH_OPEN 은 medium~coarse 분쇄에 좋지만 fine grind 에서 미분을 erode 하여 D50/finesPercent 왜곡 발생. fixture (vs3-100/500, puck) 모두 medium~fine 영역이라 fine 우선 정책 채택.

### 변경 1 — Morphological opening skip

```diff
- // 3. Morphological opening — 노이즈 제거
- const opened = scope.track(new cv.Mat());
- const kernel = scope.track(cv.Mat.ones(MORPH_KERNEL_SIZE, MORPH_KERNEL_SIZE, cv.CV_8U));
- cv.morphologyEx(masked, opened, cv.MORPH_OPEN, kernel);

+ // 3. Morphological opening — fine grind 는 skip (1-2px 미분 erode 방지).
+ // tuned 2026-05-02 — medium grind 에서 OPEN 활성화하면 D50 약간 ↑ (19%) 이지만
+ // measurement bias (equivalent circular vs sieve) 가 70%+ 차이라 해결책 아님.
+ // 미분 보존 우선해 OPEN skip 유지. 상수는 medium 분기 도입 시 사용.
+ void MORPH_KERNEL_SIZE;
```

### 변경 2 — Watershed 우회 (fine grind)

```diff
- // 4. Distance transform → markers → watershed
- cv.distanceTransform(...);
- cv.threshold(...);
- cv.watershed(colorSrc, markers);
+ // 4. fine-grind: watershed 우회 (전체 coffee 영역을 한 덩어리로 통합).
+ const finalMask = scope.track(new cv.Mat());
+ masked.convertTo(finalMask, cv.CV_8U);
```

watershed 의 over-segmentation 자체는 calibration layer (F06) 의 image→sieve 변환으로 우회. fine grind 에서 watershed 우회 시 D50 변화 < 5%, 반면 미분 보존 효과 큼.

### 변경 3 — MAX_PARTICLE_AREA_MM2 = 80 (배경 필터)

```ts
// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
// 입자 단일 면적 상한 (mm²) — 이보다 큰 contour 는 배경 (나무 바닥, 컵받침,
// napkin 그림자) 으로 간주해 sanity 계산 + 통계에서 제외. 80mm² ≈ 직경 10mm.
// 동전 마스킹은 동전만 가리고 napkin 밖 wood floor 는 여전히 검출 → 필터 필요.
const MAX_PARTICLE_AREA_MM2 = 80;
```

원 spec 의 SANITY_MIN_AREA_RATIO / SANITY_MAX_SINGLE_RATIO 외에 추가. F06 의 `MAX_PARTICLE_DIAMETER_UM = 15000` (직경 ≈ 15mm) 과 정합 — segment level 에서 더 aggressive (10mm) 하게 컷.

### 변경 4 — Adaptive threshold 파라미터 유지

원 spec 그대로 (`blockSize=51, C=10`) — 변경 없음. fixture QC 에서 검증.

### 향후 (medium grind 분기)

medium~coarse grind fixture 추가 시 watershed/MORPH 활성 분기 도입 검토:

```ts
// 가상 코드 — 사용자 sieve fixture 4종 도착 후 검증
const isFineGrind = tempD50 < 200; // image-space estimate
if (isFineGrind) {
  // 현재 동작 (watershed/MORPH 우회)
} else {
  // medium grind: watershed + MORPH 활성
  cv.morphologyEx(masked, opened, cv.MORPH_OPEN, kernel);
  cv.watershed(colorSrc, markers);
}
```

도입 여부는 측정 정확도 vs 코드 복잡도 trade-off — 현재 calibration layer (×2.8) 만으로 핸드드립 분류 정상 동작하므로 우선순위 낮음.

### 수용 기준 추가

- [ ] fine grind fixture (vs3-100/500) 에서 watershed 우회 + MORPH skip 시 미분 (<300μm) 비율 14~20% 보존
- [ ] `MAX_PARTICLE_AREA_MM2 = 80` 으로 배경 contour (나무 바닥/그림자) sanity 에서 제외
- [ ] medium grind 분기는 도입 X (Phase 2 이후) — 코드에 `void MORPH_KERNEL_SIZE` placeholder 만 남김

### 위험 / 함정

- ⚠️ **단일 fixture 의존**: watershed 우회 결정이 vs3 fixture 1세트 기반. medium~coarse grind fixture 추가 시 재검증 필요.
- ⚠️ **fine vs medium 동적 분기 부재**: 현재는 모든 grind 에서 watershed 우회. 굵은 분쇄에서 입자 분리 미흡 가능 — calibration ratio 가 grind 별로 다르면 4 카테고리 매핑 정확도 저하.
