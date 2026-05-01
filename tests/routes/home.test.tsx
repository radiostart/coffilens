import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeRoute } from "../../src/routes/home";
import { useHistoryStore } from "../../src/stores/history.store";

describe("HomeRoute", () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it("측정 기록 없을 때 EmptyStateCard 렌더", () => {
    render(<HomeRoute />);
    expect(screen.getByText("첫 측정을 시작해보세요")).toBeDefined();
    expect(screen.getByText("아직 측정 기록이 없어요")).toBeDefined();
  });

  it("측정 기록 있을 때 RecordList 렌더", () => {
    useHistoryStore.getState().add({
      id: "r1",
      createdAt: "2026-05-01T00:00:00Z",
      toolId: "v60",
      d50: 720,
      confidence: 8.2,
    });
    render(<HomeRoute />);
    expect(screen.getByText("V60")).toBeDefined();
    expect(screen.getByText(/720μm/)).toBeDefined();
  });
});
