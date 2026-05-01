/**
 * 분쇄도 → 추천 도구 매트릭스 (룰베이스).
 *
 * 5 경계값 (plain.md Section 7):
 *  - 500μm 미만: very-fine (에스프레소 영역, 도구 미지원)
 *  - 500~649μm: fine (Clever 침지+드립)
 *  - 650~799μm: v60-optimal (V60, Origami)
 *  - 800~949μm: coarse (Kalita Wave, Chemex)
 *  - 950μm 이상: very-coarse (프렌치프레스 영역, 도구 미지원)
 *
 * 단위 테스트로 경계값 회귀 방어 (499/500, 649/650, 799/800, 949/950).
 */

import type { ToolId } from "../stores/measurement.store";

export type GrindLevel =
  | "very-fine"
  | "fine"
  | "v60-optimal"
  | "coarse"
  | "very-coarse";

export interface GrindDiagnosis {
  level: GrindLevel;
  label: string;
  recommendedTools: ToolId[];
}

const D50_BOUNDARIES: Array<{
  upper: number;
  level: GrindLevel;
  label: string;
  recommendedTools: ToolId[];
}> = [
  { upper: 500, level: "very-fine", label: "매우 곱음", recommendedTools: [] },
  { upper: 650, level: "fine", label: "곱은 편", recommendedTools: ["clever"] },
  {
    upper: 800,
    level: "v60-optimal",
    label: "V60 적정",
    recommendedTools: ["v60", "origami"],
  },
  {
    upper: 950,
    level: "coarse",
    label: "굵은 편",
    recommendedTools: ["kalita", "chemex"],
  },
  {
    upper: Infinity,
    level: "very-coarse",
    label: "매우 굵음",
    recommendedTools: [],
  },
];

export function diagnoseByD50(d50: number): GrindDiagnosis {
  for (const b of D50_BOUNDARIES) {
    if (d50 < b.upper) {
      return {
        level: b.level,
        label: b.label,
        recommendedTools: [...b.recommendedTools],
      };
    }
  }
  // Infinity 가 마지막이라 도달 불가
  const last = D50_BOUNDARIES[D50_BOUNDARIES.length - 1];
  return {
    level: last.level,
    label: last.label,
    recommendedTools: [...last.recommendedTools],
  };
}

export interface UniformityAction {
  label: "매우 균일" | "양호" | "편차 큼";
  action: string;
}

/**
 * Uniformity (D90/D10) 해석 + 추출 액션.
 *  - < 3.0: 매우 균일 — 자유로운 레시피
 *  - 3.0~4.99: 양호 — 일반 레시피
 *  - >= 5.0: 편차 큼 — 저온/짧은 추출로 보완
 */
export function uniformityAction(uniformity: number): UniformityAction {
  if (uniformity < 3.0) {
    return { label: "매우 균일", action: "그라인더 좋음. 레시피 자유롭게." };
  }
  if (uniformity < 5.0) {
    return { label: "양호", action: "일반적인 레시피 OK." };
  }
  return {
    label: "편차 큼",
    action: "저온 추출 또는 짧은 추출시간으로 보완.",
  };
}

export interface FinesAction {
  label: "깨끗함" | "보통" | "채널링 위험";
  action: string;
}

/**
 * Fines% (300μm 미만 면적 비율) 해석 + 액션.
 *  - < 10%: 깨끗 — 표준 레시피
 *  - 10~14.9%: 보통 — 블루밍 30초
 *  - >= 15%: 채널링 위험 — 블루밍 짧게, 약한 푸어, 침지 비율↑
 */
export function finesAction(finesPercent: number): FinesAction {
  if (finesPercent < 10) {
    return { label: "깨끗함", action: "표준 레시피." };
  }
  if (finesPercent < 15) {
    return { label: "보통", action: "블루밍 30초 충분히." };
  }
  return {
    label: "채널링 위험",
    action: "블루밍 짧게(15초), 약하게 푸어, 침지 비율↑",
  };
}

/**
 * 사용자가 선택한 도구가 분쇄도에 적합한지.
 *
 * 단순화 (sweep Issue 21): 'wrong' 케이스 제거 — optimal 또는 suboptimal 만.
 *  - optimal: diagnose 의 recommendedTools 에 포함
 *  - suboptimal: 그 외
 */
export type ToolFitness = "optimal" | "suboptimal";

export function toolFitness(d50: number, selectedTool: ToolId): ToolFitness {
  const diagnosis = diagnoseByD50(d50);
  return diagnosis.recommendedTools.includes(selectedTool)
    ? "optimal"
    : "suboptimal";
}

export const ALL_TOOLS: ToolId[] = [
  "v60",
  "kalita",
  "clever",
  "origami",
  "chemex",
];

/** 현재 도구를 제외한 다른 도구 목록 — "다른 도구로 보기" chip 그룹 입력 */
export function getOtherTools(current: ToolId): ToolId[] {
  return ALL_TOOLS.filter((t) => t !== current);
}
