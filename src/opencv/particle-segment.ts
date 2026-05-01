/**
 * 입자 영역 분할 — adaptive threshold + watershed.
 *
 * 파이프라인 3~4단계 (plain.md Section 6).
 *
 * 흐름:
 *  1. 동전 영역 + 5mm 마진 마스킹 (경계 입자 왜곡 방지)
 *  2. Adaptive threshold (gaussian, blockSize=51, C=10) → binary
 *  3. Morphological opening (3x3 커널) → 노이즈 제거
 *  4. Distance transform → 시드 추출 (정규화 후 0.5 임계)
 *  5. Watershed → 입자 분리 (oversegment 위험)
 *  6. findContours → 입자별 contour 추출
 *  7. Sanity check: 면적 비율 < 0.5% (분쇄 안 됨) 또는 단일 입자 > 50% (덩어리)
 *
 * 반환: contours / hierarchy 는 caller-managed lifecycle.
 *  → 호출자(F06 pipeline) 가 finally 에서 disposeSegmentation() 호출 강제.
 *
 * OOM: cv 의 std::bad_alloc / "memory access" 메시지 패턴 catch → memory_oom throw.
 */

import { withMatScope, type Disposable } from "./mat-pool";
import type { CoinDetection } from "./coin-detect";
import type { AnalysisError } from "./errors";

declare const cv: {
  imread: (canvas: HTMLCanvasElement) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  adaptiveThreshold: (
    src: CvMat,
    dst: CvMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number,
  ) => void;
  bitwise_and: (a: CvMat, b: CvMat, dst: CvMat, mask: CvMat) => void;
  morphologyEx: (src: CvMat, dst: CvMat, op: number, kernel: CvMat) => void;
  distanceTransform: (
    src: CvMat,
    dst: CvMat,
    distanceType: number,
    maskSize: number,
  ) => void;
  normalize: (
    src: CvMat,
    dst: CvMat,
    alpha: number,
    beta: number,
    normType: number,
  ) => void;
  threshold: (
    src: CvMat,
    dst: CvMat,
    thresh: number,
    maxval: number,
    type: number,
  ) => void;
  connectedComponents: (image: CvMat, labels: CvMat) => number;
  watershed: (image: CvMat, markers: CvMat) => void;
  findContours: (
    image: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ) => void;
  contourArea: (contour: CvMat) => number;
  compare: (a: CvMat, b: CvMat, dst: CvMat, cmpop: number) => void;
  circle: (
    img: CvMat,
    center: CvPoint,
    radius: number,
    color: CvScalar,
    thickness: number,
  ) => void;
  Mat: CvMatStatic;
  MatVector: new (...args: unknown[]) => CvMatVector;
  Point: new (x: number, y: number) => CvPoint;
  Scalar: new (...values: number[]) => CvScalar;
  COLOR_RGBA2GRAY: number;
  COLOR_RGBA2RGB: number;
  CV_8U: number;
  CV_32S: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY_INV: number;
  THRESH_BINARY: number;
  MORPH_OPEN: number;
  DIST_L2: number;
  NORM_MINMAX: number;
  CMP_GT: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
};

interface CvMatStatic {
  new (...args: unknown[]): CvMat;
  ones: (rows: number, cols: number, type: number) => CvMat;
}

interface CvMat extends Disposable {
  rows: number;
  cols: number;
  type: () => number;
  convertTo: (dst: CvMat, rtype: number, alpha?: number) => void;
}

interface CvMatVector extends Disposable {
  size: () => number;
  get: (index: number) => CvMat;
}

interface CvPoint {
  x: number;
  y: number;
}

type CvScalar = number[];

const MASK_MARGIN_MM = 5;
const ADAPT_BLOCK_SIZE = 51;
const ADAPT_C = 10;
const MORPH_KERNEL_SIZE = 3;

const SANITY_MIN_AREA_RATIO = 0.005;
const SANITY_MAX_SINGLE_RATIO = 0.5;

export interface ParticleSegmentation {
  contours: CvMatVector;
  hierarchy: CvMat;
  /** 디버그용 — caller 가 직접 dispose 하지 않음 (scope 가 정리) */
  totalArea: number;
}

/**
 * 입자 영역 분할.
 *
 * @returns ParticleSegmentation { contours, hierarchy, totalArea }
 *  - contours / hierarchy 는 caller-managed → 반드시 disposeSegmentation() 호출.
 */
