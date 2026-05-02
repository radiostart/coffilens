/**
 * 분쇄도(D50) + 균일도 + 클럼프 비율 기반 추출 도구 가이드.
 *
 * 결과 화면의 "이 분쇄로는 어떻게 추출하면 좋을까" 가이드.
 * 절대 권장이 아닌 안내 — 디스클레이머 (측정값은 상대 비교용) 와 함께 사용.
 *
 * **분류 정책: 4 카테고리** (도구 세분화 X)
 *  1) 에스프레소 — 매우 곱은 분쇄, 9bar 압력 추출
 *  2) 모카포트 — 곱은 분쇄, 가스레인지 압력 추출
 *  3) 핸드드립 — 중간 분쇄, 중력 통과식 (V60·Kalita·Origami·Chemex 통칭)
 *  4) 프렌치프레스 — 굵은 분쇄, 침지 추출 (콜드브루 포함)
 *
 * **D50 임계값 — 표준 sieve 기준 (Hoffmann/SCA/Perfect Daily Grind 등 외부 reference)**
 *
 *  < 350 : 에스프레소
 *  350~500 : 모카포트
 *  500~800 : 핸드드립
 *  800+ : 프렌치프레스 / 콜드브루
 *
 * 이 임계값은 **외부 표준** 이므로 우리가 결정/조정할 영역이 아님. 측정 결과를
 * sieve scale 로 align 시키는 책임은 `src/opencv/calibration.ts` 에서 진다.
 * (image-measured 직경 × IMAGE_TO_SIEVE_RATIO → sieve-equivalent 직경)
 *
 * **uniformity 임계값 — image-space (raw 측정값 기준)**
 *
 * D90/D10 비율은 ratio calibration 으로 변환되지 않아 sieve uniformity 와
 * 직접 비교 불가. image segmentation 의 over-segmentation 으로 sieve 대비
 * spread 가 부풀려 측정되는 systematic bias 가 있어 sieve 표준 임계값 (2.5/3.5/5.0)
 * 을 그대로 쓰면 좋은 burr 도 "uneven" 으로 잘못 분류됨. caveat 용 ancillary
 * metric 으로만 사용.
 */

export interface BrewingGuide {
  /** 가장 적합한 추출법 (1~2개) */
  primary: string[];
  /** 차선 추출법 (조건부, 가능) */
  secondary: string[];
  /** 비추천 추출법 + 이유 */
  avoid: string[];
  /** 분쇄 품질 / 측정 신뢰도 관련 caveat (있을 때만) */
  caveat?: string;
}

/**
 * 분쇄도 분류 — D50 기준 (μm), **표준 sieve 임계값** (4 카테고리).
 *
 * 입력 D50 은 sieve-equivalent (calibration 적용 후) 임을 전제로 한다.
 * raw image D50 을 직접 넣으면 모든 결과가 한 단계 곱은 쪽으로 치우침.
 */
function classifyD50(d50: number):
  | "very_fine"
  | "fine"
  | "medium"
  | "coarse" {
  if (d50 < 350) return "very_fine";
  if (d50 < 500) return "fine";
  if (d50 < 800) return "medium";
  return "coarse";
}

/**
 * 균일도 라벨. d90/d10 기준, **image-space** 임계값.
 *
 * sieve uniformity 표준 (2.5/3.5/5.0) 을 그대로 쓰지 않는 이유는 파일 상단
 * doc-comment 참조. anchor: VS3 + Hyperhoba @ 11.5 (전문가급 burr) image
 * uniformity ≈ 4.95 → "good" 분류 기대.
 */
function classifyUniformity(
  uniformity: number,
): "excellent" | "good" | "uneven" | "very_uneven" {
  if (uniformity <= 4.5) return "excellent";
  if (uniformity <= 6.0) return "good";
  if (uniformity <= 8.0) return "uneven";
  return "very_uneven";
}

export function buildBrewingGuide(input: {
  d50: number;
  uniformity: number;
  clumpAreaRatio: number;
}): BrewingGuide {
  const grindClass = classifyD50(input.d50);
  const uniClass = classifyUniformity(input.uniformity);

  let primary: string[] = [];
  let secondary: string[] = [];
  let avoid: string[] = [];

  // 4 카테고리만 분기 — 도구별 세분화 (V60/Origami/Kalita/Chemex) 의도적으로 X.
  // 사용자가 원하는 분류는 "추출 방식" 단위 (에스프레소/모카포트/핸드드립/프렌치프레스).
  switch (grindClass) {
    case "very_fine":
      primary = ["에스프레소"];
      secondary = ["모카포트 (조금 굵게)"];
      avoid = ["핸드드립 (추출 너무 느림, 과추출)", "프렌치프레스 (미분 슬러지)"];
      break;
    case "fine":
      primary = ["모카포트"];
      secondary = ["에스프레소 (조금 곱게 조정 권장)"];
      avoid = ["프렌치프레스 (미분 슬러지)"];
      break;
    case "medium":
      primary = ["핸드드립"];
      secondary = ["모카포트 (조금 곱게)", "프렌치프레스 (조금 굵게)"];
      avoid = ["에스프레소 (너무 굵음, 채널링)"];
      break;
    case "coarse":
      primary = ["프렌치프레스", "콜드브루"];
      secondary = ["핸드드립 (조금 곱게 조정 권장)"];
      avoid = ["에스프레소 (추출 너무 빠름)", "모카포트"];
      break;
  }

  // 균일도 / 클럼프 기반 caveat.
  //
  // 임계값 (2026-05-02 조정):
  //  - ≥40% : 강한 경고 (puck/burr 문제 의심)
  //  - 20~40%: 약한 안내 (촬영 평탄도 권장 — grinder 비난 X)
  //  - <20%  : caveat 없음 (전문가급 grinder 도 정전기 cluster 로 일정 비율 발생, false alarm 방지)
  const caveats: string[] = [];
  if (input.clumpAreaRatio >= 40) {
    caveats.push(
      `덩어리(클럼프) 가 면적 ${input.clumpAreaRatio.toFixed(0)}% — 분쇄 안 된 큰 입자가 많아요. 추출 후 퍽 사진이거나 그라인더 burr 점검 필요.`,
    );
  } else if (input.clumpAreaRatio >= 20) {
    caveats.push(
      `덩어리 ${input.clumpAreaRatio.toFixed(0)}% — 일부 입자가 뭉쳐 있어요. 분쇄 후 가볍게 흔들어 평탄하게 펴고 다시 측정하면 더 정확해져요.`,
    );
  }
  if (uniClass === "very_uneven") {
    caveats.push(
      "균일도가 매우 낮음 — 칼날 그라인더거나 burr 가 무뎌진 상태일 수 있어요. 핸드드립처럼 균일성에 민감한 추출은 채널링 주의.",
    );
  } else if (uniClass === "uneven") {
    caveats.push(
      "균일도 편차 큼 — 침지(프렌치프레스) 또는 압력(모카포트·에스프레소) 추출이 채널링 위험 낮춰줘요.",
    );
  }

  return {
    primary,
    secondary,
    avoid,
    caveat: caveats.length > 0 ? caveats.join(" ") : undefined,
  };
}

export const _internal = { classifyD50, classifyUniformity };
