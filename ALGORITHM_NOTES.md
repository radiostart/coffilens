# Coffilens Algorithm Notes

> D7 종료 시점 작성 (F06 수용 기준). 6개월 후 본인 또는 후임 개발자가
> 파라미터 결정 근거를 추적할 수 있도록 유지.

---

## 파라미터 결정 이력

### F04 — 동전 검출 (HoughCircles)
- `dp = 1`, `minDist = imgRows / 4`
- `param1 = 100` (Canny 상위 임계)
- `param2 = 30` (검출 임계, 낮을수록 검출 ↑)
- `minRadius = imgRows * 0.05` / `maxRadius = imgRows * 0.4`
  - 이유: 일반 촬영 거리(20~40cm)에서 동전이 차지하는 비율
- 100/500원 분류 임계: `2r/imgWidth > 0.20` → 500원
  - 단순 휴리스틱. Phase 1 에 사용자 선택 UI 또는 ML 분류기 검토.

### F04 — 입력 검증
- `MIN_BRIGHTNESS = 80` — 평균 밝기 (0~255)
- `MIN_LAPLACIAN_VAR = 100` — 블러 점수 임계
  - 임계는 anchor fixture 기반 튜닝 — 실 기기마다 카메라 노이즈 다름

### F05 — 입자 분할
- 동전 영역 + `5mm` 마진 마스킹 (경계 입자 왜곡 방지)
- Adaptive threshold: `blockSize = 51`, `C = 10` (Gaussian)
  - anchor fixture (`grind-anchor-{NNN}.jpg`) 에서 입자 분리 잘됨
  - blockSize 31, 71 도 시도 → 51 이 노이즈/검출 균형 best (예시 — 실제 튜닝 시점에 갱신)
- Distance transform threshold: `0.5` (정규화된 시드 추출)
  - 0.3~0.7 범위 튜닝 가능. 너무 높으면 시드 부족 (oversegment 위험 X), 너무 낮으면 입자 합쳐짐.
- Sanity:
  - `SANITY_MIN_AREA_RATIO = 0.005` (입자 면적 합 / 동전 면적 < 0.5% → no_particles)
  - `SANITY_MAX_SINGLE_RATIO = 0.5` (단일 입자 > 50% → no_particles, 분쇄 안 됨)

### F06 — 통계
- 노이즈 필터: `MIN_PARTICLE_DIAMETER_UM = 100` (직경 100μm 미만 제외)
- Fines 임계: `FINES_THRESHOLD_UM = 300` (직경 300μm 미만 면적 비율)
- 등가 직경 가정: 원으로 근사 → `D = 2 * sqrt(A / π)`
  - 실제 입자는 각진 형상이 많아 5~15% 과소평가 (디스클레이머 정당화)
- Percentile: linear interpolation (between adjacent sorted values)

### F06 — 신뢰도 점수
- 가중치 (베타 피드백으로 조정 가능):
  - `coin: 0.3` — 동전 검출 신뢰도
  - `particles: 0.4` — 입자 수 단계 (50/200/500 임계)
  - `brightness: 0.15` — 80~220 정상, 양 끝 감점
  - `blur: 0.15` — Laplacian variance / 200 으로 정규화
- 결정 근거: 입자 수 + 동전 검출이 정확도에 가장 결정적. 베타에서 사용자 만족도와 상관관계 검증 필요.
- 임계: `score < 5` → 결과 카드에 경고 배지 + "재측정 권장"

---

## 그라운드 트루스 검증 결과

| Fixture | 기댓값 D50 (sieve fraction midpoint) | 측정값 D50 | 오차 | 통과 |
|---|---|---|---|---|
| `grind-anchor-{NNN}` | `{NNN}μm` (예: 725) | _D0 anchor 촬영 후 채우기_ | _-_ | _-_ |

> 베타 D13~17 에서 사용자별 데이터 수집 후 추가 row 갱신 (Phase 1).

---

## 알려진 한계

- **컵받침/그릇 등 원형 노이즈**: HoughCircles 가 잘 잡음. `chooseCoinType` 휴리스틱 또는 신뢰도 점수로 fallback. Phase 1에 ML 분류기 도입 검토.
- **Watershed oversegment**: 큰 입자가 여러 조각으로 분리 → D50 과소평가. 100μm 미만 필터로 일부 완화. F11 베타에서 검증.
- **단일 그라인더 anchor**: 다른 그라인더 / 다른 폰 / 다른 조명 조건은 베타에서 자연 검증 (Phase 1 fixture 확장).
- **Single-coin 가정**: 두 동전 동시 사용 시 multi_coin reject — Phase 1 다중 동전 처리 검토 안 함 (사용자 안내로 회피).
- **iOS Safari WASM 메모리**: 큰 이미지 + 여러 Mat 동시 보유 시 OOM. F04 다운샘플링 (1280px) + MatScope 즉시 dispose 가 안전망. memory_oom 검출은 메시지 패턴 의존 (불안정).

---

## 변경 이력

- `2026-05-01`: 초기 작성 — D7 시점 (F06 commit). 실제 anchor fixture 측정값은 D0 작업 완료 후 갱신.
