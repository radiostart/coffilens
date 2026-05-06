# 검출 알고리즘 + 보정 기술 정리

> coffilens 의 사진 → 분쇄도 측정 파이프라인에서 사용된 알고리즘과 보정 기법을 한 곳에 모아둔 reference. 2026-05-06 까지의 누적 결과 — 측정 일관성 (D50 CoV) **1.9%** 안정화 시점.
>
> 변경 이력 추적: [ALGORITHM_NOTES.md](../ALGORITHM_NOTES.md)
> 최근 커밋 단위 변경: [docs/release-notes-2026-05-06.md](release-notes-2026-05-06.md)

---

## 파이프라인 개요

```
사진(JPEG)
  ↓
[1] 다운샘플 (1280px long edge, Canvas2D bicubic high-quality)
  ↓
[2] 입력 품질 검증 (밝기 + Laplacian variance)
  ↓
[3] 동전 검출 (HoughCircles + 필터 ladder + hint sanity)
  ↓
[4] 입자 분할 (Gray ∩ Saturation adaptive threshold)
  ↓
[5] Contour 분류 (boulder vs clump, shape factor)
  ↓
[6] 통계 (volume-weighted D-value + calibration)
  ↓
결과 (D50, fines%, clump 비율, brewing 가이드, spectrum)
```

---

## [1] 다운샘플 — 알고리즘 일관성 확보

[src/lib/image-downsample.ts](../src/lib/image-downsample.ts)

| 항목 | 값 | 근거 |
|---|---|---|
| Target long edge | **1280px** | iOS Safari WASM 메모리 안전 (~70MB peak) |
| 알고리즘 | **Canvas2D bicubic** (`imageSmoothingQuality="high"`) | Sharp lanczos 와 가까운 결과 — 동전 rim gradient 보존 |

**왜 high quality:** 기본 `low` 는 fast bilinear → 4000×3000 → 960×1280 (4x 다운샘플) 시 동전 rim 의 sharp gradient 가 무뎌져 HoughCircles 검출 실패.

**왜 1280:** 1920px 시도 했으나 [`MIN_LAPLACIAN_VAR`](../ALGORITHM_NOTES.md) blur 임계가 1280 기준 튜닝되어 false positive 발생. 향후 ground-truth 도착 후 재검토.

---

## [2] 입력 품질 검증

[src/opencv/coin-detect.ts:93](../src/opencv/coin-detect.ts:93) `checkInputQuality()`

| 임계 | 값 | 검출 항목 |
|---|---|---|
| `MIN_BRIGHTNESS` | 80 | 평균 밝기 (0~255) — 너무 어두운 사진 reject |
| `MIN_LAPLACIAN_VAR` | 100 | 블러 점수 — 흔들림/초점 문제 reject |

순서: 검증 먼저 → 통과 시 동전 검출 시작. 실패 시 사용자에게 "다시 촬영" 안내.

---

## [3] 동전 검출 — 다단계 robust matching

[src/opencv/coin-detect.ts:418](../src/opencv/coin-detect.ts:418) `detectCoin()`

### 3-1. HoughCircles 입력 전처리

```
원본 (RGBA)
  ↓ cvtColor RGBA→Gray
grayOriginal (rim gradient 측정용 — sharp edge 보존)
  ↓ medianBlur 7
gray (intensity stats 용 — noise 억제)
  ↓ chooseGamma(meanIntensity)
gamma-lifted (어두운 사진 검출률 향상)
  ↓ GaussianBlur kernel (해상도 비례)
coinDetectGray (HoughCircles 입력 — 작은 texture 억제)
```

**동적 감마** ([coin-detect.ts:195](../src/opencv/coin-detect.ts:195)):

| photoMean | gamma | 효과 |
|---|---|---|
| < 100 | 0.55 | 어두운 사진 강한 lift |
| < 140 | 0.75 | 중간 lift |
| ≥ 140 | 1.0 | no-op (충분히 밝음) |

`HoughCircles 입력에만` 적용 — validation (intensity stats / rim gradient) 은 원본 사용해 reject 임계 의미 보존.

**적응형 blur kernel** ([coin-detect.ts:444](../src/opencv/coin-detect.ts:444)):

```
kernel = (gray.rows >= 1600) ? 23 : 15
```

이미지 해상도 비례. 작은 coffee 입자 texture (1-3px) 를 흐리게 해 false circle 폭증 방지. 동전 윤곽 (~100-200px) 은 보존.

### 3-2. HoughCircles 파라미터

