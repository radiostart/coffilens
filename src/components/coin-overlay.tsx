import "./coin-overlay.css";

/**
 * 카메라 위 촬영 가이드.
 *
 * 캡처/검출 모두 전체 프레임 사용 — 박스 ROI 아님.
 * 동전과 분쇄물이 함께 화면에 보이면 측정 가능. 가까이 찍을수록 미세 입자
 * (~100µm) 검출 정확도 ↑ (capture-guide 와 일치, 2026-05-07 임계 완화).
 */
export function CoinOverlay() {
  return (
    <div className="coin-overlay" aria-hidden="true">
      <div className="coin-overlay-corners">
        <span className="coin-overlay-corner coin-overlay-corner-tl" />
        <span className="coin-overlay-corner coin-overlay-corner-tr" />
        <span className="coin-overlay-corner coin-overlay-corner-bl" />
        <span className="coin-overlay-corner coin-overlay-corner-br" />
      </div>
      <div className="coin-overlay-hint">
        <p className="text-caption">
          동전과 분쇄물이 화면에 함께 보이게 담아주세요
        </p>
      </div>
    </div>
  );
}
