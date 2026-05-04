# F09 — Telemetry + Permission UX + Review Polish

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D10)
**Dependencies**: F00 D1 SDK 조사 결과, F03 (permissions), F08 (저장 시 이벤트), F06 (실패 시 이벤트)
**Blocks**: F10
**plain.md 참조**: Section 4-3 (종료 모달 정확 매치), Section 4-6/4-7 (카메라 권한, 외부 통신 사유), Section 12 (telemetry/), Section 15 (텔레메트리 전략)

---

## 목표

텔레메트리 (토스 SDK 우선, CF Workers fallback) + 카메라 권한 거부 UX 마무리 + **종료 모달 텍스트 토스 가이드 정확 매치 검증** + 자가 검수 체크리스트 1차 통과.

---

## D1 결과별 분기 결정 트리 ★

D10 진입 전 `features/F00-investigation.md` 의 SDK 분류 결과 (① ~ ⑦) 를 확인. F09 는 분류에 따라 자동 분기:

| D1 분류 | 의미 | 어댑터 선택 | 폐기 코드 | 신호 레벨 | plain.md 영향 |
|---|---|---|---|---|---|
| ① Full | 사용자 정의 이벤트 + payload + WebView OK + 외부 추출 가능 | TossAdapter | `cf-workers-adapter.ts`, `worker/index.ts` | E (모든 알람) | 없음 |
| ② Limited | 이벤트명만 (payload X) | TossAdapter (이벤트명 분해 트릭, 하단 참조) | `cf-workers-adapter.ts`, `worker/index.ts` | C (알람 #3 손실) | Section 15 알람 #3 (평균 분석시간) 제거 |
| ③ Predefined | 미리 정의된 카테고리만 (purchase/screen_view 등) | CloudflareWorkersAdapter | `toss-adapter.ts` | E | Section 4-7 외부 통신 사유 명시 |
| ④ Crash-only | 크래시 리포팅만 | CloudflareWorkersAdapter | `toss-adapter.ts` | E | Section 4-7 외부 통신 사유 명시 |
| ⑤ None | 분석 API 자체 없음 | CloudflareWorkersAdapter | `toss-adapter.ts` | E | Section 4-7 외부 통신 사유 명시 |
| ⑥ Console-only | SDK Full 이지만 데이터가 토스 콘솔에서만 보임 | TossAdapter + 운영 절차 | `cf-workers-adapter.ts`, `worker/index.ts` | E (자동 알람 X) | F09 운영 절차 추가 (매일 콘솔 수동 검사) |
| ⑦ Native-only | 분석 API 가 WebView 미지원 | CloudflareWorkersAdapter | `toss-adapter.ts` | E | Section 4-7 외부 통신 사유 명시 |

**원칙**: 어댑터 1개만 production. 양쪽 dual-write 안 함.

### ② Limited 의 이벤트명 분해 트릭

`measurement_fail` 이벤트의 `failReason` payload 를 보존할 수 없으므로 5개 이벤트 이름으로 분해:

```ts
// 원래
tel.track({ type: 'measurement_fail', failReason: 'no_coin', durationMs: 3200 });

// ② 분해 트릭
sdk.track('measurement_fail_no_coin');
// (durationMs 손실 — Level C 가 허용)
```

5개 이벤트: `measurement_fail_no_coin`, `measurement_fail_multi_coin`, `measurement_fail_partial_coin`, `measurement_fail_blur`, `measurement_fail_low_brightness` (+ `measurement_fail_other` 안전망).

### ⑥ Console-only 의 운영 절차

자동 알람 자동화 불가 → 매일 (또는 주 1회) 토스 콘솔 로그인 → 카운트 확인 → 임계 위반 시 수동 대응. `docs/inspection-evidence.md` 또는 별도 운영 메모에 절차 기록. 솔로 운영자 burden 큼 → 발생 시 Phase 1 에 자동화 또는 dual-write 재검토.

---

## 산출물

### 신규 파일
- `src/telemetry/client.ts` — interface + factory
- `src/telemetry/toss-adapter.ts` — SDK 분석 API 어댑터 (D1 결과에 따라)
- `src/telemetry/cf-workers-adapter.ts` — Cloudflare Workers fallback
- `src/telemetry/events.ts` — `TelemetryEvent` 타입 정의
- `src/components/permission-denied-screen.tsx` — 카메라 권한 거부 화면 (설정 진입 안내)
- `tests/telemetry/cf-workers-adapter.test.ts` — fetch mock

### 수정 파일
- `src/components/exit-modal.tsx` — **텍스트 토스 가이드와 정확 매치** ★
- `src/stores/measurement.store.ts` — 측정 시도/성공/실패 시 텔레메트리 호출
- `src/routes/analyzing.tsx` — 실패 시 telemetry track
- `src/routes/result.tsx` — 저장 시 telemetry track

### Cloudflare Workers (별도 배포, 코드는 `worker/index.ts` 또는 README)
- 단순 ingest 엔드포인트 (POST /track)
- KV 에 일자별 카운터 누적
- CORS 허용 (Toss WebView origin)

---

## 구현 디테일

### telemetry/events.ts
```ts
export type DeviceClass = 'ios_high' | 'ios_low' | 'android_high' | 'android_low' | 'unknown';

export type TelemetryEvent =
  | { type: 'measurement_attempt'; coinType: '100' | '500' }
  | { type: 'measurement_success'; durationMs: number; confidence: number; coinType: '100' | '500' }
  | { type: 'measurement_fail'; failReason: string; durationMs: number }
  | { type: 'opencv_load_fail' }
  | { type: 'app_open' }
  // [Phase 2] 광고 이벤트 (Phase 0/1 시점 미발화)
  | { type: 'ad_impression'; placement: 'home' | 'result'; emptyState?: boolean }
  | { type: 'ad_click'; placement: 'home' | 'result' }
  | { type: 'ad_load_fail'; placement: 'home' | 'result'; reason: string };

export interface TelemetryPayload {
  event: TelemetryEvent;
  deviceClass: DeviceClass;
  timestamp: string; // ISO8601
  sessionId: string; // 앱 진입 시 생성, 종료 시 폐기 (디바이스 식별 X)
}

export function detectDeviceClass(): DeviceClass {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad/.test(ua);
  const isAndroid = /Android/.test(ua);
  // 메모리 기반 high/low (Device Memory API)
  const memGB = (navigator as any).deviceMemory ?? 4;
  const high = memGB >= 4;
  if (isIOS) return high ? 'ios_high' : 'ios_low';
  if (isAndroid) return high ? 'android_high' : 'android_low';
  return 'unknown';
}
```

### telemetry/client.ts
```ts
import { TelemetryEvent, TelemetryPayload, detectDeviceClass } from './events';

export interface TelemetryClient {
  track(event: TelemetryEvent): void; // fire-and-forget
}

let cachedClient: TelemetryClient | null = null;
const sessionId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

export async function getTelemetryClient(): Promise<TelemetryClient> {
  if (cachedClient) return cachedClient;
  const tossSDK = await tryLoadTossAnalytics(); // F00 D1 조사 결과에 따라 구현
  cachedClient = tossSDK ? new TossAdapter(tossSDK) : new CloudflareWorkersAdapter();
  return cachedClient;
}

export function buildPayload(event: TelemetryEvent): TelemetryPayload {
  return {
    event,
    deviceClass: detectDeviceClass(),
    timestamp: new Date().toISOString(),
    sessionId,
  };
}
```

### telemetry/toss-adapter.ts (SDK 있을 경우)
```ts
export class TossAdapter implements TelemetryClient {
  constructor(private sdk: any /* SDK 분석 API */) {}

  track(event: TelemetryEvent): void {
    try {
      // SDK 분석 API 호출 형태에 맞게 매핑 (D1 조사 결과 기반)
      this.sdk.track(event.type, buildPayload(event));
    } catch (_) {
      // fire-and-forget — 실패 무시
    }
  }
}

export async function tryLoadTossAnalytics(): Promise<any | null> {
  try {
    // 예시: import('@apps-in-toss/web-framework').then(m => m.analytics ?? null)
    // 실제 API 경로는 D1 조사 결과
    const mod = await import('@apps-in-toss/web-framework');
    return (mod as any).analytics ?? null;
  } catch (_) {
    return null;
  }
}
```

### telemetry/cf-workers-adapter.ts
```ts
const ENDPOINT = import.meta.env.VITE_TELEMETRY_ENDPOINT ?? 'https://coffilens-telemetry.workers.dev/track';

export class CloudflareWorkersAdapter implements TelemetryClient {
  track(event: TelemetryEvent): void {
    const payload = buildPayload(event);
    // sendBeacon 우선 (페이지 이탈 시에도 전송 보장)
    if (navigator.sendBeacon) {
      // Blob 으로 감싸서 Content-Type 지정 — request.json() 파싱 호환
      navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {/* fire-and-forget */});
    }
  }
}
```

### Cloudflare Workers (worker/index.ts, 별도 배포)
```ts
export default {
  async fetch(request: Request, env: { COFFILENS_KV: KVNamespace }): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const cors = {
      'Access-Control-Allow-Origin': '*', // 또는 토스 WebView origin 화이트리스트
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      const payload = await request.json() as any;
      const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const eventKey = `${day}:${payload.event.type}`;
      const current = parseInt(await env.COFFILENS_KV.get(eventKey) ?? '0');
      await env.COFFILENS_KV.put(eventKey, String(current + 1));

      // 실패 사유별 카운터 (집계용)
      if (payload.event.type === 'measurement_fail') {
        const failKey = `${day}:fail:${payload.event.failReason}`;
        const failCount = parseInt(await env.COFFILENS_KV.get(failKey) ?? '0');
        await env.COFFILENS_KV.put(failKey, String(failCount + 1));
      }

      return new Response('OK', { headers: cors });
    } catch (e: any) {
      return new Response(e.message, { status: 400, headers: cors });
    }
  },
};
```

### components/exit-modal.tsx (★ 정확 매치)
```tsx
// 토스 비게임 가이드 문서 (https://developers-apps-in-toss.toss.im/checklist/app-nongame.html) 와
// D10 시점에 1:1 텍스트 매치 검증. 가이드 변경 시 추적 필요.

const EXIT_MODAL_TEXT = {
  title: '커피렌즈를 종료할까요?',
  cancel: '취소',
  exit: '종료하기',
};

export function ExitModal({ open, onCancel, onExit }: Props) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" className="modal-backdrop">
      <div className="modal">
        <p className="modal-title">{EXIT_MODAL_TEXT.title}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>{EXIT_MODAL_TEXT.cancel}</button>
          <button onClick={onExit} className="primary">{EXIT_MODAL_TEXT.exit}</button>
        </div>
      </div>
    </div>
  );
}
```

### components/permission-denied-screen.tsx
```tsx
export function PermissionDeniedScreen() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad/.test(ua);

  return (
    <main className="permission-denied">
      <h1>카메라 권한이 필요해요</h1>
      <p>분쇄도 측정을 위해 카메라 권한을 허용해주세요.</p>

      <section>
        <h2>설정에서 권한 허용하기</h2>
        {isIOS ? (
          <ol>
            <li>아이폰 설정 앱 열기</li>
            <li>토스 → 카메라</li>
            <li>"허용" 선택</li>
            <li>토스로 돌아와서 다시 시도</li>
          </ol>
        ) : (
          <ol>
            <li>안드로이드 설정 → 앱 → 토스</li>
            <li>권한 → 카메라</li>
            <li>"허용" 선택</li>
            <li>토스로 돌아와서 다시 시도</li>
          </ol>
        )}
      </section>

      <Link href="/home"><Button>홈으로</Button></Link>
    </main>
  );
}
```

### 호출 통합
```ts
// stores/measurement.store.ts
const tel = await getTelemetryClient();

// 측정 시도
tel.track({ type: 'measurement_attempt', toolKind: tool });

// 성공 (F08 save 시점)
tel.track({ type: 'measurement_success', durationMs, confidence: result.confidence.score, coinType: result.coin.coinType });

// 실패 (F06 catch 시점)
tel.track({ type: 'measurement_fail', failReason: e.kind, durationMs });
```

---

## 수용 기준

- [ ] 텔레메트리 어댑터 자동 선택 (SDK 우선, 없으면 CF Workers)
- [ ] CF Workers 엔드포인트 배포 (Cloudflare 무료 티어) + KV 카운터 동작
- [ ] 측정 시도/성공/실패 이벤트가 백엔드에 도달 (수동 검증)
- [ ] **종료 모달 텍스트가 토스 비게임 가이드와 1:1 매치** (스크린샷 비교)
- [ ] 카메라 권한 거부 시 PermissionDeniedScreen 표시 + iOS/AOS 분기 안내
- [ ] sendBeacon 우선 사용 (페이지 이탈 시에도 전송 보장)
- [ ] 1차 자가 검수 체크리스트 (Section 17) 80% 이상 통과

---

## 테스트

### tests/telemetry/cf-workers-adapter.test.ts
- sendBeacon 사용 가능 시 → sendBeacon 호출
- 미지원 시 → fetch 호출
- 네트워크 실패 → 에러 무시 (fire-and-forget)

### tests/telemetry/events.test.ts
- detectDeviceClass: iOS/Android UA + memory → 정확 분류

### 수동
- CF Workers 배포 후 curl 로 POST → 200 OK + KV 값 증가 확인
- 토스 샌드박스에서 측정 → CF Workers 로그/KV 에 이벤트 도달

---

## 검수 영향

- **plain.md Section 4-3** (종료 모달) — 이 feature 가 정확 매치 검증 책임
- **plain.md Section 4-6** (카메라 권한 거부) — PermissionDeniedScreen 충족
- **plain.md Section 4-7** (외부 통신 사유) — CF Workers 사용 시 검수 콘솔 명시 필수
  - "익명 사용 통계 수집 (개인정보 미수집, 측정 성공률 + 실패 사유 + 디바이스 클래스만)"
  - 토스 SDK 분석 API 사용 시 별도 사유 불필요

---

## 위험 / 함정

- ⚠️ **종료 모달 텍스트 가이드 변경**: 토스 가이드가 업데이트되면 매치 깨짐. **D10 검증 시점의 가이드 URL + 캡처 스크린샷을 ALGORITHM_NOTES 또는 별도 문서에 기록** → 추후 재검증 가능
- ⚠️ **CF Workers 무료 티어 한계**: 일 100K req. MVP 단계에서 충분. 초과 시 알람 + 유료 전환
- ⚠️ **KV eventual consistency**: 카운터 race. MVP 단계에서는 무시 (정확도보다 트렌드 파악 목적)
- ⚠️ **토스 WebView CORS**: CF Workers 의 `Access-Control-Allow-Origin: *` 가 검수에서 시큐리티 이슈 지적될 수 있음. Toss 도메인 화이트리스트 권장
- ⚠️ **sessionId 디바이스 식별 위험**: 매 앱 진입 시 새로 생성 (영구 저장 X). 우연히 디바이스 fingerprint 가 되지 않도록 검토
- ⚠️ **navigator.sendBeacon body 크기 64KB 제한**: payload 작아서 OK이지만 향후 확장 시 주의

---

## 참조

- [plain.md Section 4-3, 4-6, 4-7](../plain.md)
- [plain.md Section 15 (텔레메트리 전략)](../plain.md)
- [Cloudflare Workers + KV](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [MDN: navigator.sendBeacon](https://developer.mozilla.org/docs/Web/API/Navigator/sendBeacon)

---

## Handoff Notes

D10은 plain.md 일정에서 **검수 안전망 마무리** 일. 세 가지 평행 작업:
1. 텔레메트리 (인프라 + 코드)
2. 권한 거부 UX (사용자 막힘 방지)
3. 종료 모달 정확 매치 (검수 통과 직결)

세 가지 중 **종료 모달 정확 매치가 가장 검수 직결**. 토스 가이드 페이지 (4-3 항목 명시 부분) 를 D10 시점에 직접 확인 후 텍스트 1:1 매치. 가이드 캡처 + 코드 비교 스크린샷을 ALGORITHM_NOTES 또는 `docs/inspection-evidence.md` 에 기록.

CF Workers fallback 은 SDK 가 없을 경우만. **D1 조사에서 토스 SDK 분석 API 가 있다고 확인되면 CF Workers 코드 작성 안 해도 됨** — 노력 0.5일 절감.

---

## 추가 (2026-05-02, Phase 1) — D1 결정: ⑥ Console-only 채택 + CF Workers 폐기

### D1 조사 결과

위 ① ~ ⑦ 분류표 중 **⑥ Console-only** 로 확정:
- 사용자 정의 이벤트 + payload 모두 SDK 가 받지만 **데이터는 토스 콘솔에서만 조회 가능**
- 외부 추출 불가 (Cloudflare Workers 같은 자체 인프라로 우회 X)
- 자동 알람 X — Section 15 Alarm #1~#5 모두 **수동 콘솔 검사** 로 운영

### 코드 결정 — adapter 분리 폐기

원 spec 의 multi-adapter 전략 (`toss-adapter.ts` + `cf-workers-adapter.ts` + `worker/index.ts`) **전부 폐기**. SDK 만 사용하는 단순 구조:

```
src/telemetry/
├── client.ts        — getTelemetryClient() factory (SDK 직접 호출)
└── events.ts        — TelemetryEvent 타입 + DeviceClass 휴리스틱
```

폐기된 파일:
- ~~`src/telemetry/toss-adapter.ts`~~
- ~~`src/telemetry/cf-workers-adapter.ts`~~
- ~~`worker/index.ts`~~ + `wrangler.toml`
- ~~`tests/telemetry/cf-workers-adapter.test.ts`~~

**효과**: D10 노력 ~0.5일 절감 (CF Workers + 운영 인프라 미작성). 외부 통신 사유 검수 항목도 불요.

### 운영 절차 — 콘솔 수동 검사

자동 알람 부재 → **매일 (베타 D13~17) / 매주 (정식 출시 후)** 토스 콘솔 수동 확인:

| 점검 항목 | 빈도 | 임계 |
|---|---|---|
| `measurement_fail` 비율 (vs `measurement_attempt`) | 매일 | 베타 30%+ / 정식 20%+ → 알고리즘 회귀 의심 |
| `opencv_load_fail` 발생 빈도 | 매일 | 1% 초과 → CDN/vendoring 이슈 |
| `failReason` 분포 변화 | 매주 | 특정 reason 급증 → fixture 추가 후보 |
| 평균 `durationMs` (measurement_success) | 매주 | 5초 초과 추세 → 성능 회귀 |

운영 체크리스트는 `docs/inspection-submission.md` 와 별도 `docs/operations-runbook.md` 에 정리 (F11 작업).

### 이벤트 페이로드 단순화

원 spec 의 ② Limited (이벤트명 분해) 우회 트릭 불요 — ⑥ 은 payload 보존 가능. `failReason` 그대로 single 이벤트로:

```ts
tel.track({ type: "measurement_fail", failReason: "no_coin", durationMs: 3200 });
// → SDK 가 payload 그대로 받음, 콘솔에서 failReason filter 가능
```

### 신규 페이로드 — coinType (Phase 1)

Phase 1 의 `coin-select` UX 도입 → `measurement_attempt` / `measurement_success` 에 `coinType: "100" | "500"` 추가. 100원 vs 500원 사용 비율 추적 + 동전별 측정 정확도 (페어 일관성) 모니터링 데이터 수집.

```ts
type TelemetryEvent =
  | { type: "app_open" }
  | { type: "measurement_attempt"; coinType: "100" | "500" }
  | { type: "measurement_success"; durationMs: number; confidence: number; coinType: "100" | "500" }
  | { type: "measurement_fail"; failReason: string; durationMs: number }
  | { type: "opencv_load_fail"; cause: "network" | "cors" | "timeout" };
```

### 폐기된 alarm

원 spec Section 15 Alarm #3 (평균 분석시간 자동 알람) 는 ② 분류였으면 분해 필요했으나, ⑥ 은 콘솔 수동 검사로 대체 — 자동 알람 자체가 SDK 차원에서 X.

### 수용 기준 변경

| 원 기준 | 변경 후 |
|---|---|
| ~~CF Workers fallback 동작 검증~~ | 폐기 (코드 자체 X) |
| ~~`toss-adapter.ts` / `cf-workers-adapter.ts` factory 선택~~ | 단일 SDK 호출만 (`client.ts`) |
| TossAdapter eventLog 호출 | (그대로) |
| ② 분해 트릭 | 폐기 — payload 그대로 |
| 운영 콘솔 수동 검사 절차 (`docs/operations-runbook.md`) | 신규 — F11 작업 |

---

## 추가 (2026-05-01, Phase 2) — 광고 텔레메트리

> **컨텍스트**: D1 결과 ⑥ Console-only 채택. 광고 (`useTossBanner`) 자체도 토스 광고 콘솔에 카운터 자동 집계. 자체 텔레메트리는 사용자 측면 (placement별, 빈 상태 vs 정상) 분석용 + 광고 SDK 동작 cross-check.

### Phase 2 광고 이벤트 (events.ts 확장)

기존 `TelemetryEvent` union 에 3개 추가:

```ts
export type TelemetryEvent =
  // ... 기존 (measurement_attempt/success/fail/opencv_load_fail/app_open)
  | { type: 'ad_impression'; placement: 'home' | 'result'; emptyState?: boolean }
  | { type: 'ad_click'; placement: 'home' | 'result' }
  | { type: 'ad_load_fail'; placement: 'home' | 'result'; reason: string };
```

**`emptyState` 의미** (ad_impression 만 해당):
- `placement: 'home'` + `emptyState: true` — 측정 기록 0건 상태에서 노출
- `placement: 'home'` + `emptyState: false` — 측정 기록 ≥1건에서 노출
- `placement: 'result'` — `emptyState` 미사용 (생략)

→ Phase 2 베타에서 빈 상태 노출 비율 + goodwill 영향 데이터 수집 → [plain.md Section 18](../plain.md) "빈 상태 홈 광고 노출 여부" 결정 근거.

### 호출 위치

#### F02 HomeAdBanner

```tsx
import { useTossBanner } from '@apps-in-toss/web-framework';
import { useEffect } from 'react';
import { getTelemetryClient } from '../telemetry/client';

function HomeAdBanner({ showInEmpty, isEmpty }: Props) {
  if (!showInEmpty && isEmpty) return null;

  const banner = useTossBanner({
    position: 'bottom',
    onLoad: () => {
      getTelemetryClient().then(c => c.track({
        type: 'ad_impression',
        placement: 'home',
        emptyState: isEmpty,
      }));
    },
    onClick: () => {
      getTelemetryClient().then(c => c.track({
        type: 'ad_click',
        placement: 'home',
      }));
    },
    onError: (err) => {
      getTelemetryClient().then(c => c.track({
        type: 'ad_load_fail',
        placement: 'home',
        reason: err?.message ?? 'unknown',
      }));
    },
  });

  return <div className="ad-slot" aria-label="광고">{banner}</div>;
}
```

#### F07 ResultAdBanner

```tsx
function ResultAdBanner() {
  const banner = useTossBanner({
    position: 'bottom',
    onLoad: () => track({ type: 'ad_impression', placement: 'result' }),
    onClick: () => track({ type: 'ad_click', placement: 'result' }),
    onError: (err) => track({ type: 'ad_load_fail', placement: 'result', reason: err?.message ?? 'unknown' }),
  });
  return <div className="ad-slot" aria-label="광고">{banner}</div>;
}
```

> **`useTossBanner` 콜백 API 확인 필요** — `onLoad`/`onClick`/`onError` 가 실제 SDK API 인지 D1 추가 조사 시점 또는 Phase 2 진입 시 SDK 문서 재확인. 명칭이 다르면 그대로 매핑. 콜백 자체가 없으면 `IntersectionObserver` 폴리필로 ad_impression 만 측정 가능 (click/error 는 추적 불가).

### ⑥ Console-only 운영 절차 — 광고 카운터 추가

원 spec 의 운영 절차 (`docs/operations-runbook.md`) 에 광고 항목 추가:

```markdown
## Phase 2 — 광고 카운터 점검 (매주 1회)

### 토스 콘솔 측면
1. 토스 광고 콘솔 → 광고 단위별 impression / click / eCPM
2. 비정상 0 또는 급락 → 광고 SDK 또는 광고 단위 ID 문제

### 자체 텔레메트리 측면 (콘솔 이벤트 로그)
1. `ad_impression` placement별 카운트
   - home (emptyState=true) vs home (emptyState=false) 비율
   - result 노출률 (= 측정 성공 횟수 ÷ ad_impression result 카운트, ≈ 100% 기대)
2. `ad_click` 카운트 → 클릭률 (CTR) = ad_click ÷ ad_impression
3. `ad_load_fail` 카운트 → 5% 초과 시 광고 SDK 문제 의심

### Cross-check
- 토스 광고 콘솔 impression ≈ 자체 텔레메트리 ad_impression
- 차이 5% 이상 → 한쪽 누락 (자체 onLoad 콜백 미발화 또는 토스 콘솔 집계 지연)
```

### 검수 영향 — 추가 외부 통신 사유 X

`useTossBanner` 가 토스 SDK 내장 → 외부 도메인 호출 자체 없음 (토스 광고 인프라가 SDK 내부에서 처리). `docs/inspection-submission.md` 의 외부 통신 사유 변경 X.

### 수용 기준 추가 (Phase 2)

- [ ] `TelemetryEvent` union 에 ad_impression / ad_click / ad_load_fail 3개 추가
- [ ] `HomeAdBanner` / `ResultAdBanner` 컴포넌트가 `useTossBanner` 콜백에서 텔레메트리 발화
- [ ] Phase 0/1 빌드 (`VITE_APP_PHASE !== '2'`) 에서는 광고 이벤트 0건 발화 (gating 검증)
- [ ] `docs/operations-runbook.md` 에 광고 카운터 점검 절차 추가
- [ ] 토스 광고 콘솔 ↔ 자체 텔레메트리 cross-check 1회 검증 (Phase 2 베타 시작 직후)

### 위험 / 함정

- ⚠️ **`useTossBanner` 콜백 미존재**: SDK 가 `onLoad`/`onClick` 콜백 안 주면 ad_impression/ad_click 추적 불가. `IntersectionObserver` 로 viewport 진입만 폴리필 가능 (정확한 광고 노출 시점은 모름). D1 시점 또는 Phase 2 진입 직전 SDK 문서 재확인.
- ⚠️ **빈 상태 광고 default true**: F02 에서 `showInEmpty` 기본값 true. 베타에서 emptyState=true 비율이 높고 goodwill drop 보고되면 false 로 1줄 변경. 텔레메트리가 이 결정의 근거.
- ⚠️ **이벤트 빈도**: ad_impression 이 한 화면 진입당 1회만 발화하도록 (`useEffect` cleanup 또는 SDK 콜백 1회성 보장). 스크롤 / 리렌더마다 발화하면 노이즈 + 콘솔 카운터 왜곡.
- ⚠️ **클릭 추적 한계**: 토스 광고가 사용자를 외부로 이동시키면 그 후 추적 불가 (SPA 외부 navigate). `ad_click` 만 발화하고 conversion 은 토스 광고 콘솔 의존.
