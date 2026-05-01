/**
 * 결과 화면 메시지 생성 — 진단 + 도구 적정성 + 추천 레시피 + 경고.
 */

import type { ParticleStats } from "../opencv/statistics";
import type { ToolId } from "../stores/measurement.store";
import {
  diagnoseByD50,
  finesAction,
  toolFitness,
  uniformityAction,
} from "./matrix";

export interface ResultMessages {
  /** 한 줄 진단 (예: "V60 적정 (D50 720μm)") */
  headline: string;
  /** 사용자가 선택한 도구의 적정성 메시지 */
  toolFitMessage: string;
  /** 추천 레시피 — Uniformity + Fines 액션 결합 */
  recipe: string;
  /** 신뢰도 / 입자수 등 경고 */
  warnings: string[];
}

const TOOL_LABELS: Record<ToolId, string> = {
  v60: "V60",
  kalita: "Kalita Wave",
  clever: "Clever",
  origami: "Origami",
  chemex: "Chemex",
};

export function buildMessages(
  stats: ParticleStats,
  selectedTool: ToolId,
  confidenceScore: number,
): ResultMessages {
  const diagnosis = diagnoseByD50(stats.d50);
  const fitness = toolFitness(stats.d50, selectedTool);
  const uni = uniformityAction(stats.uniformity);
  const fines = finesAction(stats.finesPercent);

  const headline = `${diagnosis.label} (D50 ${Math.round(stats.d50)}μm)`;

  const selectedLabel = TOOL_LABELS[selectedTool];
  const recommendedLabels = diagnosis.recommendedTools
    .map((t) => TOOL_LABELS[t])
    .join(", ");

  let toolFitMessage: string;
  if (fitness === "optimal") {
    toolFitMessage = `${selectedLabel} 에 잘 맞아요`;
  } else if (recommendedLabels) {
    const direction = stats.d50 < 650 ? "곱은" : "굵은";
    toolFitMessage = `${selectedLabel} 에는 약간 ${direction} 편이에요. ${recommendedLabels} 추천`;
  } else {
    toolFitMessage = `${selectedLabel} 에는 분쇄도 범위가 벗어났어요. 분쇄도를 조정해보세요`;
  }

  const recipe = `${uni.action} ${fines.action}`;

  const warnings: string[] = [];
  if (confidenceScore < 5) {
    warnings.push("신뢰도가 낮아요. 더 밝은 곳에서 재측정을 권장합니다.");
  }
  if (stats.particleCount < 100) {
    warnings.push(
      `검출된 입자가 적어요(${stats.particleCount}개). 통계 신뢰도가 낮을 수 있습니다.`,
    );
  }

  return { headline, toolFitMessage, recipe, warnings };
}
