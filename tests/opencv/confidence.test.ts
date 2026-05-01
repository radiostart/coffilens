import { describe, it, expect } from "vitest";
import { computeConfidence } from "../../src/opencv/confidence";

describe("computeConfidence — 신호 조합", () => {
  it("모든 신호 1.0 → score 10", () => {
    const r = computeConfidence({
      coinConfidence: 1,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    expect(r.score).toBe(10);
    expect(r.warning).toBe(false);
  });

  it("모든 신호 0 → score 0", () => {
    const r = computeConfidence({
      coinConfidence: 0,
      particleCount: 0,
      meanBrightness: 50, // < 80 → 0
      laplacianVariance: 0,
    });
    expect(r.score).toBe(0);
    expect(r.warning).toBe(true);
  });

  it("입자 < 50 → score ↓ (가중치 0.4 영향)", () => {
    const high = computeConfidence({
      coinConfidence: 1,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    const low = computeConfidence({
      coinConfidence: 1,
      particleCount: 30, // < 50 tier → 0
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    expect(low.score).toBeLessThan(high.score);
    // 차이 ≈ 0.4 * 10 = 4 (가중치만큼)
    expect(high.score - low.score).toBeGreaterThanOrEqual(3);
  });

  it("동전 신뢰도 0.3 → score 큰 영향 (가중치 0.3)", () => {
    const high = computeConfidence({
      coinConfidence: 1,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    const lowCoin = computeConfidence({
      coinConfidence: 0.3,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    expect(lowCoin.score).toBeLessThan(high.score);
    // 차이 ≈ 0.3 * 10 * (1 - 0.3) = 2.1
    expect(high.score - lowCoin.score).toBeGreaterThanOrEqual(2);
  });

  it("score 항상 0~10 정수", () => {
    const r = computeConfidence({
      coinConfidence: 0.7,
      particleCount: 100,
      meanBrightness: 130,
      laplacianVariance: 150,
    });
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(10);
  });

  it("warning = score < 5", () => {
    const r1 = computeConfidence({
      coinConfidence: 0.5,
      particleCount: 30,
      meanBrightness: 80,
      laplacianVariance: 100,
    });
    if (r1.score < 5) expect(r1.warning).toBe(true);
    else expect(r1.warning).toBe(false);
  });
});

describe("computeConfidence — 밝기 신호", () => {
  it("80 미만 → 0", () => {
    const r = computeConfidence({
      coinConfidence: 1,
      particleCount: 1000,
      meanBrightness: 70,
      laplacianVariance: 1000,
    });
    expect(r.signals.brightness).toBe(0);
  });

  it("80~220 정상 → 1.0", () => {
    const r = computeConfidence({
      coinConfidence: 0,
      particleCount: 0,
      meanBrightness: 150,
      laplacianVariance: 0,
    });
    expect(r.signals.brightness).toBe(1.0);
  });

  it("220 초과 → 점진 감소", () => {
    const r230 = computeConfidence({
      coinConfidence: 0,
      particleCount: 0,
      meanBrightness: 230,
      laplacianVariance: 0,
    });
    const r250 = computeConfidence({
      coinConfidence: 0,
      particleCount: 0,
      meanBrightness: 250,
      laplacianVariance: 0,
    });
    expect(r230.signals.brightness).toBeGreaterThan(r250.signals.brightness);
    expect(r250.signals.brightness).toBeGreaterThanOrEqual(0);
  });
});

describe("computeConfidence — 입자 tier", () => {
  it.each([
    [1000, 1.0],
    [500, 1.0],
    [200, 0.8],
    [50, 0.5],
    [10, 0.0],
  ])("particleCount %d → particleSignal %f", (count, expected) => {
    const r = computeConfidence({
      coinConfidence: 0,
      particleCount: count,
      meanBrightness: 0,
      laplacianVariance: 0,
    });
    expect(r.signals.particles).toBe(expected);
  });
});

describe("computeConfidence — 입력 클램프", () => {
  it("coinConfidence 1 초과 → 1 클램프", () => {
    const r = computeConfidence({
      coinConfidence: 999,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    expect(r.signals.coin).toBe(1);
  });

  it("NaN 입력 → 0", () => {
    const r = computeConfidence({
      coinConfidence: NaN,
      particleCount: 1000,
      meanBrightness: 150,
      laplacianVariance: 1000,
    });
    expect(r.signals.coin).toBe(0);
  });
});
