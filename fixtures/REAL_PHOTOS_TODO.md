# Phase 2 Roadmap — Boulder D-value 통계 포함

Phase 1 (boulder/clump 분리) 완료. 실 fixture 임계값 calibration 까지 끝.

## ✓ 사용한 실 fixture

기존 fixture 가 분쇄도 spectrum 을 잘 cover:

| Fixture | Grinder Setting | 역할 |
|---|---|---|
| `test-500-fine.jpg` | spent puck (espresso 후) | clump 양성 검증 (응집 65%) |
| `test-vs3-09.jpg` | VS3 @ 9 | fine grind (moka) |
| `test-vs3-11.jpg` | VS3 @ 11 | medium (pour over, primary anchor) |
| `test-vs3-13.jpg` | **VS3 @ 13 (French Press)** | **boulder 검증 — 임계값 calibration 기반** |
| `multi-shot-2026-05-05/` | 14장 same fine grind | regression 일관성 |

이 fixture 들로 임계값 0.55 / 0.80 calibration 완료. 분쇄도 → boulder 비율 monotonic.

## Phase 2 계획 — boulder 를 D-value 통계에 포함

현재 (Phase 1):
- boulder, clump 모두 D-value 통계에서 제외
- French Press 측정 시 D90 truncated (큰 boulder 가 빠지면 → D90 underestimate)

Phase 2 목표:
- **Boulder = real measurement** → D-value 에 포함
- **Clump = artifact** → 계속 제외

```
이전 (Phase 1):              Phase 2:
diameters[] = normal         diameters[] = normal + boulder
boulders   = excluded        boulders   = reported separately (count + area)
                             clumps     = excluded
```

## Phase 2 작업 목록

1. **statistics.ts**: `if (isBoulder)` → `diameters.push(diameterUm)` (D-value 통계 포함)
2. **regression**: 14장 nominal 의 D50 변화 < ±5% 검증 (large 입자 적은 fine grind 라 영향 미미)
3. **VS3 @ 13 (French Press)**: D50 / D90 정상화 검증 — 이전엔 boulder 8.6% 가 통계에서 빠졌음
4. **brewing-guide 임계값 재calibration**:
   - 현재 `IMAGE_TO_SIEVE_RATIO = 0.63` 은 V60 setting 11 의 D50=414 (image, count-based) 기준
   - Phase 2 (boulder 포함) 후 image volume-D50 재측정 → ratio 재anchor

## Phase 2 위험

- D50 변화 가능성 — multi-shot 14장 회귀로 변화 폭 확인
- Brewing-guide 임계값 (fine ≤ 500, medium 500-900, coarse 900+) 영향
- 사용자 측정 결과 변경 → DB 저장된 record 와 일관성

이 위험들은 Phase 2 PR 에서 별도 plan 필요. 현재 Phase 1 으로 ship 가능 (측정값 변화 0).

## 추가 fixture (선택, 향후 정확도 ↑)

기존 fixture 가 충분하지만 다음이 추가되면 정확도 ↑:
- VS3 @ 14-15 (가장 거친 setting) — boulder 임계값 양성 한계 검증
- 정전기 응집 fine grind (RDT 안 한 상태) — clump 양성 한계
