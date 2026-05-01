/**
 * 동전 검출 + 입력 검증 (밝기/블러).
 *
 * 파이프라인 0~2단계 (plain.md Section 6).
 * HoughCircles 로 원형 후보 검출 → 0/1/2+ 분기 → 가장자리 잘림 검증 → 100/500원 분류 → mm/pixel 환산.
 *
 * 모든 Mat 은 MatScope 로 추적 — 누수 방지 (F03).
 * cv 는 OpenCV.js 가 window 에 주입한 전역. 테스트는 `globalThis.cv` mock.
 */

import { withMatScope } from "./mat-pool";
import type { AnalysisError } from "./errors";

declare const cv: {
  imread: (canvas: HTMLCanvasElement) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  medianBlur: (src: CvMat, dst: CvMat, ksize: number) => void;
  HoughCircles: (
    src: CvMat,
    circles: CvMat,
    method: number,
    dp: number,
    minDist: number,
    param1: number,
    param2: number,
    minRadius: number,
    maxRadius: number,
  ) => void;
  Laplacian: (src: CvMat, dst: CvMat, ddepth: number) => void;
  meanStdDev: (src: CvMat, mean: CvMat, stddev: CvMat) => void;
  mean: (src: CvMat) => number[];
  Mat: new (...args: unknown[]) => CvMat;
  MatVector: new (...args: unknown[]) => CvMat;
  COLOR_RGBA2GRAY: number;
  HOUGH_GRADIENT: number;
  CV_64F: number;
};

interface CvMat {
  delete: () => void;
  rows: number;
  cols: number;
  data32F: Float32Array;
  data64F: Float64Array;
}

export interface CoinDetection {
  centerX: number;
  centerY: number;
  radiusPx: number;
  coinType: "100" | "500";
  diameterMm: number;
  mmPerPixel: number;
  /** 0~1, 검출 신뢰도 (HoughCircles 자체는 미제공 → 휴리스틱 점수) */
  confidence: number;
}

export interface InputQualityResult {
  meanBrightness: number;
  laplacianVariance: number;
}

const COIN_100_DIAMETER_MM = 24;
const COIN_500_DIAMETER_MM = 26.5;
const EDGE_MARGIN_PX = 20;

const MIN_BRIGHTNESS = 80;
const MIN_LAPLACIAN_VAR = 100;

/**
 * 입력 이미지 품질 검증 (밝기 + 블러).
 *
 * 합격 시 측정값 반환 — F06 confidence 입력으로 사용.
 * 불합격 시 AnalysisError throw (low_brightness | blur).
 */
export async function checkInputQuality(
  canvas: HTMLCanvasElement,
): Promise<InputQualityResult> {
  return withMatScope(async (scope) => {
    const src = scope.track(cv.imread(canvas));
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const meanBrightness = cv.mean(gray)[0];
    if (meanBrightness < MIN_BRIGHTNESS) {
      throw {
        kind: "low_brightness",
        meanBrightness,
      } satisfies AnalysisError;
    }

    const laplacian = scope.track(new cv.Mat());
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    const mean = scope.track(new cv.Mat());
    const stddev = scope.track(new cv.Mat());
    cv.meanStdDev(laplacian, mean, stddev);
    const variance = stddev.data64F[0] ** 2;
    if (variance < MIN_LAPLACIAN_VAR) {
      throw {
        kind: "blur",
        laplacianVariance: variance,
      } satisfies AnalysisError;
    }

    return { meanBrightness, laplacianVariance: variance };
  });
}

/**
 * HoughCircles 동전 검출 + 분기 + mm/pixel 환산.
 *
 * 분기:
 *  - 0개 → no_coin
 *  - 2개+ → multi_coin
 *  - 1개지만 가장자리 잘림 → partial_coin
 *  - 1개 정상 → 100/500원 분류 + mm/pixel + 신뢰도
 */
export async function detectCoin(
  canvas: HTMLCanvasElement,
): Promise<CoinDetection> {
  return withMatScope(async (scope) => {
    const src = scope.track(cv.imread(canvas));
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 5);

    const circles = scope.track(new cv.Mat());
    cv.HoughCircles(
      gray,
      circles,
      cv.HOUGH_GRADIENT,
      1, // dp
      gray.rows / 4, // minDist
      100, // param1
      30, // param2
      Math.round(gray.rows * 0.05), // minRadius
      Math.round(gray.rows * 0.4), // maxRadius
    );

    const numCircles = circles.cols;

    if (numCircles === 0) {
      throw { kind: "no_coin" } satisfies AnalysisError;
    }
    if (numCircles > 1) {
      throw {
        kind: "multi_coin",
        count: numCircles,
      } satisfies AnalysisError;
    }

    const cx = circles.data32F[0];
    const cy = circles.data32F[1];
    const r = circles.data32F[2];

    if (
      cx - r < EDGE_MARGIN_PX ||
      cy - r < EDGE_MARGIN_PX ||
      cx + r > gray.cols - EDGE_MARGIN_PX ||
      cy + r > gray.rows - EDGE_MARGIN_PX
    ) {
      throw { kind: "partial_coin" } satisfies AnalysisError;
    }

    const coinType = chooseCoinType(r, gray.cols);
    const diameterMm =
      coinType === "100" ? COIN_100_DIAMETER_MM : COIN_500_DIAMETER_MM;
    const mmPerPixel = diameterMm / (r * 2);
    const confidence = computeCoinConfidence(cx, cy, r, gray.cols, gray.rows);

    return {
      centerX: cx,
      centerY: cy,
      radiusPx: r,
      coinType,
      diameterMm,
      mmPerPixel,
      confidence,
    };
  });
}

/**
 * 100/500원 자동 분류.
 *
 * 휴리스틱: 동전 직경 / 이미지 폭 비율.
 * 일반 촬영 거리에서 100원은 ratio ~0.10~0.18, 500원은 ~0.15~0.25.
 * 0.20 임계로 단순 분류 — Phase 1 에서 사용자 선택 UI 또는 ML 분류기 검토.
 */
function chooseCoinType(radiusPx: number, imgWidth: number): "100" | "500" {
  const ratio = (radiusPx * 2) / imgWidth;
  return ratio > 0.2 ? "500" : "100";
}

/**
 * 검출 신뢰도 (0~1) — HoughCircles 자체 미제공이라 휴리스틱.
 *
 * 시그널:
 *  - centerScore: 화면 중앙에 가까울수록 ↑
 *  - sizeScore: 반지름이 합리적 크기일수록 ↑
 */
function computeCoinConfidence(
  cx: number,
  cy: number,
  r: number,
  w: number,
  h: number,
): number {
  const centerDx = Math.abs(cx - w / 2) / (w / 2);
  const centerDy = Math.abs(cy - h / 2) / (h / 2);
  const centerScore = 1 - Math.min(1, (centerDx + centerDy) / 2);
  const sizeScore = Math.min(1, r / (h * 0.15));
  return Math.round((centerScore * 0.4 + sizeScore * 0.6) * 100) / 100;
}

// 테스트용 export
export const _internal = {
  chooseCoinType,
  computeCoinConfidence,
  MIN_BRIGHTNESS,
  MIN_LAPLACIAN_VAR,
};
