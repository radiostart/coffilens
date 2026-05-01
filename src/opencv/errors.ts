/**
 * 분석 파이프라인 에러 — discriminated union 단일 진실.
 *
 * F03: opencv_load_fail | aborted
 * F04: + no_coin | multi_coin | partial_coin | low_brightness | blur
 * F05~F06: 추가 예정 (no_particles, memory_oom 등)
 *
 * 모든 throw 는 이 type 만 사용 — switch exhaustive 로 누락 컴파일 타임 차단.
 */
export type AnalysisError =
  | { kind: "opencv_load_fail"; cause: "network" | "cors" | "timeout" }
  | { kind: "aborted" }
  | { kind: "no_coin" }
  | { kind: "multi_coin"; count: number }
  | { kind: "partial_coin" }
  | { kind: "low_brightness"; meanBrightness: number }
  | { kind: "blur"; laplacianVariance: number }
  | { kind: "no_particles" }
  | { kind: "memory_oom"; phase: "segment" | "stats" | "pipeline" };

/**
 * 사용자에게 노출할 메시지. 신규 kind 추가 시 case 도 함께 확장 (TS exhaustive).
 */
export function userMessage(e: AnalysisError): string {
  switch (e.kind) {
    case "opencv_load_fail":
      return "OpenCV 로드 실패. 와이파이 확인 후 재시도해주세요.";
    case "aborted":
      // 사용자 의도적 취소 — 메시지 노출 X
      return "";
    case "no_coin":
      return "동전이 보이지 않아요. 100원 또는 500원 동전을 함께 놓고 다시 촬영해주세요.";
    case "multi_coin":
      return "동전이 여러 개 보여요. 1개만 놓아주세요.";
    case "partial_coin":
      return "동전이 화면 가장자리에 잘렸어요. 동전 전체가 보이도록 다시 촬영해주세요.";
    case "low_brightness":
      return "너무 어두워요. 더 밝은 곳에서 촬영해주세요.";
    case "blur":
      return "흔들렸어요. 폰을 고정하고 다시 촬영해주세요.";
    case "no_particles":
      return "입자가 검출되지 않았어요. 분쇄가 안 됐거나 원두가 너무 적을 수 있어요.";
    case "memory_oom":
      return "사진 크기가 너무 커요. 다시 촬영해주세요.";
  }
}

/**
 * 텔레메트리 reason 코드. failReason payload 에 사용.
 * kind 이름 그대로 사용해 type-safe 매핑.
 */
export function telemetryReason(e: AnalysisError): string {
  return e.kind;
}
