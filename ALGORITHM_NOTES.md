# Coffilens Algorithm Notes

> D7 종료 시점 작성 (F06 수용 기준). 6개월 후 본인 또는 후임 개발자가
> 파라미터 결정 근거를 추적할 수 있도록 유지.

---

## 파라미터 결정 이력

### F04 — 동전 검출 (HoughCircles)
- `dp = 1`, `minDist = imgRows / 3` (2026-05-02 — false circle 분리 개선)
- `param1 = 100` (Canny 상위 임계)
- `param2 = 50` (검출 임계, 2026-05-02 — 노이즈 false positive ↓)
- `minRadius = imgRows * 0.05` / `maxRadius = imgRows * 0.4`
  - 이유: 일반 촬영 거리(20~40cm)에서 동전이 차지하는 비율
- 동전 종류는 사용자가 F02 coin-select 에서 선택 → `coinType` 인자로 전달 (auto-classify 휴리스틱 X)
- `medianBlur = 7` 전처리 (Hough 안정성 향상)

### F04 — Candidate intensity 필터 (2026-05-02 추가)

False positive (napkin 텍스처 등) 분리용 4개 픽셀 통계 필터:

```
COIN_MIN_MEAN_INTENSITY     = 110   (어두운 배경 차단)
COIN_MAX_MEAN_INTENSITY     = 225   (밝은 조명 napkin 위 동전 mean ~210 cover)
COIN_MAX_STDDEV             = 42    (조명 차이 흡수 — 38 → 42 완화)
COIN_MAX_INTERIOR_EXTERIOR_DIFF = 70  (내부 vs 외부 ring intensity diff)
COIN_MIN_RIM_GRADIENT       = 18    (sharp edge 검증, unblurred gray 사용)
```

**한계**: vs3-500 fixture (sparse coffee + napkin 배경) 에서 모든 필터 통과한 false positive 2개 발생 — fundamental ambiguity. Phase 1 UX (coinHint) 로 우회.

### F04 — `coinHint` Phase 1 UX (2026-05-02 추가)

사용자가 `/coin-locate` 에서 동전 위치 탭 → 상대 좌표 (0~1) hint:

```
detectCoin(canvas, coinType, coinHint?)
```

- hint 있을 때: hint 가장 가까운 candidate 채택 (Math.hypot 거리)
- hint 있을 때: `multi_coin` / `partial_coin` 검사 모두 우회 (사용자 의도 우선)
- hint 없을 때: 기존 로직 (가장 신뢰도 높은 candidate)

vs3-100 vs vs3-500 페어 일관성 |Δ| = **11%** (target ≤15%) 달성.

### F04 — 입력 검증
- `MIN_BRIGHTNESS = 80` — 평균 밝기 (0~255)
- `MIN_LAPLACIAN_VAR = 100` — 블러 점수 임계
  - 임계는 anchor fixture 기반 튜닝 — 실 기기마다 카메라 노이즈 다름

### F05 — 입자 분할 (2026-05-02 fine-grind 우선 튜닝)

- 동전 영역 + `5mm` 마진 마스킹 (경계 입자 왜곡 방지)
- Adaptive threshold: `blockSize = 51`, `C = 10` (Gaussian)
- **Morphological opening — fine grind 는 skip** (1-2px 미분 erode 방지)
  - tuned 2026-05-02: medium grind 에서 OPEN 활성화 시 D50 ↑ 19% 이지만 measurement bias (70%+) 가 더 큰 문제 → 미분 보존 우선
  - 상수 `MORPH_KERNEL_SIZE = 3` 은 medium grind 분기 도입 시 사용
- **Watershed — fine grind 우회** (전체 coffee 영역을 한 덩어리로 통합)
  - over-segmentation bias 자체는 calibration layer (F06) 의 ×2.8 변환으로 우회
  - fine grind 에서 watershed 우회 시 D50 변화 < 5%, 미분 보존 효과 큼
- Sanity:
  - `SANITY_MIN_AREA_RATIO = 0.005` (입자 면적 합 / 동전 면적 < 0.5% → no_particles)
  - `SANITY_MAX_SINGLE_RATIO = 0.5` (단일 입자 > 50% → no_particles)
  - **`MAX_PARTICLE_AREA_MM2 = 80`** (직경 ≈ 10mm — 배경 차단, F06 의 15mm 와 정합)

### F06 — 통계
- 노이즈 필터: `MIN_PARTICLE_DIAMETER_UM = 100` (image-space, sub-pixel artifact 차단)
  - vs3-100/500 fixture 에서 raw contour 의 44~48% 가 < 100μm → P25=0 (단일 픽셀 contour) 이라 적절한 임계
- 배경 필터: `MAX_PARTICLE_DIAMETER_UM = 15000` (whole bean ~8mm 도 포괄, 안전망)
- Fines 임계: `FINES_THRESHOLD_UM = 300` (image-space) — sieve 표준 fines 와 다름. UI "미분" 라벨은 한국 커피 친숙도 우선 + tooltip 으로 정의 명시 ("같은 분쇄 내 상대 비교용")
- 등가 직경 가정: 원으로 근사 → `D = 2 * sqrt(A / π)`
  - 각진 입자 → 5~15% 과소평가 (디스클레이머 정당화)
  - Calibration layer 의 image→sieve 변환 (×2.8) 도 이 bias 를 부분 보정

