/**
 * 입자 통계 — D10/D50/D90, Fines%, Uniformity.
 *
 * 파이프라인 5~6단계 (plain.md Section 6).
 *
 * 등가 직경 가정: 원으로 근사 → D = 2 * sqrt(A / PI).
 * 실제 입자는 각진 형상이 많아 실제 직경보다 5~15% 과소평가 (디스클레이머 정당화).
 *
 * 노이즈 필터:
 *  - 100μm 미만 입자 제거 (watershed oversegment + 카메라 노이즈)
 *  - 10000μm (10mm) 초과 contour 제거 (배경: wood floor, 컵받침, napkin 그림자)
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
  /** 클럼프 (분쇄가 안 된 덩어리, 통계에서 제외된 입자) 통계 */
  clumps: {
    count: number;
    totalAreaMm2: number;
    /** 전체 면적 대비 클럼프 면적 비율 (백분율 0~100) — UI 경고 임계값 */
    areaRatio: number;
  };
}

// **MIN diameter — adaptive** (2026-05-02 C1, 2026-05-03 floor 75 raise):
// 이전 고정 100μm image-space → 픽셀 해상도에 따라 dynamic.
// 다른 AI 비평: "100μm 이하 fines 누락" 정당. 실제로 mmPerPx 작을 때 (close-up,
// 동전 크게 보임) 100μm 는 이미 2-3px 라 안전한 검출 가능 → 더 낮춰 fines 회복.
// mmPerPx 클 때 (멀리 촬영, 동전 작게 보임) 는 100μm 가 1-2px 라 sub-pixel
// 한계로 자연스럽게 fines 검출 안 됨 — MIN 그대로 100 유지.
//
// **2026-05-03 floor raise (50 → 75 image)**:
// 사용자 ground-truth — V60 16g/220g/3min 정상 추출 그라인드 측정 시 fines%
// 17.8% 노출 (Hypernova spec 기대 5-10% 의 2x). 1-2픽셀 노이즈 입자 (sub-pixel
// 한계 이하) 가 fines 로 over-count 되는 문제. floor 75 (= ~127µm sieve) 로
// 1픽셀 노이즈 제외.
//
// 즉 **MIN 은 절대 100 초과하지 않게**, 가까이 촬영시만 더 낮춤 (75 까지).
// 공식: min(100, 1500 × mmPerPx), 하한 75.
//   mmPerPx 0.030 (5.1 close-up): 45 → clamp 75 (이전 50)
//   mmPerPx 0.045 (V60 close-up): 67.5 → clamp 75 (이전 67)
//   mmPerPx 0.05  (V60 normal):   75 → 75
//   mmPerPx 0.069 (moka):         103 → clamp 100 (이전 동일)
//   mmPerPx 0.10+ (보통/멀리):    150+ → clamp 100 (이전 동일)
function computeMinDiameter(mmPerPixel: number): number {
  return Math.max(75, Math.min(100, 1500 * mmPerPixel));
}
// **finesPercent 임계** — image-space, "미분" 면적 비율 계산용.
// industry 표준 fines (<300μm sieve) 보다 더 wide 한 정의 (image-space 300 = sieve
// 510). 같은 분쇄 내 상대 비교용. UI "미분 N%" 로 표시.
const FINES_THRESHOLD_UM = 300;

