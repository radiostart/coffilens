import { describe, expect, it } from "vitest";
import { _internal, buildBrewingGuide } from "../../src/lib/brewing-guide";

const { classifyD50, classifyMeasurementConfidence } = _internal;

/**
 * brewing-guide 테스트 — 2026-05-02 revision (3 카테고리 + mmPerPixel confidence)
 *
 * 정책 출처: features/F07-result-recommendation.md `## 추가 (2026-05-02 revision)`,
 * fixtures/manifest.json `calibration_2026_05_02_revision_pour_over_anchor`.
 */

describe("classifyD50 — 3-카테고리 경계값", () => {
  it("499μm sieve → fine (미세 영역 끝)", () => {
    expect(classifyD50(499)).toBe("fine");
  });

  it("500μm sieve → medium (중간 시작)", () => {
    expect(classifyD50(500)).toBe("medium");
  });

  it("899μm sieve → medium (중간 끝)", () => {
    expect(classifyD50(899)).toBe("medium");
  });

  it("900μm sieve → coarse (거침 시작)", () => {
    expect(classifyD50(900)).toBe("coarse");
  });

  it("V60 표준 700μm → medium (Setting 11 anchor)", () => {
    expect(classifyD50(700)).toBe("medium");
  });
});

describe("classifyMeasurementConfidence — mmPerPixel 임계", () => {
  it("0.045 (Setting 11 anchor) → high", () => {
    expect(classifyMeasurementConfidence(0.045)).toBe("high");
  });

  it("0.050 boundary → high (≤)", () => {
    expect(classifyMeasurementConfidence(0.05)).toBe("high");
  });

  it("0.060 (Setting 13) → medium", () => {
    expect(classifyMeasurementConfidence(0.06)).toBe("medium");
  });

  it("0.070 boundary → medium (≤)", () => {
    expect(classifyMeasurementConfidence(0.07)).toBe("medium");
  });

  it("0.068 (Setting 5.1 re-shot) → medium", () => {
    expect(classifyMeasurementConfidence(0.068)).toBe("medium");
  });

  it("0.128 (Setting 5.1 original far) → low", () => {
    expect(classifyMeasurementConfidence(0.128)).toBe("low");
  });
});

describe("buildBrewingGuide — Setting 11 (primary anchor)", () => {
  it("핸드드립 영역 (sieve 653μm) + high confidence → 중간 + 핸드드립 추천", () => {
    const guide = buildBrewingGuide({
      d50: 653, // Setting 11 측정값 sieve
      uniformity: 3.99,
      clumpAreaRatio: 0.0,
      mmPerPixel: 0.045,
    });
    expect(guide.grindLabel).toBe("중간");
    expect(guide.measurementConfidence).toBe("high");
    expect(guide.primary).toEqual(["핸드드립"]);
    // high confidence + 0 clump + uniformity excellent → caveat 없음
    expect(guide.caveat).toBeUndefined();
  });
});

describe("buildBrewingGuide — coarse grind + medium confidence (5.1 시나리오)", () => {
  it("sieve 1033μm + medium confidence → 거침 + caveat 없음 (coarse 는 픽셀 한계 무관)", () => {
    // 2026-05-03 변경: 픽셀 한계 caveat 는 fine grind 에서만 노출.
    // coarse 측정은 입자 크고 sub-pixel 한계 영향 없음.
    const guide = buildBrewingGuide({
      d50: 1033, // Setting 5.1 re-shot sieve
      uniformity: 5.67,
      clumpAreaRatio: 15.6,
      mmPerPixel: 0.068,
    });
    expect(guide.grindLabel).toBe("거침");
    expect(guide.measurementConfidence).toBe("medium");
    expect(guide.primary).toEqual(["프렌치프레스", "콜드브루"]);
    // coarse + 균일도/clump 임계 미달 → caveat 없음
    expect(guide.caveat).toBeUndefined();
  });
});

describe("buildBrewingGuide — fine grind 영역 (espresso 경고)", () => {
  it("D50 300µm (fine) → 핸드드립 최적화 caveat 노출", () => {
    // 2026-05-03 추가: fine grind 측정 시 항상 espresso 영역 경고 (절대값 신뢰 X)
    const guide = buildBrewingGuide({
      d50: 300,
      uniformity: 4.0,
      clumpAreaRatio: 5.0,
      mmPerPixel: 0.045, // high confidence
    });
    expect(guide.grindLabel).toBe("미세");
    expect(guide.caveat).toBeDefined();
    expect(guide.caveat).toContain("핸드드립");
  });
});

describe("buildBrewingGuide — fine 카테고리 (espresso/moka)", () => {
  it("sieve 300μm + high → 미세 + 에스프레소·모카포트 추천", () => {
    const guide = buildBrewingGuide({
      d50: 300,
      uniformity: 4.0,
      clumpAreaRatio: 5.0,
      mmPerPixel: 0.045,
    });
    expect(guide.grindLabel).toBe("미세");
    expect(guide.primary).toEqual(["에스프레소", "모카포트"]);
    expect(guide.avoid.length).toBeGreaterThan(0);
  });
});

describe("buildBrewingGuide — coarse 카테고리 (french press)", () => {
  it("sieve 1100μm + medium → 거침 + 프렌치프레스·콜드브루 추천", () => {
    const guide = buildBrewingGuide({
      d50: 1100,
      uniformity: 5.0,
      clumpAreaRatio: 0.0,
      mmPerPixel: 0.06,
    });
    expect(guide.grindLabel).toBe("거침");
    expect(guide.primary).toEqual(["프렌치프레스", "콜드브루"]);
    expect(guide.measurementConfidence).toBe("medium");
  });
});

describe("buildBrewingGuide — low confidence caveat", () => {
  it("mmPerPx 0.10 (먼 촬영) → low + 가까이 촬영 안내", () => {
    const guide = buildBrewingGuide({
      d50: 700,
      uniformity: 4.0,
      clumpAreaRatio: 0.0,
      mmPerPixel: 0.10,
    });
    expect(guide.measurementConfidence).toBe("low");
    expect(guide.caveat).toBeDefined();
    expect(guide.caveat).toContain("30%");
  });
});

describe("buildBrewingGuide — clump caveat 임계", () => {
  it("clumpAreaRatio 24% (VS3 정상 범위) → 약한 안내 (중간 임계)", () => {
    const guide = buildBrewingGuide({
      d50: 700,
      uniformity: 4.0,
      clumpAreaRatio: 24,
      mmPerPixel: 0.045,
    });
    expect(guide.caveat).toContain("클럼프 24%");
    // 2026-05-05: "burr 점검" 단정 표현 제거 — Phase 1+2 boulder/clump 분리 후
    // 42% clump 도 over-segmentation artifact 가능성 큼.
    expect(guide.caveat).not.toContain("burr 점검");
  });

  it("clumpAreaRatio 54% (puck 케이스) → 더 강한 안내 (40%+ 임계)", () => {
    const guide = buildBrewingGuide({
      d50: 600,
      uniformity: 5.5,
      clumpAreaRatio: 54,
      mmPerPixel: 0.045,
    });
    expect(guide.caveat).toContain("클럼프 54%");
    expect(guide.caveat).toContain("평탄하게");
  });

  it("clumpAreaRatio 18% → caveat 없음 (false alarm 방지)", () => {
    const guide = buildBrewingGuide({
      d50: 700,
      uniformity: 4.0,
      clumpAreaRatio: 18,
      mmPerPixel: 0.045,
    });
    // clump caveat 없음. high confidence 라 measurement caveat 도 없음.
    expect(guide.caveat).toBeUndefined();
  });
});
