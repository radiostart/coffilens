import "./coin-overlay.css";

/**
 * 카메라 위 동전 가이드 박스.
 *
 * 사용자가 동전을 화면 중앙 박스 안에 위치시키도록 안내.
 * F04 동전 검출 정확도 ↑ — 화면 가장자리 잘림 (partial_coin) 사전 예방.
 */
export function CoinOverlay() {
  return (
    <div className="coin-overlay" aria-hidden="true">
      <div className="coin-overlay-frame">
        <div className="coin-overlay-coin-circle" />
      </div>
      <div className="coin-overlay-hint">
        <p className="text-caption">분쇄물과 동전을 화면 안에 함께 두세요</p>
      </div>
    </div>
  );
}
