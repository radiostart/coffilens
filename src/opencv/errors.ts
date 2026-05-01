/**
 * 분석 파이프라인 에러 — discriminated union 단일 진실.
 *
 * F03 단계: opencv_load_fail + aborted 만.
 * F04~F06 에서 각자 자기 단계 에러를 추가 (no_coin, multi_coin, blur, ...).
 *
 * 모든 throw 는 이 type 만 사용 — switch exhaustive 로 누락 컴파일 타임 차단.
 */
export type AnalysisError =
  | { kind: "opencv_load_fail"; cause: "network" | "cors" | "timeout" }
  | { kind: "aborted" };

/**
 * 사용자에게 노출할 메시지. F04~F06 추가 시 case 도 함께 확장.
 */
export function userMessage(e: AnalysisError): string {
  switch (e.kind) {
    case "opencv_load_fail":
      return "OpenCV 로드 실패. 와이파이 확인 후 재시도해주세요.";
    case "aborted":
      // 사용자 의도적 취소 — 메시지 노출 X
      return "";
  }
}

/**
 * 텔레메트리 reason 코드. failReason payload 에 사용.
 * kind 이름 그대로 사용해 type-safe 매핑.
 */
export function telemetryReason(e: AnalysisError): string {
  return e.kind;
}
