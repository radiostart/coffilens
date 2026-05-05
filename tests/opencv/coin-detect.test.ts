import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectCoin, _internal } from "../../src/opencv/coin-detect";

/**
 * cv (OpenCV.js global) mock — 테스트마다 vi.stubGlobal 로 설정.
 *
 * HoughCircles 출력은 circles.data32F = [cx, cy, r, ...] 형태.
 * cols 가 검출된 원 개수 (Mat 의 열 수).
 */
interface MockMat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  data64F: Float64Array;
  delete: ReturnType<typeof vi.fn>;
}

interface MockCv {
  imread: ReturnType<typeof vi.fn>;
  cvtColor: ReturnType<typeof vi.fn>;
  medianBlur: ReturnType<typeof vi.fn>;
  GaussianBlur: ReturnType<typeof vi.fn>;
  HoughCircles: ReturnType<typeof vi.fn>;
  Laplacian: ReturnType<typeof vi.fn>;
  meanStdDev: ReturnType<typeof vi.fn>;
  mean: ReturnType<typeof vi.fn>;
  // partial-coin-probe (2026-05-05) 가 사용하는 함수들 — 0 circle 시 fallback.
  Canny: ReturnType<typeof vi.fn>;
  findContours: ReturnType<typeof vi.fn>;
  boundingRect: ReturnType<typeof vi.fn>;
  minEnclosingCircle: ReturnType<typeof vi.fn>;
  Mat: ReturnType<typeof vi.fn>;
  MatVector: ReturnType<typeof vi.fn>;
  Size: ReturnType<typeof vi.fn>;
  COLOR_RGBA2GRAY: number;
  HOUGH_GRADIENT: number;
  CV_64F: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_NONE: number;
}

function makeMat(opts: Partial<MockMat> = {}): MockMat {
  const rows = opts.rows ?? 1280;
  const cols = opts.cols ?? 720;
  // 기본 grayscale: 150 ± 약한 변화 (gradient 측정 가능). intensityStatsInCircle
  // 평균 ~150, stddev 작음 → mean+stddev 필터 통과. meanRimGradient 도 0 보다
  // 큰 값 (~10-30) 으로 측정 → 동전 검출 분기 테스트 정상 진행.
  // 특정 테스트가 다른 분포 필요시 override.
  // 3px 가로 stripes 130/170 alternating (mean ~150, stddev ~20 → 통계 필터 통과,
  // 인접 픽셀 ±2 차이 40 → meanRimGradient 평균 ≥ 18 통과)
  const data =
    opts.data ??
    new Uint8Array(rows * cols).map((_, i) =>
      Math.floor((i % cols) / 3) % 2 === 0 ? 130 : 170,
    );
  return {
    rows,
    cols,
    data,
    data32F: opts.data32F ?? new Float32Array(0),
    data64F: opts.data64F ?? new Float64Array(0),
    delete: vi.fn(),
  };
}

/**
 * cv mock 빌더.
 *  - circles: HoughCircles 가 채울 검출 결과 (cx, cy, r 의 배열)
 *  - mean: cv.mean 반환값
 *  - stddev: meanStdDev 가 stddev 에 채울 값 (variance = stddev^2)
 */
