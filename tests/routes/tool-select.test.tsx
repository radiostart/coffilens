import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolSelectRoute } from "../../src/routes/tool-select";
import { useMeasurementStore } from "../../src/stores/measurement.store";

describe("ToolSelectRoute", () => {
  beforeEach(() => {
    useMeasurementStore.getState().reset();
  });

  it("5개 도구 모두 렌더 (이름 + 설명)", () => {
    render(<ToolSelectRoute />);
    // 도구 이름은 strong 태그
    expect(screen.getByRole("button", { name: /^V60/ })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /^Kalita Wave/ }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /^Clever/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Origami/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Chemex/ })).toBeDefined();
  });

  it("도구 클릭 시 store 에 저장", () => {
    render(<ToolSelectRoute />);
    fireEvent.click(
      screen.getByRole("button", { name: /^V60/ }),
    );
    expect(useMeasurementStore.getState().tool).toBe("v60");
  });
});
