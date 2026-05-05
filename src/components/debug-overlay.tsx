import { useEffect, useRef, useState } from "react";
import type { CoinDetection } from "../opencv/coin-detect";
import type { ParticleMarker } from "../opencv/statistics";
import "./debug-overlay.css";

/**
 * 개발자용 검출 시각화 — 분석한 frame 위에 동전 + 입자 마커 그리기.
 *
 * `?debug=1` URL 파라미터 시 result 화면 상단에 노출. 비-개발 사용자에게는 보이지 않음.
 *
 * 좌표 변환: pipeline 은 downsampled canvas (≤ 1280px 긴변) 에서 분석 →
 * marker 의 cx/cy/rPx 는 그 좌표계. 표시는 원본 frame 을 캔버스에 그린 뒤
 * `frame.width / imageWidth` 배수로 마커 좌표 scale.
 *
 * 색상 코드:
 *  - 노랑 (두꺼움): 검출 동전 + center 점
 *  - 보라:  fines (< 300µm image-space)
 *  - 시안:  main (정상 입자)
 *  - 초록:  boulder (≥ 1500µm 단일 큰 입자, 통계 포함)
 *  - 빨강:  clump (≥ 1500µm 응집체, 통계 제외)
 */

interface DebugOverlayProps {
  frame: HTMLCanvasElement;
  coin: CoinDetection;
  particles: ParticleMarker[];
  imageWidth: number;
  imageHeight: number;
}

interface FilterToggles {
  fines: boolean;
  main: boolean;
  boulder: boolean;
  clump: boolean;
}

const KIND_COLORS: Record<ParticleMarker["kind"], string> = {
  fines: "rgba(180, 80, 240, 0.85)",
  main: "rgba(0, 200, 230, 0.85)",
  boulder: "rgba(50, 220, 120, 0.95)",
  clump: "rgba(255, 70, 90, 0.95)",
};

const KIND_LABELS: Record<ParticleMarker["kind"], string> = {
  fines: "미분 (< 300µm)",
  main: "정상 입자",
  boulder: "boulder (≥ 1.5mm 단일)",
  clump: "clump (≥ 1.5mm 응집)",
};

export function DebugOverlay({
  frame,
  coin,
  particles,
  imageWidth,
  imageHeight,
}: DebugOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filters, setFilters] = useState<FilterToggles>({
    fines: true,
    main: true,
    boulder: true,
    clump: true,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = frame.width;
    canvas.height = frame.height;

    ctx.drawImage(frame, 0, 0);

    const scale = frame.width / imageWidth;

    // 동전 — 굵은 노란 원 + 중심 십자.
    const coinCx = coin.centerX * scale;
    const coinCy = coin.centerY * scale;
    const coinR = coin.radiusPx * scale;
    ctx.strokeStyle = "rgba(255, 220, 0, 0.95)";
    ctx.lineWidth = Math.max(3, scale * 3);
    ctx.beginPath();
    ctx.arc(coinCx, coinCy, coinR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    const cross = Math.max(8, scale * 6);
    ctx.moveTo(coinCx - cross, coinCy);
    ctx.lineTo(coinCx + cross, coinCy);
    ctx.moveTo(coinCx, coinCy - cross);
    ctx.lineTo(coinCx, coinCy + cross);
    ctx.stroke();

    // 입자 마커
    const baseLw = Math.max(1, scale * 0.8);
    for (const p of particles) {
      if (!filters[p.kind]) continue;
      ctx.strokeStyle = KIND_COLORS[p.kind];
      ctx.lineWidth = p.kind === "boulder" || p.kind === "clump" ? baseLw * 2 : baseLw;
      ctx.beginPath();
      const rDraw = Math.max(2, p.rPx * scale);
      ctx.arc(p.cx * scale, p.cy * scale, rDraw, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [frame, coin, particles, imageWidth, filters]);

  const counts: Record<ParticleMarker["kind"], number> = {
    fines: 0,
    main: 0,
    boulder: 0,
    clump: 0,
  };
  for (const p of particles) counts[p.kind]++;

  return (
    <section className="debug-overlay" aria-label="개발자 디버그 오버레이">
      <header className="debug-overlay-header">
        <h2 className="text-h3">🔬 검출 검증 (debug)</h2>
        <p className="text-caption">
          {imageWidth}×{imageHeight} 분석 좌표 → {frame.width}×{frame.height} 표시
        </p>
      </header>
      <div className="debug-overlay-canvas-wrap">
        <canvas ref={canvasRef} className="debug-overlay-canvas" />
      </div>
      <ul className="debug-overlay-legend" aria-label="범례">
        <li>
          <span
            className="debug-overlay-swatch"
            style={{ background: "rgba(255, 220, 0, 0.95)" }}
          />
          <span className="text-caption">
            동전 ({coin.coinType}원, r={coin.radiusPx.toFixed(1)}px,{" "}
            {coin.mmPerPixel.toFixed(4)} mm/px)
          </span>
        </li>
        {(Object.keys(KIND_LABELS) as ParticleMarker["kind"][]).map((kind) => (
          <li key={kind}>
            <label className="debug-overlay-toggle">
              <input
                type="checkbox"
                checked={filters[kind]}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, [kind]: e.target.checked }))
                }
              />
              <span
                className="debug-overlay-swatch"
                style={{ background: KIND_COLORS[kind] }}
              />
              <span className="text-caption">
                {KIND_LABELS[kind]} · {counts[kind]}개
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
