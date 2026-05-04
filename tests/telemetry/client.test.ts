import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsoleAdapter,
  TossAdapter,
  _resetClientForTests,
} from "../../src/telemetry/client";
import { _resetSessionForTests } from "../../src/telemetry/events";

beforeEach(() => {
  _resetSessionForTests();
  _resetClientForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TossAdapter", () => {
  it("eventLog 호출 — log_name = event.type, log_type = 'event'", () => {
    const eventLog = vi.fn();
    const adapter = new TossAdapter(eventLog);

    adapter.track({ type: "measurement_attempt", coinType: "500" });

    expect(eventLog).toHaveBeenCalledOnce();
    const call = eventLog.mock.calls[0][0];
    expect(call.log_name).toBe("measurement_attempt");
    expect(call.log_type).toBe("event");
    expect(call.params.coinType).toBe("500");
    expect(call.params.deviceClass).toBeDefined();
    expect(call.params.sessionId).toBeDefined();
    expect(call.params.timestamp).toBeDefined();
  });

  it("measurement_fail / opencv_load_fail → log_type 'error'", () => {
    const eventLog = vi.fn();
    const adapter = new TossAdapter(eventLog);

    adapter.track({
      type: "measurement_fail",
      failReason: "no_coin",
      durationMs: 3200,
    });
    expect(eventLog.mock.calls[0][0].log_type).toBe("error");

    adapter.track({ type: "opencv_load_fail", cause: "network" });
    expect(eventLog.mock.calls[1][0].log_type).toBe("error");
  });

  it("app_open → log_type 'screen'", () => {
    const eventLog = vi.fn();
    const adapter = new TossAdapter(eventLog);

    adapter.track({ type: "app_open" });
    expect(eventLog.mock.calls[0][0].log_type).toBe("screen");
  });

  it("eventLog throw 시 silent (fire-and-forget)", () => {
    const eventLog = vi.fn(() => {
      throw new Error("sdk error");
    });
    const adapter = new TossAdapter(eventLog);

    expect(() =>
      adapter.track({ type: "app_open" }),
    ).not.toThrow();
  });

  it("eventLog Promise reject 시 silent (catch chain)", async () => {
    const eventLog = vi.fn(() => Promise.reject(new Error("network")));
    const adapter = new TossAdapter(eventLog);

    expect(() => adapter.track({ type: "app_open" })).not.toThrow();
    // microtask flush — unhandled rejection 발생 안 함
    await new Promise((r) => setTimeout(r, 10));
  });

  it("event 추가 필드가 params 에 포함 (durationMs, confidence, coinType)", () => {
    const eventLog = vi.fn();
    const adapter = new TossAdapter(eventLog);

    adapter.track({
      type: "measurement_success",
      durationMs: 2840,
      confidence: 8,
      coinType: "500",
    });

    const params = eventLog.mock.calls[0][0].params;
    expect(params.durationMs).toBe(2840);
    expect(params.confidence).toBe(8);
    expect(params.coinType).toBe("500");
    // type 자체는 log_name 으로 들어가니 params 에는 X
    expect(params.type).toBeUndefined();
  });

  // **F09 Phase 2 — 광고 텔레메트리** (2026-05-03):
  describe("광고 이벤트 — log_type 매핑", () => {
    it("ad_impression → log_type 'impression', slotId/adGroupId 보존", () => {
      const eventLog = vi.fn();
      const adapter = new TossAdapter(eventLog);

      adapter.track({
        type: "ad_impression",
        slotId: "home",
        adGroupId: "test_ad_group_001",
      });

      expect(eventLog).toHaveBeenCalledOnce();
      const call = eventLog.mock.calls[0][0];
      expect(call.log_name).toBe("ad_impression");
      expect(call.log_type).toBe("impression");
      expect(call.params.slotId).toBe("home");
      expect(call.params.adGroupId).toBe("test_ad_group_001");
    });

    it("ad_click → log_type 'click', slotId/adGroupId 보존", () => {
      const eventLog = vi.fn();
      const adapter = new TossAdapter(eventLog);

      adapter.track({
        type: "ad_click",
        slotId: "result",
        adGroupId: "test_ad_group_002",
      });

      const call = eventLog.mock.calls[0][0];
      expect(call.log_name).toBe("ad_click");
      expect(call.log_type).toBe("click");
      expect(call.params.slotId).toBe("result");
      expect(call.params.adGroupId).toBe("test_ad_group_002");
    });

    it("ad_load_fail → log_type 'error', errorCode/errorMessage 보존", () => {
      const eventLog = vi.fn();
      const adapter = new TossAdapter(eventLog);

      adapter.track({
        type: "ad_load_fail",
        slotId: "home",
        adGroupId: "test_ad_group_003",
        errorCode: 503,
        errorMessage: "no_fill",
      });

      const call = eventLog.mock.calls[0][0];
      expect(call.log_name).toBe("ad_load_fail");
      expect(call.log_type).toBe("error");
      expect(call.params.slotId).toBe("home");
      expect(call.params.errorCode).toBe(503);
      expect(call.params.errorMessage).toBe("no_fill");
    });

    it("home / result slotId 모두 지원", () => {
      const eventLog = vi.fn();
      const adapter = new TossAdapter(eventLog);

      adapter.track({
        type: "ad_impression",
        slotId: "home",
        adGroupId: "g1",
      });
      adapter.track({
        type: "ad_impression",
        slotId: "result",
        adGroupId: "g2",
      });

      expect(eventLog.mock.calls[0][0].params.slotId).toBe("home");
      expect(eventLog.mock.calls[1][0].params.slotId).toBe("result");
    });
  });
});

describe("ConsoleAdapter", () => {
  it("track 호출 시 console.info 호출 — prefix [telemetry]", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const adapter = new ConsoleAdapter();

    adapter.track({ type: "app_open" });

    expect(spy).toHaveBeenCalledWith(
      "[telemetry]",
      "app_open",
      expect.objectContaining({
        event: { type: "app_open" },
        deviceClass: expect.any(String),
        sessionId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });
});
