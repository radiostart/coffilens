/**
 * 분석 파이프라인 — F03~F06 통합.
 *
 * 흐름 (단계별 진행률 콜백):
 *  1. downsample (0%) — 1280px 긴변
 *  2. preflight (15%) — 밝기/블러 검증 → InputQualityResult 반환 (sweep Issue 14)
 *  3. coin (30%) — HoughCircles 검출
 *  4. segment (50%) — adaptive threshold + watershed
 *  5. stats (80%) — D10/D50/D90/Fines%/Uniformity + diameters[]
 *  6. confidence (95%) — 4신호 가중 평균
 *
 * AbortSignal: 단계 사이마다 throwIfAborted + tick() 으로 microtask 양보.
 *
 * 메모리: segmentParticles 의 contours/hierarchy 는 caller-managed →
 * try/finally 로 disposeSegmentation 강제.
 */

import { downsampleImage } from "../lib/image-downsample";
import { checkInputQuality, detectCoin } from "./coin-detect";
import type { CoinDetection } from "./coin-detect";
import type { CoinType } from "../stores/measurement.store";
import {
  segmentParticles,
  disposeSegmentation,
} from "./particle-segment";
import { computeStats, extractParticleMarkers } from "./statistics";
import type { ParticleStats, ParticleMarker } from "./statistics";
import { applyImageToSieveCalibration } from "./calibration";
import { computeConfidence } from "./confidence";
import type { ConfidenceResult } from "./confidence";
import type { AnalysisError } from "./errors";

export interface PipelineResult {
  stats: ParticleStats;
  coin: CoinDetection;
  confidence: ConfidenceResult;
  durationMs: number;
  /**
   * 분석에 사용된 (downsampled) canvas 의 크기 — 디버그 오버레이가 표시 사이즈에
   * 맞게 marker 좌표를 scale 할 때 필요. coin.centerX/Y/radiusPx 와 markers 의
   * cx/cy/rPx 는 모두 이 좌표계 기준.
   */
  imageWidth: number;
  imageHeight: number;
  /** 개발자 디버그 오버레이용 입자 마커 — 각 contour 의 centroid + 등가 반지름. */
  particles: ParticleMarker[];
}

export type PipelineStep =
  | "downsample"
  | "preflight"
  | "coin"
  | "segment"
  | "stats"
  | "confidence";

export interface PipelineCallbacks {
  onProgress?: (step: PipelineStep, percent: number) => void;
}

export async function runPipeline(
  source:
    | HTMLVideoElement
    | HTMLCanvasElement
    | HTMLImageElement
    | OffscreenCanvas,
  coinType: CoinType,
  signal: AbortSignal,
  callbacks: PipelineCallbacks = {},
  coinHint?: { x: number; y: number } | null,
): Promise<PipelineResult> {
  const start =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  function step<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    const t0 = performance.now();
    console.log(`[pipeline] ${label} start`);
    return Promise.resolve(fn()).then(
      (result) => {
        console.log(`[pipeline] ${label} done (${Math.round(performance.now() - t0)}ms)`);
        return result;
      },
      (err) => {
        console.warn(
          `[pipeline] ${label} FAILED (${Math.round(performance.now() - t0)}ms)`,
          err,
        );
        throw err;
      },
    );
  }

  // **progress UX 패턴**: onProgress(setState) 직후 tick() 으로 yield → React
  // 가 화면 업데이트할 시간 확보 → 실제 무거운 동기 작업 (detectCoin 등 WASM
  // call) 실행. 이 패턴 없이 setState 후 즉시 동기 호출하면 main thread 블록
  // 으로 progress bar 가 이전 단계에 멈춰 있는 것처럼 보임 (사용자 보고 2026-05-02).
  signal.throwIfAborted();
  callbacks.onProgress?.("downsample", 0);
  await tick();
  const canvas = await step("downsample", () => downsampleImage(source));
  console.log(`[pipeline] downsampled canvas: ${canvas.width}×${canvas.height}`);

  signal.throwIfAborted();
  callbacks.onProgress?.("preflight", 15);
  await tick();
  const inputQuality = await step("preflight", () => checkInputQuality(canvas));

  signal.throwIfAborted();
  callbacks.onProgress?.("coin", 30);
  await tick();
  const coin = await step("coin", () => detectCoin(canvas, coinType, coinHint));

  signal.throwIfAborted();
  callbacks.onProgress?.("segment", 50);
  await tick();
  const segmentation = await step("segment", () =>
    segmentParticles(canvas, coin),
  );

  try {
    // sweep Issue 17: segmentParticles 반환 직후 abort 재확인 (watershed 후)
    signal.throwIfAborted();
    callbacks.onProgress?.("stats", 80);
    await tick();

    let stats: ParticleStats;
    try {
      // 1) computeStats — pure image-space 측정 (raw 등가 원형 직경)
      const rawStats = computeStats(segmentation.contours, coin.mmPerPixel);
      // 2) image → sieve calibration (D-value/diameters[] 만 변환).
      //    brewing-guide.ts 가 sieve 표준 임계값을 그대로 사용할 수 있도록
      //    layer 분리. anchor: Setting 11 V60 pour-over (ratio 1.7, 2026-05-02
      //    후속 수정 — 브라우저 measurement 기반). 상세는 calibration.ts doc.
      stats = applyImageToSieveCalibration(rawStats);
    } catch {
      // computeStats 의 빈 배열 throw → no_particles 로 변환
      throw { kind: "no_particles" } satisfies AnalysisError;
    }

    // 3) 디버그 마커 — debug overlay 전용. 실패해도 본 측정 결과 영향 없음.
    //    별도 try 로 분리해 moments 등 옵션 cv 함수 부재 시 no_particles 오인 방지.
    let particles: ParticleMarker[] = [];
    try {
      particles = extractParticleMarkers(
        segmentation.contours,
        coin.mmPerPixel,
      );
    } catch (e) {
      console.warn("[pipeline] extractParticleMarkers failed (non-fatal)", e);
    }

    signal.throwIfAborted();
    callbacks.onProgress?.("confidence", 95);
    await tick();
    const confidence = computeConfidence({
      coinConfidence: coin.confidence,
      particleCount: stats.particleCount,
      // sweep Issue 14: placeholder 값이 아닌 실제 측정값
      meanBrightness: inputQuality.meanBrightness,
      laplacianVariance: inputQuality.laplacianVariance,
    });

    callbacks.onProgress?.("confidence", 100);
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    return {
      stats,
      coin,
      confidence,
      durationMs: now - start,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      particles,
    };
  } finally {
    disposeSegmentation(segmentation);
  }
}

/**
 * 단계 사이 양보 — abort 응답성 + UI paint 시간 확보.
 *
 * **2026-05-02 변경**: setTimeout 0 → 80ms.
 *
 * OpenCV 가 캐시된 상태에서는 단계 자체 (downsample/preflight/coin/segment/
 * stats/confidence) 가 합쳐 ~수백 ms 안에 완료. setTimeout 0 (microtask 양보) 만으로는
 * React render → DOM paint 사이 frame 사이클이 user 에게 보이지 않아 progress
 * bar 가 단계별로 변하지 않고 결과 화면으로 점프하는 것처럼 보임.
 *
 * 80ms × 6단계 ≈ 480ms 추가 → 사용자가 단계별 진행 인지 가능. cache 안 된
 * 상태에서는 전체 분석 시간 (~수 초) 대비 비중 작아 영향 미미.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}
