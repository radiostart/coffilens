# F10 — Test Hardening & Code Review

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D11)
**Dependencies**: F01~F09 (모든 코드)
**Blocks**: F11
**plain.md 참조**: Section 13 (테스트 전략 + 커버리지 목표), Section 17 (출시 전 체크리스트)

---

## 목표

opencv/* 단위 테스트 ★★★ 마무리 + DRY/리팩터 정리 + 자체 검수 체크리스트 100% 통과 + 코드 리뷰 (혼자 또는 외부 리뷰어).

---

## 산출물

### 신규/보강 파일
- `tests/opencv/coin-detect.test.ts` — F04 작성 후 분기 보강 (모든 reject 케이스)
- `tests/opencv/particle-segment.test.ts` — F05 작성 후 sanity 케이스 보강
- `tests/opencv/statistics.test.ts` — F06 작성 후 경계값 보강
- `tests/opencv/confidence.test.ts` — F06 작성 후 신호 매트릭스 보강
- `tests/opencv/regression.test.ts` — 그라운드 트루스 5단계 D50 회귀 (Section 13)
- `tests/recommendation/matrix.test.ts` — F07 작성 후 5 경계값 검증
- `tests/storage/quota.test.ts` — F08 작성 후 임계 시나리오 보강
- `tests/eslint-rules/*.test.ts` — F01, F03 룰 양성/음성

### 검수 자가 체크 산출물
- `docs/self-inspection.md` — plain.md Section 17 모든 항목 ✅ 표시
- `docs/inspection-evidence.md` — 종료 모달 텍스트 1:1 매치 스크린샷 + 토스 가이드 캡처

---

## 구현 디테일

### 커버리지 목표 (Section 13 인용)
```
opencv/*              ★★★ 모든 분기 + 에러 + 엣지 케이스
recommendation/*      ★★★ 모든 경계값
storage/*             ★★  쿼터 + 정상 CRUD
components/*          ★   smoke (렌더링)
routes/*              수동 베타 (D13~17) 위주
```

### 테스트 실행
```bash
npm test                      # vitest 단위 테스트 전체
npm test -- --coverage        # 커버리지 리포트
npm test -- regression        # 회귀 테스트만
npm run lint                  # ESLint 룰 (no-custom-back-button, no-direct-mat)
```

### DRY 정리 체크포인트
- [ ] 추천 매트릭스 룩업 코드가 한 곳에만 (matrix.ts)
- [ ] 카메라 권한 체크가 routes/camera.tsx, routes/intro.tsx 양쪽 중복 → permissions.ts 통합
- [ ] AnalysisError → userMessage 매핑이 한 곳에만 (errors.ts)
- [ ] thumbnail 생성 로직이 한 곳에만 (lib/thumbnail.ts)
- [ ] Mat 생성이 모두 MatScope 통과 (ESLint 룰로 검증)

### 코드 리뷰 체크 (혼자 / 외부)
- [ ] OpenCV Mat 누수 없음 (모든 함수에 MatScope or withMatScope 사용)
- [ ] AnalysisError discriminated union 컴파일러 exhaustive 통과
- [ ] AbortSignal 모든 비동기 단계에서 throwIfAborted 호출
- [ ] 사용자 메시지가 모든 에러에 정확히 매핑 (silent failure 0)
- [ ] 디스클레이머가 결과 화면에서 sticky 또는 영구 노출

### docs/self-inspection.md (체크리스트 형식)
```markdown
# 자가 검수 체크리스트 (D11)

## 등록/네이밍
- [x] "커피렌즈" 이름 중복 확인
- ...

## 코드 (검수 대응 핵심)
- [x] SDK 2.x 사용 확인 — package.json:15
- [x] 인트로 브릿지뷰 정상 동작 — 샌드박스 캡처 #1
- [x] 비게임 표준 nav-bar 적용 — 샌드박스 캡처 #2
- [x] ESLint 룰: 자체 뒤로가기 차단 — `npm run lint` 통과
- [x] 종료 모달 텍스트 정확히 일치 — docs/inspection-evidence.md:#exit-modal
- [x] AOS 시스템 백버튼 동작 — 베타 사용자 검증 (F11 D13~17)
...

## Failure 처리
- [x] Failure Modes Registry 16개 모두 처리 — tests/opencv 회귀 테스트 통과
- [x] AnalysisError switch exhaustive — `tsc --noEmit` 통과
...
```

### docs/inspection-evidence.md
```markdown
# 검수 증거 문서

## 종료 모달 텍스트 매치

### 토스 비게임 가이드 (2026-XX-XX 캡처)
![가이드 스크린샷](./images/toss-guide-exit-modal.png)

> "{앱명}을 종료할까요?" / "취소" / "종료하기"

### 커피렌즈 구현 (D10)
![구현 스크린샷](./images/coffilens-exit-modal.png)

> "커피렌즈를 종료할까요?" / "취소" / "종료하기"

**1:1 매치 확인 ✅**

## 카메라 권한 거부 UX
... (캡처 + 설명)

## 텔레메트리 외부 통신 사유
- 엔드포인트: https://coffilens-telemetry.workers.dev/track (또는 SDK 분석 API)
- 전송 데이터: event_type + fail_reason + device_class + timestamp 만
- 개인정보/이미지/위치 정보 미수집
```

---

## 수용 기준

- [ ] `npm test` 전체 통과
- [ ] **opencv/* 커버리지 80%+**, 핵심 분기 100%
- [ ] **recommendation/matrix.ts 커버리지 100%** (5 경계값 + 정상)
- [ ] **그라운드 트루스 회귀 테스트 5/5 통과** (D50 ±50μm)
- [ ] `npm run lint` 통과 (no-custom-back-button + no-direct-mat)
- [ ] `tsc --noEmit` 통과 (TypeScript strict)
- [ ] `docs/self-inspection.md` 전 항목 ✅
- [ ] `docs/inspection-evidence.md` 작성 (종료 모달 + 권한 + 텔레메트리 사유)

---

## 테스트

이 feature 자체가 테스트 보강. 이미 위에 명시.

추가:
- **회귀 테스트가 시간 오래 걸리면 (>30s) CI 별도 분리** (`vitest.config.ts` projects 설정)
- **fixture 이미지 git LFS 또는 별도 저장**: 5+9 = 14장 × 평균 200KB = 3MB. git 직접 OK이지만 LFS 권장

---

## 검수 영향

- 이 feature 가 **검수 제출 직전 안전망**. 모든 검수 항목이 통과 가능 상태인지 확인.
- `docs/inspection-evidence.md` 가 검수 반려 시 근거 자료로 활용 가능.

---

## 위험 / 함정

- ⚠️ **D11 하루로 부족할 가능성**: 그라운드 트루스 회귀 테스트 통과가 첫 시도에 안 될 수도. F04~F06 파라미터 재튜닝 시 +0.5~1일. 일정 여유 확보.
- ⚠️ **fixture 이미지가 너무 정형화**: D0 촬영 시 이상적인 조건만 → 베타 (F11) 에서 다양한 조건에 약함 발견. 베타 피드백으로 추가 fixture 확보 권장.
- ⚠️ **docs/self-inspection.md 진실성**: ✅ 표시했지만 실제 미동작 시 검수 반려. 각 항목에 evidence (파일:line, 스크린샷, 테스트 통과 로그) 첨부 권장.
- ⚠️ **OpenCV.js 단위 테스트 환경**: jsdom 에서 OpenCV.js 동작 안 함 → fixture 회귀 테스트는 vitest browser mode 또는 Playwright. vitest 단위는 logic 만 (statistics, confidence, matrix)
- ⚠️ **TypeScript strict 누락**: `tsconfig.json` 의 `strict: true` + `noUncheckedIndexedAccess: true` 권장. AnalysisError exhaustive 강제하려면 `noFallthroughCasesInSwitch: true` 도

---

## 참조

- [plain.md Section 13 (테스트 전략)](../plain.md)
- [plain.md Section 17 (출시 전 체크리스트)](../plain.md)
- [Vitest Browser Mode](https://vitest.dev/guide/browser/)

---

## Handoff Notes

이 feature 는 **새로운 코드 작성 거의 없음** — 기존 코드의 테스트 보강 + 자가 검수. 그러나 **숨은 결함을 가장 많이 발견하는 시점**. 베타 (F11) 보다 먼저 발견하면 비용이 훨씬 저렴.

가장 중요한 것:
1. 그라운드 트루스 회귀 통과 (분석 정확도 보장)
2. 종료 모달 텍스트 정확 매치 + 증거 (검수 반려 차단)
3. ESLint 룰 통과 (Mat 누수 + 자체 백버튼 차단)

`docs/self-inspection.md` 에 ✅ 적당히 찍지 말 것. 각 항목에 evidence 첨부 → 베타/검수에서 신뢰도 ↑.

---

## 추가 (2026-05-02, Phase 1) — 현재 테스트 현황 + Phase 1 변경 영향

### 현재 카운트 (D11 기준 잠정)

```
Test Files  18 passed | 1 skipped (19)
Tests       117 passed | 1 skipped (118)
```

원 spec 의 카테고리 + Phase 1 추가 테스트 합쳐 117 통과. 1 skipped 는 베타 D13~17 시점에 활성화 예정 (regression test 의 placeholder).

### 폐기된 테스트 (Option A — 2026-05-01)

```
~~tests/recommendation/matrix.test.ts~~     — 추천 매트릭스 자체 폐기
~~tests/recommendation/messages.test.ts~~   — 추천 메시지 폐기
~~tests/telemetry/cf-workers-adapter.test.ts~~ — F09 ⑥ Console-only 결정으로 CF Workers 자체 폐기
```

원 spec 의 "recommendation/matrix.ts 커버리지 100%" 수용 기준 → **폐기**.

### Phase 1 추가 / 변경된 테스트

| 카테고리 | 변경 | 비고 |
|---|---|---|
| `tests/opencv/statistics.test.ts` | image-space (raw) 그대로 검증 — calibration 적용 X | measurement layer 의 pure 책임 유지 |
| `tests/opencv/pipeline.test.ts` | mock d50=720 → expect 720 × 2.8 = 2016 (sieve-equivalent) | calibration 적용 사실 자체 검증 |
| `tests/opencv/coin-detect.test.ts` | rim gradient 필터 mock 데이터 stripe 패턴 추가 | 실측 fixture 의 gradient 분포 모사 |
| `tests/opencv/coin-detect.test.ts` | grayOriginalMat 첫 번째 mock matInstance 로 추가 | rim gradient 가 unblurred gray 사용 |
| _신규_ | calibration.ts 단위 테스트 | TODO — Phase 2 sieve fixture 도착 후 ratio 검증 시점 |
| _신규_ | brewing-guide.ts 단위 테스트 | TODO — 4 카테고리 분류 경계값 검증 (현재 미작성) |

### 그라운드 트루스 회귀 테스트 — fixture 4종 검증

```ts
// tests/opencv/regression.test.ts (manifest 기반 동적 루프)
import manifest from '../../fixtures/manifest.json';

describe('Anchor regression', () => {
  for (const fx of manifest.fixtures.filter(f => f.kind === 'anchor')) {
    it(`${fx.file} → D50 ${fx.ground_truth_d50_um}±${fx.tolerance_um}μm`, async () => {
      const result = await runPipeline(loadFixture(fx.file), 'auto', new AbortController().signal);
      expect(Math.abs(result.stats.d50 - fx.ground_truth_d50_um)).toBeLessThan(fx.tolerance_um);
    });
  }
});
```

**현황**:
- `test-vs3-100.jpg`: ground_truth_d50_um=249, observed D50=697 (sieve-equivalent ×2.8) — **anchor 자체** (calibration 의 ground truth)
- `test-vs3-500.jpg`: 페어 일관성 검증 (vs3-100 과 |Δ|≤15%)
- `test-500-fine.jpg`: 클럼프 필터 검증 (54% 면적 → 강 경고)
- `test-vs3-multi.jpg`: multi_coin reject 검증

`tolerance_um` 은 calibration anchor 1점의 한계 반영 — Phase 2 sieve fixture 4종 도착 시 anchor 평균으로 ratio 재보정 + tolerance 좁힘.

### Histogram 시각화 테스트 (Phase 1 재설계)

`buildBins()` P95 초과 outlier 처리 변경:
- 이전: 마지막 bin 흡수 (우측 spike)
- 신규: P95 초과 제외 (자연스러운 우하향)

→ 단위 테스트 영향: histogram 자체 단위 테스트 부재 (smoke test 만). 시각 회귀는 manual QC 로 검증.

### 수용 기준 변경

| 원 기준 | 변경 후 |
|---|---|
| ~~recommendation/matrix.ts 커버리지 100%~~ | 폐기 |
| ~~CF Workers fallback 검증~~ | 폐기 (F09 ⑥ Console-only 결정) |
| 그라운드 트루스 회귀 5/5 통과 | 변경 — 4 fixture (vs3 페어 + puck + multi) 통과 + Phase 2 4종 sieve fixture 추가 후 8 통과 |
| `tsc --noEmit` 통과 | (그대로) |
| `npm run lint` 통과 | (그대로) — 0 errors / 4 warnings (pre-existing) |

### 폐기된 DRY 정리 항목

```diff
- 추천 매트릭스 룩업 코드가 한 곳에만 (matrix.ts)  ← 폐기 (Option A)
+ brewing-guide 4 카테고리 매핑이 한 곳에만 (brewing-guide.ts)
+ image→sieve calibration 이 한 곳에만 (calibration.ts)
```

### 신규 DRY 정리 항목 (Phase 1)

- [ ] Histogram 색상 토큰 동기화 (`histogram-impl.tsx` ↔ `index.css` ↔ DESIGN.md)
- [ ] `IMAGE_TO_SIEVE_RATIO` 상수가 calibration.ts 외부에서 직접 사용 X (모든 변환은 `applyImageToSieveCalibration()` 통과)
- [ ] coinHint 좌표 처리 (상대 0~1 vs 절대 px) 명확 분리 — store 는 상대, detectCoin 내부에서만 절대 변환
