import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { useMeasurementStore } from "../stores/measurement.store";
import "./coin-locate.css";

/**
 * 동전 위치 hint UI — Phase 1 (pixel-stat 자동 검출의 fundamental ambiguity 해결).
 *
 * 흐름: camera 촬영 → frame 저장 → 이 화면에서 사용자가 동전 위치 탭 →
 * 상대 좌표 (0~1) 로 store 저장 → /analyzing 진행.
 * detectCoin 이 hint 와 가장 가까운 candidate 채택 + multi_coin 검사 우회.
 *
 * "건너뛰기" 옵션: hint 없이 자동 검출도 가능 (기존 동작).
 */
export function CoinLocateRoute() {
  const frame = useMeasurementStore((s) => s.frame);
  const setCoinHint = useMeasurementStore((s) => s.setCoinHint);
  const [, setLocation] = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  // 화면 표시 크기 기준 hint (px) — 마커 표시용. 상대 좌표는 store 에 저장.
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);

  // frame 없이 직접 진입 → /home redirect
  useEffect(() => {
    if (!frame) {
      setLocation("/home");
    }
  }, [frame, setLocation]);

  // canvas → blob URL (img src 용)
  useEffect(() => {
    if (!frame) return;
    let cancelled = false;
    let url: string | null = null;
    frame.toBlob(
      (blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setImgUrl(url);
      },
      "image/jpeg",
      0.92,
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [frame]);

  function handleImgClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTap({ x, y });
    // 상대 좌표 (0~1) — 다운샘플 canvas 어떤 사이즈에도 적용 가능
    setCoinHint({
      x: x / rect.width,
      y: y / rect.height,
    });
  }

  function handleProceed() {
    if (!tap) return;
    setLocation("/analyzing");
  }

  function handleSkip() {
    setCoinHint(null);
    setLocation("/analyzing");
  }

  if (!frame || !imgUrl) {
    return (
      <>
        <NavBar title="동전 위치" />
        <main className="coin-locate-loading">
          <p className="text-caption">사진 준비 중...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar title="동전 위치 알려주기" />
      <main className="coin-locate" aria-label="동전 위치 지정">
        <p className="text-body-large coin-locate-instruction">
          사진에서 <strong>동전 가운데</strong>를 한 번 탭해주세요
        </p>
        <p className="text-caption coin-locate-help">
          탭한 위치를 기준으로 동전을 찾아 분쇄도를 측정합니다
        </p>

        <div className="coin-locate-wrapper" ref={wrapperRef}>
          <img
            ref={imgRef}
            src={imgUrl}
            alt="촬영한 사진 — 동전을 탭"
            className="coin-locate-image"
            onClick={handleImgClick}
            draggable={false}
          />
          {tap && (
            <div
              className="coin-locate-marker"
              style={{ left: tap.x, top: tap.y }}
              aria-hidden="true"
            >
              <div className="coin-locate-marker-ring" />
              <div className="coin-locate-marker-dot" />
            </div>
          )}
        </div>

        <div className="coin-locate-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleProceed}
            disabled={!tap}
          >
            {tap ? "이 위치로 분석" : "동전 탭하기"}
          </button>
          <button
            type="button"
            className="coin-locate-skip"
            onClick={handleSkip}
          >
            건너뛰기 (자동 검출)
          </button>
        </div>
      </main>
    </>
  );
}
