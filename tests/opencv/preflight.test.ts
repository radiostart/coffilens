import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkInputQuality } from "../../src/opencv/coin-detect";

interface MockMat {
  rows: number;
  cols: number;
  data32F: Float32Array;
  data64F: Float64Array;
  delete: ReturnType<typeof vi.fn>;
}

function makeMat(opts: Partial<MockMat> = {}): MockMat {
  return {
    rows: opts.rows ?? 1280,
    cols: opts.cols ?? 720,
    data32F: opts.data32F ?? new Float32Array(0),
    data64F: opts.data64F ?? new Float64Array(0),
    delete: vi.fn(),
  };
}

/**
 * checkInputQuality 의 cv 호출 시퀀스:
 *  1. imread → src
 *  2. new cv.Mat() (gray) — 1번째
 *  3. cvtColor(src, gray, ...)
 *  4. cv.mean(gray) → [brightness, ...]
 *  5. brightness < 80 → throw low_brightness
 *  6. new cv.Mat() (laplacian) — 2번째
 *  7. cv.Laplacian(gray, laplacian, ...)
 *  8. new cv.Mat() (mean) — 3번째
 *  9. new cv.Mat() (stddev) — 4번째 → data64F[0] 가 stddev
 * 10. cv.meanStdDev → stddev.data64F[0] 채움
 * 11. variance = stddev^2 < 100 → throw blur
 */
function setupCvMock(opts: { brightness?: number; stddev?: number }) {
  const grayMat = makeMat();
  const laplacianMat = makeMat();
  const meanMat = makeMat();
  const stddevMat = makeMat({
    data64F: new Float64Array([opts.stddev ?? 100]),
  });

  const matInstances = [grayMat, laplacianMat, meanMat, stddevMat];
  let matCount = 0;

  vi.stubGlobal("cv", {
    imread: vi.fn(() => makeMat()),
    cvtColor: vi.fn(),
    medianBlur: vi.fn(),
    HoughCircles: vi.fn(),
    Laplacian: vi.fn(),
    meanStdDev: vi.fn(),
    mean: vi.fn(() => [opts.brightness ?? 150, 0, 0, 0]),
    Mat: vi.fn(function MockMatCtor() {
      const m = matInstances[matCount % matInstances.length];
      matCount++;
      return m;
    }),
    MatVector: vi.fn(),
    COLOR_RGBA2GRAY: 0,
    HOUGH_GRADIENT: 0,
    CV_64F: 0,
  });
}

function fakeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  return c;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("checkInputQuality", () => {
  it("정상 밝기 + sharp → InputQualityResult 반환", async () => {
    // brightness=150, stddev=20 → variance=400 > 100
    setupCvMock({ brightness: 150, stddev: 20 });
    const result = await checkInputQuality(fakeCanvas());
    expect(result.meanBrightness).toBe(150);
    expect(result.laplacianVariance).toBe(400);
  });

  it("어두운 이미지 → low_brightness throw", async () => {
    setupCvMock({ brightness: 50, stddev: 20 });
    await expect(checkInputQuality(fakeCanvas())).rejects.toMatchObject({
      kind: "low_brightness",
      meanBrightness: 50,
    });
  });

  it("밝기 경계값 80 → 통과 (>= 80 만 reject)", async () => {
    setupCvMock({ brightness: 80, stddev: 20 });
    const result = await checkInputQuality(fakeCanvas());
    expect(result.meanBrightness).toBe(80);
  });

  it("흐릿한 이미지 (variance < 100) → blur throw", async () => {
    // stddev=5 → variance=25 < 100
    setupCvMock({ brightness: 150, stddev: 5 });
    await expect(checkInputQuality(fakeCanvas())).rejects.toMatchObject({
      kind: "blur",
      laplacianVariance: 25,
    });
  });

  it("variance 경계값 100 정확히 → 통과", async () => {
    // stddev=10 → variance=100
    setupCvMock({ brightness: 150, stddev: 10 });
    const result = await checkInputQuality(fakeCanvas());
    expect(result.laplacianVariance).toBe(100);
  });
});
