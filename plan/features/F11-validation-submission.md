# F11 — Validation, Beta & Submission

**Status**: 🟡 미시작
**Estimated effort**: 7 days (D12–D18)
**Dependencies**: F10 (자가 검수 통과)
**Blocks**: 없음 (출시)
**plain.md 참조**: Section 8 (D12~D18), Section 16 (배포·롤아웃 체크리스트), Section 17 (출시 전 체크리스트)

---

## 목표

실기기 검증 → **베타 5명 5일 사용** → 피드백 반영 → 검수 제출. 검수 반려 시 대응까지.

---

## 산출물

### 신규/수정 문서
- `docs/beta-feedback.md` — 베타 사용자 피드백 정리
- `docs/algorithm-tuning-v2.md` (선택) — 베타 결과 기반 알고리즘 재튜닝
- `docs/inspection-submission.md` — 검수 제출 시 콘솔에 입력한 내용 + 일시
- `tests/opencv/*` 보강 — 베타에서 발견된 케이스를 fixture 로 추가

---

## 구현 디테일

### D12 — 실기기 테스트
**iOS + AOS 각 1대 이상** (본인 + 가족/지인). 다음 시나리오:

#### 핵심 플로우
- [ ] 인트로 → 홈 → 도구 → 가이드 → 카메라 → 분석 → 결과 → 저장 → 홈 (정상 케이스)
- [ ] 측정 기록 5건 누적 후 홈 화면 진입 (가상 스크롤 동작)
- [ ] 분석 중 취소 → 홈 복귀 (AbortSignal)
- [ ] 종료 모달 → 종료하기 (정상)
- [ ] 종료 모달 → 취소 (홈 유지)

#### 에러 플로우
- [ ] 동전 없이 촬영 → no_coin reject + 재촬영 가이드
- [ ] 동전 2개 → multi_coin reject
- [ ] 카메라 권한 거부 → PermissionDeniedScreen + 설정 진입 안내
- [ ] OpenCV.js 다운로드 실패 시뮬레이션 (네트워크 차단) → 재시도 버튼
- [ ] 100건+ 측정 → 쿼터 정리 자동 동작 + 안내

#### 검수 항목
- [ ] nav-bar 백버튼 정상 (자체 버튼 0개)
- [ ] 종료 모달 텍스트 1:1 매치
- [ ] AOS 시스템 백버튼 동작
- [ ] 외부 링크 0개

### D13–D17 — 베타 5명 5일

#### 베타 모집 기준 (plain.md Section 8 베타 체크리스트)
- iOS 사용자 ≥ 2명
- Android 사용자 ≥ 2명
- 저사양 기기 ≥ 1대 (3년 이상 경과 폰)
- 모두 만 19세 이상 (앱인토스 연령 제약)

#### 베타 안내문 템플릿
```
안녕하세요, 커피렌즈 베타테스터님.

5일 동안 자유롭게 사용해주시고, 다음 항목 위주로 피드백 부탁드립니다:

1. 측정 결과가 본인 그라인더 다이얼 변화와 일관되는지
2. 분석 시간 (분석 중 화면이 답답한지)
3. 에러 메시지가 명확한지 (어떻게 해야 할지 알겠는지)
4. 종료/뒤로가기 동작이 자연스러운지
5. 결과 화면의 신뢰도 점수가 납득되는지

피드백은 카톡으로 자유롭게 주세요. 스크린샷 환영.
```

#### 피드백 수집 템플릿 (`docs/beta-feedback.md`)
```markdown
# Beta Feedback (D13~17)

## 베타 사용자
- B1: iOS 17, iPhone 14 Pro
- B2: iOS 16, iPhone 12
- B3: Android 14, Galaxy S23
- B4: Android 13, Galaxy A33 (저사양)
- B5: iOS 15, iPhone SE 2 (저사양)

## 측정 일관성
- B1: Varia 다이얼 5단계 모두 측정. D50 단조 증가 확인 ✅
- B2: 같은 다이얼 3회 측정 → ±80μm 변동 (허용 범위)
- ...

## 분석 시간 (디바이스별)
- B1 (high): 평균 2.8s ✅
- B4 (low): 평균 6.2s ⚠️ (8s 임계 미만이지만 답답함 호소)
- B5 (low): 9.5s ❌ (취소 누름 → UX 개선 필요)

## 에러 메시지 명확성
- B3: "동전이 보이지 않아요" 명확 ✅
- B5: "흔들렸어요" 메시지 보고 폰 고정 → 성공 (좋음)
- B2: low_brightness reject 시 후레쉬 권유 못 봄 (UI 위치 개선)

## 발견된 버그
- [BUG-1] B4: IndexedDB 쿼터 초과 안내 토스트 안 뜸 (조용히 정리됨)
- [BUG-2] B1: 인트로에서 1.5초 후 자동 홈 이동인데 즉시 홈 누르면 중복 navigate
- ...

## 알고리즘 이슈
- [ALG-1] B2 의 수동 그라인더(Comandante) 분쇄도 D50 700μm → V60 적정 진단인데 본인 체감은 너무 곱음. 등가 직경 가정 한계
```

