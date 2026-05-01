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

  useEffect(() => {
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
    if (!videoRef.current) return;
    const canvas = captureFrame(videoRef.current);
    setFrame(canvas);
    setLocation("/analyzing");
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
          <button
            type="button"
            className="capture-button"
            onClick={handleCapture}
            disabled={permission !== "granted"}
            aria-label="촬영"
          >
            <span className="capture-button-inner" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
