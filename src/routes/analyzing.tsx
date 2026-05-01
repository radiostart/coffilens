import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { loadOpenCV, OpenCVLoadError } from "../opencv/loader";
import { userMessage } from "../opencv/errors";
import "./analyzing.css";

type State =
  | { kind: "loading_opencv"; progress: number }
  | { kind: "running" }
  | { kind: "error"; message: string };

/**
 * /analyzing — F03 단계는 OpenCV 다운로드 진행률만 표시.
 * 실제 분석 파이프라인 호출은 F06 에서 구현.
 */
export function AnalyzingRoute() {
  const [state, setState] = useState<State>({
    kind: "loading_opencv",
    progress: 0,
  });
  const [, setLocation] = useLocation();

  useEffect(() => {
    const ac = new AbortController();

    loadOpenCV({
      onProgress: (loaded, total) => {
        if (ac.signal.aborted) return;
        setState({
          kind: "loading_opencv",
          progress: total > 0 ? loaded / total : 0,
        });
      },
      signal: ac.signal,
    })
      .then(() => {
        if (ac.signal.aborted) return;
        // F06 에서 실제 분석 호출로 교체 — 지금은 placeholder
        setState({ kind: "running" });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        // instanceof + duck-type 둘 다 — Vite HMR 모듈 reload 시 instanceof 깨질 수 있음
        const isLoadFail =
          e instanceof OpenCVLoadError ||
          (typeof e === "object" &&
            e !== null &&
            (e as { kind?: unknown }).kind === "opencv_load_fail");
        if (isLoadFail) {
          const cause =
            (e as { cause?: "network" | "cors" | "timeout" }).cause ?? "network";
          setState({
            kind: "error",
            message: userMessage({ kind: "opencv_load_fail", cause }),
          });
        } else {
          setState({
            kind: "error",
            message: "예상치 못한 에러가 발생했어요.",
          });
        }
      });

    return () => {
      ac.abort();
    };
  }, []);

  function handleCancel() {
    setLocation("/home");
  }

  return (
    <>
      <NavBar title="분석 중" />
      <main className="analyzing" aria-label="분석 진행 중" aria-live="polite">
        {state.kind === "loading_opencv" && (
          <>
            <h1 className="text-h2">OpenCV 다운로드 중</h1>
            <p className="text-body-large analyzing-description">
              첫 측정 시 8MB OpenCV.js 를 받아요. 한 번만 받으면 다음부턴 캐시
              사용.
            </p>
            <div
              className="analyzing-progress"
              role="progressbar"
              aria-valuenow={Math.round(state.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="analyzing-progress-bar"
                style={{ width: `${Math.max(2, state.progress * 100)}%` }}
              />
            </div>
            <p className="text-caption numeric analyzing-progress-text">
              {Math.round(state.progress * 100)}%
            </p>
          </>
        )}

        {state.kind === "running" && (
          <>
            <h1 className="text-h2">분석 중</h1>
            <p className="text-body-large analyzing-description">
              F06 에서 실제 파이프라인 호출 — 현재는 placeholder.
            </p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <h1 className="text-h2">로드 실패</h1>
            <p className="text-body-large analyzing-description">
              {state.message}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.location.reload()}
            >
              재시도
            </button>
          </>
        )}

        <button
          type="button"
          className="analyzing-cancel"
          onClick={handleCancel}
        >
          취소하고 홈으로
        </button>
      </main>
    </>
  );
}
