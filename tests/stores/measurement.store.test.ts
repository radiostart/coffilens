import { describe, it, expect, beforeEach } from "vitest";
import { useMeasurementStore } from "../../src/stores/measurement.store";

describe("measurement.store", () => {
  beforeEach(() => {
    useMeasurementStore.getState().reset();
  });

  it("초기값 coinType 은 null", () => {
    expect(useMeasurementStore.getState().coinType).toBeNull();
  });

  it("setCoinType 호출 시 coinType 업데이트", () => {
    useMeasurementStore.getState().setCoinType("100");
    expect(useMeasurementStore.getState().coinType).toBe("100");
  });

  it("reset 호출 시 coinType null 로 복귀", () => {
    useMeasurementStore.getState().setCoinType("500");
    useMeasurementStore.getState().reset();
    expect(useMeasurementStore.getState().coinType).toBeNull();
  });
});