```
dp        = 1
minDist   = imgRows / 3
param1    = 100  (Canny 상위 임계)
param2    = 50   (검출 임계 — 노이즈 false positive ↓)
minRadius = imgRows × 0.05
maxRadius = imgRows × 0.4
```

### 3-3. Candidate 필터 ladder

각 원형 후보를 5개 시그널로 검증 ([coin-detect.ts:155-180](../src/opencv/coin-detect.ts:155)):

| 시그널 | 측정 함수 | 임계 | 검출 대상 |
|---|---|---|---|
| `mean` | `intensityStatsInCircle` (중심 r/2 영역) | 110~225 | 어두운 배경 / 흰 napkin 단독 false positive |
| `stddev` | 동일 | ≤ 42 | 커피 입자 클럼프 (dark+bright mix) |
| `exterior` | `meanIntensityRingOutside` (외곽 ring r~1.25r) | \|int-ext\| ≤ 70 | 커피에 둘러싸인 napkin "구멍" |
| `rimGradient` | `meanRimGradient` (rim 32 sample finite-diff) | ≥ 18 | 흐린 윤곽 (sharp metal edge 검증) |
| **bypass** | strong rim grad ≥ 50 | int-ext / too-dark check 우회 | 그림자 진 동전, 학 도안 metal coin |

**rationale:**
- 진짜 silver coin: mean ~150-215, stddev 25-40, rim grad 25-50
- 커피 클럼프: stddev 40+, mean 변동
- napkin 구멍: |int-ext| 큼 (외부가 어두운 커피)
- napkin 단독: mean 220+

### 3-4. Hint 기반 선택 + distance sanity (2026-05-06 추가)

사용자가 [coin-locate](../src/routes/coin-locate.tsx) UI 에서 동전 위치를 탭하면 상대좌표 (0~1) hint 로 전달:

```
selectedCandidate = filteredCandidates.sortByDist(hint)[0]
dist = hypot(selected.cx - hintX, selected.cy - hintY)
if (dist > selected.r * 1.5) → throw no_coin (hint_too_far)
```

**왜 distance check 필요:** HoughCircles 가 진짜 동전을 못 찾고 phantom 만 잡은 케이스에서 (fixture 014), 사용자 hint 와 phantom 거리 443px (반지름 131px 의 3.4배) 였음에도 "가장 가까운" 후보로 선택되어 silent false positive 발생. distance check 가 명시적 에러로 전환.

`MAX_HINT_DIST_FACTOR = 1.5` — 사용자 탭 부정확성(rim 근처 탭) 흡수, 명백한 mismatch 만 reject.

### 3-5. Edge-arc probe (partial coin)

HoughCircles 가 0개 검출했을 때, 동전이 프레임 가장자리에 잘려 full circle 인식 실패한 케이스 검증:

[partial-coin-probe.ts](../src/opencv/partial-coin-probe.ts) — Canny edge → arc fit → 가장자리 닿은 호 검출. fit fraction 충분하면 `partial_coin` 명시 분기 (vs. 일반 `no_coin`).

---

## [4] 입자 분할 — Multi-channel adaptive threshold

[src/opencv/particle-segment.ts:187](../src/opencv/particle-segment.ts:187) `segmentParticles()`

### 4-1. Grayscale binary

```
gray = cvtColor(src, RGBA→Gray)
binary_gray = adaptiveThreshold(gray, GAUSSIAN_C, BINARY_INV, blockSize, ADAPT_C)
```

| 파라미터 | 값 | 근거 |
|---|---|---|
| `blockSize` | `round(rows/1280 × 21) \| 1` (홀수) | fine grind 1-3px 입자의 local contrast 픽업 |
| `ADAPT_C` | 7 | 미세 입자 회수 (10 → 7 더 공격적) |

### 4-2. HSV S 채널 binary (2026-05-06 추가)

```
rgb = cvtColor(src, RGBA→RGB)
hsv = cvtColor(rgb, RGB→HSV)
sat = hsv.split()[1]  // S channel
binary_sat = threshold(sat, SAT_MIN_THRESHOLD, 255, BINARY)
```

`SAT_MIN_THRESHOLD = 25` — 종이/그림자 ceiling (S 0~15) 위, 약한 입자 saturation (~30+) 아래로 안전 margin.

### 4-3. Combined (Gray ∩ Sat)

```
combined = bitwise_and(binary_gray, binary_sat)
```

**픽셀이 "어둡다(gray)" + "채색(sat)" 둘 다 만족할 때만 입자**.

