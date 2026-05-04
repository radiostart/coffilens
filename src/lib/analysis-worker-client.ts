/**
 * 분석 worker 클라이언트.
 *
 * Worker 라이프사이클 + 메시지 라우팅 + cancel 처리.
 * `worker.terminate()` 으로 즉시 cancel 가능 (main thread 응답성 보장).
 */

import type { PipelineResult, PipelineStep } from "../opencv/pipeline";
import type { CoinType, CoinHint } from "../stores/measurement.store";
import type { AnalysisError } from "../opencv/errors";

interface RunOptions {
  onProgress?: (step: PipelineStep, percent: number) => void;
}

export interface AnalysisHandle {
  /** 분석 결과 promise — terminate() 호출 시 abort 처리됨 */
  promise: Promise<PipelineResult>;
  /** 즉시 worker 종료 (HoughCircles 도중에도 즉시 cancel) */
  terminate: () => void;
}

export function runAnalysisInWorker(
  imageData: ImageData,
  coinType: CoinType,
  coinHint: CoinHint | null,
  opts: RunOptions = {},
): AnalysisHandle {
  // Vite 의 ?worker import — 빌드 타임에 worker 번들로 분리.
  // **Module worker** (type:"module") — TypeScript ESM import 처리 가능.
  // OpenCV.js (UMD) 는 worker 안에서 fetch + Function eval 로 로드.
  const worker = new Worker(
    new URL("../workers/analysis.worker.ts", import.meta.url),
    { type: "module" },
  );

  let terminated = false;
  const promise = new Promise<PipelineResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "progress") {
        opts.onProgress?.(msg.step as PipelineStep, msg.percent as number);
      } else if (msg.type === "result") {
        resolve(msg.data as PipelineResult);
        worker.terminate();
      } else if (msg.type === "error") {
        reject(msg.error as AnalysisError);
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      console.error("[worker] uncaught error", e.message ?? e);
      reject({
        kind: "memory_oom",
        phase: "pipeline",
      } satisfies AnalysisError);
      worker.terminate();
    };

    // ImageData.data 는 Transferable — 0 copy 로 worker 이전.
    worker.postMessage(
      { type: "analyze", imageData, coinType, coinHint },
      [imageData.data.buffer],
    );
  });

  return {
    promise,
    terminate: () => {
      if (terminated) return;
      terminated = true;
      worker.terminate();
    },
  };
}
