import "./disclaimer-banner.css";

/**
 * "측정값은 상대 비교용" 영구 노출 banner.
 *
 * plain.md Section 19-2 결정: 디자인 욕심에 작게 만들지 말 것.
 * 결과 카드와 같은 시각 가중치 — 사용자 신뢰 방어선.
 */
export function DisclaimerBanner() {
  return (
    <aside className="disclaimer-banner" role="note">
      <span className="disclaimer-banner-icon" aria-hidden="true">
        ⚠️
      </span>
      <p className="disclaimer-banner-text">
        측정값은 <strong>상대 비교용</strong>입니다. 절대값으로 단정하지 마세요.
      </p>
    </aside>
  );
}
