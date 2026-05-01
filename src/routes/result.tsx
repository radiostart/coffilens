import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { useMeasurementStore } from "../stores/measurement.store";
import { userMessage } from "../opencv/errors";

/**
 * F07 placeholder — 분석 결과 표시.
 *
 * F07 에서 본격적으로 디자인:
 *  - 히스토그램 (Recharts)
 *  - D50/D10/D90/Fines%/Uniformity 카드
 *  - 신뢰도 점수
 *  - 추천 레시피 매트릭스
 *  - 저장 + 다른 도구로 보기 CTA
 */
export function ResultRoute() {
  const result = useMeasurementStore((s) => s.result);
  const error = useMeasurementStore((s) => s.error);
  const tool = useMeasurementStore((s) => s.tool);
  const [, setLocation] = useLocation();

  return (
    <>
      <NavBar title="분석 결과" />
      <main
        style={{
          padding: "var(--space-lg) var(--space-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-md)",
        }}
        aria-label="결과"
      >
        {error && (
          <>
            <h1 className="text-h2">분석 실패</h1>
            <p className="text-body-large" style={{ color: "var(--color-error)" }}>
              {userMessage(error)}
            </p>
          </>
        )}

        {result && (
          <>
            <h1 className="text-h2">측정 결과 (F07 placeholder)</h1>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "var(--space-sm) var(--space-md)",
                background: "var(--color-bg-surface)",
                padding: "var(--space-md)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <dt className="text-caption">도구</dt>
              <dd className="text-body">{tool ?? "-"}</dd>

              <dt className="text-caption">D50</dt>
              <dd className="text-body numeric">
                {Math.round(result.stats.d50)} μm
              </dd>

              <dt className="text-caption">D10 / D90</dt>
              <dd className="text-body numeric">
                {Math.round(result.stats.d10)} / {Math.round(result.stats.d90)}{" "}
                μm
              </dd>

              <dt className="text-caption">균일도 (D90/D10)</dt>
              <dd className="text-body numeric">
                {result.stats.uniformity.toFixed(2)}
              </dd>

              <dt className="text-caption">Fines%</dt>
              <dd className="text-body numeric">
                {result.stats.finesPercent.toFixed(1)}%
              </dd>

              <dt className="text-caption">입자 수</dt>
              <dd className="text-body numeric">
                {result.stats.particleCount}
              </dd>

              <dt className="text-caption">신뢰도</dt>
              <dd className="text-body numeric">
                {result.confidence.score} / 10
                {result.confidence.warning && (
                  <span style={{ color: "var(--color-warning)" }}>
                    {" "}
                    (재측정 권장)
                  </span>
                )}
              </dd>

              <dt className="text-caption">분석 시간</dt>
              <dd className="text-body numeric">
                {Math.round(result.durationMs)} ms
              </dd>
            </dl>
            <p className="text-caption">
              📌 측정값은 상대 비교용입니다. 절대값으로 단정하지 마세요.
            </p>
          </>
        )}

        {!result && !error && (
          <>
            <h1 className="text-h2">결과 없음</h1>
            <p className="text-body-large">측정을 먼저 진행해주세요.</p>
          </>
        )}

        <button
          type="button"
          className="btn-primary"
          onClick={() => setLocation("/home")}
        >
          홈으로
        </button>
      </main>
    </>
  );
}
