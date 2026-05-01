/**
 * 입자 통계 — D10/D50/D90, Fines%, Uniformity.
 *
 * 파이프라인 5~6단계 (plain.md Section 6).
 *
 * 등가 직경 가정: 원으로 근사 → D = 2 * sqrt(A / PI).
 * 실제 입자는 각진 형상이 많아 실제 직경보다 5~15% 과소평가 (디스클레이머 정당화).
 *
 * 노이즈 필터: 100μm 미만 입자 제거 (watershed oversegment + 카메라 노이즈).
 *
 * Division-by-zero 가드:
 *  - 빈 배열 → throw (호출자가 no_particles 처리)
 *  - D10 = 0 → uniformity = Infinity
 *  - totalArea = 0 → finesPercent = 0
 */

declare const cv: {
  contourArea: (contour: CvMat) => number;
};

interface CvMat {
  delete: () => void;
}

interface CvMatVector {
  size: () => number;
  get: (index: number) => CvMat;
}

export interface ParticleStats {
  d10: number;
  d50: number;
  d90: number;
  /** < 300μm 면적 비율 (백분율 0~100) */
  finesPercent: number;
  /** d90 / d10 — 분포 균일도 */
  uniformity: number;
  particleCount: number;
  totalAreaMm2: number;
  /** 정렬된 직경 배열 (μm) — 히스토그램 입력 (F07) */
  diameters: number[];
}

const MIN_PARTICLE_DIAMETER_UM = 100;
const FINES_THRESHOLD_UM = 300;

export function computeStats(
  contours: CvMatVector,
  mmPerPixel: number,
): ParticleStats {
  const diameters: number[] = [];
  let totalAreaMm2 = 0;
  let finesAreaMm2 = 0;

  const numContours = contours.size();
  for (let i = 0; i < numContours; i++) {
    const c = contours.get(i);
    const areaPx = cv.contourArea(c);
    // jsdom mock 호환 — get() 이 새 핸들 반환할 수 있어 try/catch
    try {
      c.delete();
    } catch {
      /* ignore */
    }

    const areaMm2 = areaPx * mmPerPixel ** 2;
    const diameterMm = 2 * Math.sqrt(areaMm2 / Math.PI);
    const diameterUm = diameterMm * 1000;

    if (diameterUm < MIN_PARTICLE_DIAMETER_UM) continue;

    diameters.push(diameterUm);
    totalAreaMm2 += areaMm2;
    if (diameterUm < FINES_THRESHOLD_UM) {
      finesAreaMm2 += areaMm2;
    }
  }

  if (diameters.length === 0) {
    throw new Error("computeStats: 입자 0개 (필터 후)");
  }

  diameters.sort((a, b) => a - b);
  const d10 = percentile(diameters, 0.1);
  const d50 = percentile(diameters, 0.5);
  const d90 = percentile(diameters, 0.9);

  const uniformity = d10 > 0 ? d90 / d10 : Infinity;
  const finesPercent =
    totalAreaMm2 > 0 ? (finesAreaMm2 / totalAreaMm2) * 100 : 0;

  return {
    d10,
    d50,
    d90,
    finesPercent,
    uniformity,
    particleCount: diameters.length,
    totalAreaMm2,
    diameters,
  };
}

/**
 * Percentile (linear interpolation between adjacent values).
 *
 * @throws 빈 배열 입력 시
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile: 빈 배열");
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export const _internal = { MIN_PARTICLE_DIAMETER_UM, FINES_THRESHOLD_UM };
