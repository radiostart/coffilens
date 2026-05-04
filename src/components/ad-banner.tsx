/**
 * **AdBanner — Phase 2 광고 텔레메트리 통합 컴포넌트** (2026-05-03 / F09).
 *
 * Toss SDK 의 `TossAds.attachBanner` 를 래핑. mount 시 광고 attach,
 * unmount 시 destroy. impression / click / load_fail callback 을
 * `getTelemetryClient()` 의 `track()` 에 1:1 forwarding.
 *
 * **slotId** 로 호출 위치 식별 — 한 컴포넌트로 home/result 양쪽 커버
 * (HomeAdBanner / ResultAdBanner 별도 X, prop 분기). 토스 콘솔에서 slotId
 * + adGroupId pair 로 cross-check 가능.
 *
 * **fail-soft 정책**:
 *  - SDK 미로드 (sandbox/dev) → silent return, render only empty container
 *  - attachBanner 자체 throw → console.warn + 빈 container
 *  - onAdFailedToRender → ad_load_fail telemetry track + 빈 container 유지
 *  사용자 측정 흐름 차단 X — 광고 실패가 핵심 기능 영향 0.
 *
 * **운영 절차** (⑥ Console-only):
 *  토스 콘솔 수동 검사 항목:
 *   1. ad_impression count vs ad_click count → CTR 산출
 *   2. ad_load_fail count vs ad_impression count → fill rate 진단
 *   3. slotId 별 분포 (home vs result) → 위치별 효과 비교
 *   4. errorCode top-5 → SDK/네트워크 issue 분류
 *   5. 일별 추세 (week-over-week) → 광고 성과 회귀 감지
 */

import { useEffect, useRef } from "react";
import { getTelemetryClient } from "../telemetry/client";
import type { AdSlotId } from "../telemetry/events";
import "./ad-banner.css";

/**
 * Toss SDK `attachBanner` callback payload (web-bridge `BannerSlotEventPayload`).
 * 부분 type — 우리가 사용하는 필드만 명시.
 */
interface AdEventPayload {
  slotId: string;
  adGroupId: string;
  adMetadata: Record<string, unknown>;
}

interface AdErrorPayload {
  slotId: string;
  adGroupId: string;
  error: { code: number; message: string };
}

interface AttachBannerCallbacks {
  onAdImpression?: (payload: AdEventPayload) => void;
  onAdClicked?: (payload: AdEventPayload) => void;
  onAdFailedToRender?: (payload: AdErrorPayload) => void;
}

interface AttachBannerOptions {
  theme?: "auto" | "light" | "dark";
  callbacks?: AttachBannerCallbacks;
}

interface AttachBannerResult {
  destroy: () => void;
}

interface TossAdsModule {
  TossAds?: {
    attachBanner?: (
      adGroupId: string,
      target: HTMLElement,
      options?: AttachBannerOptions,
    ) => AttachBannerResult;
  };
}

interface AdBannerProps {
  /** 호출 위치 — telemetry 의 slotId 로 사용. */
  slotId: AdSlotId;
  /** 토스 콘솔에서 발급받은 광고 그룹 ID. */
  adGroupId: string;
  /** 테마 — 기본 "auto" (시스템 따름). */
  theme?: "auto" | "light" | "dark";
}

export function AdBanner({
  slotId,
  adGroupId,
  theme = "auto",
}: AdBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;

    let destroy: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      let telClient: Awaited<ReturnType<typeof getTelemetryClient>> | null = null;
      try {
        telClient = await getTelemetryClient();
      } catch {
        // telemetry 도 fail-soft — 광고는 로드 시도.
      }

      // SDK lazy import. sandbox/dev 환경에선 fail → 빈 container 유지.
      let mod: TossAdsModule;
      try {
        mod = (await import(
          /* @vite-ignore */ "@apps-in-toss/web-framework"
        )) as TossAdsModule;
      } catch {
        return;
      }

      if (cancelled) return;
      if (!mod.TossAds?.attachBanner) return;

      try {
        const result = mod.TossAds.attachBanner(adGroupId, target, {
          theme,
          callbacks: {
            onAdImpression: () => {
              telClient?.track({ type: "ad_impression", slotId, adGroupId });
            },
            onAdClicked: () => {
              telClient?.track({ type: "ad_click", slotId, adGroupId });
            },
            onAdFailedToRender: (payload) => {
              telClient?.track({
                type: "ad_load_fail",
                slotId,
                adGroupId,
                errorCode: payload.error.code,
                errorMessage: payload.error.message,
              });
            },
          },
        });
        if (cancelled) {
          result.destroy();
          return;
        }
        destroy = result.destroy;
      } catch (e) {
        // attachBanner throw — 측정 흐름과 무관. 콘솔 경고만.
        console.warn("[ad-banner] attachBanner threw", { slotId, error: e });
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
      destroy = null;
    };
  }, [slotId, adGroupId, theme]);

  return (
    <div
      ref={containerRef}
      className="ad-banner"
      data-slot-id={slotId}
      aria-label="광고"
    />
  );
}
