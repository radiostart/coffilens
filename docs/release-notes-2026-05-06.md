# 변경노트 — 2026-05-06

검출 정확도 + 결과 화면 단순화. 4개 커밋, all on `main`.

## 요약

- 동전 검출에서 발생하던 **silent false positive** 차단 (잘못된 측정값을 명시적 에러로 전환)
- 입자 검출에서 그림자 / 종이 텍스처 노이즈 제거 → 측정 일관성 개선 (D50 CoV 4.0% → 1.9%)
- 결과 화면의 추출법 가이드 카드 단순화 — 차선/비추 텍스트 row 제거, 분쇄도 spectrum bar 도입

## 1. 동전 검출 — hint 거리 sanity check

**커밋:** [`79424c8`](https://github.com/radiostart/coffilens/commit/79424c8)

### 문제
사용자가 동전 위치를 hint 로 탭한 후, HoughCircles 가 진짜 동전을 못 찾고 phantom (커피 입자 사이 빈 공간 등) 만 검출한 케이스에서:
- 기존 코드는 "hint 와 가장 가까운 후보" 를 무조건 선택
- 실제 거리가 phantom 반지름의 3배 (예: 443px) 떨어져 있어도 그대로 채택됨
- 결과: silent false positive — 사용자는 잘못된 측정값을 받아도 인지 불가

회귀 케이스: `fixtures/multi-shot-2026-05-05/KakaoTalk_Photo_2026-05-05-14-10-35 014.jpeg`

### 변경
`coin-detect.ts` 의 hint 분기에 distance check 추가:
```
dist > selected.r * 1.5 → no_coin (hint_too_far) 으로 명시 거절
```

사용자 화면: "표시한 동전 위치를 다시 확인해 주세요" 안내 + 다시 촬영 CTA.

### 영향
- 정상 검출 사진: 동작 변화 없음
- 014 같은 edge case: silent FP → 명시적 에러 (사용자 액션 가능)
- multi-shot 14장 batch-analyze: 10/14 success (baseline 동일)
- 단위 테스트 156/156 통과

## 2. 입자 검출 — saturation 채널 결합

**커밋:** [`b2c974c`](https://github.com/radiostart/coffilens/commit/b2c974c)

### 문제
grayscale adaptive threshold 단독은 입자 + 그림자 + 종이 텍스처 noise 를 한 데 묶어 잡았음:
1. 입자 + 그림자 contour → centroid 우하단 drift, radius 20-40% 부풀림
2. sparse 사진에서 종이 텍스처 spot 이 fines (미분) 로 잘못 카운트

### 변경
HSV S 채널 (커피 = saturated, 종이/그림자 = 무채색) 과 AND 결합:
```
픽셀이 "어둡다(gray)" + "채색(sat)" 둘 다 만족할 때만 입자로 판정
```

진단 스크립트 (`scripts/diagnose-shadow.ts`) 로 sparse / dense fixture 의 채널별 contour 통계 측정.

### 영향
회귀 측정 (multi-shot 14장 mean):

| 지표 | Before | After | Δ |
|---|---|---|---|
| D50 CoV | 4.0% | 1.9% | **개선** |
| D50 mean | 647µm | 678µm | +5% |
| count | 4436 | 1113 | -75% (그림자/노이즈 제거) |
| fines% | 12.1 | 3.8 | -69% (인플레이션 해소) |
| clump 검출 | 작동 | 작동 | 유지 |

브라우저 시각 검증: cyan 마커 입자 중앙 정확 (그림자 drift 사라짐), 빈 종이 영역 phantom 마커 제거.

## 3. 결과 화면 — SpectrumBar 도입

**커밋:** [`51652a8`](https://github.com/radiostart/coffilens/commit/51652a8)

### 변경
"차선 (secondary)" 텍스트 라인을 분쇄도 spectrum 위 위치 시각화로 대체:

```
미세 (0~500µm) │  중간 (500~900µm)  │ 거침 (900~1500µm)
                       ▲
                    D50 700µm
```

차선이 전달하던 "현재 분쇄도가 인접 카테고리에도 적용 가능" 정보를 사용자가 spectrum 위 위치를 보고 직접 인지하도록 변경. 분쇄도가 fine 쪽 끝인지, medium 중앙인지, coarse 시작인지 시각적으로 명확.

### 신규 파일
- `src/components/spectrum-bar.tsx`
- `src/components/spectrum-bar.css`

## 4. 결과 화면 — brewing-guide 카드 압축

**커밋:** [`db277cd`](https://github.com/radiostart/coffilens/commit/db277cd)

### 변경
SpectrumBar 도입 후 redundant 해진 텍스트 정보 제거:

| 요소 | Before | After |
|---|---|---|
| 카드 title | "어떻게 추출할까요? [중간]" (분쇄 카테고리) | "어떻게 추출할까요? [핸드드립]" (primary 추천) |
| 추천 row | `[추천] 핸드드립` | 제거 (title 의 badge 가 그 역할) |
| 비추 row | `[비추] 에스프레소 (너무 굵음)` | 제거 (spectrum 위치로 사용자가 인지) |
| caveat / boulder-clump meta | 유지 | 유지 |

### 코드 정리
- `BrewingGuide` interface 에서 `grindLabel`, `avoid` 필드 제거 → `primary`, `measurementConfidence`, `caveat` 만 유지
- 사용하지 않게 된 CSS 클래스 5개 제거 (`.result-guide-row`, `.result-guide-tag`, `.tag-primary`, `.tag-avoid`, `.result-guide-avoid`)
- 코드 변화: -68 lines / +8 lines

## 빌드 산출물

```
dist/index.html                          0.45 kB │ gzip:  0.31 kB
dist/assets/analysis.worker-D9iZKZ5L.js  19.23 kB
dist/assets/histogram-impl-*.css          1.83 kB │ gzip:  0.52 kB
dist/assets/index-*.css                  29.33 kB │ gzip:  5.43 kB
dist/assets/index-*.js                  255.40 kB │ gzip: 81.13 kB
dist/assets/histogram-impl-*.js         382.77 kB │ gzip: 114.32 kB

coffilens.ait — RN 0.84.0 + RN 0.72.6 dual bundle
deploymentId: 019dfc18-b845-74a9-9721-61b977f521a5
```

## 회귀 검증

- TypeScript: clean
- vitest: 156/156 passed
- batch-analyze multi-shot 14장: 10/14 success (baseline 0.71 동일)
- 브라우저 시각 확인: spectrum bar 4개 분류 케이스 + 양 끝 엣지 케이스 모두 모바일 (375px) 정상 렌더

## 신규 진단 도구

- `scripts/diagnose-shadow.ts` — gray vs HSV-S 채널 contour 비교 진단 (재사용 가능)
- `coin-detect.ts` 내 `[coin-detect] reasons:` 영구 진단 로그 (후보별 PASS/reject 사유)
