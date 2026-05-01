# Toss Inspection Evidence

> 토스 비게임 미니앱 검수 대비 — 가이드 매치 증거 + 검증 절차 기록.
> Sweep Issue 27 적용: F09 가 inspection-evidence.md owner.

---

## 종료 모달 텍스트 매칭 (plain.md Section 4-3)

| 항목 | 우리 구현 | 토스 가이드 | 일치 |
|---|---|---|---|
| 제목 | "커피렌즈를 종료할까요?" | (D10 시점 가이드 페이지에서 확인) | _D10 검증 후 갱신_ |
| 취소 버튼 | "취소" | _-_ | _D10_ |
| 종료 버튼 | "종료하기" | _-_ | _D10_ |

**검증 절차** (D10):
1. https://developers-apps-in-toss.toss.im/checklist/app-nongame.html 접속
2. "종료 동작" 섹션 텍스트 캡처 → `docs/screenshots/exit-modal-guide-{date}.png` 저장
3. 우리 구현 (`src/components/exit-modal.tsx` `EXIT_MODAL_TEXT`) 와 1:1 매치 확인
4. 매치 안 되면 spec 갱신 + 캡처 갱신
5. 가이드 캡처 + 코드 비교 스크린샷을 이 문서에 첨부

---

## 자가 검수 체크리스트 (plain.md Section 4)

### 4-1. 인트로 화면 (브릿지뷰)
- [x] 앱 진입 시 앱 이름 + 로고 + 대표 색상 노출 — `routes/intro.tsx`
- [x] 인트로에서 즉시 토스 로그인 유도 X — 1.5s 후 /home 자동 이동
- [x] Basic / Inverted 스타일 — 커피 톤 cream 배경 (Basic 권장)

### 4-2. 내비게이션 바 (비게임 표준)
- [x] 좌측 뒤로가기: 토스 WebView 자동 제공 — 자체 추가 X (`nav-bar.tsx` 좌측 빈 영역 유지)
- [x] 중앙: 브랜드 로고 + 미니앱 이름 — `BrandIcon` + `<span>{title}</span>`
- [x] 우측 액션 버튼 — 최대 1개 (`rightAction` prop)
- [x] **자체 백버튼 ESLint 룰 차단** — `local/no-custom-back-button` (history.back / "뒤로" 텍스트 검출)

### 4-3. 종료 동작
- [x] 종료 모달 placeholder 구현 — `components/exit-modal.tsx`
- [ ] **D10 시점 토스 가이드와 텍스트 1:1 매치 검증** (위 표 참조)
- [ ] AOS 시스템 백버튼 종료 동작 검증 — 실 기기 테스트 (D11~)

### 4-4. UX 제약
- [x] 진입 즉시 바텀시트 자동 오픈 X
- [x] 자사 서비스/앱 설치 유도 링크 0개
- [x] 모든 화면에서 미니앱 종료 경로 존재

### 4-5. 광고 (Phase 2 미적용)
- N/A (현 Phase 0)

### 4-6. 카메라 권한
- [x] 권한 거부 시 안내 화면 — `components/permission-denied-screen.tsx`
- [x] iOS/AOS 분기 (UA 검출)
- [ ] 실 기기 검증 (D11~)

### 4-7. 외부 통신 사유
- [x] 토스 SDK 분석 API (eventLog) 사용 — 외부 통신 사유 별도 명시 **불요**
- D1 분류: ⑥ Console-only (`features/F00-investigation.md`)
- CF Workers 폐기 — 외부 도메인 호출 없음

---

## 텔레메트리 이벤트 명세 (D10 검수 콘솔 등록 시 참조)

수집 이벤트:
| event | log_type | params |
|---|---|---|
| `app_open` | screen | deviceClass, sessionId, timestamp |
| `measurement_attempt` | event | toolKind |
| `measurement_success` | event | durationMs, confidence, coinType |
| `measurement_fail` | error | failReason (no_coin / multi_coin / blur 등), durationMs |
| `opencv_load_fail` | error | cause (network / cors / timeout) |

수집 안 하는 정보 (영구):
- 이미지 자체
- 위치 정보
- 식별 가능한 사용자 ID (sessionId 는 매 진입 새로 생성)

---

## 운영 절차 (⑥ Console-only)

D1 분류 ⑥ — 데이터가 토스 콘솔에서만 보임. 자동 알람 자동화 X.

**주 1회 (또는 알람 임계 초과 의심 시)**:
1. 토스 콘솔 (https://apps-in-toss.toss.im/) 로그인
2. 분석 대시보드 → 커피렌즈 미니앱 선택
3. 카운트 확인:
   - 측정 성공률: success / (success + fail) ≥ 70%
   - OpenCV 로드 실패율: opencv_load_fail / app_open ≤ 5%
   - 평균 분석시간 (durationMs): ≤ 8000ms
4. 임계 위반 시 → 이슈 트래킹 + Phase 1 자동 알람 검토

---

## 변경 이력

- `2026-05-01`: 초기 작성 (D9 시점). 종료 모달 가이드 매칭은 D10 검증 시 갱신.
