# F00 Fixture 전략 — Design Spec

**Date**: 2026-05-01
**Scope**: F00 (Project Setup & Toss Console) 의 그라운드 트루스 fixture 부분 재설계
**Status**: 디자인 확정 — 구현 spec 으로 핸드오프 대기
**Affects**: F00, F04, F05, F06, F11, plain.md Section 13

---

## 1. 결정 요약

| 항목 | 결정 |
|---|---|
| Fixture 의 목적 | **회귀 테스트** (코드 변경이 알고리즘 출력을 깨뜨리지 않음 보장) |
| 실세계 검증 담당 | **베타 D13~17** (fixture 가 아님) |
| D0 fixture 장수 | **1장** (anchor 1개) |
| Anchor 방식 | sieve 분급으로 **알려진 입자 크기 범위** 보장 |
| Reject fixture | **합성** — F04 에서 anchor 로부터 프로그램 생성 |
| 그라인더 다이얼 라벨링 | **폐기** — 앱은 그라인더 독립적, fixture 도 그래야 함 |
| 베타 사진 → fixture 확장 | **Phase 1 / 개발 후 대응** |
| 다른 그라인더 검증 (③) | **Phase 1 / 개발 후 대응** |
| Re-shoot 일관성 검증 (⑥) | **Phase 1 / 개발 후 대응** |

---

## 2. 배경 — 왜 재설계인가

기존 F00 spec 은 fixture 9장을 명시했음:
- `varia-dial-{1..5}.jpg` — Varia 5단계 분쇄도
- `no-coin / two-coins / partial-coin / cup-edge.jpg` — reject 4종

문제점:
1. **그라인더 종속 라벨링** — 앱은 그라인더 독립적인 D50 측정 도구. fixture 가 "Varia dial N" 에 묶이면 잘못된 추상화.
2. **fixture 의 역할 혼동** — "5단계 검증" 은 알고리즘 회귀가 아니라 **본인 그라인더 1대의 한 시점 snapshot**. 실세계 검증이 아님.
3. **D50 ground truth 출처 모호** — `expectedD50: 480/600/720/850/980` 의 근거가 spec 에 없음.
4. **다른 폰·조명·사용자 변동성** — 9장으론 어차피 못 커버. 베타가 진짜 검증.
5. **D0 부담** — 9장 촬영 + 라벨링 + reject 시나리오 staging 이 일정 압박.

핵심 통찰: **fixture 는 회귀 도구다.** "오늘 코드 = 어제 코드" 만 보장하면 됨. "내 알고리즘이 모두에게 동작한다" 의 증거는 fixture 가 아니라 베타 사용자.

---

## 3. D0 산출물 — anchor 1장

### 3.1 파일

| 파일 | 역할 |
|---|---|
| `fixtures/grind-anchor-725.jpg` | 알고리즘 절대 정확도 + 회귀 잠금 |
| `fixtures/manifest.json` | metadata (ground truth, 촬영 정보) |

### 3.2 anchor 준비 절차

1. Varia 또는 임의 그라인더로 **medium 곱기 분쇄** (V60 적정 영역, 다이얼 무관)
2. 표준 체로 **분급**:
   - 600μm 체로 1차 통과 (이상 폐기)
   - 850μm 체로 2차 정지 (통과 폐기, 정지된 입자 회수)
   - **600–850μm fraction** 만 anchor 재료로 사용
3. 흰 A4 또는 흰 접시 위에 평평하게 깔기 (~10g, 단층 분포)
4. 500원 동전 함께 배치 (스케일 기준)
5. 촬영 (조건은 §3.3 참조)

> **체 mesh 가 정확히 600/850 아닌 경우**: 보유 체의 가장 가까운 페어로 anchor μm 값 조정 (예: 500/710 페어 → anchor 605μm, 파일명도 `grind-anchor-605.jpg` 로). manifest 의 `ground_truth_d50_um` 과 `tolerance_um` 도 함께 갱신.

### 3.3 촬영 표준 (anchor 작성 시)

품질 관련 최소 요건:
- 포커스 sharp — 입자 윤곽 식별 가능
- 모션 블러 없음 — Laplacian variance 임계 통과
- 흰 배경 — 동전·입자 대비 확보
- 500원 동전 함께 — 스케일 기준

자유 변수 (동전이 정규화함):
- 폰 종류 / 카메라 모드
- 조명 (실내 천장등 / 자연광 / 데스크 램프 가리지 않음)
- 거리 / 프레임 비율
- 촬영 각도 (대략 직각이면 OK)

### 3.4 manifest.json 스키마

```json
{
  "version": 1,
  "fixtures": [
    {
      "file": "grind-anchor-725.jpg",
      "kind": "anchor",
      "ground_truth_d50_um": 725,
      "tolerance_um": 50,
      "source": "sieve fraction 600-850μm (midpoint 725μm)",
      "shooting": {
        "device": "<예: iPhone 15 Pro main lens>",
        "lighting": "<예: indoor warm lamp>",
        "background": "white A4",
        "coin": "500won",
        "captured_at": "<YYYY-MM-DD>"
      }
    }
  ]
}
```

베타·Phase 1 fixture 추가 시 같은 스키마로 entry append.

### 3.5 회귀 테스트 코드 (F05/F06 작업 시 작성)

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

> manifest 기반 동적 루프 — Phase 1 에서 fixture 가 늘어나도 테스트 코드 변경 불필요.

---

