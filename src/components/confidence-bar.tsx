import "./confidence-bar.css";

export type ConfidenceVariant = "success" | "warning" | "error";

interface ConfidenceBarProps {
  score: number;
  max: number;
  variant: ConfidenceVariant;
  warningText?: string | null;
}

/**
 * 신뢰도 가로 바 — 색 + 점수 + 길이 3중 표현 (DESIGN.md 색맹 대응).
 *
 * Variant:
 *  - success (≥ 8): 녹색
 *  - warning (5~7): 주황
 *  - error (< 5): 빨강 + warningText 표시
 */
export function ConfidenceBar({
  score,
  max,
  variant,
  warningText,
}: ConfidenceBarProps) {
  const ratio = Math.max(0, Math.min(1, score / max));
  return (
    <div className={`confidence-bar variant-${variant}`}>
      <div
        className="confidence-bar-track"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`신뢰도 ${score}점 (만점 ${max}점)`}
      >
        <div
          className="confidence-bar-fill"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="confidence-bar-label numeric text-caption">
        신뢰도 {score}/{max}
      </span>
      {warningText && (
        <p className="confidence-bar-warning text-caption">{warningText}</p>
      )}
    </div>
  );
}