### F06 — Clump 필터 (2026-05-02 추가)

분쇄 안 된 덩어리 / 추출 후 puck 잔여물 등 outlier 제거:

```
CLUMP_MIN_DIAMETER_UM      = 2000  (절대 임계, image-space)
CLUMP_MEDIAN_MULTIPLIER    = 4     (상대 임계 — tempD50 × 4)
```

둘의 max 초과 입자는 정상 입자 통계에서 제외. `clumps: { count, totalAreaMm2, areaRatio }` 별도 보고. 결과 화면에 "클럼프 N% 통계에서 제외" 노출.

vs3-100/500 (전문가급 burr) 에서 7~10개 (24~28% 면적) 제거 — 정전기 cluster 추정. puck (54% 면적) 는 강한 경고 트리거.

### F06 — Calibration layer (2026-05-02 신규)

**개념**: image-space 측정 → sieve-equivalent 변환. brewing-guide 가 외부 표준 임계값 (Hoffmann/SCA 등) 그대로 사용할 수 있도록 layer 분리.

```
[Measurement] pure image-space (statistics.ts)
    ↓
[Calibration] image × IMAGE_TO_SIEVE_RATIO → sieve-equiv (calibration.ts)
    ↓
[Guide]       표준 sieve 임계값 (brewing-guide.ts)
```

**Anchor (잠정)**: VS3 + Hyperhoba @ 11.5 (V60 grind, sieve target ~700μm) → image D50 = 249μm → ratio = **2.8**

**변환 대상**: d10/d50/d90, diameters[]
**변환 안 함**: uniformity (D90/D10 invariant), finesPercent (image-space 정의), totalAreaMm2, clumps.*

**TODO Phase 2**: 사용자 sieve 분급된 ground-truth fixture 4종 (espresso/모카포트/핸드드립/프렌치프레스) 도착 후 anchor 4점 평균으로 fine-tune.

### F06 — 신뢰도 점수
- 가중치 (베타 피드백으로 조정 가능):
  - `coin: 0.3` — 동전 검출 신뢰도
  - `particles: 0.4` — 입자 수 단계 (50/200/500 임계)
  - `brightness: 0.15` — 80~220 정상, 양 끝 감점
  - `blur: 0.15` — Laplacian variance / 200 으로 정규화
- 결정 근거: 입자 수 + 동전 검출이 정확도에 가장 결정적
- 임계: `score < 5` → 결과 카드에 경고 배지 + "재측정 권장"

### F07 — Brewing guide 4 카테고리 (2026-05-02 신규)

**임계값**: 표준 sieve 기준 (Hoffmann/SCA/PDG 등 외부 reference) — 우리가 결정/조정 X.

```
< 350μm   → 에스프레소
350-500   → 모카포트
500-800   → 핸드드립
800+      → 프렌치프레스 / 콜드브루
```

**Uniformity 임계**: image-space (ratio invariant — sieve 표준 직접 적용 시 좋은 burr 도 false alarm)
- ≤4.5 excellent / ≤6.0 good / ≤8.0 uneven / >8.0 very_uneven

**Caveat 임계** (clumpAreaRatio): ≥40% 강 경고, 20-40% 약 안내, <20% 무경고
- 전문가급 burr (VS3 24~28%) 가 false alarm 안 받도록 20%/40% 로 완화 (기존 10%/30%)

### F03 — OpenCV 로딩 (2026-05-02 변경)

- CDN → **vendored** (`public/opencv.js`, npm `@techstark/opencv-js`)
  - 외부 도메인 의존 0 (검수 단순화)
  - CDN 4xx/CORS 이슈 해결
- `cv.Mat is not a constructor` race fix:
  ```ts
  function isCvReady() { return typeof cv?.Mat === "function"; }
  ```
  50ms polling + onRuntimeInitialized 콜백 이중 보장
- React StrictMode AbortError race: loader 에 signal 전달 X (cancel 은 호출 측에서 ac.signal.aborted 검사)

---

## 그라운드 트루스 검증 결과

### 2026-05-02 QC 세션 — VS3 anchor + 페어 일관성

| Fixture | grinder/setting | 기댓값 D50 (sieve) | image D50 (raw) | sieve-equivalent (×2.8) | 통과 |
|---|---|---|---|---|---|
| `test-vs3-100.jpg` | Varia VS3 + Hyperhoba @ 11.5 | ~700μm (V60 grind) | 249μm | **697μm** | ✓ (anchor 자체) |
| `test-vs3-500.jpg` | (동일, 다른 동전) | ~700μm | 223μm | **624μm** | ✓ (페어 \|Δ\|=11%, target ≤15%) |
| `test-500-fine.jpg` | 에스프레소 후 puck | 진단용 X | 213μm | 596μm | clumps 54.6% 강 경고 ✓ |
| `test-vs3-multi.jpg` | (동전 2개 동시) | reject 기대 | — | — | ✓ (multi_coin reject 정상) |

