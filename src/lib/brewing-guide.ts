/**
 * 분쇄도(D50) + 균일도 + 클럼프 비율 기반 추출 도구 가이드.
 *
 * 결과 화면의 "이 분쇄로는 어떻게 추출하면 좋을까" 가이드.
 * 절대 권장이 아닌 안내 — 디스클레이머 (측정값은 상대 비교용) 와 함께 사용.
 *
 * **분류 정책: 3 카테고리 + mmPerPixel 기반 confidence (2026-05-02 변경)**
 *
 * 이전 4-카테고리 (espresso/moka/pour-over/french press) 는 이론상 외부 표준
 * sieve 임계값 (350/500/800) 과 정확히 1:1 매핑되었다. 4-anchor sieve fixture
 * 검증 결과 (manifest.json) 카메라 거리 (mmPerPixel) 에 따라 image D50 측정에
 * sub-pixel particle 검출 한계로 ±200μm 편향 발생 → 4-카테고리 정확도 한계.
 *
 * 3-카테고리로 단순화 + image 측정 신뢰도 (mmPerPixel) 표시:
 *  1) 미세 (<500μm sieve)   — 에스프레소 / 모카포트
 *  2) 중간 (500~900μm sieve) — 핸드드립 (V60·Kalita·Origami·Chemex 통칭)
 *  3) 거침 (>900μm sieve)   — 프렌치프레스 / 콜드브루
 *
 * 카테고리 내에서 brewing 추천은 primary + avoid 로 분기.
 * 사용자가 익숙한 "추출 방식" 단위 표현은 유지하되, 카테고리 라벨만 단순화.
 * "차선" 은 SpectrumBar UI 가 분쇄도 spectrum 위 위치 정보로 대체 (2026-05-06 결정).
 *
 * **D50 임계값 — 표준 sieve 기준**
 *
 *  < 500 : 미세 (espresso 영역 + moka 영역 통합)
 *  500~900 : 중간 (V60 600~800 + french press 시작 800 buffer 포함)
 *  900+ : 거침 (french press / cold brew)
 *
 * 800 → 900 으로 buffer 를 넓힌 이유: pour-over 위쪽 경계 측정 노이즈 흡수.
 * fundamental 분류 라인은 외부 표준이지만 단순화된 3-단계는 측정 한계 반영.
 *
 * **mmPerPixel-기반 측정 신뢰도**
 *
 *  ≤ 0.05 : high   (V60 fixture anchor 수준, 미세 입자까지 검출 가능)
 *  ≤ 0.07 : medium (보통 — fine grind 일부 sub-pixel)
 *   > 0.07 : low   (멀리 촬영 — 다시 가까이 촬영 권장)
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
  /** 가장 적합한 추출법 (1~2개) — 결과 화면 title 의 badge 로 표시 */
  primary: string[];
  /** 측정 신뢰도 라벨 ("high" | "medium" | "low") */
  measurementConfidence: "high" | "medium" | "low";
  /** 분쇄 품질 / 측정 신뢰도 관련 caveat (있을 때만) */
  caveat?: string;
}

/**
 * 분쇄도 분류 — D50 기준 (μm), **표준 sieve 임계값 단순화** (3 카테고리).
 *
 * 입력 D50 은 sieve-equivalent (calibration 적용 후) 임을 전제로 한다.
 * raw image D50 을 직접 넣으면 모든 결과가 한 단계 곱은 쪽으로 치우침.
 */
function classifyD50(d50: number): "fine" | "medium" | "coarse" {
  if (d50 < 500) return "fine";
  if (d50 < 900) return "medium";
  return "coarse";
}

/**
 * 균일도 라벨. d90/d10 기준, **image-space** 임계값.
 *
 * sieve uniformity 표준 (2.5/3.5/5.0) 을 그대로 쓰지 않는 이유는 파일 상단
 * doc-comment 참조. anchor: VS3 + Hyperhoba @ 11 (전문가급 burr) image
 * uniformity ≈ 4.0 → "excellent" 분류 기대.
 */
function classifyUniformity(
  uniformity: number,
): "excellent" | "good" | "uneven" | "very_uneven" {
  if (uniformity <= 4.5) return "excellent";
  if (uniformity <= 6.0) return "good";
  if (uniformity <= 8.0) return "uneven";
  return "very_uneven";
}

