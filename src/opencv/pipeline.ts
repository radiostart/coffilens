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
import {
  segmentParticles,
  disposeSegmentation,
} from "./particle-segment";
import { computeStats } from "./statistics";
import type { ParticleStats } from "./statistics";
import { computeConfidence } from "./confidence";
import type { ConfidenceResult } from "./confidence";
import type { AnalysisError } from "./errors";

export interface PipelineResult {
  stats: ParticleStats;
  coin: CoinDetection;
  confidence: ConfidenceResult;
  durationMs: number;
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
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  signal: AbortSignal,
  callbacks: PipelineCallbacks = {},
): Promise<PipelineResult> {
  const start =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  signal.throwIfAborted();
  callbacks.onProgress?.("downsample", 0);
  const canvas = downsampleImage(source);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.("preflight", 15);
  const inputQuality = await checkInputQuality(canvas);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.("coin", 30);
  const coin = await detectCoin(canvas);
  await tick();

  signal.throwIfAborted();
  callbacks.onProgress?.("segment", 50);
  const segmentation = await segmentParticles(canvas, coin);

  try {
    // sweep Issue 17: segmentParticles 반환 직후 abort 재확인 (watershed 후)
    signal.throwIfAborted();
    callbacks.onProgress?.("stats", 80);

    let stats: ParticleStats;
    try {
      stats = computeStats(segmentation.contours, coin.mmPerPixel);
    } catch {
      // computeStats 의 빈 배열 throw → no_particles 로 변환
      throw { kind: "no_particles" } satisfies AnalysisError;
    }

    signal.throwIfAborted();
    callbacks.onProgress?.("confidence", 95);
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
    return { stats, coin, confidence, durationMs: now - start };
  } finally {
    disposeSegmentation(segmentation);
  }
}

/** microtask 양보 — abort 응답성 + UI 끊김 방지 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
