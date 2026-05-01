import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { EmptyStateCard } from "../components/empty-state-card";
import { useHistoryStore } from "../stores/history.store";
import "./home.css";

export function HomeRoute() {
  const meta = useHistoryStore((s) => s.meta);
  const isEmpty = meta.length === 0;
  const [, setLocation] = useLocation();

  return (
    <>
      <NavBar title="커피렌즈" />
      <main className="home" aria-label="홈">
        {isEmpty ? (
          <EmptyStateCard
            title="첫 측정을 시작해보세요"
            description="분쇄한 원두와 동전을 같이 촬영하면 분쇄도를 측정해드려요"
            cta={{ label: "분쇄도 측정하기", to: "/tool-select" }}
            caption="아직 측정 기록이 없어요"
          />
        ) : (
          <>
            <button
              type="button"
              className="btn-primary home-cta"
              onClick={() => setLocation("/tool-select")}
            >
              분쇄도 측정하기
            </button>
            <ul className="home-records" aria-label="측정 기록">
              {meta.map((record) => (
                <li key={record.id} className="home-record-item">
                  <span className="text-h4">{record.toolId.toUpperCase()}</span>
                  <span className="text-body numeric">
                    D50 {Math.round(record.d50)}μm
                  </span>
                  <span className="text-caption">
                    신뢰도 {record.confidence.toFixed(1)}/10
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption home-list-note">
              F08 에서 가상 스크롤 + thumbnail 추가 예정
            </p>
          </>
        )}
      </main>
    </>
  );
}
