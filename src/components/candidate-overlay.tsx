import { useEffect, useRef } from "react";
import type { CandidateInfo } from "../opencv/errors";
import { rejectReasonLabel } from "../opencv/errors";
import "./debug-overlay.css";

/**
 * **dev-only** no_coin 진단 시각화 — 분석한 frame 위에 각 후보 원 + reject 이유.
 *
 * 좌표는 candidate.debug 의 0~1 상대값 (해상도 독립). frame.width 곱해서 표시.
 *
 * 색상 코드 (reject reason 별):
 *  - 빨강:   coffee_cluster (입자 뭉침)
 *  - 남보라: too_dark      (그림자)
 *  - 노랑:   too_bright    (배경 비슷)
 *  - 주황:   weak_rim      (윤곽 흐림)
 *  - 시안:   low_contrast  (대비 부족)
 *  - 회색:   hint_too_far  (힌트 위치와 멀음)
 *
 * candidate.debug 가 없으면 렌더링 skip — production build 안전 fallback.
 */

interface CandidateOverlayProps {
  frame: HTMLCanvasElement;
  candidates: CandidateInfo[];
}

const REASON_COLORS: Record<string, string> = {
  coffee_cluster: "rgba(255, 70, 90, 0.9)",
  too_dark: "rgba(80, 80, 220, 0.9)",
  too_bright: "rgba(240, 200, 0, 0.9)",
  weak_rim: "rgba(255, 140, 30, 0.9)",
  low_contrast: "rgba(0, 200, 230, 0.9)",
  hint_too_far: "rgba(160, 160, 160, 0.9)",
};

export function CandidateOverlay({ frame, candidates }: CandidateOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = frame.width;
    canvas.height = frame.height;
    ctx.drawImage(frame, 0, 0);

    const baseLw = Math.max(2, frame.width / 400);
    ctx.font = `${Math.max(14, frame.width / 80)}px sans-serif`;
    ctx.textBaseline = "top";

    for (const c of candidates) {
      if (!c.debug) continue;
      const cx = c.debug.cxRel * frame.width;
      const cy = c.debug.cyRel * frame.height;
      const r = c.debug.rRel * frame.width;
      const color = REASON_COLORS[c.rejectReason] ?? "rgba(255, 255, 255, 0.9)";
      ctx.strokeStyle = color;
      ctx.lineWidth = baseLw * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // label box (배경 + reason 텍스트)
      const label = rejectReasonLabel(c.rejectReason);
      const labelText = `${label} · m=${c.debug.mean.toFixed(0)} g=${c.debug.rimGradient.toFixed(0)}`;
      const metrics = ctx.measureText(labelText);
      const padding = 4;
      const labelX = Math.max(0, cx - metrics.width / 2 - padding);
      const labelY = Math.max(0, cy - r - 28);
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(
        labelX,
        labelY,
        metrics.width + padding * 2,
        24,
      );
      ctx.fillStyle = color;
      ctx.fillText(labelText, labelX + padding, labelY + padding);
    }
  }, [frame, candidates]);

  const renderable = candidates.filter((c) => c.debug);
  if (renderable.length === 0) {
    return (
      <section className="debug-overlay" aria-label="후보 검출 시각화">
        <header className="debug-overlay-header">
          <h2 className="text-h3">🔍 검출 결과 (DEV)</h2>
        </header>
        <p className="text-caption">
          시각화할 후보가 없어요 (HoughCircles 자체가 0 circles 반환).
        </p>
      </section>
    );
  }

  return (
    <section className="debug-overlay" aria-label="후보 검출 시각화">
      <header className="debug-overlay-header">
        <h2 className="text-h3">🔍 검출 결과 (DEV)</h2>
        <p className="text-caption">
          {renderable.length}개 원형 후보 — 모두 reject 됨
        </p>
      </header>
      <div className="debug-overlay-canvas-wrap">
        <canvas ref={canvasRef} className="debug-overlay-canvas" />
      </div>
      <ul className="debug-overlay-legend" aria-label="reject 이유 범례">
        {renderable.map((c, i) => (
          <li key={i}>
            <span
              className="debug-overlay-swatch"
              style={{
                background:
                  REASON_COLORS[c.rejectReason] ?? "rgba(255,255,255,0.9)",
              }}
            />
            <span className="text-caption">
              {c.position} — {rejectReasonLabel(c.rejectReason)}
              {c.debug && (
                <>
                  {" "}
                  (m={c.debug.mean.toFixed(0)}, g={c.debug.rimGradient.toFixed(0)})
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