export async function segmentParticles(
  canvas: HTMLCanvasElement,
  coin: CoinDetection,
): Promise<ParticleSegmentation> {
  return withMatScope(async (scope) => {
    let escaping: { contours?: CvMatVector; hierarchy?: CvMat } = {};
    try {
      const src = scope.track(cv.imread(canvas));
      const gray = scope.track(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 1. 동전 마스킹 (반지름 + 5mm 마진)
      const marginPx = MASK_MARGIN_MM / coin.mmPerPixel;
      const maskRadius = Math.round(coin.radiusPx + marginPx);
      const coinMask = scope.track(
        cv.Mat.ones(gray.rows, gray.cols, cv.CV_8U),
      );
      cv.circle(
        coinMask,
        new cv.Point(coin.centerX, coin.centerY),
        maskRadius,
        new cv.Scalar(0),
        -1,
      );

      // 2. Adaptive threshold
      const binary = scope.track(new cv.Mat());
      cv.adaptiveThreshold(
        gray,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        ADAPT_BLOCK_SIZE,
        ADAPT_C,
      );

      // 동전 영역 mask out
      const masked = scope.track(new cv.Mat());
      cv.bitwise_and(binary, binary, masked, coinMask);

      // 3. Morphological opening
      const kernel = scope.track(
        cv.Mat.ones(MORPH_KERNEL_SIZE, MORPH_KERNEL_SIZE, cv.CV_8U),
      );
      const opened = scope.track(new cv.Mat());
      cv.morphologyEx(masked, opened, cv.MORPH_OPEN, kernel);

      // 4. Distance transform → 시드
      const dist = scope.track(new cv.Mat());
      cv.distanceTransform(opened, dist, cv.DIST_L2, 5);

      const distNorm = scope.track(new cv.Mat());
      cv.normalize(dist, distNorm, 0, 1.0, cv.NORM_MINMAX);
      const seeds = scope.track(new cv.Mat());
      cv.threshold(distNorm, seeds, 0.5, 1, cv.THRESH_BINARY);
      seeds.convertTo(seeds, cv.CV_8U, 255);

      // 5. Markers + watershed
      const markers = scope.track(new cv.Mat());
      cv.connectedComponents(seeds, markers);
      markers.convertTo(markers, cv.CV_32S);

      const colorSrc = scope.track(new cv.Mat());
      cv.cvtColor(src, colorSrc, cv.COLOR_RGBA2RGB);
      cv.watershed(colorSrc, markers);

      // 6. findContours — markers > 1 인 영역만 (1 은 background)
      const cmpVal = scope.track(
        new cv.Mat(markers.rows, markers.cols, markers.type(), [1, 0, 0, 0]),
      );
      const finalMask = scope.track(new cv.Mat());
      cv.compare(markers, cmpVal, finalMask, cv.CMP_GT);
      finalMask.convertTo(finalMask, cv.CV_8U);

      // contours/hierarchy 는 escape — scope 추적 X. caller 가 dispose.
      // eslint-disable-next-line local/no-direct-mat -- escapes scope; caller-managed
      const contours = new cv.MatVector();
      // eslint-disable-next-line local/no-direct-mat -- escapes scope; caller-managed
      const hierarchy = new cv.Mat();
      escaping = { contours, hierarchy };

      cv.findContours(
        finalMask,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      // 7. Sanity check
      const coinArea = Math.PI * coin.radiusPx ** 2;
      let totalArea = 0;
      let maxArea = 0;
      const numContours = contours.size();
      for (let i = 0; i < numContours; i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c);
        // c.delete() — get() 이 보통 새 Mat 핸들 반환 (OpenCV.js 동작)
        // jsdom mock 호환을 위해 try/catch
        try {
          c.delete();
        } catch {
          /* ignore */
        }
        totalArea += area;
        if (area > maxArea) maxArea = area;
      }

      if (
        numContours === 0 ||
        totalArea / coinArea < SANITY_MIN_AREA_RATIO ||
        (totalArea > 0 && maxArea / totalArea > SANITY_MAX_SINGLE_RATIO)
      ) {
        contours.delete();
        hierarchy.delete();
        escaping = {};
        throw { kind: "no_particles" } satisfies AnalysisError;
      }

      return { contours, hierarchy, totalArea };
    } catch (e: unknown) {
      // OOM 검출 — escape Mat 정리 후 분류 throw
      if (escaping.contours) {
        try {
          escaping.contours.delete();
        } catch {
          /* ignore */
        }
      }
      if (escaping.hierarchy) {
        try {
          escaping.hierarchy.delete();
        } catch {
          /* ignore */
        }
      }

      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : "";
      if (/memory|alloc/i.test(msg)) {
        throw {
          kind: "memory_oom",
          phase: "segment",
        } satisfies AnalysisError;
      }
      throw e;
    }
  });
}

/** 호출자 (F06 pipeline finally) 가 contours/hierarchy 정리 강제 */
export function disposeSegmentation(seg: ParticleSegmentation): void {
  try {
    seg.contours.delete();
  } catch {
    /* already disposed or invalid — ignore */
  }
  try {
    seg.hierarchy.delete();
  } catch {
    /* ignore */
  }
}

// 테스트용 export
export const _internal = {
  SANITY_MIN_AREA_RATIO,
  SANITY_MAX_SINGLE_RATIO,
  MASK_MARGIN_MM,
};