// **D-value mainFraction 임계** (2026-05-03 final, signal-quality 기반):
//
// image-space 117 = sieve ~200µm = **2 pixel diameter** at typical mmPerPixel.
// D10/D50/D90 계산 시 사용하는 main fraction 의 하한 — 1-2픽셀 sub-pixel
// borderline noise 만 제외, 4+ pixel area 의 real 입자 모두 포함.
//
// **결정 근거** (사용자 stance "signal quality > value matching"):
//  픽셀 quantization 분석:
//    228-259 sieve = 134-152 image = 2-2.2 pixel D, 4 pixel area  → real
//    295-336 sieve = 174-198 image = 2.6-2.9 pixel D, 5-7 pixel area → real
//    383+ sieve = 225+ image = 3+ pixel D, 9+ pixel area → real
//
//  이전 시도 (176 image = 300 sieve):
//    228-300 sieve real 입자가 main 에서 제외 — V60 spec 매치 위해 임계 올렸으나
//    사용자 grinder 가 V60 사용 X → 임계 조정 무효. signal quality 원칙 위배.
//
//  117 image (= 2 pixel D) 는 자연스러운 noise floor — sub-pixel artifact 만 제외.
//  D-값 = 검출된 real 입자의 honest count-based percentile.
//
// **finesPercent 와 분리 유지**:
//  FINES_THRESHOLD_UM (300 image) — UI "미분 N%" 라벨 (industry-friendly)
//  MAIN_FRACTION_MIN (117 image)  — D-값 계산 (signal-quality threshold)
const MAIN_FRACTION_MIN_UM = 117;
// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
// 배경 (나무 바닥, 컵받침, napkin 가장자리 그림자) 으로 간주 — 가장 굵은 분쇄도
// (French Press ~1.2mm) + whole bean (~8mm) 도 충분히 포괄하는 15mm 임계.
// 15mm 초과는 사실상 분쇄 입자가 아닌 배경 영역.
const MAX_PARTICLE_DIAMETER_UM = 15000;

// 클럼프 (덩어리) 분리 임계 — 통계 오염 방지.
// tuned 2026-05-02 (revision 3 — V60 핸드드립 정확도 우선 cap 강화).
// 분쇄가 안 된 덩어리, 추출 후 압착된 퍽 잔여물 등 "정상 입자" 가 아닌 outlier.
//
// **정책 (2026-05-02)**: V60 핸드드립 단일 입자 최대 ≈ 1.5mm physical.
// > 1.5mm physical 입자가 검출되면 거의 100% 응집/touching → 통계 제외.
//
// **트레이드오프**:
//  - cap 1500μm image-space (= 2550μm sieve with ratio 1.7)
//    → V60 영역 D90/uniformity 정확. french press 1.5-2mm 입자 일부 손실.
//  - 핸드드립 우선 정책 (사용자 결정) 과 일관 — french press 영역은
//    confidence 'medium' 라벨로 정확도 한계 안내.
//
// **이력**:
//  - v1: max(2000μm, D50×4) — multiplier 방식. 양성 피드백 루프 (응집이
//    D50 부풀림 → threshold 도 부풀림 → 응집 살아남음).
//  - v2: 절대 cap 2000μm. 사용자 지시 "french press 이상 사이즈 제외".
//    그러나 V60 사진에서 1.5-2mm 응집이 통과해 D90 inflate (실측 1991μm).
//  - v3 (현재): 절대 cap 1500μm. V60 핸드드립 정확도 우선.
//
// MAX_PARTICLE_DIAMETER_UM (15mm) 은 배경(가장자리, 그림자) 필터로 별개 유지.
const CLUMP_MIN_DIAMETER_UM = 1500;

interface DerivedSummary {
  d10: number;
  d50: number;
  d90: number;
  uniformity: number;
  finesPercent: number;
  clumpAreaRatio: number;
}

/**
 * D10/D50/D90 + uniformity + finesPercent + clumpAreaRatio 산출.
 *
 * D-값은 sub-pixel noise 제외 (MAIN_FRACTION_MIN_UM = 117 image ≈ 200 sieve).
 * main fraction 이 비면 (모두 sub-200 인 극단 케이스) 전체 diameters 로 fallback.
 *
 * `diameters` 는 정렬된 상태 가정.
 */
function summarize(
  diameters: number[],
  totalAreaMm2: number,
  finesAreaMm2: number,
  clumpAreaMm2: number,
): DerivedSummary {
  const mainFraction = diameters.filter((d) => d >= MAIN_FRACTION_MIN_UM);
  const dValueSource = mainFraction.length > 0 ? mainFraction : diameters;
  const d10 = percentile(dValueSource, 0.1);
  const d50 = percentile(dValueSource, 0.5);
  const d90 = percentile(dValueSource, 0.9);
  const uniformity = d10 > 0 ? d90 / d10 : Infinity;
  const finesPercent =
    totalAreaMm2 > 0 ? (finesAreaMm2 / totalAreaMm2) * 100 : 0;
  const clumpAreaRatio =
    totalAreaMm2 + clumpAreaMm2 > 0
      ? (clumpAreaMm2 / (totalAreaMm2 + clumpAreaMm2)) * 100
      : 0;
  return { d10, d50, d90, uniformity, finesPercent, clumpAreaRatio };
}

