# Sieve Calibration 가이드

image-측정 직경 → sieve-equivalent 직경 변환 비율 (`IMAGE_TO_SIEVE_RATIO`) 의
**grind-size-aware 보정 데이터** 등록 절차.

> **현재 상태 (2026-05-09)**: `defaultRatio = 0.63` 단일 값 (Setting 11 V60
> pour-over anchor). anchor 0개 → 모든 grind 영역에 0.63 적용. 다중 anchor
> 등록 시 raw D50 기준 선형 보간으로 grind-size-aware 비율 산출.

---

## 왜 calibration 이 필요한가

코드 코멘트 (`src/opencv/calibration.ts`) 참조. 요약:
1. 입자가 평탄하게 누워 촬영됨 → 가장 큰 단면만 image 에 노출
2. Adaptive threshold over-segmentation → 큰 입자가 여러 fragment 로 쪼개짐
3. 등가 원형 가정 자체의 underestimation

→ image-측정 D50 < sieve D50 (체계적). ratio 로 후보정.

manifest 의 anchor 분석 결과 ratio 가 grind 영역마다 다름:
- VS3 @ 11 (V60): ratio ≈ **0.63**
- VS3 @ 13 (FP): ratio ≈ **0.88**

→ 큰 입자 (coarse) 일수록 ratio 1 에 근접. 단일 0.63 으로는 coarse 영역
정확도 부족 → multi-anchor 보간 필요.

---

## 데이터 수집 절차

### 준비물
- **Sieve 세트** (mesh 명칭 기준 micron 환산):
  - #25 (710 μm) — coarse / French press
  - #30 (600 μm) — pour-over 표준
  - #35 (500 μm) — fine pour-over / drip
  - #40 (425 μm) — moka pot 영역
  - #50 (300 μm) — espresso 경계 (선택)
  - **권장**: 최소 #25 + #35 두 단계 (anchor 2 개)
  - ASTM 인증 sieve > test sieve (오차 ±5% vs ±15%)
- **저울** (0.1 g 정밀)
- **그라인더** + 다양한 분쇄도 사진 환경 (현 fixture 셋업 그대로 OK)

### 단계

**1. 분쇄도 fraction 만들기**
```
원두 50g 기준
1) 그라인더에서 한 setting 으로 분쇄
2) 두 sieve 사이로 통과시켜 중간 fraction 분리
   - #30 위에 멈춘 입자: 600~? μm
   - #30 통과 + #35 위에 멈춘 입자: 500~600 μm  ← 이 fraction 사용
   - #35 통과: ~500 μm 미만 (제외)
3) 중간 fraction 의 평균 직경 = (lower + upper) / 2 = 550 μm
   → 이게 그 fraction 의 D50 sieve target
```

**2. 사진 촬영**
- 같은 환경 (조명, 카메라, 거리) 으로 그 fraction 만 종이 위에 펼쳐 촬영
- 동전 함께 (mmPerPx anchor)
- 입자 100 개 이상 보이도록 양 조절
- 가능하면 동일 fraction 을 여러 번 다시 펼쳐 3~5 장 평균

**3. 분석 + raw D50 기록**
```bash
npx tsx scripts/batch-analyze.ts <fraction-photos-dir> <coin-type>
```
- 출력의 D50 이 *image-space* 임을 주의 (이미 0.63 곱해진 sieve-space 값임)
- 진짜 raw D50 얻으려면 0.63 으로 다시 나눔: `raw_D50 = output_D50 / 0.63`
- 또는 임시로 `defaultRatio: 1.0` 으로 테스트 후 그 값을 기록

**4. anchor 등록**

`src/opencv/calibration-data.json` 편집:
```json
{
  "version": 1,
  "defaultRatio": 0.63,
  "anchors": [
    {
      "label": "VS3@9 (espresso boundary)",
      "rawD50um": 750,
      "targetD50um": 425,
      "notes": "fraction #40~#50, 500g sample, 3 photos avg, 2026-05-15"
    },
    {
      "label": "VS3@11 (V60 pour-over)",
      "rawD50um": 1110,
      "targetD50um": 700,
      "notes": "기존 anchor — manifest 의 V60 reference"
    },
    {
      "label": "VS3@13 (French press)",
      "rawD50um": 1244,
      "targetD50um": 1100,
      "notes": "fraction #25~#30, 2026-05-15"
    }
  ]
}
```

**5. 검증**

각 anchor 의 사진을 다시 batch-analyze 로 돌려 새 D50 (sieve-converted) 가
target 값에 가까운지 확인:
```bash
npx tsx scripts/batch-analyze.ts <photo>
# expect: D50 ≈ targetD50um (anchor 자기 자신은 정확히 일치)
```

다른 (anchor 사이의) grind 영역은 보간된 ratio 가 적용되므로 별도 fraction
사진으로 sanity check 권장.

---

## anchor 권장 개수

| anchor 수 | 효과 |
|---|---|
| 0 | defaultRatio (0.63) 평면 적용 — 현재 상태 |
| 1 | 그 anchor 정확, 다른 grind 영역은 동일 비율 |
| **2** | **최소 권장** — 두 anchor 사이 선형 보간, 양 끝 clamp |
| 3~4 | espresso/V60/FP 전 영역 커버, 보간 정확도 ↑ |
| 5+ | 다이아미노이즈 — 노이즈 증가 (수집 비용 vs 정확도 다이미니싱 리턴) |

---

## anchor 작성 시 주의사항

1. **`rawD50um` 은 calibration 전 값** — output stats 의 D50 을 그대로 쓰면
   double-calibration. 수집 시 `defaultRatio: 1.0` 으로 임시 변경 후 측정 → 원복.
2. **`targetD50um` 은 sieve fraction 의 mean (mid-point)** — 사용한 두 sieve
   사이의 중간값. e.g. #30~#35 fraction → (600 + 500) / 2 = 550μm.
3. **같은 grinder + 비슷한 mmPerPx** 환경에서 수집한 사진들로 통계내야 의미 있음.
   다른 grinder (예: hand grinder) 는 별도 anchor set 또는 정확도 한계 인정.
4. **`label` 은 자유** — 사람이 읽을 수 있는 식별자. 보간 로직은 사용 안 함.

---

## 코드 구조 참조

- `src/opencv/calibration.ts`
  - `getCalibrationRatio(rawD50um)`: anchor 보간 함수
  - `applyImageToSieveCalibration(stats)`: pipeline 출력 단에서 호출
- `src/opencv/calibration-data.json`: 데이터 SSOT (외부 편집 가능)
- `tests/opencv/calibration.test.ts`: 보간 로직 회귀 테스트

---

## 미래 확장

- mmPerPx-aware ratio (해상도 별 보정)
- 그라인더별 anchor profile 분리
- coffee bean 종류별 ratio (가능성: roast 정도가 fragility 영향)
- non-linear 보간 (spline, polynomial fit) — anchor 5+ 시
