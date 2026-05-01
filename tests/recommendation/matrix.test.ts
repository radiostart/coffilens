import { describe, it, expect } from "vitest";
import {
  ALL_TOOLS,
  diagnoseByD50,
  finesAction,
  getOtherTools,
  toolFitness,
  uniformityAction,
} from "../../src/recommendation/matrix";

describe("diagnoseByD50 — 5 경계값", () => {
  // < upper 매핑 (upper 자체는 다음 단계)
  it.each([
    [499, "very-fine"],
    [500, "fine"],
    [649, "fine"],
    [650, "v60-optimal"],
    [799, "v60-optimal"],
    [800, "coarse"],
    [949, "coarse"],
    [950, "very-coarse"],
    [1500, "very-coarse"],
  ])("D50=%d → %s", (d50, expected) => {
    expect(diagnoseByD50(d50).level).toBe(expected);
  });

  it("v60-optimal 추천 도구는 v60, origami", () => {
    const d = diagnoseByD50(720);
    expect(d.recommendedTools).toEqual(["v60", "origami"]);
  });

  it("very-fine / very-coarse 는 빈 추천 (분쇄도 조정 필요)", () => {
    expect(diagnoseByD50(400).recommendedTools).toEqual([]);
    expect(diagnoseByD50(1200).recommendedTools).toEqual([]);
  });

  it("반환된 recommendedTools 수정해도 원본 영향 없음 (방어 복사)", () => {
    const d1 = diagnoseByD50(720);
    d1.recommendedTools.push("chemex");
    const d2 = diagnoseByD50(720);
    expect(d2.recommendedTools).toEqual(["v60", "origami"]);
  });
});

describe("uniformityAction", () => {
  it.each([
    [2.9, "매우 균일"],
    [3.0, "양호"],
    [4.99, "양호"],
    [5.0, "편차 큼"],
    [10, "편차 큼"],
  ])("uniformity=%f → %s", (u, expected) => {
    expect(uniformityAction(u).label).toBe(expected);
  });
});

describe("finesAction", () => {
  it.each([
    [0, "깨끗함"],
    [9.9, "깨끗함"],
    [10, "보통"],
    [14.9, "보통"],
    [15, "채널링 위험"],
    [50, "채널링 위험"],
  ])("fines=%f → %s", (f, expected) => {
    expect(finesAction(f).label).toBe(expected);
  });
});

describe("toolFitness", () => {
  it("v60 + d50 720 → optimal", () => {
    expect(toolFitness(720, "v60")).toBe("optimal");
  });

  it("v60 + d50 900 (coarse) → suboptimal", () => {
    expect(toolFitness(900, "v60")).toBe("suboptimal");
  });

  it("clever + d50 600 (fine) → optimal", () => {
    expect(toolFitness(600, "clever")).toBe("optimal");
  });

  it("kalita + d50 850 (coarse) → optimal", () => {
    expect(toolFitness(850, "kalita")).toBe("optimal");
  });

  it("v60 + d50 400 (very-fine) → suboptimal (recommendedTools 빈 배열)", () => {
    expect(toolFitness(400, "v60")).toBe("suboptimal");
  });
});

describe("getOtherTools", () => {
  it("v60 제외 4개 반환", () => {
    expect(getOtherTools("v60")).toEqual(["kalita", "clever", "origami", "chemex"]);
  });

  it("ALL_TOOLS 5개 일관", () => {
    expect(ALL_TOOLS).toHaveLength(5);
  });
});