export function computeStats(
  contours: CvMatVector,
  mmPerPixel: number,
): ParticleStats {
  // 1단계: 모든 contour 의 직경 + 면적 수집 (배경/노이즈 1차 필터)
  const minDiameterUm = computeMinDiameter(mmPerPixel);
  const candidates: Array<{ diameterUm: number; areaMm2: number }> = [];
  // diagnostic: 필터별 카운트 + raw 분포 통계 (DEBUG_STATS=1 시 출력)
  let belowMinCount = 0;
  let aboveMaxCount = 0;
  const rawDiameters: number[] = [];

  const numContours = contours.size();
  for (let i = 0; i < numContours; i++) {
    const c = contours.get(i);
    const areaPx = cv.contourArea(c);
    try {
      c.delete();
    } catch {
      /* ignore */
    }

    const areaMm2 = areaPx * mmPerPixel ** 2;
    const diameterMm = 2 * Math.sqrt(areaMm2 / Math.PI);
    const diameterUm = diameterMm * 1000;

    rawDiameters.push(diameterUm);

    if (diameterUm < minDiameterUm) {
      belowMinCount++;
      continue;
    }
    if (diameterUm > MAX_PARTICLE_DIAMETER_UM) {
      aboveMaxCount++;
      continue;
    }

    candidates.push({ diameterUm, areaMm2 });
  }

  if (candidates.length === 0) {
    throw new Error("computeStats: 입자 0개 (필터 후)");
  }

  // 2단계: 클럼프 임계 결정 — 절대 cap (CLUMP_MIN_DIAMETER_UM).
  // tempD50 은 diagnostic 출력용으로만 계산.
  const tempSorted = candidates.map((c) => c.diameterUm).sort((a, b) => a - b);
  const tempD50 = percentile(tempSorted, 0.5);
  const clumpThresholdUm = CLUMP_MIN_DIAMETER_UM;

  // 3단계: 클럼프 분리. 정상 입자 통계와 분리 보고.
  const diameters: number[] = [];
  let totalAreaMm2 = 0;
  let finesAreaMm2 = 0;
  let clumpCount = 0;
  let clumpAreaMm2 = 0;
  for (const { diameterUm, areaMm2 } of candidates) {
    if (diameterUm > clumpThresholdUm) {
      clumpCount++;
      clumpAreaMm2 += areaMm2;
      continue;
    }
    diameters.push(diameterUm);
    totalAreaMm2 += areaMm2;
    if (diameterUm < FINES_THRESHOLD_UM) {
      finesAreaMm2 += areaMm2;
    }
  }

  if (diameters.length === 0) {
    throw new Error("computeStats: 클럼프 필터 후 정상 입자 0개");
  }

  diameters.sort((a, b) => a - b);
  const { d10, d50, d90, uniformity, finesPercent, clumpAreaRatio } =
    summarize(diameters, totalAreaMm2, finesAreaMm2, clumpAreaMm2);

  // diagnostic: raw → 필터 breakdown → 통계 입자 수.
  // DEBUG_STATS=1 환경변수 설정 시에만 출력 (production 노이즈 방지).
  if (
    typeof globalThis.process !== "undefined" &&
    globalThis.process?.env?.DEBUG_STATS === "1"
  ) {
    const sortedRaw = [...rawDiameters].sort((a, b) => a - b);
    const p = (q: number) =>
      sortedRaw.length > 0 ? Math.round(percentile(sortedRaw, q)) : 0;
    console.log(
      `[stats] raw contours=${numContours} ` +
        `(P5=${p(0.05)} P25=${p(0.25)} P50=${p(0.5)} ` +
        `P75=${p(0.75)} P95=${p(0.95)} P99=${p(0.99)} max=${Math.round(sortedRaw[sortedRaw.length - 1] ?? 0)}μm image-space) | ` +
        `filtered: <${Math.round(minDiameterUm)}μm noise=${belowMinCount} ` +
        `(${((belowMinCount / numContours) * 100).toFixed(1)}%), ` +
        `>${MAX_PARTICLE_DIAMETER_UM}μm bg=${aboveMaxCount} | ` +
        `candidates=${candidates.length} (tempD50=${Math.round(tempD50)}μm, ` +
        `clumpThreshold=${Math.round(clumpThresholdUm)}μm) | ` +
        `clumps=${clumpCount} (${clumpAreaRatio.toFixed(1)}% area) | ` +
        `final=${diameters.length} particles`,
    );
  }

  return {
    d10,
    d50,
    d90,
    finesPercent,
    uniformity,
    particleCount: diameters.length,
    totalAreaMm2,
    diameters,
    clumps: {
      count: clumpCount,
      totalAreaMm2: clumpAreaMm2,
      areaRatio: clumpAreaRatio,
    },
  };
}

