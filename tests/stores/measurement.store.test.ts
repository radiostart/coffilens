import { describe, it, expect, beforeEach } from "vitest";
import { useMeasurementStore } from "../../src/stores/measurement.store";

describe("measurement.store", () => {
  beforeEach(() => {
    useMeasurementStore.getState().reset();
  });

  it("초기값 tool 은 null", () => {
    expect(useMeasurementStore.getState().tool).toBeNull();
  });

  it("setTool 호출 시 tool 업데이트", () => {
    useMeasurementStore.getState().setTool("v60");
    expect(useMeasurementStore.getState().tool).toBe("v60");
  });

  it("reset 호출 시 tool null 로 복귀", () => {
    useMeasurementStore.getState().setTool("kalita");
    useMeasurementStore.getState().reset();
    expect(useMeasurementStore.getState().tool).toBeNull();
  });
});
