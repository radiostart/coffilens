import { useEffect } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { EmptyStateCard } from "../components/empty-state-card";
import { useHistoryStore } from "../stores/history.store";
import "./home.css";

export function HomeRoute() {
  const meta = useHistoryStore((s) => s.meta);
  const loading = useHistoryStore((s) => s.loading);
  const load = useHistoryStore((s) => s.load);
  const [, setLocation] = useLocation();

  useEffect(() => {
    load();
  }, [load]);

  const isEmpty = !loading && meta.length === 0;

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
            <ul className="home-records" aria-label="측정 기록">
              {meta.map((record) => (
                <li key={record.id} className="home-record-item">
                  <span className="text-body numeric">
                    D50 {Math.round(record.d50)}μm
                  </span>
                  <span className="text-caption">
                    신뢰도 {Math.round(record.confidence)}/10 ·{" "}
                    {new Date(record.timestamp).toLocaleDateString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