## 4. F04 영향 — 합성 reject fixture

F04 (Coin Detection) 에 추가될 작업:

- `scripts/build-reject-fixtures.ts` 작성
- anchor (`grind-anchor-725.jpg`) 를 base 로 4개 합성 fixture 생성:
  - `no-coin.synth.jpg` — 동전 영역 mask + inpaint
  - `two-coins.synth.jpg` — 동전 복제 paste
  - `partial-coin.synth.jpg` — 동전이 25% 잘리도록 crop
  - `cup-edge.synth.jpg` — 큰 호(arc) 합성으로 가짜 원형 노이즈
- 합성 fixture 는 `fixtures/synthetic/` 하위에 분리 보관 (실 fixture 와 구분)
- reject 단위 테스트의 입력으로 사용

이 작업의 spec 은 F04 spec 에서 별도 정의 (이 디자인 문서 범위 밖).

---

## 5. F00 spec 변경 사항

기존 F00 spec (`features/F00-project-setup.md`) 의 fixture 섹션을 다음으로 교체:

### 변경 전 (외부 액션 D0 항목)
```
- 그라운드 트루스 사진 촬영:
  - fixtures/varia-dial-{1,2,3,4,5}.jpg — Varia 5단계 분쇄도
  - fixtures/no-coin.jpg — 동전 없음 reject
  - fixtures/two-coins.jpg — 동전 2개 reject
  - fixtures/partial-coin.jpg — 동전 가장자리 잘림 reject
  - fixtures/cup-edge.jpg — 컵받침 등 원형 노이즈
```

### 변경 후
```
- Anchor fixture 준비 (이 디자인 문서 §3 참조):
  - 분쇄물을 보유 체로 분급 (목표: 600–850μm fraction)
  - fixtures/grind-anchor-725.jpg 촬영 (500원 동전 포함, 흰 배경)
  - fixtures/manifest.json 작성 (metadata 기록)
- Reject fixture 는 F00 에서 촬영하지 않음 — F04 에서 합성으로 생성
```

### 수용 기준 변경
- (제거) "그라운드 트루스 fixture 9개 모두 fixtures/ 에 위치"
- (추가) "fixtures/grind-anchor-{NNN}.jpg + fixtures/manifest.json 존재 (NNN = 보유 체 mesh 페어 midpoint), manifest 의 ground_truth_d50_um 과 tolerance_um 이 보유 체 mesh 페어로 보정됨"

### Handoff Notes 추가
- anchor 의 정확도가 알고리즘 절대 정확도의 유일한 회귀 닻. 보유 체 mesh 를 D0 시작 시 확인하고 manifest 의 anchor μm 값을 그에 맞게 조정.
- Reject 검증은 F04 의 합성 fixture + 단위 테스트가 담당. F00 책임 아님.
- 단조성 검증 / 다른 그라인더 / 다른 폰 검증은 Phase 1 (베타 D13~17 이후) 에서 자연 발생적으로 추가.

---

## 6. plain.md Section 13 영향

회귀 테스트 코드 예시 (5 fixtures × loop) 를 manifest 기반 anchor 코드로 교체. 단조성 검증 코드는 plain.md 에서 제거하거나 "베타 데이터 기반 별도 검증" 으로 표기.

수정은 이 디자인 문서 채택 후 별도 작업으로.

---

## 7. 위험 / 함정

| ⚠️ | 위험 | 완화 |
|---|---|---|
| 1 | anchor 1장 실패 시 회귀 안전망 얇음 | F05/F06 의 단위 테스트 (statistics·confidence) ★★★ 커버리지로 보완. anchor 가 회귀를 100% 책임지지 않음. |
| 2 | 보유 체 mesh 가 600/850 와 다름 | manifest 에 실제 mesh 페어와 anchor μm 값 명시. 기록만 정확하면 회귀 테스트는 동작. |
| 3 | 합성 reject fixture 가 실 사진 노이즈 못 흉내 | F04 합성으로 1차 안전망. 베타 실 사진은 Phase 1 에서 자연 추가. |
| 4 | "단조성 검증 없음" 우려 | 베타 5명이 다양한 다이얼로 측정한 데이터로 단조성 검증. 알고리즘 자체는 monotone-by-construction (입자 평균 → D50). |
| 5 | anchor 촬영 폰이 베타 폰과 다름 | 의도된 설계. 동전이 스케일 정규화. fines 임계 robustness 는 베타가 검증. |

---

## 8. Phase 1 / 개발 후 대응

이 디자인 범위 밖 — 베타 D13~17 이후 자연 추가:

- 베타 사용자 사진 → 동의·익명화 후 fixture 추가 (F11 에 절차 명시)
- 다른 그라인더 (1Zpresso, Comandante 등) anchor 추가 → 그라인더 독립성 검증 (③)
- Re-shoot 일관성 검증 (⑥)
- Reject 합성 fixture → 베타 실 reject 사진으로 일부 교체

---

## 9. 채택 후 액션 아이템

이 디자인 채택 시:
1. `features/F00-project-setup.md` 의 §외부 액션 / §수용 기준 / §Handoff Notes 갱신
2. `features/F04-coin-detection.md` 에 "합성 reject fixture 스크립트" 작업 추가
3. `plain.md` Section 13 회귀 테스트 코드 예시 갱신
4. `features/README.md` 의 변경 없음 (feature 분할 자체는 그대로)

각 갱신은 writing-plans 단계에서 task 화.
