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
 *
 * 짧은 한 줄 — toast / inline 용. 화면 에러 상세는 errorDetails() 사용.
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
 * 결과 화면 에러 상세 — 제목 + 무엇이 문제 + 어떻게 고칠지 + 측정값(있을 때).
 * 사용자가 사진을 어떻게 다시 찍어야 할지 명확하게 안내.
 */
export interface ErrorDetails {
  /** 한 줄 제목 — h1 */
  title: string;
  /** 무엇을 인식하지 못했는지 / 어떤 측정값이 임계 이하인지 */
  whatHappened: string;
  /** 사진 보정 액션 — bullet 리스트 */
  howToFix: string[];
  /** 디버그용 측정값 (있을 때만 표시) */
  diagnostics?: string;
}

export function errorDetails(e: AnalysisError): ErrorDetails {
  switch (e.kind) {
    case "opencv_load_fail":
      return {
        title: "분석 엔진 로드 실패",
        whatHappened: `OpenCV 분석 엔진을 불러오지 못했어요 (원인: ${
          e.cause === "network" ? "네트워크" : e.cause === "cors" ? "CORS" : "타임아웃"
        }).`,
        howToFix: [
          "와이파이 또는 데이터 연결 상태를 확인해주세요.",
          "토스 앱을 한번 종료했다 다시 들어와주세요.",
        ],
      };
    case "aborted":
      return {
        title: "취소됨",
        whatHappened: "분석을 취소했어요.",
        howToFix: [],
      };
    case "no_coin":
      return {
        title: "동전을 찾지 못했어요",
        whatHappened:
          "사진에서 원형 동전을 인식하지 못했어요. 동전이 너무 작거나, 분쇄 커피에 가려졌거나, 화면 밖에 있을 수 있어요.",
        howToFix: [
          "100원 또는 500원 동전을 흰 종이 위에 함께 두세요.",
          "동전이 분쇄 커피에 묻히지 않게 옆에 따로 놓아주세요.",
          "동전이 화면 안에 분명히 보이도록 가까이 찍어주세요.",
        ],
      };
    case "multi_coin":
      return {
        title: "동전이 여러 개 보여요",
        whatHappened: `${e.count}개의 동전 모양이 인식됐어요. 크기 기준이 흔들려 정확한 측정이 어려워요.`,
        howToFix: [
          "동전을 1개만 남기고 나머지는 화면 밖으로 치워주세요.",
          "동그란 컵받침이나 그릇 가장자리도 동전으로 인식될 수 있어요. 흰 종이 위에서 단독 촬영해주세요.",
        ],
        diagnostics: `검출된 원형 개수: ${e.count}`,
      };
    case "partial_coin":
      return {
        title: "동전이 잘렸어요",
        whatHappened:
          "동전이 화면 가장자리에 걸려서 일부만 보여요. 직경 측정이 부정확해요.",
        howToFix: [
          "동전 전체가 화면 안에 들어오도록 카메라를 조금 멀리 잡아주세요.",
          "촬영 가이드의 안내선 안에 동전을 두세요.",
        ],
      };
    case "low_brightness":
      return {
        title: "너무 어두워요",
        whatHappened: `화면 평균 밝기가 ${Math.round(e.meanBrightness)}/255 로 너무 어두워요. 입자 윤곽선이 안 보여요.`,
        howToFix: [
          "더 밝은 조명 아래로 이동해주세요 (창가, 천장 조명 바로 아래).",
          "그늘이나 카메라가 만든 그림자가 분쇄 커피 위에 떨어지지 않게 해주세요.",
          "필요 시 폰 후레쉬를 켜주세요.",
        ],
        diagnostics: `평균 밝기: ${Math.round(e.meanBrightness)}/255 (최소 80 필요)`,
      };
    case "blur":
      return {
        title: "사진이 흔들렸어요",
        whatHappened: `초점이 맞지 않거나 흔들려서 입자 경계가 흐려요.`,
        howToFix: [
          "폰을 두 손으로 고정하고 다시 촬영해주세요.",
          "카메라가 자동 초점을 잡을 때까지 잠깐 기다린 후 셔터를 눌러주세요.",
          "동전이나 분쇄 커피에 카메라를 너무 가까이 대지 마세요 (10cm 이상 떨어져서).",
        ],
        diagnostics: `선명도(Laplacian variance): ${Math.round(e.laplacianVariance)} (최소 100 필요)`,
      };
    case "no_particles":
      return {
        title: "분쇄 입자를 찾지 못했어요",
        whatHappened:
          "분쇄 커피 영역에서 입자 경계가 충분히 검출되지 않았어요. 원두가 너무 적거나, 너무 큰 덩어리거나, 흰 종이와 대비가 약할 수 있어요.",
        howToFix: [
          "분쇄 커피를 흰 종이 위에 충분한 양 (동전 면적의 2~3배) 펴주세요.",
          "원두끼리 너무 뭉치지 않게 살짝 흩뿌려주세요.",
          "원두가 분쇄가 되었는지 확인해주세요 (덩어리째면 안 됨).",
          "어두운 색 배경 (검정 종이 등) 위에서는 인식이 안 돼요. 흰 종이만 사용해주세요.",
        ],
      };
    case "memory_oom":
      return {
        title: "메모리 부족",
        whatHappened: `${
          e.phase === "segment" ? "입자 분리" : e.phase === "stats" ? "통계 산출" : "분석"
        } 단계에서 메모리가 부족했어요.`,
        howToFix: [
          "사진을 다시 촬영해주세요 (해상도가 자동으로 줄어듭니다).",
          "다른 앱을 종료한 후 다시 시도해주세요.",
        ],
        diagnostics: `OOM phase: ${e.phase}`,
      };
  }
}

/**
 * 텔레메트리 reason 코드. failReason payload 에 사용.
 * kind 이름 그대로 사용해 type-safe 매핑.
 */
export function telemetryReason(e: AnalysisError): string {
  return e.kind;
}
