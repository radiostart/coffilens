import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { AdBanner } from "../../src/components/ad-banner";
import { _resetClientForTests } from "../../src/telemetry/client";
import { _resetSessionForTests } from "../../src/telemetry/events";

/**
 * F09 Phase 2 — AdBanner 단위 테스트.
 *
 * Toss SDK 의 `attachBanner` 를 mock 하여 callback 이 telemetry track 으로
 * 1:1 forwarding 되는지 검증. 실제 광고 SDK 호출 안 함 (jsdom 환경).
 */

const mockAttachBanner = vi.fn();
const mockDestroy = vi.fn();
const mockTrack = vi.fn();

interface CapturedCallbacks {
  onAdImpression?: () => void;
  onAdClicked?: () => void;
  onAdFailedToRender?: (payload: {
    slotId: string;
    adGroupId: string;
    error: { code: number; message: string };
  }) => void;
}

let capturedCallbacks: CapturedCallbacks = {};

vi.mock("@apps-in-toss/web-framework", () => ({
  TossAds: {
    attachBanner: (
      _adGroupId: string,
      _target: HTMLElement,
      options?: {
        callbacks?: CapturedCallbacks;
      },
    ) => {
      mockAttachBanner();
      capturedCallbacks = options?.callbacks ?? {};
      return { destroy: mockDestroy };
    },
  },
}));

beforeEach(() => {
  _resetSessionForTests();
  _resetClientForTests({ track: mockTrack });
  mockAttachBanner.mockClear();
  mockDestroy.mockClear();
  mockTrack.mockClear();
  capturedCallbacks = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdBanner", () => {
  it("mount 시 attachBanner 호출, unmount 시 destroy 호출", async () => {
    const { unmount } = render(
      <AdBanner slotId="home" adGroupId="test_group_001" />,
    );

    await waitFor(() => expect(mockAttachBanner).toHaveBeenCalledOnce());

    unmount();
    await waitFor(() => expect(mockDestroy).toHaveBeenCalled());
  });

  it("onAdImpression callback → telemetry ad_impression track", async () => {
    render(<AdBanner slotId="home" adGroupId="g_home" />);
    await waitFor(() => expect(mockAttachBanner).toHaveBeenCalledOnce());

    capturedCallbacks.onAdImpression?.();

    expect(mockTrack).toHaveBeenCalledWith({
      type: "ad_impression",
      slotId: "home",
      adGroupId: "g_home",
    });
  });

  it("onAdClicked callback → telemetry ad_click track", async () => {
    render(<AdBanner slotId="result" adGroupId="g_result" />);
    await waitFor(() => expect(mockAttachBanner).toHaveBeenCalledOnce());

    capturedCallbacks.onAdClicked?.();

    expect(mockTrack).toHaveBeenCalledWith({
      type: "ad_click",
      slotId: "result",
      adGroupId: "g_result",
    });
  });

  it("onAdFailedToRender callback → telemetry ad_load_fail track (errorCode/errorMessage)", async () => {
    render(<AdBanner slotId="home" adGroupId="g_fail" />);
    await waitFor(() => expect(mockAttachBanner).toHaveBeenCalledOnce());

    capturedCallbacks.onAdFailedToRender?.({
      slotId: "home",
      adGroupId: "g_fail",
      error: { code: 503, message: "service_unavailable" },
    });

    expect(mockTrack).toHaveBeenCalledWith({
      type: "ad_load_fail",
      slotId: "home",
      adGroupId: "g_fail",
      errorCode: 503,
      errorMessage: "service_unavailable",
    });
  });

  it("data-slot-id attribute 노출 (DOM 디버그용)", async () => {
    const { container } = render(
      <AdBanner slotId="result" adGroupId="g1" />,
    );
    const div = container.querySelector(".ad-banner");
    expect(div?.getAttribute("data-slot-id")).toBe("result");
  });
});
