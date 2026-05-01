import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";

/**
 * F03 에서 채울 카메라 화면 placeholder.
 *
 * 현재는 단순 navigate stub — 실제 getUserMedia + canvas 캡처는 F03 작업 시.
 */
export function CameraRoute() {
  const [, setLocation] = useLocation();

  return (
    <>
      <NavBar title="촬영" />
      <main
        aria-label="카메라"
        style={{
          padding: "var(--space-lg) var(--space-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-md)",
        }}
      >
        <h1 className="text-h2">카메라 화면 (F03)</h1>
        <p className="text-body-large">F03 에서 카메라 + 캡처 동작 구현.</p>
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
