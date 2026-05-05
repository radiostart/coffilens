/**
 * partial-coin-probe — HoughCircles 가 0 circle 반환했을 때 fallback.
 *
 * 동전이 프레임 가장자리로 잘리면 HoughCircles 는 (full circle 가정으로) 검출 실패.
 * regression 데이터: 14장 batch 중 4장 fail, 모두 동전 일부 잘림 케이스.
 *
 * 접근:
 *  1. Canny edge → contour 추출
 *  2. 각 contour 가
 *     (a) 이미지 가장자리에 닿고
 *     (b) min enclosing circle 반지름이 동전 사이즈 (5-40% rows)
 *     (c) contour 점이 fitted circle 에 ≥60% 일치 (arc 형상)
 *     이면 partial coin 으로 간주
 */

import { withMatScope, type MatScope } from "./mat-pool";

declare const cv: {
  Canny: (
    src: GrayMat,
    dst: GrayMat,
    threshold1: number,
    threshold2: number,
  ) => void;
  medianBlur: (src: GrayMat, dst: GrayMat, ksize: number) => void;
  findContours: (
    src: GrayMat,
    contours: CvMatVector,
    hierarchy: GrayMat,
    mode: number,
    method: number,
  ) => void;
  boundingRect: (
    contour: ContourMat,
  ) => { x: number; y: number; width: number; height: number };
  minEnclosingCircle: (contour: ContourMat) => {
    center: { x: number; y: number };
    radius: number;
  };
  Mat: new () => GrayMat;
  MatVector: new () => CvMatVector;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_NONE: number;
};

// 입력 gray / 중간 Canny edge / hierarchy — pixel data 직접 접근 안 함.
interface GrayMat {
  delete: () => void;
  rows: number;
  cols: number;
}

// findContours 가 반환하는 contour — point list (data32S 페어).
interface ContourMat {
  delete: () => void;
  data32S: Int32Array;
  total: () => number;
}

interface CvMatVector {
  size: () => number;
  get: (i: number) => ContourMat;
  delete: () => void;
}

export interface PartialCoinHit {
  cx: number;
  cy: number;
  r: number;
  fitFrac: number;
}

/**
 * gray 이미지에서 가장자리에 걸린 partial coin arc 탐색.
 * 발견 시 첫 번째 매칭 반환, 없으면 null.
 *
 * 호출자는 withMatScope 내부에서 호출 — Mat 누수 방지.
 */
export function probePartialCoinAtEdges(
  gray: GrayMat,
  scope: MatScope,
): PartialCoinHit | null {
  const cols = gray.cols;
  const rows = gray.rows;

  // 노이즈 억제 후 Canny.
  const blurred = scope.track(new cv.Mat());
  cv.medianBlur(gray, blurred, 5);
  const edges = scope.track(new cv.Mat());
  cv.Canny(blurred, edges, 50, 150);

  const contours = scope.track(new cv.MatVector());
  const hierarchy = scope.track(new cv.Mat());
  cv.findContours(
    edges,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_NONE,
  );

  // HoughCircles 와 동일 radius 범위 (coin-detect.ts 의 minRadius/maxRadius).
  const minR = Math.round(rows * 0.05);
  const maxR = Math.round(rows * 0.4);
  const EDGE_TOUCH_PX = 3;
  const FIT_TOLERANCE_PX = 4;
  // arc 로 인정할 최소 contour 점 — 너무 적으면 noise.
  const MIN_CONTOUR_POINTS = 80;
  // contour 점 중 fitted circle 에 일치해야 하는 최소 비율.
  // partial coin 의 arc 는 거의 모든 점이 원 위 → 0.6 보수적 임계.
  const MIN_FIT_FRAC = 0.6;

  let best: PartialCoinHit | null = null;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    try {
      const total = c.total();
      if (total < MIN_CONTOUR_POINTS) continue;

      const rect = cv.boundingRect(c);
      const touchesEdge =
        rect.x < EDGE_TOUCH_PX ||
        rect.y < EDGE_TOUCH_PX ||
        rect.x + rect.width > cols - EDGE_TOUCH_PX ||
        rect.y + rect.height > rows - EDGE_TOUCH_PX;
      if (!touchesEdge) continue;

      const circle = cv.minEnclosingCircle(c);
      const cx = circle.center.x;
      const cy = circle.center.y;
      const r = circle.radius;

      if (r < minR || r > maxR) continue;

      // contour 점들이 fitted circle 위에 얼마나 잘 놓이는지 — arc-likeness.
      const data = c.data32S;
      let onCircle = 0;
      for (let j = 0; j < total; j++) {
        const px = data[j * 2];
        const py = data[j * 2 + 1];
        const d = Math.hypot(px - cx, py - cy);
        if (Math.abs(d - r) < FIT_TOLERANCE_PX) onCircle++;
      }
      const fitFrac = onCircle / total;
      if (fitFrac < MIN_FIT_FRAC) continue;

      // 가장 좋은 fit 채택 (여러 개 발견 시).
      if (best === null || fitFrac > best.fitFrac) {
        best = { cx, cy, r, fitFrac };
      }
    } finally {
      try {
        c.delete();
      } catch {
        // get() 이 새 핸들 반환 — jsdom mock 호환
      }
    }
  }

  return best;
}

/**
 * Standalone wrapper — withMatScope 외부에서 호출 가능.
 */
export async function probePartialCoinStandalone(
  gray: GrayMat,
): Promise<PartialCoinHit | null> {
  return withMatScope(async (scope) => probePartialCoinAtEdges(gray, scope));
}
