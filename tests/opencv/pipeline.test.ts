import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipeline, type PipelineStep } from "../../src/opencv/pipeline";

/**
 * pipeline.test — 통합 흐름 + AbortSignal + 진행률 콜백 검증.
 *
 * 모듈 mock 으로 단계별 동작 가짜화 (실제 cv 의존 없이 흐름만 검증).
 */
vi.mock("../../src/lib/image-downsample", () => ({
  downsampleImage: vi.fn((src) => src),
}));

vi.mock("../../src/opencv/coin-detect", () => ({
  checkInputQuality: vi.fn(async () => ({
    meanBrightness: 150,
    laplacianVariance: 300,
  })),
  detectCoin: vi.fn(async () => ({
    centerX: 360,
    centerY: 640,
    radiusPx: 80,
    coinType: "500" as const,
    diameterMm: 26.5,
    mmPerPixel: 26.5 / 160,
    confidence: 0.85,
  })),
}));

vi.mock("../../src/opencv/particle-segment", () => ({
  segmentParticles: vi.fn(async () => ({
    contours: { size: () => 100, get: () => ({ delete: vi.fn() }) },
    hierarchy: { delete: vi.fn() },
    totalArea: 5000,
  })),
  disposeSegmentation: vi.fn(),
}));

vi.mock("../../src/opencv/statistics", () => ({
  computeStats: vi.fn(() => ({
    d10: 400,
    d50: 720,
    d90: 1100,
    finesPercent: 5.2,
    uniformity: 2.75,
    particleCount: 100,
    totalAreaMm2: 50,
    diameters: Array(100).fill(720),
  })),
  percentile: vi.fn(),
}));

vi.mock("../../src/opencv/confidence", () => ({
  computeConfidence: vi.fn((inputs) => ({
    score: 8,
    signals: {
      coin: inputs.coinConfidence,
      particles: 0.8,
      brightness: 1.0,
      blur: 1.0,
    },
    warning: false,
  })),
}));

import * as segmentMod from "../../src/opencv/particle-segment";
import * as statsMod from "../../src/opencv/statistics";
import * as confidenceMod from "../../src/opencv/confidence";
import * as coinMod from "../../src/opencv/coin-detect";

function fakeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPipeline — 정상 흐름", () => {
  it("PipelineResult 반환 + 단계별 onProgress 호출", async () => {
    const onProgress = vi.fn();
    const result = await runPipeline(fakeCanvas(), "500", new AbortController().signal, {
      onProgress,
    });

    // pipeline 이 computeStats 출력에 image→sieve calibration (×3.3) 적용.
    // mock d50=720 (image-space) → 720 × 3.3 = 2376 (sieve-equivalent).
    // ratio 3.3: 2026-05-02 pour-over anchor (Setting 11 V60 fixture) 재보정.
    expect(result.stats.d50).toBeCloseTo(720 * 3.3, 5);
    expect(result.coin.coinType).toBe("500");
    expect(result.confidence.score).toBe(8);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // 6단계 진행률 콜백
    const steps = onProgress.mock.calls.map((c) => c[0]) as PipelineStep[];
    expect(steps).toContain("downsample");
    expect(steps).toContain("preflight");
    expect(steps).toContain("coin");
    expect(steps).toContain("segment");
    expect(steps).toContain("stats");
    expect(steps).toContain("confidence");
  });

  it("disposeSegmentation 이 finally 에서 호출됨", async () => {
    await runPipeline(fakeCanvas(), "500", new AbortController().signal);
    expect(segmentMod.disposeSegmentation).toHaveBeenCalledOnce();
  });

  it("confidence 입력에 inputQuality 실제 값 사용 (sweep Issue 14)", async () => {
    await runPipeline(fakeCanvas(), "500", new AbortController().signal);
    expect(confidenceMod.computeConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        meanBrightness: 150, // checkInputQuality mock 반환값
        laplacianVariance: 300,
      }),
    );
  });
});

describe("runPipeline — AbortSignal", () => {
  it("이미 abort 된 signal → throwIfAborted 즉시 throw", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      runPipeline(fakeCanvas(), "500", ac.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("downsample 후 abort → 다음 단계 진입 X", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(runPipeline(fakeCanvas(), "500", ac.signal)).rejects.toThrow();
    // checkInputQuality 호출 안 됨
    expect(coinMod.checkInputQuality).not.toHaveBeenCalled();
  });

  it("disposeSegmentation 은 finally — segment 단계 후 abort 시도 시에도 호출", async () => {
    // segment 후 abort 되도록 시뮬: stats 단계 진입 전 throw
    const ac = new AbortController();
    vi.mocked(statsMod.computeStats).mockImplementationOnce(() => {
      ac.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(runPipeline(fakeCanvas(), "500", ac.signal)).rejects.toThrow();
    expect(segmentMod.disposeSegmentation).toHaveBeenCalled();
  });
});

describe("runPipeline — 에러 변환", () => {
  it("computeStats throw → no_particles AnalysisError", async () => {
    vi.mocked(statsMod.computeStats).mockImplementationOnce(() => {
      throw new Error("입자 0개");
    });

    await expect(
      runPipeline(fakeCanvas(), "500", new AbortController().signal),
    ).rejects.toMatchObject({ kind: "no_particles" });
  });
});
