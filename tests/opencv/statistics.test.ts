import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeStats,
  percentile,
} from "../../src/opencv/statistics";

interface MockMat {
  delete: ReturnType<typeof vi.fn>;
}
interface MockMatVector {
  size: () => number;
  get: (i: number) => MockMat;
}

/**
 * cv mock — areasPx 시퀀스로 contourArea 가 매번 다른 값 반환.
 * mmPerPixel 입력 결합으로 직경 계산 검증.
 *
 * shape factor mock — 모든 large 입자가 default 로 clump 형상.
 * `setupCvMockWithShape` 가 boulder vs clump 분리 테스트용.
 */
function setupCvMock(areasPx: number[]) {
  let particleIdx = 0;
  let lastParticleArea = 0;
  let nextIsHull = false;
  vi.stubGlobal("cv", {
    contourArea: vi.fn(() => {
      if (nextIsHull) {
        nextIsHull = false;
        // clump-like hull (sol = 0.5 → hull = area / 0.5)
        return lastParticleArea / 0.5;
      }
      const a = areasPx[particleIdx % Math.max(1, areasPx.length)] ?? 0;
      particleIdx++;
      lastParticleArea = a;
      return a;
    }),
    arcLength: vi.fn(() =>
      Math.sqrt((4 * Math.PI * lastParticleArea) / 0.2),
    ),
    convexHull: vi.fn(() => {
      nextIsHull = true;
    }),
    Mat: function MockMat() {
      return { delete: vi.fn() };
    },
  });
  const contours: MockMatVector = {
    size: () => areasPx.length,
    get: () => ({ delete: vi.fn() }),
  };
  return contours;
}

/**
 * Shape-aware mock — boulder/clump 분리 테스트용.
 *
 * 호출 순서 (per particle):
 *   computeStats(c) → cv.contourArea(c) → [if large] cv.arcLength(c)
 *                   → cv.convexHull(c, hull) → cv.contourArea(hull)
 *
 * shapes[i] : 입자 i 의 형상 — "boulder" (circ 0.85, sol 0.95)
 *                            "clump"   (circ 0.30, sol 0.55)
 */