/**
 * **Multi-shot averaging — 여러 측정의 ParticleStats 통합** (2026-05-03).
 *
 * 같은 분쇄도를 N장 촬영 → 각 shot 의 stats 를 합쳐 더 큰 sample 로 D10/D50/D90
 * 재계산. shot noise (조명 미세 변화, 입자 배치 우연) 가 √N 으로 줄어 측정 신뢰도
 * 1.4x (2 shot) ~ 1.7x (3 shot) ↑.
 *
 * **결합 로직**:
 *  - diameters[]      : concat 후 sort → 더 큰 sample 의 percentile (정확도 ↑)
 *  - particleCount    : sum
 *  - totalAreaMm2     : sum
 *  - clumps           : count/area sum, areaRatio 재계산
 *  - finesPercent     : 면적 가중 합 → fines/total 비율 재계산
 *  - uniformity       : 새 D90/D10 으로 재계산
 *
 * **불변식**:
 *  - 단일 shot 입력 시 입력과 동일한 stats 반환 (idempotent for size 1)
 *  - 빈 배열 입력 시 throw
 *
 * **주의**: diameters 는 sieve-space (calibration 적용 후) 가정. PipelineResult.stats
 * 는 이미 sieve 변환 완료 (pipeline.ts:127 applyImageToSieveCalibration).
 */
export function combineStats(stats: ParticleStats[]): ParticleStats {
  if (stats.length === 0) throw new Error("combineStats: 빈 배열");
  if (stats.length === 1) return stats[0];

  // diameters concat + sort. ~6000 입자 (3 shot × 2000) 정렬 ≈ ~1ms.
  const allDiameters: number[] = [];
  let particleCount = 0;
  let totalAreaMm2 = 0;
  // 면적 가중 fines: 각 shot 의 finesArea = totalArea × (finesPercent / 100).
  let finesAreaMm2 = 0;
  let clumpCount = 0;
  let clumpAreaMm2 = 0;

  for (const s of stats) {
    allDiameters.push(...s.diameters);
    particleCount += s.particleCount;
    totalAreaMm2 += s.totalAreaMm2;
    finesAreaMm2 += s.totalAreaMm2 * (s.finesPercent / 100);
    clumpCount += s.clumps.count;
    clumpAreaMm2 += s.clumps.totalAreaMm2;
  }

  if (allDiameters.length === 0) {
    throw new Error("combineStats: 합쳐진 입자 0개");
  }

  allDiameters.sort((a, b) => a - b);
  const { d10, d50, d90, uniformity, finesPercent, clumpAreaRatio } =
    summarize(allDiameters, totalAreaMm2, finesAreaMm2, clumpAreaMm2);

  return {
    d10,
    d50,
    d90,
    finesPercent,
    uniformity,
    particleCount,
    totalAreaMm2,
    diameters: allDiameters,
    clumps: {
      count: clumpCount,
      totalAreaMm2: clumpAreaMm2,
      areaRatio: clumpAreaRatio,
    },
  };
}

/**
 * Count-based percentile with linear interpolation between adjacent values.
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

export const _internal = {
  computeMinDiameter,
  FINES_THRESHOLD_UM,
  MAIN_FRACTION_MIN_UM,
  MAX_PARTICLE_DIAMETER_UM,
  CLUMP_MIN_DIAMETER_UM,
};
