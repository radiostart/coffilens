/**
 * 텔레메트리 클라이언트 — D1 ⑥ Console-only 분기 적용.
 *
 * 토스 SDK 의 `eventLog` 를 직접 호출:
 *  - log_name: 자유 (event.type)
 *  - log_type: 'event' | 'error' | 'screen' (이벤트별 매핑)
 *  - params: { deviceClass, sessionId, timestamp, ...eventFields }
 *
 * 샌드박스 환경: 콘솔에 출력 (SDK docstring 명시).
 * 프로덕션: 토스 로그 시스템에 기록 → 토스 콘솔 수동 검사 (자동 알람 X).
 *
 * fire-and-forget: track() 실패 무시. 사용자 경험 차단 X.
 */

import {
  detectDeviceClass,
  getSessionId,
  type TelemetryEvent,
  type TelemetryPayload,
} from "./events";

export interface TelemetryClient {
  track(event: TelemetryEvent): void;
}

interface SdkEventLog {
  (params: {
    log_name: string;
    log_type:
      | "debug"
      | "info"
      | "warn"
      | "error"
      | "event"
      | "screen"
      | "impression"
      | "click"
      | "popup";
    params: Record<string, string | number | boolean | null | undefined>;
  }): Promise<void> | undefined;
}

function buildPayload(event: TelemetryEvent): TelemetryPayload {
  return {
    event,
    deviceClass: detectDeviceClass(),
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
  };
}

function logTypeFor(event: TelemetryEvent): "event" | "error" | "screen" {
  if (event.type === "measurement_fail" || event.type === "opencv_load_fail") {
    return "error";
  }
  if (event.type === "app_open") return "screen";
  return "event";
}

function flattenParams(payload: TelemetryPayload): Record<string, string | number | boolean | null | undefined> {
  const { event, deviceClass, timestamp, sessionId } = payload;
  const base = { deviceClass, sessionId, timestamp };
  // event 의 추가 필드 (type 제외) 를 함께
  const extra = Object.fromEntries(
    Object.entries(event).filter(([k]) => k !== "type"),
  );
  return { ...base, ...extra };
}

export class TossAdapter implements TelemetryClient {
  constructor(private eventLog: SdkEventLog) {}

  track(event: TelemetryEvent): void {
    try {
      const payload = buildPayload(event);
      const result = this.eventLog({
        log_name: event.type,
        log_type: logTypeFor(event),
        params: flattenParams(payload),
      });
      // Promise<void> | undefined — 실패 무시 (fire-and-forget)
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          /* ignore */
        });
      }
    } catch {
      /* ignore — 사용자 경험 차단 X */
    }
  }
}

/**
 * Noop adapter — SDK 미로드 / 테스트 환경.
 * dev console 에 로그 (가독성 위해 prefix).
 */
export class ConsoleAdapter implements TelemetryClient {
  track(event: TelemetryEvent): void {
    if (typeof console !== "undefined") {
      console.info("[telemetry]", event.type, buildPayload(event));
    }
  }
}

let cachedClient: TelemetryClient | null = null;

interface AppsInTossModule {
  eventLog?: SdkEventLog;
}

/**
 * 클라이언트 lazy init.
 * SDK 가 로드되어 있으면 TossAdapter, 아니면 ConsoleAdapter (dev/test).
 */
export async function getTelemetryClient(): Promise<TelemetryClient> {
  if (cachedClient) return cachedClient;

  try {
    const mod = (await import(
      /* @vite-ignore */ "@apps-in-toss/web-framework"
    )) as AppsInTossModule;
    if (typeof mod.eventLog === "function") {
      cachedClient = new TossAdapter(mod.eventLog);
      return cachedClient;
    }
  } catch {
    /* SDK 로드 실패 — fallback */
  }

  cachedClient = new ConsoleAdapter();
  return cachedClient;
}

/** 테스트용 — 클라이언트 리셋 + 명시적 주입 */
export function _resetClientForTests(client?: TelemetryClient): void {
  cachedClient = client ?? null;
}