### 페어 일관성 검증 (consistency_check)

vs3-100 (100원) ↔ vs3-500 (500원) — 같은 분쇄, 다른 동전:

```
|D50_500 - D50_100| / mean(D50) = |697 - 624| / 660 = 11%
target: ≤ 15% (동전 차이로 인한 측정 variance 허용 범위)
```

### Phase 2 후속 TODO

- sieve 분급된 ground-truth fixture 4종 (에스프레소/모카포트/핸드드립/프렌치프레스) 추가
- anchor 4점 평균으로 `IMAGE_TO_SIEVE_RATIO` 재보정 (현재 2.8 잠정)
- 현재 anchor 1점 (vs3-100, V60 grind) 으로 결정 → espresso/coarse 양 끝 정확도 검증 부족

### 베타 D13~17 자연 추가

- 다른 그라인더 / 다른 폰 / 다른 조명 fixture 누적
- 사용자별 페어 일관성 모니터링 (telemetry: `measurement_success` 이벤트 D50 분포)

---

## 알려진 한계

### 측정 정확도

- **Image segmentation systematic bias** (~0.4× sieve): 등가 원형 직경 + over-segmentation + 평탄 촬영 단면. Calibration layer (×2.8) 로 부분 보정, fundamental measurement principle 차이는 알고리즘 변경 없이 완전 제거 불가. **상대 비교용** 권장 (디스클레이머).
- **Calibration anchor 1점**: VS3 (V60 grind) 1점 → espresso/coarse 양 끝 검증 부족. 사용자 sieve fixture 4종 도착 후 ratio 재보정.
- **Fine vs medium 동적 분기 부재**: 모든 grind 에서 watershed 우회. 굵은 분쇄에서 입자 분리 미흡 가능. Phase 2+.

### 동전 검출

- **Napkin 텍스처 false positive**: HoughCircles + intensity 필터의 fundamental ambiguity. coinHint UX 로 우회.
- **컵받침/그릇 등 원형 노이즈**: HoughCircles 가 잘 잡음. coinHint 또는 신뢰도 점수로 fallback.
- **Single-coin 가정**: 두 동전 동시 사용 시 multi_coin reject (hint 없을 때) — Phase 1 다중 동전 처리 X.

### Watershed / 입자 분리

- **Watershed oversegment**: 큰 입자가 여러 조각으로 분리 → D50 과소평가. fine grind 에서는 watershed 우회로 회피, calibration ×2.8 로 보정.
- **클럼프 (정전기 cluster / puck 잔여)**: 절대 임계 (≥2000μm) + 상대 임계 (4×D50) 의 max 로 검출. 정상 입자 통계에서 분리.

### Brewing guide

- **임계값은 외부 표준 (sieve)**: 우리가 임의 조정 X. 측정 정확도 안 맞으면 calibration layer 로 align 하는 게 정도.
- **uniformity 임계는 image-space**: ratio calibration 으로 변환 안 됨. sieve 표준 직접 적용 시 좋은 burr false alarm.

### 인프라

- **iOS Safari WASM 메모리**: 큰 이미지 + 여러 Mat 동시 보유 시 OOM. F04 다운샘플링 (1280px) + MatScope 즉시 dispose 가 안전망. `memory_oom` 검출은 메시지 패턴 의존 (불안정).
- **OpenCV 로딩 race**: WASM init 후에야 `cv.Mat` constructor 사용 가능 — `isCvReady()` 폴링으로 보장.

---

## 변경 이력

- `2026-05-01`: 초기 작성 — D7 시점 (F06 commit). 실제 anchor fixture 측정값은 D0 작업 완료 후 갱신.
- `2026-05-02`: **Phase 1 sweep**:
  - Coin detection: intensity 필터 4개 추가 (mean/stddev/exterior/rim gradient), `coinHint` UX 도입, multi_coin/partial_coin 우회 (hint 있을 때)
  - Particle segmentation: fine-grind 우선 — watershed/MORPH 우회, MAX_PARTICLE_AREA_MM2=80 배경 필터
  - Statistics: clump 필터 (절대 2000μm + 상대 4×D50), MAX_PARTICLE_DIAMETER_UM=15000 안전망, DEBUG_STATS envvar
  - **Calibration layer 신규** (`calibration.ts`): image → sieve ×2.8 (anchor: VS3 V60 grind)
  - **Brewing guide 신규** (`brewing-guide.ts`): 4 카테고리 (에스프레소/모카포트/핸드드립/프렌치프레스), 표준 sieve 임계값
  - OpenCV.js vendoring: CDN → npm `@techstark/opencv-js`, `cv.Mat` readiness double-check
  - Fixture: vs3-100/500/multi/puck (4장) — 페어 일관성 11% 검증
  - UI: 미분 라벨 tooltip 명확화, clump caveat 임계 10/30 → 20/40, 메시지 톤 부드럽게
