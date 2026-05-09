/**
 * 부분 그림자 감지 — capture-guide pre-flight 용 순수 함수.
 *
 * 목적: 휴대폰이 상단 다운라이트 광원을 가려 코인/입자에 그림자가 지는 경우를
 * 사용자에게 사전 경고. 측정 알고리즘은 별도 (coin-detect 의 CLAHE fallback
 * + grayOriginal 검증) 가 처리 — 이 함수는 *감지만*, throw 없음.
 *
 * 알고리즘:
 *   1. grayscale 변환
 *   2. 이미지를 4x4 = 16 셀 그리드로 분할
 *   3. 각 셀의 평균 밝기 계산
 *   4. min(cell_mean) / max(cell_mean) 비율 = `evennessRatio`
 *   5. ratio < 임계 → partial-shadow 의심
 *   6. 보강: 인접 셀 cluster 검사 — 분산된 어두운 셀 (검은 입자) 보다 한 곳에
 *      뭉친 어두운 셀 (그림자 patch) 이 그림자 패턴.
 *
 * pipeline 영향 0 — 이 모듈을 import 한 곳에서만 동작.
 */

import { withMatScope } from "./mat-pool";
import { imreadFromCanvas } from "./canvas-mat";

declare const cv: {
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  Mat: new (...args: unknown[]) => CvMat;
  COLOR_RGBA2GRAY: number;
};

interface CvMat {
  delete: () => void;
  rows: number;
  cols: number;
  data: Uint8Array;
}

export interface ShadowReport {
  /** true = partial-shadow 의심, false = 균일 조명 */
  hasShadow: boolean;
  /** min/max 셀 평균 비율. 1.0=완전 균일, 낮을수록 불균일 */
  evennessRatio: number;
  /** 가장 어두운 셀의 평균 밝기 */
  darkestCellMean: number;
  /** 가장 밝은 셀의 평균 밝기 */
  brightestCellMean: number;
  /** 어두운 셀들이 인접해 cluster 를 이루는지 (그림자 패턴 보강 신호) */
  darkClusterSize: number;
  /** 4x4 셀 평균 (디버그/캘리브레이션용) */
  cellMeans: number[][];
}

const GRID = 4;
// 임계 (2026-05-08 캘리브레이션, scripts/verify-shadow-detect.ts):
//   shadow fixture 2장 + non-shadow 5장 (test-vs3-* / test-500-fine) 셀 grid 분석.
//   - shadow patch: 한 corner 에 3-4 셀 cluster, evennessRatio ~0.55
//   - non-shadow gradient 조명: 8-11 셀 band cluster, evennessRatio 0.34-0.44
// → 작은 localized cluster (3~6) 가 phone shadow 패턴, 큰 band cluster 는 lighting 그라디언트.
const EVENNESS_THRESHOLD = 0.65;
// 어두운 셀 = brightest cell 의 75% 미만 (shadow 절대 밝기 절대 임계 가까움)
const DARK_CELL_RATIO_OF_BRIGHTEST = 0.75;
// 어두운 셀 cluster 크기 범위 — 너무 작으면 노이즈/입자, 너무 크면 lighting 그라디언트.
const MIN_DARK_CLUSTER = 3;
const MAX_DARK_CLUSTER = 6;

/**
 * 그리드 분할 후 각 셀의 평균 grayscale 계산.
 * gray 는 single-channel uint8 Mat 가정.
 */
function gridCellMeans(gray: CvMat): number[][] {
  const cellW = Math.floor(gray.cols / GRID);
  const cellH = Math.floor(gray.rows / GRID);
  const cols = gray.cols;
  const data = gray.data;
  const result: number[][] = [];
  for (let gy = 0; gy < GRID; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < GRID; gx++) {
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      const x1 = gx === GRID - 1 ? gray.cols : x0 + cellW;
      const y1 = gy === GRID - 1 ? gray.rows : y0 + cellH;
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const rowStart = y * cols;
        for (let x = x0; x < x1; x++) {
          sum += data[rowStart + x];
          count++;
        }
      }
      row.push(count > 0 ? sum / count : 0);
    }
    result.push(row);
  }
  return result;
}

/**
 * 어두운 셀 (mean < brightestMean * DARK_CELL_RATIO_OF_BRIGHTEST) 들 중 가장 큰
 * connected component 크기. 4-방향 인접 (상하좌우).
 */
function largestDarkCluster(
  cells: number[][],
  brightestMean: number,
): number {
  const threshold = brightestMean * DARK_CELL_RATIO_OF_BRIGHTEST;
  const isDark = cells.map((row) => row.map((v) => v < threshold));
  const visited = isDark.map((row) => row.map(() => false));
  let maxCluster = 0;
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (!isDark[gy][gx] || visited[gy][gx]) continue;
      const stack: Array<[number, number]> = [[gx, gy]];
      let size = 0;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        if (x < 0 || x >= GRID || y < 0 || y >= GRID) continue;
        if (visited[y][x] || !isDark[y][x]) continue;
        visited[y][x] = true;
        size++;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      if (size > maxCluster) maxCluster = size;
    }
  }
  return maxCluster;
}

/**
 * 부분 그림자 감지. 측정 파이프라인과 독립 — pipeline 어디에도 기본 wire 안 됨.
 * UI / capture-guide / 검증 스크립트가 직접 호출.
 */
export async function detectPartialShadow(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<ShadowReport> {
  return withMatScope(async (scope) => {
    const src = scope.track(imreadFromCanvas(canvas));
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const cells = gridCellMeans(gray);
    let minV = Infinity;
    let maxV = -Infinity;
    for (const row of cells) {
      for (const v of row) {
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    const evennessRatio = maxV > 0 ? minV / maxV : 1;
    const darkClusterSize = largestDarkCluster(cells, maxV);

    // hasShadow 판정:
    //   - evennessRatio 임계 이하 (전체적으로 불균일)
    //   - 어두운 셀 cluster 가 [MIN, MAX] 범위 (작은 localized patch =
    //     phone shadow, 큰 band = lighting 그라디언트라 여기는 안 잡음)
    const hasShadow =
      evennessRatio < EVENNESS_THRESHOLD &&
      darkClusterSize >= MIN_DARK_CLUSTER &&
      darkClusterSize <= MAX_DARK_CLUSTER;

    return {
      hasShadow,
      evennessRatio,
      darkestCellMean: minV,
      brightestCellMean: maxV,
      darkClusterSize,
      cellMeans: cells,
    };
  });
}