/**
 * 측정 신뢰도 분류 — mmPerPixel 기준.
 *
 * mmPerPixel 작을수록 (= 동전 화면 비율 큼 = 가까이 촬영) 미세 입자 검출 정확도 ↑.
 * Setting 11 (mmPerPx 0.045) anchor 수준이 high. mmPerPx > 0.07 (5.1, 9 fixture
 * 수준) 은 fine grind 측정 시 sub-pixel particle 누락 가능 → low.
 */
function classifyMeasurementConfidence(
  mmPerPixel: number,
): "high" | "medium" | "low" {
  if (mmPerPixel <= 0.05) return "high";
  if (mmPerPixel <= 0.07) return "medium";
  return "low";
}

export function buildBrewingGuide(input: {
  d50: number;
  uniformity: number;
  clumpAreaRatio: number;
  mmPerPixel: number;
}): BrewingGuide {
  const grindClass = classifyD50(input.d50);
  const uniClass = classifyUniformity(input.uniformity);
  const measurementConfidence = classifyMeasurementConfidence(input.mmPerPixel);

  let primary: string[] = [];

  // 3-카테고리 → primary 추천만. 차선 / 비추는 spectrum bar UI 가 위치 정보로
  // 시각적으로 표현 (2026-05-06, plan-ceo-review 결정).
  switch (grindClass) {
    case "fine":
      primary = ["에스프레소", "모카포트"];
      break;
    case "medium":
      primary = ["핸드드립"];
      break;
    case "coarse":
      primary = ["프렌치프레스", "콜드브루"];
      break;
  }

  // caveat 모음:
  //  1) **에스프레소 영역 경고** (2026-05-03 추가) — 본 측정은 핸드드립 최적화
  //  2) 측정 신뢰도 (mmPerPixel)
  //  3) 클럼프 (분쇄 품질)
  //  4) 균일도 편차
  const caveats: string[] = [];

  // **핸드드립 최적화 명시** (2026-05-03 product 결정):
  // 사용자 대다수가 핸드드립용 → fine grind (에스프레소/모카포트) 영역은
  // sub-pixel 한계 + fines 비중 높아 측정 정확도 본질적으로 낮음. 명시적으로
  // 안내해서 사용자가 espresso 측정값을 절대값으로 신뢰하지 않게 함.
  if (grindClass === "fine") {
    caveats.push(
      "이 측정은 핸드드립 분쇄도에 최적화되어 있어요. 에스프레소/모카포트 영역 (미세 분쇄) 은 절대값보다 상대 비교용으로 활용해주세요.",
    );
  }

  if (measurementConfidence === "low") {
    caveats.push(
      "측정 정확도 낮음 — 동전이 화면의 30% 이상 차지하도록 더 가까이 촬영하면 결과가 더 정확해져요.",
    );
  } else if (measurementConfidence === "medium" && grindClass === "fine") {
    // 'fine' 일 때만 medium confidence 도 추가 caveat (이미 위에서 fine 경고 있음).
    caveats.push(
      "더 정확하게 측정하려면 동전이 화면 1/3 이상 차도록 가까이 촬영해주세요.",
    );
  }

  // clump caveat — Phase 1/2 (2026-05-05) 후 부드럽게 조정.
  // 큰 contour 가 boulder (단일 큰 입자) vs clump (응집/over-segmentation) 로
  // 별도 분리됨. clump area 큰 경우 대부분 인접 입자 merge artifact 라서
  // "burr 점검" 같은 단정 표현 X — 촬영 / 분쇄물 펴기 안내 위주.
  if (input.clumpAreaRatio >= 40) {
    caveats.push(
      `클럼프 ${input.clumpAreaRatio.toFixed(0)}% — 일부 입자가 뭉쳐 있어요. 분쇄 후 가볍게 흔들어 평탄하게 펴고 다시 측정하면 더 정확해져요.`,
    );
  } else if (input.clumpAreaRatio >= 20) {
    caveats.push(
      `클럼프 ${input.clumpAreaRatio.toFixed(0)}% — 일부 입자가 뭉쳐 있어요. 분쇄물을 얇게 펴 다시 촬영하면 정확도가 올라가요.`,
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
    measurementConfidence,
    caveat: caveats.length > 0 ? caveats.join(" ") : undefined,
  };
}

export const _internal = {
  classifyD50,
  classifyUniformity,
  classifyMeasurementConfidence,
};
