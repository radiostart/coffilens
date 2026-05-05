import "./coin-overlay.css";

/**
 * 카메라 위 촬영 가이드.
 *
 * 캡처/검출 모두 전체 프레임 사용 — 박스 ROI 아님.
 * 동전이 화면 1/3 이상 차야 미세 입자(~100µm) 측정 가능 (capture-guide 와 일치).
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
          동전이 화면 1/3 이상 차게, 분쇄물과 함께 담아주세요
        </p>
      </div>
    </div>
  );
}
