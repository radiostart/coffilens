/**
 * Image-measured → sieve-equivalent 직경 변환.
 *
 * **왜 필요한가**
 *
 * 등가 원형 직경 (equivalent circular diameter) 으로 측정한 image-based
 * 직경은 sieve 분급 직경보다 systematic 하게 작게 나온다 (~ 0.3 배). 원인:
 *  1. 입자가 평탄하게 누워서 촬영됨 → 가장 큰 단면만 보임
 *  2. Adaptive threshold over-segmentation: 큰 입자가 여러 fragment 로 쪼개짐
 *  3. 등가 원형 가정 자체의 underestimation (각진 입자 → 면적 환산 직경 < 실제 길이)
 *
 * 일반 barista 가이드 (Hoffmann/SCA/PDG 등) 는 모두 sieve 기준 D50 임계값
 * (espresso 200~350μm, V60 600~800μm 등) 을 쓰므로, 측정 결과를 sieve scale
 * 로 변환해야 외부 가이드와 비교 가능. brewing-guide.ts 의 임계값은 표준
 * sieve 기준을 그대로 사용 — 이 변환이 그 전제를 만족시키는 책임을 진다.
 *
 * **임계값 결정 — calibration 책임 분리**
 *
 *  measurement layer (statistics.ts)  : pure image-space (raw 직경)
 *  calibration layer (이 파일)        : image → sieve 변환
 *  guide layer (brewing-guide.ts)     : sieve 표준 임계값 (Hoffmann 등)
 *
 * 사용자/그라인더별 임계값 튜닝은 이 layer 에서만 일어나야 한다. 가이드
 * 임계값은 외부 표준을 따르는 게 원칙 (우리가 정할 문제가 아님).
 *
 * **Anchor — Varia VS3 + Hyperhoba burr @ 11 (V60 pour-over)**
 *
 * Setting 11 (V60 pour-over) — fixtures/test-vs3-11.jpg, 브라우저 anchor:
 *   - mmPerPx = 0.170 (정확)
 *   - image volume-D50 ≈ 1110μm
 *   - sieve target: V60 표준 700μm
 *   - ratio = 700 / 1110 ≈ **0.63**
 *
 * **2026-05-05 재anchor (volume-weighted 전환)**: D-값 계산을 count-percentile
 * → volume-weighted percentile 로 전환 (statistics.ts). 산업 표준 (Malvern
 * D[v,0.5], sieve mass-weighted) 일치 정책. count → volume 으로 D50 자체 값이
 * ~2.7x 커짐 (V60 anchor 414 → 1110), ratio 1.7 → 0.63 으로 재산출.
 *
 * **Phase 2 TODO**
 *  - 사용자 sieve 분급된 ground-truth fixture 로 정밀 보정 (grind-size-aware ratio)
 *  - 다른 setting (5.1, 9, 13) 브라우저 재측정으로 multi-anchor 재구성
 *  - mmPerPixel-aware 적응형 ratio (선형 회귀)
 *  - Sub-pixel 입자 추정 (해상도 한계 극복)
 *  - coin detection filter 완화 (|int-ext| 70 임계가 일부 동전 false reject)
 */

import type { ParticleStats } from "./statistics";

/**
 * Image-measured 직경에 곱하면 sieve-equivalent 직경이 나오는 비율.
 *
 * Setting 11 (V60 pour-over) brower-measured anchor 기반 단일 상수 (0.63).
 * grind-size-aware multi-anchor 보간은 sieve ground-truth 데이터 확보 시 도입.
 */
export const IMAGE_TO_SIEVE_RATIO = 0.63;

/**
 * computeStats 출력에 image → sieve 변환 적용.
 *
 * **변환 대상**: 직경 차원 (μm) 의 모든 값.
 *  - d10, d50, d90 → × ratio
 *  - diameters[] (히스토그램 입력) → × ratio
 *
 * **변환하지 않음**:
 *  - particleCount: 개수 (차원 무관)
 *  - uniformity: D90/D10 비율 → ratio 가 분자/분모 양쪽에 곱해져 상쇄, invariant
 *  - finesPercent: 면적 비율 (%) → image-space 정의 그대로 유지. fines threshold
 *    재정의는 별도 작업 (현재 image 300μm 기준).
 *  - totalAreaMm2, clumps.totalAreaMm2: 실측 면적 — sieve 직경과 의미가 다른
 *    metric 이므로 변환하지 않음.
 *  - clumps.areaRatio: 면적 비율 (%) → invariant.
 *
 * 새 ParticleStats 객체 반환 (input 불변).
 */
export function applyImageToSieveCalibration(
  stats: ParticleStats,
): ParticleStats {
  const r = IMAGE_TO_SIEVE_RATIO;
  return {
    ...stats,
    d10: stats.d10 * r,
    d50: stats.d50 * r,
    d90: stats.d90 * r,
    diameters: stats.diameters.map((d) => d * r),
  };
}

export const _internal = {
  IMAGE_TO_SIEVE_RATIO,
};
