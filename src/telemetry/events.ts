/**
 * 텔레메트리 이벤트 타입.
 *
 * D1 분류 결과: ⑥ Console-only (features/F00-investigation.md 참조).
 * → TossAdapter (eventLog) 만 사용. CF Workers 코드 폐기.
 *
 * 신호 레벨 E (모든 이벤트 + 모든 payload 보존).
 *
 * 외부 통신 사유 검수 항목 불요 (토스 SDK 만 사용).
 * 단, 운영 절차: 토스 콘솔 수동 검사 (자동 알람 X).
 */

export type DeviceClass =
  | "ios_high"
  | "ios_low"
  | "android_high"
  | "android_low"
  | "unknown";

export type TelemetryEvent =
  | { type: "app_open" }
  | { type: "measurement_attempt"; coinType: "100" | "500" }
  | {
      type: "measurement_success";
      durationMs: number;
      confidence: number;
      coinType: "100" | "500";
    }
  | { type: "measurement_fail"; failReason: string; durationMs: number }
  | { type: "opencv_load_fail"; cause: "network" | "cors" | "timeout" };

export interface TelemetryPayload {
  event: TelemetryEvent;
  deviceClass: DeviceClass;
  /** ISO8601 — 호출 시점 */
  timestamp: string;
  /** 앱 진입 시 생성, 영구 저장 X — 디바이스 fingerprint 방지 */
  sessionId: string;
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

export function detectDeviceClass(): DeviceClass {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad/.test(ua);
  const isAndroid = /Android/.test(ua);
  const memGB = (navigator as NavigatorWithMemory).deviceMemory ?? 4;
  const high = memGB >= 4;
  if (isIOS) return high ? "ios_high" : "ios_low";
  if (isAndroid) return high ? "android_high" : "android_low";
  return "unknown";
}

let cachedSessionId: string | null = null;

export function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    cachedSessionId = crypto.randomUUID();
  } else {
    cachedSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return cachedSessionId;
}

/** 테스트용 — 세션 리셋 */
export function _resetSessionForTests(): void {
  cachedSessionId = null;
}