function setupCvMock(opts: {
  circles?: number[]; // [cx, cy, r, cx, cy, r, ...]
  mean?: number;
  stddev?: number;
  imgRows?: number;
  imgCols?: number;
}) {
  const circlesArray = opts.circles ?? [];
  const numCircles = circlesArray.length / 3;
  const imgRows = opts.imgRows ?? 1280;
  const imgCols = opts.imgCols ?? 720;

  const srcMat = makeMat({ rows: imgRows, cols: imgCols });
  const grayMat = makeMat({ rows: imgRows, cols: imgCols });
  const circlesMat = makeMat({
    cols: numCircles,
    data32F: new Float32Array(circlesArray),
  });
  const stddevMat = makeMat({
    data64F: new Float64Array([opts.stddev ?? 100]),
  });

  // detectCoin 의 new cv.Mat() 순서 (2026-05-02 변경 후):
  //   1. grayOriginal (sharp edge 보존, gradient 측정용)
  //   2. gray (median blur 적용, intensity stats 용)
  //   3. coinDetectGray (Gaussian 15x15 추가 적용, HoughCircles 입력 — 속도 ↑)
  //   4. circles (HoughCircles 출력)
  // checkInputQuality 도 별도 cv.Mat 호출 — 그 외 5-6번째 위치
  const grayOriginalMat = makeMat({ rows: imgRows, cols: imgCols });
  let matCount = 0;
  const matInstances = [
    grayOriginalMat,
    grayMat,
    grayMat, // coinDetectGray (blur 적용 후이지만 동일 차원 → grayMat 재사용 OK)
    circlesMat,
    makeMat(),
    makeMat(),
    stddevMat,
  ];

  const cv: MockCv = {
    imread: vi.fn(() => srcMat),
    cvtColor: vi.fn(),
    medianBlur: vi.fn(),
    GaussianBlur: vi.fn(),
    HoughCircles: vi.fn(),
    Laplacian: vi.fn(),
    meanStdDev: vi.fn(),
    mean: vi.fn(() => [opts.mean ?? 150, 0, 0, 0]),
    // partial-coin-probe stubs — empty contours → no partial-coin hit, throws no_coin.
    Canny: vi.fn(),
    findContours: vi.fn(),
    boundingRect: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    minEnclosingCircle: vi.fn(() => ({ center: { x: 0, y: 0 }, radius: 0 })),
    Mat: vi.fn(function MockMatCtor() {
      const m = matInstances[matCount % matInstances.length];
      matCount++;
      return m;
    }) as unknown as ReturnType<typeof vi.fn>,
    MatVector: vi.fn(function MockMatVecCtor() {
      // MatVector — partial-coin-probe 가 size()/get() 사용. empty 로 default.
      const m = makeMat() as MockMat & {
        size: () => number;
        get: (i: number) => MockMat;
      };
      m.size = () => 0;
      m.get = () => makeMat();
      return m;
    }) as unknown as ReturnType<typeof vi.fn>,
    Size: vi.fn(function MockSize(w: number, h: number) {
      return { width: w, height: h };
    }) as unknown as ReturnType<typeof vi.fn>,
    COLOR_RGBA2GRAY: 0,
    HOUGH_GRADIENT: 0,
    CV_64F: 0,
    RETR_EXTERNAL: 0,
    CHAIN_APPROX_NONE: 0,
  };

  vi.stubGlobal("cv", cv);
  return { cv, srcMat, grayMat, circlesMat };
}

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  return canvas;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("detectCoin — 분기 동작", () => {
  it("0개 검출 → no_coin", async () => {
    setupCvMock({ circles: [] });
    await expect(detectCoin(fakeCanvas(), "500")).rejects.toMatchObject({
      kind: "no_coin",
    });
  });

  it("2개 검출 → multi_coin", async () => {
    setupCvMock({
      circles: [200, 600, 80, 500, 600, 80],
    });
    await expect(detectCoin(fakeCanvas(), "500")).rejects.toMatchObject({
      kind: "multi_coin",
      count: 2,
    });
  });

  it("3개 검출 → multi_coin (count 3)", async () => {
    setupCvMock({
      circles: [200, 600, 80, 400, 600, 80, 600, 600, 80],
    });
    await expect(detectCoin(fakeCanvas(), "500")).rejects.toMatchObject({
      kind: "multi_coin",
      count: 3,
    });
  });

  it("동전이 좌측 가장자리 잘림 → partial_coin", async () => {
    // cx=10, r=80 → cx - r = -70 < EDGE_MARGIN_PX (20)
    setupCvMock({ circles: [10, 600, 80] });
    await expect(detectCoin(fakeCanvas(), "500")).rejects.toMatchObject({
      kind: "partial_coin",
    });
  });

  it("정상 검출 → CoinDetection 객체", async () => {
    // imgRows = 1280, imgCols = 720, 동전 중심 360,640 r=80
    // 가장자리 마진 20px 안 — 정상
    setupCvMock({ circles: [360, 640, 80], imgRows: 1280, imgCols: 720 });
    const result = await detectCoin(fakeCanvas(), "500");

    expect(result.centerX).toBe(360);
    expect(result.centerY).toBe(640);
    expect(result.radiusPx).toBe(80);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    // mm/pixel 합리 범위 (0.05 ~ 0.2)
    expect(result.mmPerPixel).toBeGreaterThan(0.05);
    expect(result.mmPerPixel).toBeLessThan(0.3);
  });
});

describe("computeCoinConfidence — 휴리스틱 점수", () => {
  it("화면 중앙 + 적정 크기 → 높은 점수", () => {
    // cx=360, cy=640 (img 720x1280 중앙), r=192 (h*0.15)
    const score = _internal.computeCoinConfidence(360, 640, 192, 720, 1280);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("중앙에서 멀고 작음 → 낮은 점수", () => {
    const score = _internal.computeCoinConfidence(50, 50, 30, 720, 1280);
    expect(score).toBeLessThan(0.5);
  });

  it("점수는 0~1 범위 클램프", () => {
    const score = _internal.computeCoinConfidence(0, 0, 0, 720, 1280);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
