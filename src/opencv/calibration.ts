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
 * **Anchor — Varia VS3 + Hyperhoba burr @ 11 (pour-over 우선 정책)**
 *
 * **2026-05-02 후속 수정**: tune-pipeline.ts EXIF 버그 발견. sharp.metadata()
 * 가 pre-rotate 차원 반환 → resize cover-fit 으로 portrait 사진 상하단 잘림 →
 * 코인 위치 잘려 HoughCircles false-positive (큰 phantom circle) 잡음 →
 * mmPerPixel 부정확 (실제보다 작게 측정) → image D50 도 부정확.
 *
 * 브라우저 (real <img>+canvas, EXIF 정상 처리) 측정 결과로 재보정:
 *
 *   Setting 11 (V60 pour-over) — fixture test-vs3-11.jpg
 *     - browser: coin r=77 (정확), mmPerPx = 0.172
 *     - browser: image D50 ≈ 414μm
 *     - sieve target: V60 표준 700μm
 *     - ratio = 700 / 414 ≈ **1.69** → **1.7** 으로 round
 *
 * 이전 ratio 3.3 (구 tune-pipeline 의 r=298 false positive 기반) 은 invalid.
 * 다른 fixture (5.1, 9, 13) 의 manifest observed 데이터도 동일 버그 영향 →
 * Phase 2 에서 브라우저 측정으로 재검증 필요.
 *
 * **정책: 핸드드립 우선 anchor (사용자 결정 2026-05-02)**
 *  - 핸드드립이 가장 일반적 추출법 → 정확도 우선
 *  - Setting 11 (V60 pour-over) 브라우저 측정 anchor
 *  - 다른 grind 영역은 brewing-guide 의 3-카테고리 단순화 (fine/medium/coarse) 와
 *    measurement confidence 표시로 대응 (camera distance 가까울수록 신뢰도 ↑)
 *
 * **Phase 2 TODO**
 *  - 사용자 sieve 분급된 ground-truth fixture 로 정밀 보정
 *  - 다른 setting (5.1, 9, 13) 브라우저 재측정으로 4-anchor 재구성
 *  - mmPerPixel-aware 적응형 ratio (선형 회귀)
 *  - Sub-pixel 입자 추정 (해상도 한계 극복)
 *  - coin detection filter 완화 (|int-ext| 70 임계가 일부 동전 false reject)
 */

import type { ParticleStats } from "./statistics";

/**
 * Image-measured 직경에 곱하면 sieve-equivalent 직경이 나오는 비율.
 *
 * **2026-05-05 재anchor**: D-값 계산을 count-percentile → volume-weighted percentile
 * 로 전환 (statistics.ts). 산업 표준 (Malvern D[v,0.5], sieve mass-weighted) 일치
 * 정책. count → volume 으로 D50 자체 값이 ~2.7x 커짐 (V60 anchor 414 → 1110).
 *
 * Setting 11 (V60 pour-over) — fixtures/test-vs3-11.jpg, 브라우저 anchor:
 *   - mmPerPx = 0.170 (정확)
 *   - image volume-D50 ≈ 1110μm
 *   - sieve target: V60 표준 700μm
 *   - ratio = 700 / 1110 ≈ **0.63**
 *
 * 이전 1.7 은 count-D50 (414) 기반 — volume-D50 (1110) 와 일관성 X. 재anchor 필수.
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

export const _internal = { IMAGE_TO_SIEVE_RATIO };
