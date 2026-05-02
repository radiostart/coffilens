import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  segmentParticles,
  disposeSegmentation,
} from "../../src/opencv/particle-segment";
import type { CoinDetection } from "../../src/opencv/coin-detect";

interface MockMat {
  rows: number;
  cols: number;
  data32F: Float32Array;
  data64F: Float64Array;
  delete: ReturnType<typeof vi.fn>;
  type: () => number;
  convertTo: ReturnType<typeof vi.fn>;
}

interface MockMatVector {
  size: () => number;
  get: (i: number) => MockMat;
  delete: ReturnType<typeof vi.fn>;
}

function makeMat(opts: Partial<MockMat> = {}): MockMat {
  return {
    rows: opts.rows ?? 1280,
    cols: opts.cols ?? 720,
    data32F: opts.data32F ?? new Float32Array(0),
    data64F: opts.data64F ?? new Float64Array(0),
    delete: vi.fn(),
    type: vi.fn(() => 0),
    convertTo: vi.fn(),
  };
}

function makeMatVector(contourAreas: number[]): MockMatVector {
  const contours = contourAreas.map(() => makeMat());
  return {
    size: () => contourAreas.length,
    get: (i) => contours[i],
    delete: vi.fn(),
  };
}

interface CvMockOpts {
  contourAreas?: number[];
  oomMessage?: string;
}

function setupCvMock(opts: CvMockOpts = {}) {
  const contourAreas = opts.contourAreas ?? [];
  let areaIdx = 0;

  const matsCreated: MockMat[] = [];
  const matVectorsCreated: MockMatVector[] = [];

  const cvMock = {
    imread: vi.fn(() => {
      const m = makeMat();
      matsCreated.push(m);
      return m;
    }),
    cvtColor: vi.fn(),
    adaptiveThreshold: vi.fn(),
    bitwise_and: vi.fn(() => {
      // OOM 시뮬레이션 — fine grind 분기에서 morph/watershed 우회 후 호출되는 cv 중
      // bitwise_and 가 동전 mask 적용 단계라 항상 실행됨.
      if (opts.oomMessage) {
        throw new Error(opts.oomMessage);
      }
    }),
    morphologyEx: vi.fn(),
    distanceTransform: vi.fn(),
    normalize: vi.fn(),
    threshold: vi.fn(),
    connectedComponents: vi.fn(() => 2),
    watershed: vi.fn(),
    findContours: vi.fn(),
    contourArea: vi.fn(() => {
      const a = contourAreas[areaIdx % Math.max(1, contourAreas.length)];
      areaIdx++;
      return a ?? 0;
    }),
    compare: vi.fn(),
    circle: vi.fn(),
    Mat: vi.fn(function MockMatCtor() {
      const m = makeMat();
      matsCreated.push(m);
      return m;
    }),
    MatVector: vi.fn(function MockMatVecCtor() {
      const mv = makeMatVector(contourAreas);
      matVectorsCreated.push(mv);
      return mv;
    }),
    Point: vi.fn(function MockPoint(x: number, y: number) {
      return { x, y };
    }),
    Scalar: vi.fn(function MockScalar(...vals: number[]) {
      return vals;
    }),
    Size: vi.fn(function MockSize(w: number, h: number) {
      return { width: w, height: h };
    }),
    CLAHE: vi.fn(function MockCLAHE() {
      return {
        apply: vi.fn(),
        delete: vi.fn(),
      };
    }),
    COLOR_RGBA2GRAY: 0,
    COLOR_RGBA2RGB: 0,
    CV_8U: 0,
    CV_32S: 0,
    ADAPTIVE_THRESH_GAUSSIAN_C: 0,
    THRESH_BINARY_INV: 0,
    THRESH_BINARY: 0,
    MORPH_OPEN: 0,
    DIST_L2: 0,
    NORM_MINMAX: 0,
    CMP_GT: 0,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_SIMPLE: 0,
  };

  // cv.Mat.ones static
  Object.assign(cvMock.Mat, {
    ones: vi.fn(() => {
      const m = makeMat();
      matsCreated.push(m);
      return m;
    }),
  });

  vi.stubGlobal("cv", cvMock);
  return { cvMock, matsCreated, matVectorsCreated };
}

