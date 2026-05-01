import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetSessionForTests,
  detectDeviceClass,
  getSessionId,
} from "../../src/telemetry/events";

beforeEach(() => {
  _resetSessionForTests();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectDeviceClass", () => {
  it("iPhone + memGB 4 → ios_high", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15",
      deviceMemory: 6,
    });
    expect(detectDeviceClass()).toBe("ios_high");
  });

  it("iPhone + memGB 2 → ios_low", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)",
      deviceMemory: 2,
    });
    expect(detectDeviceClass()).toBe("ios_low");
  });

  it("Android + memGB 8 → android_high", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 13)",
      deviceMemory: 8,
    });
    expect(detectDeviceClass()).toBe("android_high");
  });

  it("Android + memGB 1 → android_low", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 9)",
      deviceMemory: 1,
    });
    expect(detectDeviceClass()).toBe("android_low");
  });

  it("Desktop UA → unknown", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      deviceMemory: 8,
    });
    expect(detectDeviceClass()).toBe("unknown");
  });

  it("deviceMemory 미지원 → 4 fallback", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone)",
      // deviceMemory 없음
    });
    expect(detectDeviceClass()).toBe("ios_high");
  });
});

describe("getSessionId", () => {
  it("동일 세션 동안 같은 ID 반환", () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
  });

  it("reset 후 새 ID", () => {
    const a = getSessionId();
    _resetSessionForTests();
    const b = getSessionId();
    expect(a).not.toBe(b);
  });
});
