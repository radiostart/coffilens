/**
 * 입자 영역 분할 — adaptive threshold + watershed.
 *
 * 파이프라인 3~4단계 (plain.md Section 6).
 *
 * 흐름:
 *  1. 동전 영역 + 5mm 마진 마스킹 (경계 입자 왜곡 방지)
 *  2. Adaptive threshold (gaussian, blockSize=21, C=7) → binary  (fine grind 기준)
 *  3. Morphological opening (3x3 커널) → 노이즈 제거
 *  4. Distance transform → 시드 추출 (정규화 후 0.3 임계, fine grind 미세 입자 회수)
 *  5. Watershed → 입자 분리 (oversegment 위험)
 *  6. findContours → 입자별 contour 추출
 *  7. Sanity check:
 *      - 단일 contour > 80mm² (배경 wood floor / 컵받침) → 통계에서 제외
 *      - 유효 입자 면적 합 / 동전 면적 < 0.5% (분쇄 안 됨)
 *      - 단일 입자 > 50% (덩어리)
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
  imread: (canvas: HTMLCanvasElement | OffscreenCanvas) => CvMat;
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
// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
// 51 → 21: 작은 block 으로 미세 입자 (1~3px) 의 local contrast 픽업.
// 51 은 medium grind (5~10px 입자) 기준 — fine grind 에서는 입자가 block 안에서
// 노이즈로 흡수되어 false negative 발생.
const ADAPT_BLOCK_SIZE = 21;
const ADAPT_C = 7; // tuned 2026-05-02 — 10 → 7 더 공격적, 미세 입자 회수
const MORPH_KERNEL_SIZE = 3;

// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
// distance transform normalize 후 임계 — 매우 고운 분쇄 (입자 1~3px) 는 normalized
// peak 가 매우 작음. 0.5 는 큰 입자 중심만, 0.3 도 fine grind 에서는 부족해 거의
// 모든 seed 손실 → watershed 가 전체 coffee 영역을 한 덩어리로 처리.
// 0.1 까지 낮춰 미세 입자 각각에 seed 확보. fine grind 는 입자가 거의 분리되어
// 있어 oversegment 위험 낮음.
const WATERSHED_SEED_THRESHOLD = 0.1;

const SANITY_MIN_AREA_RATIO = 0.005;
const SANITY_MAX_SINGLE_RATIO = 0.5;

// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
// 입자 단일 면적 상한 (mm²) — 이보다 큰 contour 는 배경 (나무 바닥, 컵받침 가장자리,
// napkin 그림자) 으로 간주해 sanity 계산 + 통계에서 제외. 80mm² ≈ 직경 10mm 로
// statistics.ts 의 MAX_PARTICLE_DIAMETER_UM (10000μm) 과 정합.
// 동전 마스킹은 동전만 가리고 napkin 밖 wood floor 는 여전히 검출 → 필터 필요.
const MAX_PARTICLE_AREA_MM2 = 80;

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
  canvas: HTMLCanvasElement | OffscreenCanvas,
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

      // 3. Morphological opening — fine grind 는 skip (1-2px 미분 erode 방지).
      // tuned 2026-05-02 — medium grind 에서 OPEN 활성화하면 D50 약간 ↑ (19%) 이지만
      // measurement bias (equivalent circular vs sieve) 가 70%+ 차이라 해결책 아님.
      // 미분 보존 우선해 OPEN skip 유지. 상수는 medium 분기 도입 시 사용.
      void MORPH_KERNEL_SIZE;

      // 4. fine-grind: watershed 우회 (전체 coffee 영역을 한 덩어리로 통합).
      const finalMask = scope.track(new cv.Mat());
      masked.convertTo(finalMask, cv.CV_8U);

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
      // tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
      // background 영역(나무 바닥, 컵받침 등) 이 동전 마스킹 후에도 거대 contour 로
      // 잡히는 경우 → MAX_PARTICLE_AREA_MM2 초과 contour 는 sanity 계산에서 제외
      // (statistics.ts 도 동일 임계로 통계에서 배제).
      const coinArea = Math.PI * coin.radiusPx ** 2;
      const maxAreaPxFilter = MAX_PARTICLE_AREA_MM2 / coin.mmPerPixel ** 2;
      let totalArea = 0;
      let maxArea = 0;
      let backgroundContours = 0;
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
        if (area > maxAreaPxFilter) {
          backgroundContours++;
          continue; // 배경으로 간주 — sanity 계산에서 제외
        }
        totalArea += area;
        if (area > maxArea) maxArea = area;
      }

      const validContours = numContours - backgroundContours;
      const areaRatio = totalArea / coinArea;
      const maxRatio = totalArea > 0 ? maxArea / totalArea : 0;
      console.log(
        `[segment] contours=${numContours} (${backgroundContours} background-filtered) ` +
          `valid=${validContours} totalArea=${Math.round(totalArea)} ` +
          `coinArea=${Math.round(coinArea)} areaRatio=${areaRatio.toFixed(4)} ` +
          `maxArea=${Math.round(maxArea)} maxRatio=${maxRatio.toFixed(2)} ` +
          `(thresholds: areaRatio≥${SANITY_MIN_AREA_RATIO} maxRatio≤${SANITY_MAX_SINGLE_RATIO} ` +
          `maxParticle≤${MAX_PARTICLE_AREA_MM2}mm²)`,
      );

      const failReason =
        validContours === 0
          ? numContours === 0
            ? "no contours"
            : "all contours filtered as background"
          : areaRatio < SANITY_MIN_AREA_RATIO
            ? `area too small (${(areaRatio * 100).toFixed(2)}% < ${SANITY_MIN_AREA_RATIO * 100}%)`
            : maxRatio > SANITY_MAX_SINGLE_RATIO
              ? `single particle dominant (${(maxRatio * 100).toFixed(0)}% > ${SANITY_MAX_SINGLE_RATIO * 100}%)`
              : null;

      if (failReason) {
        console.warn(`[segment] no_particles: ${failReason}`);
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
  MAX_PARTICLE_AREA_MM2,
  ADAPT_BLOCK_SIZE,
  ADAPT_C,
  WATERSHED_SEED_THRESHOLD,
};
