import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { Histogram } from "../components/histogram";
import {
  ConfidenceBar,
  type ConfidenceVariant,
} from "../components/confidence-bar";
import { DisclaimerBanner } from "../components/disclaimer-banner";
import { useMeasurementStore, type ToolId } from "../stores/measurement.store";
import { useHistoryStore } from "../stores/history.store";
import { userMessage } from "../opencv/errors";
import { buildMessages } from "../recommendation/messages";
import { getOtherTools } from "../recommendation/matrix";
import { makeThumbnail } from "../lib/thumbnail";
import "./result.css";

/**
 * 결과 화면 — plain.md Section 19-2 wireframe 적용.
 *
 * 위계:
 *  1. 진단 라벨 + D50 (1차)
 *  2. 신뢰도 가로 바 (1.5차)
 *  3. 히스토그램 (2차)
 *  4. inline data list (3차)
 *  5. 추천 레시피 (2차)
 *  6. 검출 동전 메타 (3차)
 *  7. sticky 디스클레이머
 *  8. CTA 측정 저장 (F08 placeholder)
 *  9. 저장 후 "다른 도구로 보기" chip 그룹
 */
export function ResultRoute() {
  const result = useMeasurementStore((s) => s.result);
  const error = useMeasurementStore((s) => s.error);
  const tool = useMeasurementStore((s) => s.tool);
  const frame = useMeasurementStore((s) => s.frame);
  const setTool = useMeasurementStore((s) => s.setTool);
  const saveHistory = useHistoryStore((s) => s.save);
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cleanedCount, setCleanedCount] = useState(0);

  // toast 자동 제거
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (error) {
    return (
      <>
        <NavBar title="분석 실패" />
        <main className="result-error" aria-label="에러 화면">
          <h1 className="text-h2">분석을 완료하지 못했어요</h1>
          <p className="text-body-large result-error-message">
            {userMessage(error) || "예상치 못한 에러가 발생했어요."}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setLocation("/camera")}
          >
            다시 촬영하기
          </button>
          <button
            type="button"
            className="result-secondary"
            onClick={() => setLocation("/home")}
          >
            홈으로
          </button>
        </main>
      </>
    );
  }

  if (!result || !tool) {
    return (
      <>
        <NavBar title="분석 결과" />
        <main className="result-empty" aria-label="결과 없음">
          <h1 className="text-h2">결과 없음</h1>
          <p className="text-body-large">측정을 먼저 진행해주세요.</p>
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

  const messages = buildMessages(result.stats, tool, result.confidence.score);
  const variant: ConfidenceVariant =
    result.confidence.score >= 8
      ? "success"
      : result.confidence.score >= 5
        ? "warning"
        : "error";
  const otherTools = getOtherTools(tool);

  async function handleSave() {
    if (!result || !tool) return;
    try {
      setSaveError(null);
      const thumbnail = frame
        ? await makeThumbnail(frame)
        : new Blob([new Uint8Array(0)], { type: "image/jpeg" });
      const { cleanedCount: cleaned } = await saveHistory({
        tool,
        thumbnail,
        d50: result.stats.d50,
        d10: result.stats.d10,
        d90: result.stats.d90,
        uniformity: result.stats.uniformity,
        finesPercent: result.stats.finesPercent,
        confidence: result.confidence.score,
        coinType: result.coin.coinType,
      });
      setCleanedCount(cleaned);
      setSaved(true);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장 실패";
      setSaveError(msg);
    }
  }

  function handleSwitchTool(t: ToolId) {
    setTool(t);
    // 같은 result 유지하되 tool 만 변경 — useMemo 로 messages 재계산.
    // 사용자가 화면에 머물기 원하므로 navigate X.
  }

  return (
    <>
      <NavBar title="분석 결과" />
      <main className="result" aria-label="측정 결과">
        {/* 1차 진단 + D50 */}
        <header className="result-headline">
          <h1 className="text-display result-diagnosis">
            {messages.headline}
          </h1>
          <p
            className="text-body-large result-tool-fit"
            aria-live="polite"
          >
            {messages.toolFitMessage}
          </p>
        </header>

        {/* 1.5차 신뢰도 바 */}
        <ConfidenceBar
          score={result.confidence.score}
          max={10}
          variant={variant}
          warningText={
            result.confidence.warning
              ? "신뢰도가 낮아요. 더 밝은 곳에서 재측정 권장"
              : null
          }
        />

        {/* 2차 히스토그램 */}
        <section
          className="result-histogram-section"
          aria-label="입자 분포"
        >
          <h2 className="text-h3 result-section-title">입자 분포</h2>
          <Histogram diameters={result.stats.diameters} />
        </section>

        {/* 3차 inline data list */}
        <dl className="result-data-inline" aria-label="측정 통계">
          <div>
            <dt className="text-caption">D50</dt>
            <dd className="text-h4 numeric">
              {Math.round(result.stats.d50)}μm
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt className="text-caption">균일도</dt>
            <dd className="text-h4 numeric">
              {result.stats.uniformity.toFixed(2)}
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt className="text-caption">Fines</dt>
            <dd className="text-h4 numeric">
              {result.stats.finesPercent.toFixed(1)}%
            </dd>
          </div>
        </dl>

        {/* 2차 추천 */}
        <section className="result-recommendation">
          <h2 className="text-h3 result-section-title">📌 추출 가이드</h2>
          <p className="text-body-large">{messages.recipe}</p>
        </section>

        {/* warnings (있을 때만) */}
        {messages.warnings.length > 0 && (
          <ul className="result-warnings" aria-label="경고">
            {messages.warnings.map((w, i) => (
              <li key={i} className="text-body">
                {w}
              </li>
            ))}
          </ul>
        )}

        {/* 3차 검출 동전 메타 */}
        <p className="text-caption result-coin-meta">
          📐 {result.coin.coinType}원 인식됨 ({result.coin.diameterMm}mm) ·
          분석 {Math.round(result.durationMs)}ms
        </p>

        {/* 3차 sticky 디스클레이머 */}
        <DisclaimerBanner />

        {/* CTA */}
        {saveError && (
          <p
            role="alert"
            className="text-body"
            style={{ color: "var(--color-error)" }}
          >
            저장 실패: {saveError}
          </p>
        )}
        {!saved ? (
          <button
            type="button"
            className="btn-primary result-save-cta"
            onClick={() => {
              void handleSave();
            }}
          >
            측정 저장
          </button>
        ) : (
          <>
            {savedAt !== null && (
              <p
                className="result-saved-toast"
                role="status"
                aria-live="polite"
              >
                ✓ 측정 기록이 저장되었어요
                {cleanedCount > 0 && (
                  <span className="text-caption">
                    {" "}· 오래된 기록 {cleanedCount}개를 정리했어요
                  </span>
                )}
              </p>
            )}
            <section
              className="result-other-tools"
              aria-label="다른 도구로 보기"
            >
              <p className="text-caption result-other-tools-label">
                다른 도구로도 보기
              </p>
              <div className="result-chip-group">
                {otherTools.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="result-chip"
                    onClick={() => handleSwitchTool(t)}
                    aria-pressed={tool === t}
                  >
                    {TOOL_LABELS[t]}
                  </button>
                ))}
              </div>
            </section>
            <button
              type="button"
              className="result-secondary"
              onClick={() => setLocation("/home")}
            >
              홈으로
            </button>
          </>
        )}
      </main>
    </>
  );
}

const TOOL_LABELS: Record<ToolId, string> = {
  v60: "V60",
  kalita: "Kalita Wave",
  clever: "Clever",
  origami: "Origami",
  chemex: "Chemex",
};
