# F00 — Project Setup & Toss Console

**Status**: 🟡 미시작
**Estimated effort**: 2 days (D0–D1)
**Dependencies**: 없음 (entry point)
**Blocks**: F01, F02, F03, F08
**plain.md 참조**: Section 1, 3, 4-1, 4-7, 8 (D0~D1)

---

## 목표

토스 콘솔 등록 + 그라운드 트루스 데이터셋 확보 + Vite/React/TS 스캐폴드 + SDK 2.x + 환경 검증. 이후 모든 feature 의 기반.

---

## 산출물

### 외부 액션 (D0)
- [ ] 토스 콘솔 가입
- [ ] 미니앱 등록, "커피렌즈" 이름 선점 확인
- [ ] 부제 (`동전 하나로 분쇄도 진단`) + 상세 설명 입력 (plain.md Section 2)
- [ ] 토스 API 키 발급 → `.env` (gitignore)
- [ ] **Anchor fixture 준비** (디자인 spec [docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md](../docs/superpowers/specs/2026-05-01-f00-fixture-strategy-design.md) §3 참조):
  - 보유 체 mesh 페어 확인 → anchor μm 값 계산 (예: 600/850 → 725, 500/710 → 605)
  - 분쇄물을 mesh 페어로 분급 → 두 mesh 사이 fraction 만 회수 (~10g)
  - 흰 A4 또는 흰 접시 위에 평평하게 깔고 500원 동전과 함께 촬영
  - `fixtures/grind-anchor-{NNN}.jpg` 저장 (NNN = 계산된 midpoint μm)
  - `fixtures/manifest.json` 작성 (스키마는 디자인 spec §3.4 참조)
- Reject fixture (no-coin/two-coins/partial-coin/cup-edge) 는 **F00 에서 촬영하지 않음** — F04 에서 anchor 로부터 합성으로 생성

### 신규 파일 (D1)
- `package.json` — `@apps-in-toss/web-framework` (SDK 2.x), react, vite, typescript, zustand, recharts, wouter, vitest, @testing-library/react
- `vite.config.ts` — Toss appName + brand
- `tsconfig.json` — strict
- `.gitignore` — `node_modules/`, `dist/`, `.env`, `*.log`
- `.env.example` — `TOSS_API_KEY=` 빈값 (실제 키는 .env)
- `src/main.tsx` — entry
- `src/App.tsx` — 빈 라우터 골격

### vite.config.ts
```ts
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'coffilens',
  brand: {
    displayName: '커피렌즈',
    primaryColor: '#6B4423', // D2에 확정 가능
  },
});
```

---

## 구현 디테일

### D1 작업 순서
1. `npx create-ait-app coffilens` 또는 수동 Vite 셋업
2. SDK 2.x 설치: `npm i @apps-in-toss/web-framework`
3. 의존성 추가: `npm i react wouter zustand recharts`
4. dev 의존성: `npm i -D vitest @testing-library/react @testing-library/user-event @types/react`
5. `vite.config.ts` 위 형태로 작성
6. **샌드박스 카메라 권한 검증 (iOS + AOS)** — 빈 페이지 + `getUserMedia({ video: true })` 호출만
7. **토스 SDK 분석 API capability check matrix** (F09 분기 결정에 사용):

   `@apps-in-toss/web-framework` exports + 토스 샌드박스 실측으로 다음 5개 질문 답:

   - **Q1.** 분석/이벤트 트래킹 API 가 export 되어 있는가?
     - 없음 → ⑤ None
     - 있음 → Q2
   - **Q2.** 사용자 정의 이벤트명을 받는가? (vs 미리 정의된 카테고리)
     - 사용자 정의 OK → Q3
     - 미리 정의된 것만 (purchase/screen_view 등) → ③ Predefined
     - 크래시 리포팅만 → ④ Crash-only
   - **Q3.** payload (key-value) 를 받는가?
     - 받음 → Q4
     - 받지 않음 (이벤트명만) → ② Limited
   - **Q4.** WebView 환경에서 동작하는가? (샌드박스 실측)
     - 동작 → Q5
     - 네이티브 SDK 만 → ⑦ Native-only
   - **Q5.** 데이터가 외부 추출 가능한가? (API/export/webhook)
     - 가능 → ① Full
     - 토스 콘솔에서만 보임 → ⑥ Console-only

   결과 7개 중 하나로 분류 → F09 가 자동 분기 (F09 spec 머리 참조).

8. **토스 SDK 내장 nav-bar/exit-modal 컴포넌트 조사**:
   - 자체 구현 vs SDK 활용 결정 → F01 에 영향

