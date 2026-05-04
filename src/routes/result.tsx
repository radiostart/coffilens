import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { Histogram } from "../components/histogram";
import {
  ConfidenceBar,
  type ConfidenceVariant,
} from "../components/confidence-bar";
import { DisclaimerBanner } from "../components/disclaimer-banner";
import { AdBanner } from "../components/ad-banner";
import { ConfirmModal } from "../components/confirm-modal";
import { useMeasurementStore } from "../stores/measurement.store";
import { useHistoryStore } from "../stores/history.store";
import { errorDetails, rejectReasonLabel } from "../opencv/errors";
import { makeThumbnail } from "../lib/thumbnail";
import { buildBrewingGuide } from "../lib/brewing-guide";
import "./result.css";

// F09 Phase 2 — 광고 그룹 ID. 미설정 시 banner 미노출 (fail-soft).
const RESULT_AD_GROUP_ID = import.meta.env.VITE_AD_GROUP_RESULT;

/**
 * 결과 화면 — 순수 측정 결과 표시 (도구별 추천 없음).
 *
 * 위계:
 *  1. D50 (1차)
 *  2. 신뢰도 가로 바 (1.5차)
 *  3. 히스토그램 (2차)
 *  4. inline data list (3차)
 *  5. 신뢰도/입자수 경고 (있을 때만)
 *  6. 검출 동전 메타 (3차)
 *  7. sticky 디스클레이머
 *  8. CTA 측정 저장
 */