function setupCvMockWithShape(
  areasPx: number[],
  shapes: Array<"boulder" | "clump">,
) {
  let particleIdx = 0;
  // hull area 가 다음 contourArea 호출 — flag 로 구분.
  let nextIsHull = false;
  vi.stubGlobal("cv", {
    contourArea: vi.fn(() => {
      if (nextIsHull) {
        nextIsHull = false;
        const a = areasPx[particleIdx - 1] ?? 0;
        const sol = shapes[particleIdx - 1] === "boulder" ? 0.95 : 0.55;
        return a / sol;
      }
      const a = areasPx[particleIdx] ?? 0;
      particleIdx++;
      return a;
    }),
    arcLength: vi.fn(() => {
      const a = areasPx[particleIdx - 1] ?? 0;
      const circ = shapes[particleIdx - 1] === "boulder" ? 0.85 : 0.3;
      return Math.sqrt((4 * Math.PI * a) / circ);
    }),
    convexHull: vi.fn(() => {
      nextIsHull = true;
    }),
    Mat: function MockMat() {
      return { delete: vi.fn() };
    },
  });
  const contours: MockMatVector = {
    size: () => areasPx.length,
    get: () => ({ delete: vi.fn() }),
  };
  return contours;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("computeStats — 정상 케이스", () => {
  it("균일 직경 입자 → D10 ≈ D50 ≈ D90", () => {
    // mmPerPixel = 0.05 (close-up, V60 fixture 수준)
    // 직경 500μm 입자 100개:
    //   R = 250μm = 0.25mm → A = π*0.25^2 = 0.196 mm²
    //   areaPx = 0.196 / 0.05^2 = 0.196 / 0.0025 ≈ 78.5 → 79
    // CLUMP_MIN_DIAMETER_UM(2000μm) 미만이므로 전부 통과
    const areasPx = Array(100).fill(79);
    const contours = setupCvMock(areasPx);
    const stats = computeStats(contours, 0.05);

    expect(stats.particleCount).toBe(100);
    expect(stats.d10).toBeCloseTo(stats.d50, 0);
    expect(stats.d50).toBeCloseTo(stats.d90, 0);
    // 직경 약 500μm (image-space, ±2% tolerance)
    expect(stats.d50).toBeCloseTo(500, -2);
  });

  it("D10 < D50 < D90 단조 증가", () => {
    // 직경 100~1000μm 분포 (areaPx = (D/2 / mmPerPixel * 1000)^2 * π / 1000^2 * mmPerPixel^2 ...)
    // 단순화: 면적값 작은 → 큰 순서로 입력. mmPerPixel = 0.05
    // areaMm2 = areaPx * 0.0025 (mmPerPixel^2)
    // D = 2*sqrt(areaMm2/π) * 1000 (μm)
    // areaPx 100~10000 이면 D 가 100μm~1000μm 근방
    const areasPx = Array.from({ length: 100 }, (_, i) => 200 + i * 100);
    const contours = setupCvMock(areasPx);
    const stats = computeStats(contours, 0.05);

    expect(stats.d10).toBeLessThan(stats.d50);
    expect(stats.d50).toBeLessThan(stats.d90);
    expect(stats.uniformity).toBeGreaterThan(1);
  });

  it("diameters 배열이 정렬되어 반환", () => {
    const contours = setupCvMock([1000, 500, 2000, 100]); // 무작위 순서
    const stats = computeStats(contours, 0.1);
    for (let i = 1; i < stats.diameters.length; i++) {
      expect(stats.diameters[i]).toBeGreaterThanOrEqual(
        stats.diameters[i - 1],
      );
    }
  });
});

describe("computeStats — 가드", () => {
  it("contours 가 비어있을 때 throw", () => {
    const contours = setupCvMock([]);
    expect(() => computeStats(contours, 0.1)).toThrow(
      /입자 0개|빈 배열/,
    );
  });

  it("100μm 미만 입자 필터링", () => {
    // 매우 작은 areaPx → 직경 100μm 미만 → 필터 후 0개
    // areaPx=1, mmPerPixel=0.01 → areaMm2 = 0.0001, D = 2*sqrt(0.0001/π)*1000 ≈ 11.3μm
    const contours = setupCvMock([1, 1, 1, 1]);
    expect(() => computeStats(contours, 0.01)).toThrow(/입자 0개/);
  });

  it("100μm 미만 + 정상 입자 혼합 → 정상만 반환", () => {
    // 작은 입자 (필터됨) + 정상 (유지)
    // mmPerPixel = 0.05
    // small: areaPx=1 → D ≈ 56μm (MIN 100μm 필터됨)
    // normal: areaPx=200 → areaMm2=0.5, D=2*sqrt(0.5/π)*1000 ≈ 798μm
    //   (CLUMP cap 2000μm 미만 → 통과)
    const contours = setupCvMock([1, 200, 1, 200, 200]);
    const stats = computeStats(contours, 0.05);
    expect(stats.particleCount).toBe(3);
  });

  it("D50 계산은 sub-200 sieve noise (MAIN_FRACTION_MIN 117 image 미만) 제외", () => {
    // 2026-05-03 final: MAIN_FRACTION_MIN_UM = 117 image-space (= 200 sieve).
    // 1-2 pixel sub-pixel noise 만 제외, real signal (4+ pixel area) 모두 포함.
    //
    // mmPerPixel = 0.05 가정.
    // 노이즈 입자 (~100µm image, < 117 threshold) areaPx ≈ 3
    // 작은 main (~150µm image, > 117) areaPx ≈ 7
    // 큰 main (~800µm image) areaPx ≈ 200
    const noiseCount = 30;
    const smallMainCount = 5;
    const largeMainCount = 5;
    const areasPx = [
      ...Array(noiseCount).fill(3), // ~100µm image (sub-117, noise)
      ...Array(smallMainCount).fill(7), // ~150µm image (small main, > 117)
      ...Array(largeMainCount).fill(200), // ~800µm image (large main)
    ];
    const contours = setupCvMock(areasPx);
    const stats = computeStats(contours, 0.05);

    // computeMinDiameter (mmPerPx 0.05) = max(75, min(100, 75)) = 75 image
    // 노이즈 (~100µm image) 는 minDiameter 통과 (75 이상)
    // 작은/큰 main 도 minDiameter 통과
    // 전체 검출 입자: 40 (모두 sieve filter 통과)
    expect(stats.particleCount).toBe(40);
    // D50 은 sub-117 image (= sub-200 sieve) 노이즈 제외 후 main fraction (10개)
    // 의 median = small main (~150 image) ~ large main (~800 image) 중간 영역
    expect(stats.d50).toBeGreaterThan(150);
    expect(stats.diameters.length).toBe(40);
    expect(stats.finesPercent).toBeGreaterThan(0);
  });

  it("모든 입자가 sub-pixel noise 인 극단 케이스 → fallback (전체로 계산)", () => {
    // mmPerPixel = 0.05, 모두 ~100µm image (sub-MAIN_FRACTION_MIN 117)
    // 다만 minDiameter (75 image) 는 통과해야 detection 됨.
    // fallback: main fraction 비어있어 전체 diameters 로 D50 계산.
    const areasPx = Array(20).fill(3); // ~100µm image, > minDiameter 75
    const contours = setupCvMock(areasPx);
    const stats = computeStats(contours, 0.05);
    // D50 ~100µm image — main 임계 (117) 미만이지만 fallback 으로 계산됨 (throw X)
    expect(stats.d50).toBeGreaterThan(0);
    expect(stats.d50).toBeLessThan(117); // MAIN_FRACTION_MIN_UM 미만
    expect(stats.particleCount).toBe(20);
  });

  it("Fines% 계산 — 300μm 미만 면적 비율", () => {
    // 큰 입자 + 작은 입자 (>100μm)
    // mmPerPixel = 0.05
    // small (~150μm): areaPx 가 어떻게? D=150μm → R=75μm → A=π*75^2 = 17671μm² → 17671e-6 mm²
    // = 0.0177 mm² / mmPerPixel^2 (0.0025) = 7.07 px → 약 7
    // 큰 (~1000μm): D=1000μm → R=500μm → A=π*250000 = 785398μm² = 0.785 mm² → 314 px
    const contours = setupCvMock([7, 7, 7, 314, 314]); // 3 small + 2 large
    const stats = computeStats(contours, 0.05);
    expect(stats.particleCount).toBeGreaterThan(0);
    expect(stats.finesPercent).toBeGreaterThan(0);
    expect(stats.finesPercent).toBeLessThan(100);
  });
});

describe("percentile", () => {
  it("빈 배열 throw", () => {
    expect(() => percentile([], 0.5)).toThrow();
  });

  it("단일 값 반환", () => {
    expect(percentile([42], 0.5)).toBe(42);
  });

  it("선형 보간 (linear interpolation)", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5); // 중간값 보간
  });

  it("0 → 첫번째, 1 → 마지막", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });
});

