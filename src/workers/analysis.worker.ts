/// <reference lib="webworker" />

/**
 * 분석 파이프라인 Web Worker.
 *
 * **이 worker 가 존재하는 이유**: OpenCV.js HoughCircles 가 monolithic
 * synchronous WASM call (수백ms~30s+). main thread 에서 실행 시 사용자가
 * "취소하고 홈으로" 클릭해도 main thread 가 풀릴 때까지 click 이벤트가 처리
 * 안 됨 → 즉시 cancel 불가능. worker 에서 실행하면 main thread 는 자유로이
 * UI 업데이트하고, cancel 시 `worker.terminate()` 로 즉시 종료 가능.
 *
 * **프로토콜**:
 *   in:  { type: "analyze", imageData, coinType, coinHint }
 *   out: { type: "progress", step, percent }
 *        { type: "result", data: PipelineResult }
 *        { type: "error", error: { kind, ...details } }
 *
 * **수명주기**: AnalyzingRoute 마운트 시 worker 생성, 분석 완료/취소 시 terminate.
 * 다음 분석은 새 worker (단순화 위해 재사용 X — terminate 가 빠름).
 *
 * **OpenCV 로드**: importScripts("/opencv.js"). 메인 스레드와 별개 인스턴스
 * (heap 분리). 첫 분석 시 ~5-10s 추가 소요 가능 (cache 없으면 +8MB 다운로드).
 */

import { runPipeline } from "../opencv/pipeline";
import type { PipelineStep } from "../opencv/pipeline";
import type { CoinType } from "../stores/measurement.store";
import type { AnalysisError } from "../opencv/errors";

interface AnalyzeMessage {
  type: "analyze";
  imageData: ImageData;
  coinType: CoinType;
  coinHint?: { x: number; y: number } | null;
}

declare const self: DedicatedWorkerGlobalScope & {
  cv?: { Mat?: unknown; onRuntimeInitialized?: () => void } & Record<
    string,
    unknown
  >;
};

let cvReady: Promise<void> | null = null;

function ensureCvLoaded(): Promise<void> {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    try {
      // Worker 에선 importScripts 로 동기 스크립트 로드. opencv.js 는
      // self.Module 환경 변수를 통해 자동 초기화.
      self.importScripts("/opencv.js");
      const start = Date.now();
      const TIMEOUT_MS = 30_000;
      const tryReady = () => {
        const cv = self.cv;
        if (cv && typeof cv.Mat === "function") {
          resolve();
          return;
        }
        if (Date.now() - start > TIMEOUT_MS) {
          reject(new Error("worker opencv runtime timeout"));
          return;
        }
        setTimeout(tryReady, 50);
      };
      // onRuntimeInitialized 콜백 + polling 동시 사용
      if (self.cv) {
        const prev = self.cv.onRuntimeInitialized;
        self.cv.onRuntimeInitialized = () => {
          if (typeof prev === "function") prev();
          tryReady();
        };
      }
      tryReady();
    } catch (e) {
      reject(e);
    }
  });
  return cvReady;
}

self.onmessage = async (e: MessageEvent<AnalyzeMessage>) => {
  if (e.data.type !== "analyze") return;
  const { imageData, coinType, coinHint } = e.data;

  try {
    await ensureCvLoaded();

    // ImageData → OffscreenCanvas (cv.imread 가 받아 처리)
    const offscreen = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("worker: 2d context unavailable on OffscreenCanvas");
    ctx.putImageData(imageData, 0, 0);

    // worker 안에서는 abort signal 의미 X — main thread 가 worker.terminate()
    // 로 강제 종료하므로 dummy AbortController 사용.
    const ac = new AbortController();
    const result = await runPipeline(
      offscreen,
      coinType,
      ac.signal,
      {
        onProgress: (step: PipelineStep, percent: number) => {
          self.postMessage({ type: "progress", step, percent });
        },
      },
      coinHint ?? null,
    );

    // PipelineResult 는 plain JSON serializable. coin/stats/confidence 모두
    // primitive + array. 직접 postMessage 가능.
    self.postMessage({ type: "result", data: result });
  } catch (err: unknown) {
    // AnalysisError ({ kind: ... }) 또는 일반 Error.
    if (
      err &&
      typeof err === "object" &&
      "kind" in err &&
      typeof (err as { kind: unknown }).kind === "string"
    ) {
      self.postMessage({ type: "error", error: err as AnalysisError });
    } else {
      self.postMessage({
        type: "error",
        error: {
          kind: "memory_oom",
          phase: "pipeline",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
};
