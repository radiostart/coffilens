/**
 * 신뢰도 점수 (0~10) — 4가지 신호 가중 평균.
 *
 * 신호:
 *  - coin: 동전 검출 신뢰도 (F04 출력)
 *  - particles: 입자 수 단계 (PARTICLE_TIERS)
 *  - brightness: 밝기 적정도 (80~220 정상)
 *  - blur: Laplacian variance (>= 200 정상, < 100 이미 reject)
 *
 * 가중치 (베타 피드백으로 조정 가능 — ALGORITHM_NOTES 참조):
 *  - coin 0.3 + particles 0.4 + brightness 0.15 + blur 0.15
 *
 * < 5 점 시 결과 카드에 경고 배지 (재측정 권장).
 */

export interface ConfidenceInputs {
  coinConfidence: number; // 0~1
  particleCount: number;
  meanBrightness: number; // 0~255
  laplacianVariance: number;
}

export interface ConfidenceResult {
  /** 0~10 정수 */
  score: number;
  signals: {
    coin: number;
    particles: number;
    brightness: number;
    blur: number;
  };
  /** score < 5 — UI 경고 배지 표시 */
  warning: boolean;
}

const PARTICLE_TIERS = [
  { min: 500, score: 1.0 },
  { min: 200, score: 0.8 },
  { min: 50, score: 0.5 },
  { min: 0, score: 0.0 },
] as const;

const WEIGHTS = {
  coin: 0.3,
  particles: 0.4,
  brightness: 0.15,
  blur: 0.15,
} as const;

const BRIGHTNESS_LOW_REJECT = 80;
const BRIGHTNESS_HIGH_THRESHOLD = 220;
const BRIGHTNESS_HIGH_FALLOFF = 35;
const BLUR_TARGET = 200;

export function computeConfidence(inputs: ConfidenceInputs): ConfidenceResult {
  const particleSignal =
    PARTICLE_TIERS.find((t) => inputs.particleCount >= t.min)?.score ?? 0;

  let brightnessSignal: number;
  if (inputs.meanBrightness < BRIGHTNESS_LOW_REJECT) {
    brightnessSignal = 0;
  } else if (inputs.meanBrightness > BRIGHTNESS_HIGH_THRESHOLD) {
    brightnessSignal = Math.max(
      0,
      1 -
        (inputs.meanBrightness - BRIGHTNESS_HIGH_THRESHOLD) /
          BRIGHTNESS_HIGH_FALLOFF,
    );
  } else {
    brightnessSignal = 1.0;
  }

  const blurSignal = Math.min(1, inputs.laplacianVariance / BLUR_TARGET);

  const signals = {
    coin: clamp01(inputs.coinConfidence),
    particles: particleSignal,
    brightness: brightnessSignal,
    blur: blurSignal,
  };

  const weighted =
    signals.coin * WEIGHTS.coin +
    signals.particles * WEIGHTS.particles +
    signals.brightness * WEIGHTS.brightness +
    signals.blur * WEIGHTS.blur;

  const score = Math.round(clamp01(weighted) * 10);
  return { score, signals, warning: score < 5 };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export const _internal = {
  PARTICLE_TIERS,
  WEIGHTS,
  BRIGHTNESS_LOW_REJECT,
  BRIGHTNESS_HIGH_THRESHOLD,
};
