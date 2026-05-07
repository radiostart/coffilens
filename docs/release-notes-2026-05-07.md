# 변경노트 — 2026-05-07

5/6 release 이후 4개 커밋 — 입자 분포 그래프 정밀화 + 측정 sanity 강화 + UI 정리.

## 요약

- 입자 분포 그래프의 미분 영역을 더 자세히 분할 — bimodal 분포 (그라인더 retention 진단) 가시화
- 분쇄 가능 크기 sanity check 추가 — 통원두/artifact 자동 제외
- 결과 화면 응집체 표기 한국어 + "통계 제외" 명확화
- 알고리즘 + 보정 기술 통합 reference 문서 작성

## 1. 입자 분포 그래프 — 미분 영역 sub-bin 분할

**커밋:** [`c31176b`](https://github.com/radiostart/coffilens/commit/c31176b)

### 문제
기존 fines outlier 가 단일 wide bin (예: 95~329µm 한 덩어리) 으로 collapse → 미분 비율 시각 검증 불가, bimodal 분포 (미분 peak + main peak) 진단 불가.

### 변경
fines 영역 (volP5 미만) 을 균등 log-width 로 1~3개 sub-bin 분할:
- 표시 floor 200µm 이상 영역만 sub-bin 표시
- sub-pixel artifact zone (200µm 미만) 은 leftmost sub-bin 에 묶음

### 영향
- 미분% 가 시각적으로 검증 가능 (작은쪽 marker 직전 sub-bin 비율)
- bimodal 분포 진단 활성화 — 그라인더 retention 의심 시 fines 영역 별도 peak 확인 가능
- sub-pixel artifact 와 진짜 미분 시각 구분

## 2. 분쇄 가능 크기 sanity cutoff

**커밋:** [`ab0445a`](https://github.com/radiostart/coffilens/commit/ab0445a)

### 문제
사용자 보고 — 단일 6517µm contour 1개가 전체 부피 79.2% 차지하는 케이스 발생. 통원두 (~7mm), 분쇄 안 된 덩어리, image artifact 가 정상 입자처럼 contour 로 추출되지만 실제 분쇄 입자보다 훨씬 큼.

기존 `MAX_PARTICLE_DIAMETER_UM = 15000` (15mm) 안전망은 너무 관대 → 6.5mm artifact 통과 → D-value 계산 통째로 왜곡.

### 변경
`GRIND_MAX_DIAMETER_UM = 3000` 신규 임계 추가. 이 값 초과 contour 는 통계 / boulder / clump 분류 모두에서 완전 제외.

### 임계 3mm 근거

| 분쇄 종류 | Worst-case |
|---|---|
| Espresso/모카포트 | ~1mm |
| 핸드드립 | ~1.5mm |
| French Press | ~2mm |
| 응집체 (clump artifact) | ~2.5mm |
| **3mm 임계** | 모든 합리적 분쇄 + 안전 margin |
| 통원두 | ~7mm (catch 대상) |

### 회귀 측정 (multi-shot 14장 mean)

| 지표 | 이전 | 적용 후 | 변화 |
|---|---|---|---|
| D50 | 678µm | 678µm | **0** |
| count | 1113 | 1113 | **0** |
| fines% | 3.8 | 3.8 | **0** |
| clump area% | 26.3 | 21.4 | -4.9pp (artifact 정리) |
| success rate | 10/14 | 10/14 | same |

→ **정상 분쇄 사진 영향 0**. outlier-clumped (014) 같은 케이스에서만 큰 응집체 artifact (49 → 41개) 정리.

## 3. 결과 화면 — 응집체 meta 정리

**커밋:** [`57d8c64`](https://github.com/radiostart/coffilens/commit/57d8c64)

### 변경
"큰 입자 분리 (통계 제외): Boulder N개 · Clump N개" 표시가 boulder 가 사실 D-value 통계에 포함됨에도 "통계 제외" 라벨이 같이 적용되는 것처럼 보여 사용자 오해 가능했던 문제 해결.

```diff
- 🔸 큰 입자 분리 (통계 제외): Boulder 4개 (2.4%) · Clump 32개 (24.1%)
- Clump 다수 — RDT(분무) 또는 retention 점검 권장
+ 🔸 응집체 32개 (24.1%, 통계 제외)
+ 응집체 비율 높음 — RDT(분무) 또는 그라인더 retention 점검 권장
```

- Boulder 표시 제거 (debug overlay 에서는 유지 — 개발자용)
- "Clump" 영문 → "응집체" 한국어
- 액션 hint 그대로

## 4. 검출 알고리즘 + 보정 기술 reference 문서

**커밋:** [`40fd5e2`](https://github.com/radiostart/coffilens/commit/40fd5e2)

### 변경
[docs/detection-techniques.md](docs/detection-techniques.md) 신규 작성 — 2026-05-06 까지 누적된 모든 검출/보정 기법을 한 곳에 정리. 향후 회귀 검증 + 신규 기능 작업의 baseline.

포함:
- 파이프라인 8단계 개요
- 동전 검출 5-시그널 필터 ladder
- 입자 분할 multi-channel approach (Gray ∩ HSV-S)
- Boulder/Clump shape factor 분류
- Volume-weighted D-value + calibration
- 모든 magic number 일람표
- 결과 품질 요약 (D50 CoV 1.9%)

## 빌드 산출물

```
✓ vite production build (1.46s)
✓ AIT artifact: coffilens.ait (RN 0.84.0 + 0.72.6 dual bundle)
✓ deploymentId: 019e02be-ebb1-7a3e-bbf9-e004c0686425
```

| 산출물 | 크기 (gzip) | 변동 (vs 5/6) |
|---|---|---|
| `index-*.js` | 81.06 kB | -0.07 kB |
| `histogram-impl-*.js` | 114.52 kB | +0.20 kB |
| `index-*.css` | 5.43 kB | 동일 |

## 회귀 검증

- TypeScript: clean
- vitest: 156/156 passed
- batch-analyze multi-shot 14장 + vs3 anchor 4종: 영향 없음 / 의도된 정화만
- 브라우저 시각: 미분 영역 sub-bin 분할 + 응집체 표기 변경 확인 완료
