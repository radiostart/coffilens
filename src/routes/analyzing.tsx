import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { NavBar } from "../components/nav-bar";
import { OpenCVLoadError } from "../opencv/loader";
import { downsampleImage } from "../lib/image-downsample";
import {
  runAnalysisInWorker,
  type AnalysisHandle,
} from "../lib/analysis-worker-client";
import type { PipelineStep } from "../opencv/pipeline";
import type { AnalysisError } from "../opencv/errors";
import { useMeasurementStore } from "../stores/measurement.store";
import { combineStats } from "../opencv/statistics";
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
  // Worker handle ref — handleCancel 즉시 worker.terminate() 가능.
  const workerHandleRef = useRef<AnalysisHandle | null>(null);
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
        // **Worker 사용** (2026-05-02): OpenCV 가 main thread 를 블록해서
        // "취소" 버튼이 즉시 안 동작하던 문제 해결. worker.terminate() 으로
        // HoughCircles 도중에도 즉시 cancel 가능.
        //
        // Main thread 작업: 카메라 frame → 1280×960 다운샘플 → ImageData 추출
        // → worker 에 transfer (zero-copy).
        if (ac.signal.aborted) return;
        setState({ kind: "analyzing", step: "downsample", progress: 0.05 });

        const downsampled = downsampleImage(frame);
        const dctx = downsampled.getContext("2d");
        if (!dctx) throw new Error("downsample canvas: 2d context null");
        const imageData = dctx.getImageData(
          0,
          0,
          downsampled.width,
          downsampled.height,
        );

        if (ac.signal.aborted) return;

        const handle = runAnalysisInWorker(imageData, coinType, coinHint, {
          onProgress: (step, percent) => {
            if (ac.signal.aborted) return;
            setState({ kind: "analyzing", step, progress: percent / 100 });
          },
        });
        workerHandleRef.current = handle;

        const result = await handle.promise;
        workerHandleRef.current = null;

        if (ac.signal.aborted) return;

        // Multi-shot averaging integration:
        //  - appendMode=true  → 이전 shot 들과 합쳐 combined stats 로 표시.
        //  - appendMode=false → 새 측정 사이클. 누적 비우고 단일 shot 으로 시작.
        // PipelineResult 의 coin/confidence/durationMs 는 가장 최근 shot 의 값.
        // store 를 effect dep 으로 두지 않고 getState() 로 직접 읽는다 — 자기
        // mutate (pushShotStats/setAppendMode) 가 effect 재진입을 일으키지 않게.
        const store = useMeasurementStore.getState();
        if (store.appendMode) {
          const combinedStats = combineStats([
            ...store.accumulatedStats,
            result.stats,
          ]);
          store.pushShotStats(result.stats);
          setResult({
            stats: combinedStats,
            coin: result.coin,
            confidence: result.confidence,
            durationMs: result.durationMs,
          });
          // append mode 1회 분석 후 자동 false — user trust 보호 (의도치 않은
          // 자동 누적 방지). 다음 누적은 명시적 confirm 필요.
          store.setAppendMode(false);
        } else {
          // 새 측정 사이클 — 이전 누적 비우고 단일 shot 으로 시작.
          store.resetAccumulated();
          store.pushShotStats(result.stats);
          setResult(result);
        }
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
      // Cleanup: worker 가 진행 중이면 즉시 종료.
      workerHandleRef.current?.terminate();
      workerHandleRef.current = null;
    };
  }, [frame, coinType, coinHint, setError, setLocation, setResult]);

  function handleCancel() {
    abortRef.current?.abort();
    // Worker 즉시 종료 — HoughCircles 도중이라도 main thread 즉시 자유.
    workerHandleRef.current?.terminate();
    workerHandleRef.current = null;
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