| 픽셀 종류 | gray | sat | combined |
|---|---|---|---|
| 진짜 커피 입자 | dark ✓ | high (brown) ✓ | **입자 ✓** |
| 종이 텍스처 spot | dark ✓ | low (achromatic) ✗ | 제외 |
| 입자 그림자 | dark ✓ | low (gray shadow) ✗ | 제외 |
| 흰 napkin | bright ✗ | low ✗ | 제외 |

### 4-4. 동전 영역 마스킹

```
coinMask = ones; circle(coinMask, coin.center, coin.r + 5mm, fill=0)
masked = bitwise_and(combined, combined, mask=coinMask)
```

5mm 마진 — 동전 경계의 입자 왜곡 방지.

### 4-5. Watershed 우회 (fine grind)

Watershed segmentation 은 이론상 입자 분리 정밀도 ↑ 이지만 fine grind (1-3px 입자) 에서는 oversegment 위험 + 미분 손실. **fine grind 우선** 정책으로 watershed skip — 전체 coffee 영역을 한 덩어리로 통합하고 contour 추출.

[기존 시도 실패 사례](../src/opencv/particle-segment.ts:212):
- CLAHE 단독: clipLimit 1~2 모두 V60 에서 clump area 0%→42-47% false alarm
- bilateral + CLAHE: 입자 boundary 도 smooth → 입자 merge → D50 198→814 폭증

→ HSV S 채널 결합 (현재 방식) 이 채택된 이유: spatial smoothing 없이 색 정보만 활용 → 입자 손상 없음.

---

## [5] Contour 분류 — Shape factor

[src/opencv/statistics.ts:336-365](../src/opencv/statistics.ts:336)

### 5-1. 임계

| 카테고리 | 조건 | 통계 처리 |
|---|---|---|
| **Fines** | diameter < 300µm | 통계 포함 (fines% 별도 집계) |
| **Main** | 300 ≤ d < 1500µm | 통계 포함 (D10/D50/D90 핵심) |
| **Boulder** | d ≥ 1500µm AND circ ≥ 0.55 AND solidity ≥ 0.80 | **통계 포함** (Phase 2, 단일 큰 입자 = 진짜 측정값) |
| **Clump** | d ≥ 1500µm AND (위 조건 미달) | 통계 **제외** (응집체 / over-segmentation artifact) |

### 5-2. Shape factor 임계 (ISO 13322-1 완화)

```
BOULDER_MIN_CIRCULARITY = 0.55  (ISO 표준 0.78 → 완화)
BOULDER_MIN_SOLIDITY    = 0.80  (ISO 표준 0.90 → 완화)
```

**왜 완화:** ISO 13322-1 은 sphere assumption 인데 fractured coffee 입자는 모서리 진 형태. 표준 적용 시 모든 입자가 boulder 못 됨. fixture 검증 (4종 grind) 으로 0.55 / 0.80 empirical 임계 도출.

### 5-3. Phase 2 — Boulder 통계 포함 (2026-05-05)

이전엔 boulder + clump 둘 다 통계 제외였으나, 거친 분쇄 (프렌치프레스) 에서 boulder 8.6% area 가 빠지면서 **D90 truncation** 발생. 사용자 피드백: "왜 거친 분쇄인데 D90 이 안 거치게 나오지?"

→ Phase 2 에서 boulder = 진짜 단일 큰 입자 (모양 깔끔) → 통계 포함. clump 만 제외.

영향: vs3-13 (French Press) D90 891µm → 1077µm 정상화.

---

## [6] 통계 — Volume-weighted PSD

[src/opencv/statistics.ts:211-230](../src/opencv/statistics.ts:211) `summarize()`

### 6-1. Volume-weighted percentile (D-value)

```
weight(d) = d³  // 구체 부피 가정
D10/D50/D90 = volumeWeightedPercentile(diameters, [0.1, 0.5, 0.9])
```

**왜 count-D50 이 아니고 volume-D50:**
- count-D50 = 입자 수 절반이 이 값 이하 → 작은 입자 쏠림
- volume-D50 = 전체 부피의 절반이 이 값 이하 → 산업 표준 PSD, 사용자 직관 일치

사용자 피드백 "D50 이 분포 왼쪽에 떨어져 있다" 가 count → volume 전환 동기.

### 6-2. Main fraction filter

```
MAIN_FRACTION_MIN_UM = 117 (image-space ≈ 200µm sieve)
mainFraction = diameters.filter(d ≥ 117)
dValueSource = mainFraction.length > 0 ? mainFraction : diameters
```

Sub-pixel noise (1-2 pixel contour 인 1픽셀 artifact) 을 D-value 통계에서 제외. fines% 는 별도 집계라 영향 없음.

### 6-3. mmPerPixel 환산

