import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyImageToSieveCalibration,
  getCalibrationRatio,
  _internal,
} from "../../src/opencv/calibration";
import type { ParticleStats } from "../../src/opencv/statistics";

/**
 * calibration ratio + sieve 변환 회귀 테스트.
 *
 * 핵심 보장:
 *  1. anchor 비어있으면 defaultRatio (0.63) — 기존 동작 byte-identical
 *  2. 단일 anchor: 그 anchor 의 ratio 그대로 (grind 무관 평면)
 *  3. 다중 anchor: rawD50 기준 선형 보간 + 양 끝 clamp
 *  4. applyImageToSieveCalibration 이 d10/d50/d90/diameters 만 변환,
 *     count/uniformity/fines%/totalArea 등 invariant 유지
 */

function fakeStats(overrides: Partial<ParticleStats> = {}): ParticleStats {
  return {
    particleCount: 100,
    d10: 200,
    d50: 1000,
    d90: 1500,
    uniformity: 7.5,
    finesPercent: 12.5,
    totalAreaMm2: 250.5,
    diameters: [100, 200, 1000, 1500, 2000],
    boulders: { count: 0, areaRatio: 0, totalAreaMm2: 0 },
    clumps: { count: 0, areaRatio: 0, totalAreaMm2: 0 },
    ...overrides,
  };
}

describe("getCalibrationRatio — anchor 등록 상태별 보간", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("anchor 비어있으면 defaultRatio 반환", () => {
    // _internal.config 의 anchor 가 [] 인 baseline 상태 가정 (calibration-data.json
    // 시드값). defaultRatio 0.63 — 2026-05-05 V60 anchor 기반.
    const ratio = getCalibrationRatio(1000);
    expect(ratio).toBeCloseTo(0.63, 5);
  });

  it("anchor 1개: 그 anchor 의 ratio 평면 적용", () => {
    const orig = _internal.config.anchors;
    _internal.config.anchors = [
      { label: "VS3@11", rawD50um: 1000, targetD50um: 700 },
    ];
    try {
      // 어떤 rawD50 입력이든 동일 ratio (700/1000 = 0.7)
      expect(getCalibrationRatio(500)).toBeCloseTo(0.7, 5);
      expect(getCalibrationRatio(1500)).toBeCloseTo(0.7, 5);
    } finally {
      _internal.config.anchors = orig;
    }
  });

  it("anchor 2개: 구간 내부는 선형 보간", () => {
    const orig = _internal.config.anchors;
    _internal.config.anchors = [
      { label: "fine", rawD50um: 500, targetD50um: 300 }, // ratio 0.6
      { label: "coarse", rawD50um: 1500, targetD50um: 1200 }, // ratio 0.8
    ];
    try {
      // 양 끝 anchor 그대로
      expect(getCalibrationRatio(500)).toBeCloseTo(0.6, 5);
      expect(getCalibrationRatio(1500)).toBeCloseTo(0.8, 5);
      // 중간점: 0.6 + 0.5*(0.8-0.6) = 0.7
      expect(getCalibrationRatio(1000)).toBeCloseTo(0.7, 5);
      // 25% 지점: 0.6 + 0.25*0.2 = 0.65
      expect(getCalibrationRatio(750)).toBeCloseTo(0.65, 5);
    } finally {
      _internal.config.anchors = orig;
    }
  });

  it("anchor 범위 밖 입력은 가장 가까운 anchor 의 ratio 로 clamp (extrapolation 안 함)", () => {
    const orig = _internal.config.anchors;
    _internal.config.anchors = [
      { label: "fine", rawD50um: 500, targetD50um: 300 }, // ratio 0.6
      { label: "coarse", rawD50um: 1500, targetD50um: 1200 }, // ratio 0.8
    ];
    try {
      // 좌측 밖 — fine anchor ratio 0.6 으로 clamp
      expect(getCalibrationRatio(100)).toBeCloseTo(0.6, 5);
      expect(getCalibrationRatio(0)).toBeCloseTo(0.6, 5);
      // 우측 밖 — coarse anchor ratio 0.8 으로 clamp
      expect(getCalibrationRatio(2000)).toBeCloseTo(0.8, 5);
      expect(getCalibrationRatio(5000)).toBeCloseTo(0.8, 5);
    } finally {
      _internal.config.anchors = orig;
    }
  });

  it("정렬되지 않은 anchor 도 정상 처리 (입력 순서 무관)", () => {
    const orig = _internal.config.anchors;
    _internal.config.anchors = [
      { label: "coarse", rawD50um: 1500, targetD50um: 1200 },
      { label: "fine", rawD50um: 500, targetD50um: 300 }, // 의도적으로 역순
    ];
    try {
      expect(getCalibrationRatio(1000)).toBeCloseTo(0.7, 5);
    } finally {
      _internal.config.anchors = orig;
    }
  });
});

describe("applyImageToSieveCalibration — 변환 대상/비대상 분리", () => {
  it("d10/d50/d90/diameters 만 ratio 곱, 나머지는 invariant", () => {
    const stats = fakeStats({ d10: 200, d50: 1000, d90: 1500 });
    const result = applyImageToSieveCalibration(stats);
    // anchor 비어있으면 ratio = 0.63
    expect(result.d10).toBeCloseTo(200 * 0.63, 5);
    expect(result.d50).toBeCloseTo(1000 * 0.63, 5);
    expect(result.d90).toBeCloseTo(1500 * 0.63, 5);
    expect(result.diameters).toEqual([
      100 * 0.63,
      200 * 0.63,
      1000 * 0.63,
      1500 * 0.63,
      2000 * 0.63,
    ]);
    // invariant
    expect(result.particleCount).toBe(100);
    expect(result.uniformity).toBe(7.5); // D90/D10 ratio 는 ratio 곱해도 상쇄
    expect(result.finesPercent).toBe(12.5);
    expect(result.totalAreaMm2).toBe(250.5);
  });

  it("input 객체 불변 (immutable)", () => {
    const stats = fakeStats();
    const original = { d50: stats.d50, diameters: [...stats.diameters] };
    applyImageToSieveCalibration(stats);
    expect(stats.d50).toBe(original.d50);
    expect(stats.diameters).toEqual(original.diameters);
  });

  it("d50 기준 anchor 보간이 적용됨 (다중 anchor 시)", () => {
    const orig = _internal.config.anchors;
    _internal.config.anchors = [
      { label: "fine", rawD50um: 500, targetD50um: 300 }, // ratio 0.6
      { label: "coarse", rawD50um: 1500, targetD50um: 1200 }, // ratio 0.8
    ];
    try {
      // d50=1000 → ratio 0.7
      const stats = fakeStats({ d50: 1000, d10: 500, d90: 1500 });
      const result = applyImageToSieveCalibration(stats);
      expect(result.d50).toBeCloseTo(700, 1); // 1000 * 0.7
      expect(result.d10).toBeCloseTo(350, 1); // 500 * 0.7
      expect(result.d90).toBeCloseTo(1050, 1); // 1500 * 0.7
    } finally {
      _internal.config.anchors = orig;
    }
  });
});
