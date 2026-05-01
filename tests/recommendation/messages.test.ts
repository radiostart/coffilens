import { describe, it, expect } from "vitest";
import { buildMessages } from "../../src/recommendation/messages";
import type { ParticleStats } from "../../src/opencv/statistics";

function makeStats(overrides: Partial<ParticleStats> = {}): ParticleStats {
  return {
    d10: 400,
    d50: 720,
    d90: 1100,
    finesPercent: 5,
    uniformity: 2.75,
    particleCount: 200,
    totalAreaMm2: 50,
    diameters: [],
    ...overrides,
  };
}

describe("buildMessages — 정상 케이스", () => {
  it("V60 + d50 720 → optimal 메시지", () => {
    const m = buildMessages(makeStats({ d50: 720 }), "v60", 8);
    expect(m.headline).toBe("V60 적정 (D50 720μm)");
    expect(m.toolFitMessage).toMatch(/V60.*잘 맞아요/);
    expect(m.warnings).toEqual([]);
  });

  it("V60 + d50 900 → suboptimal + 굵은 편 메시지", () => {
    const m = buildMessages(makeStats({ d50: 900 }), "v60", 8);
    expect(m.toolFitMessage).toMatch(/굵은 편/);
    expect(m.toolFitMessage).toMatch(/Kalita Wave|Chemex/);
  });

  it("V60 + d50 600 → suboptimal + 곱은 편 메시지", () => {
    const m = buildMessages(makeStats({ d50: 600 }), "v60", 8);
    expect(m.toolFitMessage).toMatch(/곱은 편/);
    expect(m.toolFitMessage).toMatch(/Clever/);
  });

  it("v60 + d50 400 (very-fine) → 추천 도구 없음 + 분쇄도 조정", () => {
    const m = buildMessages(makeStats({ d50: 400 }), "v60", 8);
    expect(m.toolFitMessage).toMatch(/분쇄도를 조정/);
  });
});

describe("buildMessages — 경고", () => {
  it("신뢰도 < 5 → warning 추가", () => {
    const m = buildMessages(makeStats(), "v60", 4);
    expect(m.warnings).toContainEqual(
      expect.stringMatching(/신뢰도가 낮아요/),
    );
  });

  it("particleCount < 100 → warning 추가", () => {
    const m = buildMessages(
      makeStats({ particleCount: 80 }),
      "v60",
      8,
    );
    expect(m.warnings).toContainEqual(
      expect.stringMatching(/입자가 적어요/),
    );
  });

  it("신뢰도 5 + 입자 100 → warnings 없음", () => {
    const m = buildMessages(makeStats({ particleCount: 200 }), "v60", 5);
    expect(m.warnings).toEqual([]);
  });
});

describe("buildMessages — recipe", () => {
  it("uniformity + fines 액션 결합", () => {
    const m = buildMessages(
      makeStats({ uniformity: 2.5, finesPercent: 5 }),
      "v60",
      8,
    );
    expect(m.recipe).toMatch(/그라인더 좋음|레시피 자유/);
    expect(m.recipe).toMatch(/표준 레시피/);
  });

  it("높은 fines% → 채널링 액션", () => {
    const m = buildMessages(
      makeStats({ finesPercent: 20 }),
      "v60",
      8,
    );
    expect(m.recipe).toMatch(/블루밍 짧게|침지 비율/);
  });
});