### 피드백 반영
- BUG-1, BUG-2 등 버그 수정 (D17 안에)
- ALG-1 같은 알고리즘 이슈는 ALGORITHM_NOTES 에 기록 + Phase 1 개선 항목으로

### D18 — 검수 제출

#### 토스 콘솔 입력 (docs/inspection-submission.md 에 기록)
- 부제: `동전 하나로 분쇄도 진단`
- 상세 설명: plain.md Section 2 텍스트 그대로
- 아이콘 (D2 확정 + 디자인)
- **카메라 권한 사유 문구**: "분쇄한 원두와 동전을 촬영하여 분쇄도를 분석하기 위해 카메라 권한이 필요합니다."
- **외부 통신 사유** (CF Workers 사용 시): "익명 사용 통계 수집 (개인정보 미수집, 측정 성공률 + 실패 사유 + 디바이스 클래스만)"

#### 제출 직전 최종 체크
- [ ] `npm test` 통과
- [ ] `npm run lint` 통과
- [ ] `tsc --noEmit` 통과
- [ ] 베타 피드백 모두 처리 (반영 또는 의식적 보류)
- [ ] `docs/self-inspection.md` 100% ✅
- [ ] `docs/inspection-evidence.md` 최신
- [ ] git commit + tag `v1.0.0-rc1`

---

## 수용 기준

### D12 (실기기)
- [ ] iOS + AOS 각 1대 이상에서 핵심 + 에러 플로우 모두 통과
- [ ] 종료 모달 텍스트 1:1 매치 시각 확인

### D13~17 (베타)
- [ ] 베타 5명 모두 최소 3회 측정 사용
- [ ] 발견된 P0/P1 버그 모두 수정 (P2/P3 는 Phase 1 백로그)
- [ ] `docs/beta-feedback.md` 작성 완료

### D18 (검수)
- [ ] 토스 콘솔에 미니앱 검수 요청 제출
- [ ] `docs/inspection-submission.md` 작성

### +α (반려 대응)
- [ ] 반려 사유별 대응 PR 작성 + 재제출
- [ ] 평균 1~2회 반려 예상, 회당 5~10일

---

## 테스트

이 feature 는 **사람 손 검증 위주**. 자동 테스트는 F10 에서 완료.

### 베타에서 발견된 회귀 케이스 → fixture 추가
- 예: B5 가 어두운 조건에서 측정 → fixture/dark-low-light.jpg 추가 → 회귀 테스트 보강

### 부하 테스트
- 100건 측정 후 메모리 누수 확인 (Chrome DevTools Memory profiler)
- WebView 메모리 피크 확인 (저사양 기기)

---

## 검수 영향

이 feature 가 **검수 통과 책임**. 모든 plain.md Section 4 검수 항목이 충족되었는지 최종 확인.

검수 반려 시:
- 토스 검수팀 메시지 → 사유 분석 → 해당 항목 수정 → 재제출
- 자주 반려되는 사유 우선 점검:
  - 자체 백버튼 (F01 ESLint 룰로 차단해도 visual 점검 필요)
  - 종료 모달 텍스트 (F09 정확 매치 검증해도 가이드 변경 가능)
  - 외부 링크 (Phase 0 에는 0개여야 함)
  - 카메라 권한 거부 시 사용자 안내

---

## 위험 / 함정