describe("Boulder vs Clump 분리 (Phase 1, 2026-05-05)", () => {
  // ≥ 1500µm 입자만 shape factor 분류 대상.
  // mmPerPixel=0.05 → areaMm2 = areaPx × 0.0025
  //   D_um = 2 × sqrt(areaMm2 / π) × 1000
  //   D=2000µm → areaMm2 = π × 1² = π → areaPx = π / 0.0025 ≈ 1257
  //   D=600µm  → areaMm2 = π × 0.3² = 0.283 → areaPx ≈ 113
  const NORMAL_AREA = 113; // ~600µm
  const LARGE_AREA = 1257; // ~2000µm

  it("단일 boulder 형상 (high circ + sol) → boulder bucket + D-value 통계 포함 (Phase 2)", () => {
    // 정상 입자 5개 + boulder 1개
    const areasPx = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, LARGE_AREA];
    const shapes: Array<"boulder" | "clump"> = [
      "boulder", "boulder", "boulder", "boulder", "boulder", // 정상 입자 — shape unused
      "boulder",
    ];
    const contours = setupCvMockWithShape(areasPx, shapes);
    const stats = computeStats(contours, 0.05);
    expect(stats.boulders.count).toBe(1);
    expect(stats.clumps.count).toBe(0);
    // **Phase 2**: boulder 가 D-value 통계에 포함됨 → particleCount = 6
    expect(stats.particleCount).toBe(6);
  });

  it("응집체 형상 (low circ + sol) → clump bucket, D-value 제외", () => {
    const areasPx = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, LARGE_AREA, LARGE_AREA];
    const shapes: Array<"boulder" | "clump"> = [
      "boulder", "boulder", "boulder", // 정상 입자
      "clump", "clump",
    ];
    const contours = setupCvMockWithShape(areasPx, shapes);
    const stats = computeStats(contours, 0.05);
    expect(stats.boulders.count).toBe(0);
    expect(stats.clumps.count).toBe(2);
    // clump 는 통계 제외 → particleCount = 3 (정상 입자만)
    expect(stats.particleCount).toBe(3);
  });

  it("boulder + clump 혼합 → boulder 만 통계 포함 (Phase 2)", () => {
    const areasPx = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, LARGE_AREA, LARGE_AREA, LARGE_AREA];
    const shapes: Array<"boulder" | "clump"> = [
      "boulder", "boulder", "boulder",
      "boulder", "clump", "boulder",
    ];
    const contours = setupCvMockWithShape(areasPx, shapes);
    const stats = computeStats(contours, 0.05);
    expect(stats.boulders.count).toBe(2);
    expect(stats.clumps.count).toBe(1);
    // **Phase 2**: 정상 3개 + boulder 2개 → particleCount = 5 (clump 만 제외)
    expect(stats.particleCount).toBe(5);
  });

  it("areaRatio: boulder + clump area 합쳐 분모 일관성", () => {
    const areasPx = [NORMAL_AREA, LARGE_AREA, LARGE_AREA];
    const shapes: Array<"boulder" | "clump"> = [
      "boulder", // normal particle
      "boulder", // boulder
      "clump", // clump
    ];
    const contours = setupCvMockWithShape(areasPx, shapes);
    const stats = computeStats(contours, 0.05);
    // total area = normal + boulder + clump
    // boulder area / total ≈ LARGE / (NORMAL + 2×LARGE)
    const expectedBoulderRatio = (LARGE_AREA / (NORMAL_AREA + 2 * LARGE_AREA)) * 100;
    const expectedClumpRatio = expectedBoulderRatio; // 같은 area
    expect(stats.boulders.areaRatio).toBeCloseTo(expectedBoulderRatio, 0);
    expect(stats.clumps.areaRatio).toBeCloseTo(expectedClumpRatio, 0);
    // 합 ≈ 95% (NORMAL 이 ~5% 차지)
    expect(stats.boulders.areaRatio + stats.clumps.areaRatio).toBeGreaterThan(90);
  });

  it("**Phase 2**: boulder 추가 시 D90 정상화 — French Press 케이스", () => {
    // 정상 입자 (small) + boulder (large) → boulder 가 D90 에 영향
    const normalOnly = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA];
    const withBoulders = [
      NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, NORMAL_AREA,
      LARGE_AREA, LARGE_AREA,
    ];
    const c1 = setupCvMockWithShape(
      normalOnly,
      ["boulder", "boulder", "boulder", "boulder", "boulder"],
    );
    const s1 = computeStats(c1, 0.05);
    const c2 = setupCvMockWithShape(
      withBoulders,
      ["boulder", "boulder", "boulder", "boulder", "boulder", "boulder", "boulder"],
    );
    const s2 = computeStats(c2, 0.05);
    // boulder 가 D-value 통계 포함 → s2 의 D90 > s1 의 D90 (boulder 가 distribution top tail)
    expect(s2.d90).toBeGreaterThan(s1.d90);
    // boulder count 도 분리 보고
    expect(s2.boulders.count).toBe(2);
  });

  it("**Phase 2**: clump 만 있는 경우 D-value 변화 없음", () => {
    // 정상 입자만 vs 정상+clump
    const normalOnly = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA];
    const withClump = [NORMAL_AREA, NORMAL_AREA, NORMAL_AREA, LARGE_AREA];
    const c1 = setupCvMockWithShape(
      normalOnly,
      ["boulder", "boulder", "boulder"],
    );
    const s1 = computeStats(c1, 0.05);
    const c2 = setupCvMockWithShape(
      withClump,
      ["boulder", "boulder", "boulder", "clump"],
    );
    const s2 = computeStats(c2, 0.05);
    // clump 는 통계 제외 → D50 동일, particleCount 동일
    expect(s2.d50).toBeCloseTo(s1.d50, 0);
    expect(s2.particleCount).toBe(s1.particleCount);
    expect(s2.clumps.count).toBe(1);
  });
});
