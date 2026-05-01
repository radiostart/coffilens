import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { loadOpenCV, OpenCVLoadError } from "../opencv/loader";
import { runPipeline, type PipelineStep } from "../opencv/pipeline";
import { userMessage } from "../opencv/errors";
import type { AnalysisError } from "../opencv/errors";
import { useMeasurementStore } from "../stores/measurement.store";
import "./analyzing.css";

type State =
  | { kind: "loading_opencv"; progress: number }
  | { kind: "analyzing"; step: PipelineStep; progress: number }
  | { kind: "error"; message: string };

const STEP_LABELS: Record<PipelineStep, string> = {
  downsample: "이미지 준비 중",
  preflight: "이미지 품질 확인 중",
  coin: "동전 검출 중",
  segment: "입자 분리 중",
  stats: "통계 산출 중",
  confidence: "신뢰도 계산 중",
};

function isAnalysisError(e: unknown): e is AnalysisError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { kind?: unknown }).kind === "string"
  );
}

export function AnalyzingRoute() {
  const frame = useMeasurementStore((s) => s.frame);
  const setResult = useMeasurementStore((s) => s.setResult);
  const setError = useMeasurementStore((s) => s.setError);
  const [, setLocation] = useLocation();
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({
    kind: "loading_opencv",
    progress: 0,
  });

  useEffect(() => {
    if (!frame) {
      // frame 없이 직접 진입 — 홈으로 복귀
      setLocation("/home");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        // OpenCV 로드 — 0~20%
        await loadOpenCV({
          onProgress: (l, t) => {
            if (ac.signal.aborted) return;
            setState({
              kind: "loading_opencv",
              progress: t > 0 ? l / t : 0,
            });
          },
          signal: ac.signal,
        });

        if (ac.signal.aborted) return;

        // 분석 파이프라인 — 진행률 0~100% 을 20~100% 구간으로 매핑
        const result = await runPipeline(frame, ac.signal, {
          onProgress: (step, percent) => {
            if (ac.signal.aborted) return;
            setState({ kind: "analyzing", step, progress: percent / 100 });
          },
        });

        setResult(result);
        setLocation("/result");
      } catch (e: unknown) {
        if (ac.signal.aborted) return;

        // OpenCVLoadError → AnalysisError 형식으로 변환
        const isLoadFail =
          e instanceof OpenCVLoadError ||
          (isAnalysisError(e) && e.kind === "opencv_load_fail");
        if (isLoadFail) {
          const cause =
            (e as { cause?: "network" | "cors" | "timeout" }).cause ??
            "network";
          setError({ kind: "opencv_load_fail", cause });
          setState({
            kind: "error",
            message: userMessage({ kind: "opencv_load_fail", cause }),
          });
          return;
        }

        if (isAnalysisError(e)) {
          setError(e);
          setState({ kind: "error", message: userMessage(e) || "분석 실패" });
          return;
        }

        // AbortError 등 — 홈 복귀
        const name = (e as { name?: string })?.name;
        if (name === "AbortError") {
          setLocation("/home");
          return;
        }

        setState({
          kind: "error",
          message: "예상치 못한 에러가 발생했어요.",
        });
      }
    })();

    return () => {
      ac.abort();
    };
  }, [frame, setError, setLocation, setResult]);

  function handleCancel() {
    abortRef.current?.abort();
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
            <ProgressBar value={state.progress} />
          </>
        )}

        {state.kind === "analyzing" && (
          <>
            <h1 className="text-h2">분석 중</h1>
            <p className="text-body-large analyzing-description">
              {STEP_LABELS[state.step]}
            </p>
            <ProgressBar value={state.progress} />
          </>
        )}

        {state.kind === "error" && (
          <>
            <h1 className="text-h2">분석 실패</h1>
            <p className="text-body-large analyzing-description">
              {state.message}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setLocation("/home")}
            >
              홈으로
            </button>
          </>
        )}

        {state.kind !== "error" && (
          <button
            type="button"
            className="analyzing-cancel"
            onClick={handleCancel}
          >
            취소하고 홈으로
          </button>
        )}
      </main>
    </>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(2, Math.min(100, value * 100));
  return (
    <>
      <div
        className="analyzing-progress"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="analyzing-progress-bar"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-caption numeric analyzing-progress-text">
        {Math.round(pct)}%
      </p>
    </>
  );
}
