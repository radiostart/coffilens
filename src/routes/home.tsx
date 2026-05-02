import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { EmptyStateCard } from "../components/empty-state-card";
import { useHistoryStore } from "../stores/history.store";
import { useMeasurementStore } from "../stores/measurement.store";
import { getRecord, recordToPipelineResult } from "../storage/records";
import { _internal as brewingInternal } from "../lib/brewing-guide";
import "./home.css";

const { classifyD50 } = brewingInternal;

const GRIND_LABELS: Record<"fine" | "medium" | "coarse", string> = {
  fine: "미세",
  medium: "중간",
  coarse: "거침",
};

export function HomeRoute() {
  const meta = useHistoryStore((s) => s.meta);
  const loading = useHistoryStore((s) => s.loading);
  const load = useHistoryStore((s) => s.load);
  const remove = useHistoryStore((s) => s.remove);
  const setResult = useMeasurementStore((s) => s.setResult);
  const setArchivedRecordId = useMeasurementStore((s) => s.setArchivedRecordId);
  const setFrame = useMeasurementStore((s) => s.setFrame);
  const [, setLocation] = useLocation();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty = !loading && meta.length === 0;

  async function handleOpen(id: string) {
    const record = await getRecord(id);
    if (!record) return;
    // 측정 store 에 archive view 로 주입 — result.tsx 가 그대로 표시.
    setFrame(null);
    setResult(recordToPipelineResult(record));
    setArchivedRecordId(id);
    setLocation("/result");
  }

  async function handleDelete(id: string) {
    if (pendingDelete !== id) {
      // 1차 탭: 삭제 모드 진입 (확인 단계)
      setPendingDelete(id);
      // 5초 후 자동 취소
      setTimeout(() => {
        setPendingDelete((cur) => (cur === id ? null : cur));
      }, 5000);
      return;
    }
    // 2차 탭: 실제 삭제
    await remove(id);
    setPendingDelete(null);
  }

  return (
    <>
      <NavBar title="커피렌즈" />
      <main className="home" aria-label="홈">
        {loading && <p className="text-caption home-list-note">로드 중...</p>}

        {isEmpty && (
          <EmptyStateCard
            title="첫 측정을 시작해보세요"
            description="분쇄한 원두와 동전을 같이 촬영하면 분쇄도를 측정해드려요"
            cta={{ label: "분쇄도 측정하기", to: "/coin-select" }}
            caption="아직 측정 기록이 없어요"
          />
        )}

        {!isEmpty && !loading && (
          <>
            <button
              type="button"
              className="btn-primary home-cta"
              onClick={() => setLocation("/coin-select")}
            >
              분쇄도 측정하기
            </button>
            <h2 className="text-h4 home-records-title">측정 기록</h2>
            <ul className="home-records" aria-label="측정 기록">
              {meta.map((record) => {
                const grindClass = classifyD50(record.d50);
                const grindLabel = GRIND_LABELS[grindClass];
                const isPending = pendingDelete === record.id;
                return (
                  <li key={record.id} className="home-record-item">
                    <button
                      type="button"
                      className="home-record-card"
                      onClick={() => {
                        void handleOpen(record.id);
                      }}
                      aria-label={`측정 기록 보기: 분쇄도 ${Math.round(record.d50)}μm`}
                    >
                      <div className="home-record-row">
                        <span className="text-body numeric home-record-d50">
                          분쇄도 {Math.round(record.d50)}μm
                        </span>
                        <span
                          className={`home-record-tag home-record-tag-${grindClass}`}
                        >
                          {grindLabel}
                        </span>
                      </div>
                      <div className="home-record-row home-record-meta">
                        <span className="text-caption">
                          작은쪽 {Math.round(record.d10)} · 큰쪽{" "}
                          {Math.round(record.d90)}μm
                        </span>
                        <span className="text-caption">
                          균일도 {record.uniformity.toFixed(1)}
                        </span>
                      </div>
                      <div className="home-record-row home-record-meta">
                        <span className="text-caption">
                          신뢰도 {Math.round(record.confidence)}/10
                        </span>
                        <span className="text-caption">
                          {new Date(record.timestamp).toLocaleDateString(
                            "ko-KR",
                          )}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`home-record-delete${isPending ? " home-record-delete-pending" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(record.id);
                      }}
                      aria-label={
                        isPending ? "삭제 확인 (다시 탭)" : "측정 기록 삭제"
                      }
                    >
                      {isPending ? "삭제?" : "✕"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