- ⚠️ **베타 5명 모집 어려움**: D13 시작 전에 미리 섭외. 카톡/지인. 응답 안 하면 D14~16 으로 연장
- ⚠️ **저사양 기기 부재**: 본인 폰 외에 1대 더 필요. 가족/지인의 옛 폰 활용
- ⚠️ **검수 반려 사유 불명확**: 토스 검수팀 답변이 추상적일 수 있음. 개발자 커뮤니티 [techchat-apps-in-toss.toss.im](https://techchat-apps-in-toss.toss.im/) 에서 유사 사례 검색
- ⚠️ **반려 사이클 5~10일 × 1~2회 = 10~20일 추가**: 출시 목표일 역산 시 +14일 여유 권장 (plain.md 명시)
- ⚠️ **알고리즘 큰 변경**: 베타에서 정확도 큰 결함 발견 시 (ALG-1 같이) → Phase 1 개선으로 미루고 디스클레이머 강화 (출시 지연 vs 한계 명시)
- ⚠️ **Kill switch 셋업 권장**: 검수 통과 직후 치명 버그 발견 시 즉시 차단 가능 (plain.md Section 16). CF Workers 무료 티어로 가능

---

## 참조

- [plain.md Section 8 (D12~D18)](../plain.md)
- [plain.md Section 16 (배포·롤아웃)](../plain.md)
- [plain.md Section 17 (출시 전 체크리스트)](../plain.md)
- [개발자 커뮤니티](https://techchat-apps-in-toss.toss.im/)

---

## Handoff Notes

코드 작성 거의 없음. **사람 검증 + 문서화 + 검수 대응** 위주. 솔로 개발자에게는 가장 외로운 단계 — 베타 피드백 받고 혼자 우선순위 결정.

**P0/P1 버그만 D17 안에 수정**. P2/P3 는 Phase 1 백로그. "완벽주의" 빠지면 출시 무한 지연.

검수 반려는 거의 확정 (1~2회). 자책 금지. 반려 사유를 학습 자료로 → ALGORITHM_NOTES 또는 별도 `docs/inspection-lessons.md` 에 기록 → Phase 1 또는 다음 미니앱 자산.

출시 후 Phase 1 진입은 **CEO 리뷰 + 엔지니어링 리뷰 다시** 권장. plan-ceo-review + plan-eng-review 사이클 재실행.

---

## 추가 (2026-05-02, Phase 1) — Calibration anchor 1점 한계 + Phase 2 TODO

### 측정 정확도의 알려진 한계

D9~D12 fixture QC 결과로 도입된 image→sieve calibration layer 가 anchor **1 점** (Varia VS3 + Hyperhoba @ 11.5, V60 grind, sieve target ~700μm) 만으로 보정. 즉:

- **D50 영역** (~700μm sieve): anchor 자체라 정확
- **D10 / D90 영역**: anchor 와 다른 grind range → **±10~20% 오차 가능**
- **espresso (300μm 이하) / coarse (1200μm 이상)**: anchor 와 거리 멀어 정확도 검증 부족

**4 카테고리 brewing guide** 분류는 임계값 폭 (~150μm sieve) 이 calibration 오차보다 커서 안전마진 있지만, D10/D90 절대값 표시는 사용자에게 불완전한 정보. 디스클레이머 ("측정값은 상대 비교용") 가 이 한계 커버.

### Phase 2 우선순위 — sieve 분급된 ground-truth fixture 4종

원 spec 의 베타 D13~17 자연 추가 항목에 **명시 추가**:

| 카테고리 | sieve mesh | 기대 image D50 (raw) | tolerance | 우선순위 |
|---|---|---|---|---|
| 에스프레소 | 200~400μm | ~110μm | ±50 | P1 |
| 모카포트 | 400~600μm | ~180μm | ±50 | P2 |
| 핸드드립 | 600~800μm | ~250μm (anchor 자체) | ±60 | (이미 있음) |
| 프렌치프레스 | 1000~1200μm | ~390μm | ±80 | P1 |

**작업 흐름**:
1. 사용자가 Kruve sifter 로 분급 + 동일 동전 (500원 권장) 으로 촬영
2. `fixtures/manifest.json` 의 `ground_truth_d50_um_sieve` 슬롯 채움
3. `tune-pipeline.ts` 로 image D50 측정
4. anchor 4점 평균으로 `IMAGE_TO_SIEVE_RATIO` 재보정 (현재 2.8 → ?)
5. `tests/opencv/regression.test.ts` 에 4종 anchor 추가 + tolerance 좁힘

상세 가이드는 [F02 추가 섹션 — coin-locate](F02-home-routing.md) 의 "sieve fixture 직접 촬영" 참조.

### 베타 D13~17 모니터링 항목 — Phase 1 추가

원 spec 의 피드백 수집 템플릿에 추가 질문:

```markdown
## 분쇄도 측정 정확도 (Phase 1 추가)
- 표시된 분쇄도 (μm) 이 실제 분쇄와 비슷한가?
  - 본인이 사용한 그라인더/setting:
  - 표시된 D50:
  - 외부 reference (그라인더 매뉴얼) 비교:
- 추출 가이드 (에스프레소/모카포트/핸드드립/프렌치프레스) 가 본인 의도와 맞는가?
- 같은 분쇄를 여러 번 측정 시 D50 일관성 (±N% 이내?)
- coinType 100 vs 500 페어 일관성 (같은 분쇄, 다른 동전 → ±15% 이내?)
```

**Telemetry 모니터링** (F09 ⑥ Console-only 운영절차):
- `measurement_success` 의 D50 분포 — outlier 빈도 (예: <50μm 또는 >2000μm sieve-equiv 가 5% 초과 시 algorithm 회귀 의심)
- `coinType` (100 vs 500) 분포 — 페어 일관성 검증 (벌크 분포 비교)

### 검수 영향 — 외부 통신 항목 단순화

원 spec 의 "텔레메트리 외부 통신 사유" 검수 항목 → F09 ⑥ Console-only 결정으로 **불요**. CF Workers 폐기 = 외부 도메인 의존 0. OpenCV.js 도 vendored (F03 추가 섹션) 라 자가 호스트만.

`docs/inspection-submission.md` 의 외부 통신 사유 섹션 단순화:
- ~~Cloudflare Workers~~ — 폐기
- ~~OpenCV.js CDN~~ — 폐기 (vendored)
- 토스 SDK 분석 API — 내부 SDK, 검수 항목 X

### Kill switch 검토 — Phase 2

원 spec 의 "Kill switch 셋업 권장" 항목 → F09 ⑥ Console-only 결정으로 CF Workers 폐기 → kill switch 인프라 없음. 대안:
- 토스 SDK 의 remote config (있으면) 사용
- 또는 `package.json` 의 `version` 비교로 클라이언트 자체 disable 로직
- 결정은 베타 후속 작업 (Phase 2)

### 폐기된 수용 기준

| 원 기준 | 변경 후 |
|---|---|
| `docs/beta-feedback.md` 작성 완료 | (그대로) — 위 Phase 1 추가 질문 포함 |
| `docs/inspection-submission.md` 작성 | (그대로) — 단 외부 통신 사유 단순화 |
| ~~CF Workers 텔레메트리 검수 통과~~ | 폐기 (F09 ⑥ Console-only) |
| Kill switch 셋업 | Phase 2 보류 (인프라 없음) |

## 추가 (2026-05-02 revision) — 4-anchor 검증 결과 + 핸드드립 우선 정책

### 4-anchor 검증 (Varia VS3 sieve fixture)

사용자 제공 4 fixture 측정 결과 (`fixtures/manifest.json` `calibration_2026_05_02_revision_pour_over_anchor`):

| Setting | 사용자 의도 | image D50 | sieve (×3.3) | predicted | match |
|---------|-------------|-----------|--------------|-----------|-------|
| 5.1 | 에스프레소 (끝자락) | 313 | 1033 | 거침 | ❌ |
| 9 | 모카포트 | 302 | 996 | 거침 | ❌ |
| **11** | **핸드드립** | **198** | **653** | **중간** | **✓ (anchor)** |
| 13 | 프렌치프레스 | 200 | 660 | 중간 | ❌ (boundary 케이스) |

**핵심 발견**: image D50 가 사용자 의도와 monotonic 하지 않음. 원인 = mmPerPixel (camera distance) 에 따른 sub-pixel particle 검출 한계. 단일 ratio 로 4-anchor 모두 정확 보정 불가능 (ratio: 5.1=1.21 → 13=4.50, 4배 차이).

### 정책 변경 4가지 (사용자 결정 — 핸드드립 우선)

1. **CLUMP filter** — D50×4 multiplier 폐지, 절대 cap 2000μm. 양성 피드백 루프 제거.
2. **IMAGE_TO_SIEVE_RATIO** — 2.8 → **3.3** (Setting 11 V60 pour-over anchor).
3. **brewing-guide** — 4 카테고리 → **3 카테고리** (미세/중간/거침). 측정 ±200μm 편향 흡수.
4. **measurement confidence** — mmPerPixel 기반 high/medium/low 라벨. UX caveat 로 "더 가까이 촬영" 안내.

### 베타 검증 질문 — 추가

기존 검증 질문 외 4-anchor 결과 기반 추가 항목:

| 질문 | 목적 |
|------|------|
| 분쇄도 라벨 ("미세"/"중간"/"거침") 가 본인 분쇄와 직관적으로 일치하는가? | 3-카테고리 적정성 |
| 카테고리가 본인 분쇄와 다를 때, "측정 정확도 낮음" caveat 가 있었는가? | confidence 표시 동작 |
| caveat ("동전이 화면 30% 이상 차지하도록") 가 행동 변화 (재촬영) 로 이어졌는가? | UX 효과 |
| "중간" 카테고리 (핸드드립) 가 본인 핸드드립 분쇄와 일치했는가? | primary anchor 정확도 검증 |

### Phase 2 TODO (수정)

기존 TODO 외:
- mmPerPixel-aware 적응형 ratio (선형 회귀: ratio = a + b*mmPerPx)
- Sub-pixel 입자 추정 (fine grind 측정 한계 극복)
- Phase 1 mismatch fixture 재촬영 (5.1, 9, 13 의 mmPerPx ≤ 0.05 도달 시 분류 정확도 재검증)
- ground-truth sieve 분급 fixture 제작 (≤500/500-1000/>1000μm)