const mockCoin500: CoinDetection = {
  centerX: 360,
  centerY: 640,
  radiusPx: 80,
  coinType: "500",
  diameterMm: 26.5,
  mmPerPixel: 26.5 / 160,
  confidence: 0.85,
};

function fakeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  return c;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("segmentParticles — sanity 분기", () => {
  it("contours 0개 → no_particles", async () => {
    setupCvMock({ contourAreas: [] });
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toMatchObject({
      kind: "no_particles",
    });
  });

  it("입자 면적 합 / 동전 면적 < 0.5% → no_particles (분쇄 안 됨)", async () => {
    // coinArea = π * 80^2 ≈ 20106. 0.5% = ~100. totalArea < 100 → reject
    setupCvMock({ contourAreas: [10, 20, 30] }); // total 60
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toMatchObject({
      kind: "no_particles",
    });
  });

  it("단일 입자 > 50% (덩어리) → no_particles", async () => {
    // total = 1000, max = 700 (70%) → reject
    setupCvMock({ contourAreas: [700, 100, 100, 100] });
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toMatchObject({
      kind: "no_particles",
    });
  });

  it("정상 분포 → ParticleSegmentation 반환", async () => {
    // total ≈ 5000 (> 0.5% × 20106 ≈ 100), max 500 (10%) → OK
    setupCvMock({
      contourAreas: Array(50).fill(100), // 50개 × 100 = 5000
    });
    const seg = await segmentParticles(fakeCanvas(), mockCoin500);
    expect(seg.totalArea).toBe(5000);
    expect(seg.contours.size()).toBe(50);
    expect(seg.hierarchy).toBeDefined();
  });
});

describe("segmentParticles — OOM 분기", () => {
  it("OpenCV 'memory access out of bounds' → memory_oom", async () => {
    setupCvMock({
      contourAreas: [],
      oomMessage: "memory access out of bounds at watershed",
    });
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toMatchObject({
      kind: "memory_oom",
      phase: "segment",
    });
  });

  it("'std::bad_alloc' → memory_oom", async () => {
    setupCvMock({
      contourAreas: [],
      oomMessage: "std::bad_alloc",
    });
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toMatchObject({
      kind: "memory_oom",
    });
  });

  it("일반 에러는 그대로 통과 (OOM 분류 X)", async () => {
    setupCvMock({
      contourAreas: [],
      oomMessage: "some other error",
    });
    await expect(segmentParticles(fakeCanvas(), mockCoin500)).rejects.toThrow(
      /some other error/,
    );
  });
});

describe("disposeSegmentation", () => {
  it("contours + hierarchy delete 호출", () => {
    const contours = makeMatVector([]);
    const hierarchy = makeMat();
    disposeSegmentation({
      contours: contours as unknown as ReturnType<typeof makeMatVector>,
      hierarchy: hierarchy as unknown as ReturnType<typeof makeMat>,
      totalArea: 0,
    });
    expect(contours.delete).toHaveBeenCalledOnce();
    expect(hierarchy.delete).toHaveBeenCalledOnce();
  });

  it("이미 해제된 mat throw 무시", () => {
    const contours = {
      ...makeMatVector([]),
      delete: vi.fn(() => {
        throw new Error("already deleted");
      }),
    };
    const hierarchy = makeMat();
    expect(() =>
      disposeSegmentation({
        contours: contours as unknown as ReturnType<typeof makeMatVector>,
        hierarchy: hierarchy as unknown as ReturnType<typeof makeMat>,
        totalArea: 0,
      }),
    ).not.toThrow();
  });
});