### 조사 결과 기록
- `features/F00-investigation.md` (필수) 에 다음 기록:
  - SDK 분석 API Q1~Q5 답 + 분류 결과 (① ~ ⑦) + 근거 (코드/문서 캡처 또는 인용)
  - SDK nav-bar/exit-modal 컴포넌트 존재 여부 + 사용 결정
  → F01 (nav-bar 분기), F09 (텔레메트리 어댑터 분기) 가 참조

---

## 수용 기준

- [ ] 토스 콘솔에 미니앱 등록 완료, "커피렌즈" 이름 사용 가능
- [ ] `.env` 에 API 키 존재, `.gitignore` 등록 확인
- [ ] `npm run dev` 정상 실행
- [ ] 샌드박스 앱(iOS + AOS)에서 카메라 권한 요청 동작 확인
- [ ] SDK 분석 API capability matrix Q1~Q5 답 완료 + 7개 분류 중 하나로 분류
- [ ] `features/F00-investigation.md` 작성 (분류 결과 + 근거)
- [ ] SDK 컴포넌트 (nav-bar, exit-modal) 사용 가능 여부 결정
- [ ] `fixtures/grind-anchor-{NNN}.jpg` 존재 (NNN 은 보유 체 mesh 페어 midpoint, 예: 725)
- [ ] `fixtures/manifest.json` 존재, 스키마: `version`, `fixtures[]` (각 entry: `file`, `kind: "anchor"`, `ground_truth_d50_um`, `tolerance_um`, `source`, `shooting{}`)
- [ ] `manifest.json` 의 `ground_truth_d50_um` 이 실제 사용한 mesh 페어 midpoint 와 일치

---

## 테스트

D0~D1 단계에서는 코드 테스트 없음. 환경 검증만.

---

## 검수 영향

- plain.md Section 4-1: 인트로 화면 (브릿지뷰) — F01 에서 다룸, F00 은 사전 등록만
- plain.md Section 4-6: 카메라 권한 — D1에 양 OS 검증
- plain.md Section 4-7: 외부 통신 사유 (텔레메트리 추가 시) — F09 에서 다룸

---

## 위험 / 함정

- ⚠️ **API 키 노출**: `.env` 가 `.gitignore` 에 있는지 첫 커밋 전 반드시 확인
- ⚠️ **이름 선점 실패**: "커피렌즈" 가 이미 사용 중이면 F01~F11 전체에 브랜딩 영향. 백업 이름 1~2개 미리 준비
- ⚠️ **Android 카메라 권한**: WebView에서 별도 처리 필요할 수 있음. 안 되면 F03 `lib/permissions.ts` 가 양 OS 추상화 책임
- ⚠️ **SDK 1.x 잘못 설치**: `npm i @apps-in-toss/web-framework@^2` 로 메이저 버전 명시. 2026-03-23 이후 1.x 콘솔 업로드 차단

---

## 참조

- [plain.md Section 1, 3, 4](../plain.md)
- [앱인토스 개발자센터](https://developers-apps-in-toss.toss.im/)
- [WebView 튜토리얼](https://developers-apps-in-toss.toss.im/tutorials/webview.html)

---

## Handoff Notes

이 feature는 **외부 액션 + 환경 셋업** 위주. 코드 산출물은 최소 (스캐폴드 골격만). 핵심 산출물은 다음 두 가지:
1. 토스 콘솔 등록된 미니앱 + API 키
2. **anchor fixture 1장 + manifest.json** (알고리즘 절대 정확도 회귀 잠금)

**Fixture 전략 핵심**: anchor 1장이 알고리즘의 D50 절대 정확도를 보장. 단조성 / 다른 그라인더 / 다른 폰 검증은 **베타 D13~17 이후 자연 추가** (Phase 1). 디자인 결정 근거는 디자인 spec 참조.

**보유 체 mesh 확인**: D0 시작 직후 보유 체 mesh 사이즈를 확인하고 anchor μm 값을 그에 맞게 결정. mesh 가 600/850 이면 anchor=725μm, 500/710 이면 anchor=605μm 식. manifest 의 `ground_truth_d50_um` 과 파일명 (`grind-anchor-{NNN}.jpg`) 둘 다 그 값으로.

Reject 검증은 F04 의 합성 fixture + 단위 테스트가 담당. F00 책임 아님.

D1 의 SDK 조사 결과는 F01 (nav-bar 컴포넌트 선택), F09 (텔레메트리 어댑터 선택) 에 직결. 결과를 명확히 기록해서 다음 feature 가 분기 결정 가능하도록.
