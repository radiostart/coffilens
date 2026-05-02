import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { loadOpenCV, OpenCVLoadError } from "../opencv/loader";
import { runPipeline, type PipelineStep } from "../opencv/pipeline";
import type { AnalysisError } from "../opencv/errors";
import { useMeasurementStore } from "../stores/measurement.store";
import { getTelemetryClient } from "../telemetry/client";
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
  const coinType = useMeasurementStore((s) => s.coinType);
  const coinHint = useMeasurementStore((s) => s.coinHint);
  const setResult = useMeasurementStore((s) => s.setResult);
  const setError = useMeasurementStore((s) => s.setError);
  const [, setLocation] = useLocation();
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({
    kind: "loading_opencv",
    progress: 0,
  });

  useEffect(() => {
    console.log("[analyzing] mount", {
      hasFrame: !!frame,
      frameW: frame?.width,
      frameH: frame?.height,
      coinType,
    });
    if (!frame || !coinType) {
      console.warn("[analyzing] missing frame or coinType — redirect to /home", {
        hasFrame: !!frame,
        coinType,
      });
      setLocation("/home");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    const startedAt = performance.now();

    (async () => {
      const tel = await getTelemetryClient();
      try {
        // OpenCV 로드 — 0~20%
        // signal 을 넘기지 않음: 로드는 idempotent + fast (10MB 로컬). React StrictMode 의
        // cleanup 으로 인한 abort 가 캐시된 promise 를 poison 시켜 mount-2 가 무한 retry 하는
        // race 회피. 사용자 cancel 은 ac.signal.aborted 체크로 대신 처리.
        await loadOpenCV({
          onProgress: (l, t) => {
            if (ac.signal.aborted) return;
            setState({
              kind: "loading_opencv",
              progress: t > 0 ? l / t : 0,
            });
          },
        });

        if (ac.signal.aborted) return;

        // 분석 파이프라인 — 진행률 0~100% 을 20~100% 구간으로 매핑
        // coinHint (사용자가 /coin-locate 에서 탭한 위치) 가 있으면 detectCoin 이
        // hint 가장 가까운 candidate 채택 + multi_coin 검사 우회.
        const result = await runPipeline(
          frame,
          coinType,
          ac.signal,
          {
            onProgress: (step, percent) => {
              if (ac.signal.aborted) return;
              setState({ kind: "analyzing", step, progress: percent / 100 });
            },
          },
          coinHint,
        );

        setResult(result);
        tel.track({
          type: "measurement_success",
          durationMs: Math.round(result.durationMs),
          confidence: result.confidence.score,
          coinType: result.coin.coinType,
        });
        setLocation("/result");
      } catch (e: unknown) {
        console.warn("[analyzing] caught error", {
          aborted: ac.signal.aborted,
          name: (e as { name?: string })?.name,
          message: (e as { message?: string })?.message,
          kind: (e as { kind?: string })?.kind,
          error: e,
        });
        if (ac.signal.aborted) {
          console.log("[analyzing] abort silent return (signal aborted)");
          return;
        }

        // OpenCVLoadError → AnalysisError 형식으로 변환 후 /result 로 이동.
        // 결과 화면이 errorDetails 로 풍부한 진단 UI 표시.
        const isLoadFail =
          e instanceof OpenCVLoadError ||
          (isAnalysisError(e) && e.kind === "opencv_load_fail");
        if (isLoadFail) {
          console.log("[analyzing] branch: opencv_load_fail");
          const cause =
            (e as { cause?: "network" | "cors" | "timeout" }).cause ??
            "network";
          setError({ kind: "opencv_load_fail", cause });
          tel.track({ type: "opencv_load_fail", cause });
          setLocation("/result");
          return;
        }

        if (isAnalysisError(e)) {
          console.log("[analyzing] branch: AnalysisError", e);
          setError(e);
          tel.track({
            type: "measurement_fail",
            failReason: e.kind,
            durationMs: Math.round(performance.now() - startedAt),
          });
          setLocation("/result");
          return;
        }

        // AbortError silent return — 자기 signal abort 는 위에서 이미 처리됨.
        // loader 에 signal 을 넘기지 않으므로 foreign AbortError 가 더 이상 발생 X.
        const name = (e as { name?: string })?.name;
        if (name === "AbortError") {
          console.log("[analyzing] AbortError silent return");
          return;
        }

        // unknown error — store 에 fallback AnalysisError 저장 + /result 로
        console.warn("[analyzing] branch: unknown error → /result", e);
        setError({ kind: "memory_oom", phase: "pipeline" });
        tel.track({
          type: "measurement_fail",
          failReason: "unknown",
          durationMs: Math.round(performance.now() - startedAt),
        });
        setLocation("/result");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [frame, coinType, coinHint, setError, setLocation, setResult]);

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
            {/*
             * coin 단계는 HoughCircles 가 monolithic WASM 호출 (수백ms~수초) 라
             * 중간 progress 보고 불가 → indeterminate (실제 진행률 표시 못 하므로
             * 정직한 슬라이딩 바). 다른 단계는 빠르거나 progress 보고됨.
             */}
            <ProgressBar
              value={state.progress}
              indeterminate={state.step === "coin"}
            />
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

function ProgressBar({
  value,
  indeterminate = false,
}: {
  value: number;
  indeterminate?: boolean;
}) {
  const pct = Math.max(2, Math.min(100, value * 100));

  // Indeterminate: 실제 progress 알 수 없는 단계 (HoughCircles 등 monolithic
  // WASM 호출). 슬라이딩 애니메이션으로 "작업 중" 표현. % 라벨 대신 dots.
  if (indeterminate) {
    return (
      <>
        <div
          className="analyzing-progress"
          role="progressbar"
          aria-busy="true"
          aria-valuetext="처리 중 (시간 예측 불가)"
        >
          <div className="analyzing-progress-bar analyzing-progress-bar-indeterminate" />
        </div>
        <p className="text-caption analyzing-progress-text">잠시만 기다려주세요</p>
      </>
    );
  }

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