```
mmPerPixel = coinType.diameterMm / (coin.radiusPx × 2)
particle.diameterUm = sqrt(area_px / π) × 2 × mmPerPixel × 1000
```

100원 = 24mm, 500원 = 26.5mm.

### 6-4. Calibration layer (image → sieve)

[src/opencv/calibration.ts](../src/opencv/calibration.ts)

```
sieve_d = image_d × IMAGE_TO_SIEVE_RATIO
```

| Anchor | image D50 | target sieve | implied ratio |
|---|---|---|---|
| VS3 setting 11 (V60 grind) | 1187µm | 700µm | 0.59 |
| VS3 setting 13 (French Press) | 1244µm | 1100µm | 0.88 |

**현재 ratio: 0.63** (두 anchor 의 spread 0.59~0.88 중간).

**한계:** anchor 별 ratio 가 0.3 spread → 진짜 sieve ground truth 없이 단정 어려움. Phase 3 에서 sieve 분급 fixture 4종 (espresso/모카포트/핸드드립/프렌치프레스) 도착 후 다중 anchor 보간 또는 grind-size-aware ratio 검토.

### 6-5. fines% 정의

```
finesPercent = (Σ area_fines_mm²) / totalAreaMm² × 100
fines = particles with diameter < 300µm (image-space)
```

같은 분쇄 내 상대 비교용 — sieve 표준 fines (보통 100µm 이하) 과 다름. UI tooltip 으로 정의 명시.

---

## [7] 신뢰도 — 측정 정확도 시그널

[src/opencv/confidence.ts](../src/opencv/confidence.ts)

```
score = coin × 0.3 + particles × 0.4 + brightness × 0.15 + blur × 0.15
```

| 시그널 | 가중치 | 임계 |
|---|---|---|
| 동전 검출 신뢰도 | 0.3 | center + size 휴리스틱 |
| 입자 수 | 0.4 | 50/200/500 단계 |
| 밝기 | 0.15 | 80~220 정상, 양 끝 감점 |
| 블러 | 0.15 | Laplacian variance / 200 정규화 |

**측정 신뢰도** (mmPerPixel 기반, [brewing-guide.ts:81](../src/lib/brewing-guide.ts:81)):

```
high   : mmPerPixel ≤ 0.05  (가까이 촬영, 미세 입자까지 검출)
medium : ≤ 0.07
low    : > 0.07  (멀리 촬영, sub-pixel 한계)
```

`score < 5` → 결과 화면 경고 + "재측정 권장".

---

## [8] 결과 표현 — Spectrum bar

[src/components/spectrum-bar.tsx](../src/components/spectrum-bar.tsx)

분쇄도 분류를 단일 카테고리 라벨 ("중간") 이 아니라 **연속 spectrum 위 위치** 로 시각화:

```
미세 (0~500µm) │  중간 (500~900µm)  │ 거침 (900~1500µm)
                       ▲
                    D50 700µm
```

이전의 "차선 (secondary)" 텍스트 추천이 전달하던 "인접 카테고리 가능성" 정보를 사용자가 자기 위치를 보고 직접 인지하도록 시각화로 대체.

---

## 검증 방법론

### 회귀 fixture set

| Fixture set | 용도 | 위치 |
|---|---|---|
| `multi-shot-2026-05-05/` (14장) | 동일 분쇄 다각도 — D50 일관성 (CoV) 측정 | [fixtures/multi-shot-2026-05-05/](../fixtures/multi-shot-2026-05-05/) |
| `test-vs3-09.jpg` | fine moka anchor | [fixtures/](../fixtures/) |
| `test-vs3-11.jpg` | medium pour-over anchor | 동상 |
| `test-vs3-13.jpg` | coarse French press anchor | 동상 |
| `test-500-fine.jpg` | spent puck (응집 극심) | 동상 |

### 성능 지표

```
D50 Coefficient of Variation (CoV) = stddev(D50_per_shot) / mean(D50_per_shot)
```

같은 분쇄 14장 측정 결과의 일관성 metric. 낮을수록 측정이 stable.

| 시점 | D50 CoV | 비고 |
|---|---|---|
| 2026-05-05 baseline | 4.0% | Phase 2 boulder 포함 직후 |
| 2026-05-06 (HSV S 결합 후) | **1.9%** | 그림자/노이즈 제거 효과 |

### 진단 도구

| 스크립트 | 용도 |
|---|---|
| [scripts/batch-analyze.ts](../scripts/batch-analyze.ts) | fixture 일괄 분석 — D-value 통계 + CoV 측정 |
| [scripts/diagnose-shadow.ts](../scripts/diagnose-shadow.ts) | gray vs HSV-S 채널 contour 비교 — 향후 그림자 처리 회귀 검증 |
| `[coin-detect] reasons:` 콘솔 로그 | 후보별 PASS/reject 사유 (영구 진단 라인) |