export function ResultRoute() {
  const result = useMeasurementStore((s) => s.result);
  const error = useMeasurementStore((s) => s.error);
  const frame = useMeasurementStore((s) => s.frame);
  const archive = useMeasurementStore((s) => s.archive);
  const setArchive = useMeasurementStore((s) => s.setArchive);
  const accumulatedStats = useMeasurementStore((s) => s.accumulatedStats);
  const setAppendMode = useMeasurementStore((s) => s.setAppendMode);
  const resetAccumulated = useMeasurementStore((s) => s.resetAccumulated);
  const saveHistory = useHistoryStore((s) => s.save);
  const removeHistory = useHistoryStore((s) => s.remove);
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cleanedCount, setCleanedCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "한 번 더 측정" 클릭 시 같은 분쇄도 confirm 모달 표시 — user trust 보호:
  // 다른 분쇄도가 자동 결합되는 silent failure 방지.
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);
  // no_coin 진단 — v3 default 노출, "자세히" 클릭 시 v2 (per-candidate) expand.
  const [showDiagDetail, setShowDiagDetail] = useState(false);
  const isArchived = archive !== null;
  // archive view 의 shotCount: record 의 shotCount (구 record 는 null = 1).
  // 신규 측정: accumulatedStats.length.
  const shotCount = isArchived
    ? (archive.shotCount ?? 1)
    : accumulatedStats.length;

  // result 화면을 떠날 때마다 누적/append 상태를 비운다 — 다음 사이클은 fresh.
  function leaveResult(path: string) {
    resetAccumulated();
    setLocation(path);
  }

  function leaveArchive(path: string) {
    setArchive(null);
    setLocation(path);
  }

  // toast 자동 제거
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  if (error) {
    const details = errorDetails(error);
    return (
      <>
        <NavBar title="분석 실패" />
        <main className="result-error" aria-label="에러 화면">
          <h1 className="text-h2">{details.title}</h1>
          <p className="text-body-large result-error-message">
            {details.whatHappened}
          </p>
          {details.howToFix.length > 0 && (
            <section className="result-error-fix" aria-label="해결 방법">
              <h2 className="text-h3">이렇게 해보세요</h2>
              <ul>
                {details.howToFix.map((step, i) => (
                  <li key={i} className="text-body">
                    {step}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {details.candidates && details.candidates.length > 0 && (
            <section
              className="result-error-diag-detail"
              aria-label="자세한 진단"
            >
              <button
                type="button"
                className="result-error-diag-toggle"
                onClick={() => setShowDiagDetail((v) => !v)}
                aria-expanded={showDiagDetail}
                aria-controls="diag-detail-list"
              >
                {showDiagDetail ? "자세한 진단 닫기 ▲" : "자세한 진단 보기 ▼"}
              </button>
              {showDiagDetail && (
                <ul id="diag-detail-list" className="result-error-diag-list">
                  {details.candidates.map((c, i) => (
                    <li key={i} className="text-caption">
                      <strong>{c.position}</strong> 원형 —{" "}
                      {rejectReasonLabel(c.rejectReason)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {details.diagnostics && (
            <p className="text-caption result-error-diag" aria-label="진단 정보">
              📊 {details.diagnostics}
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => leaveResult("/camera")}
          >
            다시 촬영하기
          </button>
          <button
            type="button"
            className="result-secondary"
            onClick={() => leaveResult("/home")}
          >
            홈으로
          </button>
        </main>
      </>
    );
  }

  if (!result) {
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

  const variant: ConfidenceVariant =
    result.confidence.score >= 8
      ? "success"
      : result.confidence.score >= 5
        ? "warning"
        : "error";

  const warnings: string[] = [];
  if (result.confidence.score < 5) {
    warnings.push("신뢰도가 낮아요. 더 밝은 곳에서 재측정을 권장합니다.");
  }
  if (result.stats.particleCount < 100) {
    warnings.push(
      `검출된 입자가 적어요(${result.stats.particleCount}개). 통계 신뢰도가 낮을 수 있습니다.`,
    );
  }

  async function handleSave() {
    if (!result) return;
    try {
      setSaveError(null);
      const thumbnail = frame
        ? await makeThumbnail(frame)
        : new Blob([new Uint8Array(0)], { type: "image/jpeg" });
      const { cleanedCount: cleaned } = await saveHistory({
        thumbnail,
        d50: result.stats.d50,
        d10: result.stats.d10,
        d90: result.stats.d90,
        uniformity: result.stats.uniformity,
        finesPercent: result.stats.finesPercent,
        confidence: result.confidence.score,
        coinType: result.coin.coinType,
        diameters: result.stats.diameters,
        mmPerPixel: result.coin.mmPerPixel,
        clumpsCount: result.stats.clumps.count,
        clumpsAreaRatio: result.stats.clumps.areaRatio,
        clumpsTotalAreaMm2: result.stats.clumps.totalAreaMm2,
        totalAreaMm2: result.stats.totalAreaMm2,
        particleCount: result.stats.particleCount,
        durationMs: result.durationMs,
        shotCount,
      });
      setCleanedCount(cleaned);
      setSaved(true);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "저장 실패";
      setSaveError(msg);
    }
  }

  const guide = buildBrewingGuide({
    d50: result.stats.d50,
    uniformity: result.stats.uniformity,
    clumpAreaRatio: result.stats.clumps.areaRatio,
    mmPerPixel: result.coin.mmPerPixel,
  });

  return (
    <>
      <NavBar title="분석 결과" />
      <main className="result" aria-label="측정 결과">
        {/* 1차 — 분쇄도 (D50, 입자 크기 중앙값) */}
        <header className="result-headline">
          <h1 className="text-display result-diagnosis">
            분쇄도 {Math.round(result.stats.d50)}μm
          </h1>
          {/* archive view (저장된 record) 는 단일 stats 로 저장됐으므로 배지 X. */}
          {shotCount > 1 && (
            <span className="result-shot-badge">
              ✨ {shotCount}회 측정 평균 (정확도 ↑)
            </span>
          )}
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

        {/* 2차 히스토그램 — archive view 의 구 record 는 diameters[] 없음 */}
        <section className="result-histogram-section" aria-label="입자 분포">
          <h2 className="text-h3 result-section-title">입자 분포</h2>
          {result.stats.diameters.length > 0 ? (
            <Histogram
              diameters={result.stats.diameters}
              d10={result.stats.d10}
              d50={result.stats.d50}
              d90={result.stats.d90}
            />
          ) : (
            <p className="text-caption result-histogram-empty">
              이전 버전 기록은 분포 그래프가 저장되지 않았어요. 새 측정부터
              표시됩니다.
            </p>
          )}
        </section>

        {/* 3차 inline data list — 작은쪽 → 중앙 → 큰쪽 progression, 그 뒤 균일도 / 미분 */}
        <dl className="result-data-inline" aria-label="측정 통계">
          <div>
            <dt
              className="text-caption"
              title="입자 크기 하위 10% 경계 — 이 값보다 작은 입자가 10%"
            >
              작은 쪽
            </dt>
            <dd className="text-h4 numeric">
              {Math.round(result.stats.d10)}μm
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt
              className="text-caption"
              title="중앙값 — 전체 입자의 절반이 이 크기보다 작음"
            >
              중앙값
            </dt>
            <dd className="text-h4 numeric">
              {Math.round(result.stats.d50)}μm
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt
              className="text-caption"
              title="입자 크기 상위 10% 경계 — 이 값보다 큰 입자가 10%"
            >
              큰 쪽
            </dt>
            <dd className="text-h4 numeric">
              {Math.round(result.stats.d90)}μm
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt
              className="text-caption"
              title="입자 크기 균일성 (작을수록 고름, D90/D10 비율)"
            >
              균일도
            </dt>
            <dd className="text-h4 numeric">
              {result.stats.uniformity.toFixed(2)}
            </dd>
          </div>
          <span className="result-data-sep" aria-hidden="true">
            ·
          </span>
          <div>
            <dt
              className="text-caption"
              title="image 측정 기준 작은 입자 (≤300μm) 면적 비율 — 같은 분쇄 내 상대 비교용"
            >
              미분
            </dt>
            <dd className="text-h4 numeric">
              {result.stats.finesPercent.toFixed(1)}%
            </dd>
          </div>
        </dl>

        {warnings.length > 0 && (
          <ul className="result-warnings" aria-label="경고">
            {warnings.map((w, i) => (
              <li key={i} className="text-body">
                {w}
              </li>
            ))}
          </ul>
        )}

        {/* 2차 — 분포 기반 추출법 가이드 */}
        <section className="result-brewing-guide" aria-label="추출 가이드">
          <h2 className="text-h3 result-section-title">
            ☕ 어떻게 추출할까요?{" "}
            <span className="result-grind-label">{guide.grindLabel}</span>
          </h2>
          <div className="result-guide-row">
            <span className="result-guide-tag tag-primary">추천</span>
            <span className="text-body">{guide.primary.join(" · ")}</span>
          </div>
          {guide.secondary.length > 0 && (
            <div className="result-guide-row">
              <span className="result-guide-tag tag-secondary">차선</span>
              <span className="text-body">{guide.secondary.join(" · ")}</span>
            </div>
          )}
          {guide.avoid.length > 0 && (
            <div className="result-guide-row">
              <span className="result-guide-tag tag-avoid">비추</span>
              <span className="text-body result-guide-avoid">
                {guide.avoid.join(" · ")}
              </span>
            </div>
          )}
          {guide.caveat && (
            <p className="text-caption result-guide-caveat">
              ⚠️ {guide.caveat}
            </p>
          )}
          {result.stats.clumps.count > 0 && (
            <p className="text-caption result-clumps-meta">
              🔸 클럼프 {result.stats.clumps.count}개 (
              {result.stats.clumps.totalAreaMm2.toFixed(0)}mm²,{" "}
              {result.stats.clumps.areaRatio.toFixed(1)}%) 통계에서 제외됨
            </p>
          )}
        </section>

        {/* 3차 검출 동전 메타 */}
        <p className="text-caption result-coin-meta">
          📐 {result.coin.coinType}원 인식됨 ({result.coin.diameterMm}mm) ·
          분석 {Math.round(result.durationMs)}ms
        </p>

        {/* 3차 sticky 디스클레이머 */}
        <DisclaimerBanner />

        {RESULT_AD_GROUP_ID && (
          <AdBanner slotId="result" adGroupId={RESULT_AD_GROUP_ID} />
        )}

        {saveError && (
          <p
            role="alert"
            className="text-body"
            style={{ color: "var(--color-error)" }}
          >
            저장 실패: {saveError}
          </p>
        )}
        {isArchived ? (
          <>
            <button
              type="button"
              className="btn-primary result-save-cta"
              onClick={() => leaveArchive("/coin-select")}
            >
              새 측정 시작
            </button>
            <button
              type="button"
              className={`result-secondary${confirmDelete ? " result-delete-confirm" : ""}`}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 5000);
                  return;
                }
                if (archive) {
                  await removeHistory(archive.recordId);
                  leaveArchive("/home");
                }
              }}
            >
              {confirmDelete ? "정말 삭제할까요? (다시 탭)" : "이 기록 삭제"}
            </button>
            <button
              type="button"
              className="result-secondary"
              onClick={() => leaveArchive("/home")}
            >
              홈으로
            </button>
          </>
        ) : !saved ? (
          <>
            <button
              type="button"
              className="btn-primary result-save-cta"
              onClick={() => {
                void handleSave();
              }}
            >
              측정 저장
            </button>
            {/* "한 번 더 측정" — 같은 분쇄도 confirm 후 appendMode=true 로 /camera. */}
            <button
              type="button"
              className="result-retake-cta"
              onClick={() => setShowRetakeConfirm(true)}
            >
              ✨ 한 번 더 측정 (정확도 ↑)
            </button>
            <button
              type="button"
              className="result-secondary"
              onClick={() => leaveResult("/camera")}
            >
              다시 촬영 (새 측정)
            </button>
            <button
              type="button"
              className="result-secondary"
              onClick={() => setLocation("/home")}
            >
              홈으로 (저장 안 함)
            </button>
          </>
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
                    {" "}
                    · 오래된 기록 {cleanedCount}개를 정리했어요
                  </span>
                )}
              </p>
            )}
            <button
              type="button"
              className="result-secondary"
              onClick={() => leaveResult("/camera")}
            >
              다시 촬영
            </button>
            <button
              type="button"
              className="result-secondary"
              onClick={() => leaveResult("/home")}
            >
              홈으로
            </button>
          </>
        )}
      </main>

      <ConfirmModal
        open={showRetakeConfirm}
        title="같은 분쇄도인가요?"
        description="한 번 더 같은 분쇄도를 촬영하면 측정 정확도가 올라가요. 분쇄도가 다르면 결과가 부정확해져요."
        cancelLabel="취소"
        confirmLabel="네, 같은 분쇄도예요"
        onCancel={() => setShowRetakeConfirm(false)}
        onConfirm={() => {
          setAppendMode(true);
          setShowRetakeConfirm(false);
          setLocation("/camera");
        }}
      />
    </>
  );
}
