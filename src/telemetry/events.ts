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

/**
 * 광고 banner 의 노출 위치 식별자 (Phase 2 — 광고 텔레메트리, 2026-05-03).
 * - "home"   : Home 화면 records 하단
 * - "result" : Result 화면 disclaimer 하단
 *
 * slotId 별로 impression/click/load_fail 카운터 분리 → 토스 콘솔 cross-check
 * (어느 위치 광고가 효과적인지, 어느 위치에서 load 실패 빈도 높은지 진단).
 */
export type AdSlotId = "home" | "result";

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
  | { type: "opencv_load_fail"; cause: "network" | "cors" | "timeout" }
  /*
   * **Phase 2 — 광고 텔레메트리** (2026-05-03):
   * Toss `attachBanner` callback (onAdImpression / onAdClicked /
   * onAdFailedToRender) 에 1:1 매핑. slotId 로 호출 위치 식별, adGroupId 는
   * 토스 콘솔 cross-check 용. ⑥ Console-only 운영 — 자동 알람 없음, 수동 검사.
   */
  | { type: "ad_impression"; slotId: AdSlotId; adGroupId: string }
  | { type: "ad_click"; slotId: AdSlotId; adGroupId: string }
  | {
      type: "ad_load_fail";
      slotId: AdSlotId;
      adGroupId: string;
      /** Toss SDK BannerSlotErrorPayload.error.code */
      errorCode: number;
      /** 사람-판독용 message — 콘솔 진단 용도 (PII 없음) */
      errorMessage: string;
    };

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