---

## 임계값 일람

알고리즘 튜닝 시 변경 가능성 있는 모든 magic number 정리:

```
[다운샘플]
TARGET_LONG_EDGE              = 1280

[입력 검증]
MIN_BRIGHTNESS                = 80
MIN_LAPLACIAN_VAR             = 100

[동전 검출]
HoughCircles dp=1, minDist=rows/3, param1=100, param2=50
HoughCircles minRadius = rows×0.05, maxRadius = rows×0.4
COIN_MIN_MEAN_INTENSITY       = 110
COIN_MAX_MEAN_INTENSITY       = 225
COIN_MAX_STDDEV               = 42
COIN_MAX_INTERIOR_EXTERIOR_DIFF = 70
COIN_GRADIENT_STRONG_BYPASS   = 50
COIN_MIN_RIM_GRADIENT         = 18
NOISE_RADIUS_RATIO            = 0.5  (multi-coin filter)
CONCENTRIC_DISTANCE_FACTOR    = 1.0
EDGE_MARGIN_PX                = 20   (partial coin 임계)
MAX_HINT_DIST_FACTOR          = 1.5  (hint sanity, 2026-05-06)
chooseGamma: <100→0.55, <140→0.75, else→1.0
GaussianBlur kernel: rows≥1600→23, else→15

[입자 분할]
MASK_MARGIN_MM                = 5
adaptive blockSize = round(rows/1280 × 21) | 1
ADAPT_C                       = 7
SAT_MIN_THRESHOLD             = 25  (HSV S, 2026-05-06)
MORPH_KERNEL_SIZE             = 3   (현재 미사용 — 미분 보존 우선)
SANITY_MIN_AREA_RATIO         = 0.005
SANITY_MAX_SINGLE_RATIO       = 0.5
MAX_PARTICLE_AREA_MM2         = 80

[통계]
MIN_PARTICLE_DIAMETER_UM      = 100
MAX_PARTICLE_DIAMETER_UM      = 15000
MAIN_FRACTION_MIN_UM          = 117  (image ≈ 200 sieve)
FINES_THRESHOLD_UM            = 300
CLUMP_MIN_DIAMETER_UM         = 1500
BOULDER_MIN_CIRCULARITY       = 0.55  (ISO 0.78 완화)
BOULDER_MIN_SOLIDITY          = 0.80  (ISO 0.90 완화)
WATERSHED_SEED_THRESHOLD      = 0.1   (현재 fine grind 우회)

[보정]
IMAGE_TO_SIEVE_RATIO          = 0.63  (anchor 2점 spread 0.59~0.88 중간)

[측정 신뢰도]
mmPerPixel high ≤ 0.05, medium ≤ 0.07, low > 0.07
```

---

## 결과 품질 요약 (2026-05-06 기준)

| 지표 | 측정값 | 의미 |
|---|---|---|
| D50 측정 일관성 (CoV, 14장 mean) | **1.9%** | 같은 분쇄를 다른 각도/사진으로 측정해도 ±2% 안 |
| 동전 검출 silent FP | 0건 | hint distance check + filter ladder 로 전수 차단 |
| 그림자 contour 부풀림 | 제거 | HSV S 채널 결합으로 입자 본체만 측정 |
| 종이 노이즈 phantom fines | 제거 | 동상 |
| Boulder/Clump 분리 | 작동 | 진짜 큰 입자 vs 응집체 구분 |
| Multi-shot baseline (14장) | 10/14 success | 4건 partial coin (가장자리 잘림) — 알고리즘 한계 명시 |

---

## 향후 개선 후보

| 항목 | 설명 | 우선순위 |
|---|---|---|
| Sieve ground-truth fixture 4종 도착 | calibration ratio 다중 anchor 보간 → grind-size-aware ratio | 높음 (정확도 핵심) |
| 거대 응집체 분할 문제 | 큰 contour 가 cyan 여러 개로 쪼개지는 over-segmentation 케이스 | 중간 |
| Boulder shape factor 임계 fine-tune | 현재 0.55/0.80 — fixture 더 모이면 재검증 | 낮음 |
| Hint 없을 때 phantom 거절 | 014 같은 케이스가 hint 없이도 silent FP 안 나오게 | 중간 |
| 동전 검출 ROI 재시도 | hint 주변에서 lower-threshold HoughCircles 재시도 | 낮음 |
