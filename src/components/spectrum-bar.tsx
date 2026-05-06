import "./spectrum-bar.css";

/**
 * 분쇄도 spectrum bar — D50 (sieve-eq µm) 위치 시각화.
 *
 * 분쇄도 분류 라벨 (미세 / 중간 / 거침) 만 보여주는 대신, 사용자의 D50 가
 * 어느 위치에 있는지 spectrum 위에 표시. 인접 카테고리에 가까운지 사용자
 * 본인이 직접 인지 가능 → 기존 "차선 (secondary)" 텍스트 추천이 전달하던
 * 정보를 시각적으로 대체.
 *
 * 분류 임계 ([brewing-guide.ts:67](../lib/brewing-guide.ts:67)):
 *  미세 < 500µm < 중간 < 900µm < 거침
 *
 * 표시 범위 0~1500µm (1500 이상은 끝에 clamp).
 */

interface SpectrumBarProps {
  /** sieve-equivalent D50, µm */
  d50: number;
}

const MAX_UM = 1500;
const FINE_BOUNDARY_UM = 500;
const MEDIUM_BOUNDARY_UM = 900;

export function SpectrumBar({ d50 }: SpectrumBarProps) {
  const positionPct = Math.max(0, Math.min(100, (d50 / MAX_UM) * 100));
  const finePct = (FINE_BOUNDARY_UM / MAX_UM) * 100;
  const mediumPct = ((MEDIUM_BOUNDARY_UM - FINE_BOUNDARY_UM) / MAX_UM) * 100;
  const coarsePct = ((MAX_UM - MEDIUM_BOUNDARY_UM) / MAX_UM) * 100;

  return (
    <div
      className="spectrum-bar"
      role="meter"
      aria-valuenow={Math.round(d50)}
      aria-valuemin={0}
      aria-valuemax={MAX_UM}
      aria-label={`분쇄도 D50 ${Math.round(d50)}마이크로미터`}
    >
      <div className="spectrum-bar-track">
        <div className="spectrum-bar-zone zone-fine" style={{ width: `${finePct}%` }}>
          <span className="spectrum-bar-zone-label">미세</span>
        </div>
        <div
          className="spectrum-bar-zone zone-medium"
          style={{ width: `${mediumPct}%` }}
        >
          <span className="spectrum-bar-zone-label">중간</span>
        </div>
        <div
          className="spectrum-bar-zone zone-coarse"
          style={{ width: `${coarsePct}%` }}
        >
          <span className="spectrum-bar-zone-label">거침</span>
        </div>
      </div>
      <div className="spectrum-bar-marker-track">
        <div
          className="spectrum-bar-marker"
          style={{ left: `${positionPct}%` }}
        >
          <span className="spectrum-bar-marker-arrow" aria-hidden="true" />
          <span className="spectrum-bar-marker-label numeric">
            D50 {Math.round(d50)}µm
          </span>
        </div>
      </div>
    </div>
  );
}
