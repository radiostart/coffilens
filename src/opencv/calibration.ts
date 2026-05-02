/**
 * Image-measured → sieve-equivalent 직경 변환.
 *
 * **왜 필요한가**
 *
 * 등가 원형 직경 (equivalent circular diameter) 으로 측정한 image-based
 * 직경은 sieve 분급 직경보다 systematic 하게 작게 나온다 (~ 0.4 배). 원인:
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
 * **Anchor (잠정)**
 *
 * Varia VS3 + Hyperhoba burr @ 11.5
 *   - sieve target: V60 grind 표준 ≈ 700μm (range 600~800)
 *   - image measured: D50 ≈ 249μm (test-vs3-100.jpg, 2026-05-02)
 *   - ratio: 700 / 249 ≈ 2.81 → 2.8 으로 round
 *
 * **TODO** 사용자 sieve 분급된 ground-truth fixture 4종 (espresso/모카포트/
 * 핸드드립/프렌치프레스) 도착 후 anchor 4점 평균으로 정확히 재보정. 현재 1점
 * anchor 라 grind range 양 끝 (espresso, coarse) 의 정확도는 검증 필요.
 */

import type { ParticleStats } from "./statistics";

/**
 * Image-measured 직경에 곱하면 sieve-equivalent 직경이 나오는 비율.
 *
 * 잠정값 2.8 — vs3-100 anchor 1점 기준. fixture 도착 후 fine-tune 예정.
 */
export const IMAGE_TO_SIEVE_RATIO = 2.8;

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

export const _internal = { IMAGE_TO_SIEVE_RATIO };
