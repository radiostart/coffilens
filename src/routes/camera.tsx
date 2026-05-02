import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { CoinOverlay } from "../components/coin-overlay";
import { PermissionDeniedScreen } from "../components/permission-denied-screen";
import {
  type CameraPermissionState,
  captureFrame,
  checkCameraPermission,
  lockPortraitOrientation,
  requestCameraStream,
  stopStream,
  unlockOrientation,
} from "../lib/permissions";
import { useMeasurementStore } from "../stores/measurement.store";
import "./camera.css";

export function CameraRoute() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] =
    useState<CameraPermissionState>("prompt");
  const [, setLocation] = useLocation();
  const setFrame = useMeasurementStore((s) => s.setFrame);
  const coinType = useMeasurementStore((s) => s.coinType);

  // coinType 미설정 상태에서 /camera 직접 진입 → /coin-select 로 redirect
  // (예: 옛 URL 잔존, 또는 HMR 이후 navigation 상태가 stale 한 경우)
  useEffect(() => {
    if (!coinType) setLocation("/coin-select");
  }, [coinType, setLocation]);

  useEffect(() => {
    if (!coinType) return;
    let cancelled = false;
    void lockPortraitOrientation();

    (async () => {
      const state = await checkCameraPermission();
      if (cancelled) return;
      setPermission(state);
      if (state === "denied") return;

      try {
        const stream = await requestCameraStream();
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPermission("granted");
      } catch {
        if (!cancelled) setPermission("denied");
      }
    })();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      unlockOrientation();
    };
  }, []);

  function handleCapture() {
    const v = videoRef.current;
    if (!v) {
      console.warn("[camera] handleCapture: videoRef.current is null");
      return;
    }
    console.log("[camera] handleCapture", {
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      readyState: v.readyState,
      paused: v.paused,
      permission,
    });
    if (v.videoWidth === 0 || v.videoHeight === 0) {
      console.warn("[camera] video not ready — try video.play()");
      void v.play().catch((e) => console.error("[camera] play failed", e));
      return;
    }
    const canvas = captureFrame(v);
    setFrame(canvas);
    setLocation("/coin-locate");
  }

  // 갤러리에서 이미지 선택 — 카메라 셔터와 동등한 first-class 진입점.
  // 사용자가 미리 촬영한 사진으로 측정하거나 회귀 테스트할 때 사용.
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log(`[camera] gallery upload: ${file.name} (${file.size} bytes)`);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      // willReadFrequently: 다운스트림 OpenCV pipeline (cv.imread + HoughCircles
      // 등) 이 getImageData 다회 호출. CPU-side buffer 로 readback 가속.
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      console.log(
        `[camera] gallery upload canvas: ${canvas.width}×${canvas.height}`,
      );
      setFrame(canvas);
      setLocation("/coin-locate");
    } catch (err) {
      console.error("[camera] gallery upload failed", err);
    }
  }

  if (permission === "denied") return <PermissionDeniedScreen />;

  return (
    <>
      <NavBar title="촬영" />
      <div className="camera-screen">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
          aria-label="카메라 미리보기"
        />
        <CoinOverlay />
        <div className="camera-controls">
          {/* 좌측 placeholder — 시각적 균형용 (셔터 정중앙 유지) */}
          <span className="camera-control-spacer" aria-hidden="true" />

          {/* 메인 셔터 */}
          <button
            type="button"
            className="capture-button"
            onClick={handleCapture}
            disabled={permission !== "granted"}
            aria-label="촬영"
          >
            <span className="capture-button-inner" aria-hidden="true" />
          </button>

          {/* 갤러리 업로드 (셔터 우측, 동등한 first-class 모드) */}
          <label className="gallery-button" aria-label="갤러리에서 이미지 선택">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
            />
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </label>
        </div>
      </div>
    </>
  );
}
