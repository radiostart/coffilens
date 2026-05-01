# F00 Investigation — SDK Capability Check

**Date**: 2026-05-01
**Source**: `node_modules/@apps-in-toss/web-framework@2.4.7`
**Triggered by**: F00 D1 task (capability matrix Q1~Q5) → F09 분기 결정 입력

---

## SDK 분석 API capability check

### Q1. 분석/이벤트 트래킹 API 가 export 되어 있는가?

**✅ YES**

`@apps-in-toss/web-framework` 가 `@apps-in-toss/web-analytics` + `@apps-in-toss/web-bridge` 를 re-export.

두 가지 사용 경로:

```ts
// 1. 고수준 — 카테고리 helper
import { Analytics } from '@apps-in-toss/web-framework';
Analytics.screen({ log_name, ...params });
Analytics.impression({ log_name, ...params });
Analytics.click({ log_name, ...params });

// 2. 저수준 — eventLog 직접
import { eventLog } from '@apps-in-toss/web-framework';
eventLog({ log_name, log_type, params });
```

`eventLog` 의 `log_type` 은: `'debug' | 'info' | 'warn' | 'error' | 'event' | 'screen' | 'impression' | 'click' | 'popup'` (9개)

### Q2. 사용자 정의 이벤트명을 받는가?

**✅ YES** — `log_name: string` 자유 입력. 미리 정의된 카테고리 X.

### Q3. payload (key-value) 를 받는가?

**✅ YES** — `params: Record<string, Primitive>` 자유 형태. `Primitive = string | number | boolean | null | undefined | symbol`.

### Q4. WebView 환경에서 동작하는가?

**✅ YES (가정)** — 라이브러리명이 `web-framework` + 토스 미니앱은 WebView 기반. 정식 검증은 D2 토스 샌드박스 앱 실측 시 진행.

샌드박스 동작: docstring 명시 — _"샌드박스 환경에서는 콘솔에 로그가 출력되고, 실제 환경에서는 로그 시스템에 기록돼요."_ → `vite dev` 환경에선 console.log 로 보임.

### Q5. 데이터가 외부 추출 가능한가? (API/export/webhook)

**❓ 미확인 → ⑥ Console-only 가정 (보수적)**

위 docstring 은 "실제 환경에서는 로그 시스템에 기록" 이라고만 명시. 토스 콘솔에서 보이는지, BigQuery export 등 외부 통합이 있는지 SDK 코드만으로는 확인 불가.

**검증 필요 항목** (D2 또는 D10 시점):
- 토스 콘솔 (https://apps-in-toss.toss.im/) 에서 분석 데이터 대시보드 존재 여부
- Webhook / export API 문서 (https://developers-apps-in-toss.toss.im/)

확인 결과에 따라 ① Full (외부 추출 가능) 또는 ⑥ Console-only (수동 모니터링) 로 확정.

---

## 분류 결과

**⑥ Console-only** (보수적 가정, Q5 검증 후 ① 로 승급 가능)

### F09 분기 결정 (디자인 spec §1, §3 참조)

- 어댑터 선택: **TossAdapter** (eventLog 직접 사용)
- 폐기 코드: `cf-workers-adapter.ts`, `worker/index.ts` — D10 작업 시 작성하지 않음
- 신호 레벨: **E** (모든 이벤트 + 모든 payload 보존)
- plain.md 영향:
  - Section 4-7 외부 통신 사유 — **불요** (토스 SDK 만 사용)
  - F09 운영 절차 추가 — 매일/주 1회 토스 콘솔 수동 검사 (Q5 ⑥ 확정 시) 또는 자동 알람 (Q5 ① 승급 시)

### F09 TossAdapter 코드 변경 사항

기존 F09 spec 의 TossAdapter:
```ts
this.sdk.track(event.type, buildPayload(event));
```

실제 사용할 코드:
```ts
import { eventLog } from '@apps-in-toss/web-framework';

eventLog({
  log_name: event.type,           // 'measurement_attempt' / 'measurement_success' 등
  log_type: event.type === 'measurement_fail' || event.type === 'opencv_load_fail' ? 'error' : 'event',
  params: {
    deviceClass: detectDeviceClass(),
    sessionId,
    timestamp: new Date().toISOString(),
    ...eventSpecificFields,        // durationMs, confidence, coinType, failReason 등
  },
});
```

---

## SDK 컴포넌트 (nav-bar / exit-modal) 조사

### nav-bar 컴포넌트

`@apps-in-toss/web-framework` exports 에서 nav-bar 관련 컴포넌트 찾지 못함. SDK 는 native bridge + analytics 위주 — UI 컴포넌트 라이브러리 아님.

**TDS (Toss Design System)** 별도 패키지 가능 (create-ait-app `--tds` 옵션). 이번 스캐폴드는 미설치.

→ **F01 결정**: nav-bar 자체 구현 (DESIGN.md 토큰 사용). SDK 백버튼은 토스 WebView 가 자동 제공 (자체 구현 X).

### exit-modal 컴포넌트

마찬가지로 SDK exports 에 없음.

→ **F09 결정**: exit-modal 자체 구현. 텍스트만 토스 가이드 1:1 매치 (D10 검증).

### 추후 검토

- `--tds` 플래그로 재스캐폴드 시 TDS 컴포넌트 제공 여부 확인 (Phase 1 검토)
- TDS 가 nav-bar 컴포넌트 제공 시 자체 구현 → wrapper 로 마이그레이션

---

## 액션 아이템

- [x] F00-investigation.md 작성
- [ ] F01 구현 시 nav-bar 자체 구현 (DESIGN.md 토큰 사용, 좌측 백버튼 자체 추가 X)
- [ ] F09 spec 의 TossAdapter 코드 예시를 `eventLog` 호출 형태로 갱신 (별도 task)
- [ ] D10 또는 그 전 — 토스 콘솔 + 개발자센터 문서로 Q5 검증 → ⑥/① 확정
