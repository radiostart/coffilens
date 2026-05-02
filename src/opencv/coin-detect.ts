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
  data: Uint8Array;
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
 * 동전 검출 휴리스틱.
 *
 * HoughCircles 가 단일 동전에서도 여러 원을 검출:
 *  - inner ring (100원 이순신 메달리온, 500원 학 도안 윤곽)
 *  - 외곽 rim 의 약간 다른 위치/크기로 중복 검출
 *  - 노이즈 (분쇄 커피 군집, 컵받침 가장자리)
 *
 * 진짜 multi_coin 케이스와 구분하는 핵심:
 *   같은 동전이면 → 중심점들이 거의 같음 (concentric)
 *   다른 동전이면 → 중심점이 떨어져 있음 (separated)
 *
 * 거리 기반 휴리스틱: 가장 큰 원 외에 다른 원의 중심이 가장 큰 원의 반경 안에
 * 있으면 같은 동전의 inner feature 로 간주. 밖에 있으면 별도 동전.
 *
 * 추가 필터: 가장 큰 원의 50% 미만 radius 는 noise 로 간주 (애초에 비교 대상 X).
 */
const NOISE_RADIUS_RATIO = 0.5; // 가장 큰 원 대비 50% 미만 = 노이즈
const CONCENTRIC_DISTANCE_FACTOR = 1.0; // 중심 거리 < biggest.r * 이 값 = 같은 동전

// 동전 후보 색상 필터 — 은색 동전은 평균 grayscale ~110-175, low stddev (uniform metal).
// tuned 2026-05-02 for fine grind 500원 fixture, see fixtures/manifest.json
//   - 110 미만: 어두운 배경 (커피, 컵 뚜껑, 그림자)
//   - 175 초과: 흰 napkin 단독 영역 (false circle on plain paper)
//   - stddev > 38: 커피 클럼프 (dark+bright mix), can lid + 주변 mixed
// tuned 2026-05-02 for VS3 fixture set, see fixtures/manifest.json
//   - 어두운 조명 (test-500-fine.jpg 퍽 사진): 동전 mean ~150, stddev ~33
//   - 밝은 조명 (test-vs3-* fixtures, 균일 흰 napkin): 동전 mean ~200-215, stddev ~25-40
//   - 둘 다 cover 하기 위해 max 175 → 225, stddev 38 → 42
const COIN_MIN_MEAN_INTENSITY = 110;
const COIN_MAX_MEAN_INTENSITY = 225;
const COIN_MAX_STDDEV = 42;

// Exterior ring 필터 — 동전은 napkin 위에 놓이므로 주변도 밝음.
// 커피에 둘러싸인 napkin "구멍" (false positive) 은 외부가 어두움 → 큰 diff.
// tuned 2026-05-02 for VS3 fixture set, see fixtures/manifest.json
const COIN_MAX_INTERIOR_EXTERIOR_DIFF = 70;

// Strong gradient bypass — rim gradient 가 매우 강하면 (sharp metal edge) |int-ext|
// 임계 우회. 그림자 진 동전 / 어두운 디자인 영역이 많은 코인 (학 그림 등) 은
// |int-ext| 가 70 가까이 가지만, gradient 는 여전히 sharp (≥50).
// 사용자 fixture 11 검증: r=80 with |int-ext|=73 (실패) gradient=66 (sharp) — 진짜 동전.
// tuned 2026-05-02 (revision 4 — coin filter 완화).
const COIN_GRADIENT_STRONG_BYPASS = 50;

// Rim gradient strength 필터 — 진짜 동전 rim 은 sharp transition (metal→napkin) 로
// gradient magnitude 가 큼. Napkin "구멍" (sparse coffee 사이) 은 명확한 edge 없어
// gradient 약함. tuned 2026-05-02 for VS3 fixture set.
//   진짜 동전: rim gradient ~25-50+
//   napkin 구멍/scattered coffee 가장자리: ~5-15
const COIN_MIN_RIM_GRADIENT = 18;

/**
 * 원형 중심부 (반경 r/2) 의 grayscale 평균 + 표준편차 측정.
 * 중심부만 샘플해서 가장자리/배경 오염 최소화.
 * coin: 균일 metal → low stddev (~10-25)
 * 커피 클럼프: dark + bright napkin → high stddev (~40+)
 * 어두운 배경: 균일 → low stddev 일 수 있어 mean 으로 추가 필터
 */
function intensityStatsInCircle(
  gray: CvMat,
  cx: number,
  cy: number,
  r: number,
): { mean: number; stddev: number } {
  // 중심부만 샘플 — r/2 inscribed square (코인 중앙 25% 영역)
  const side = Math.floor((r / 2) / Math.SQRT2);
  const x0 = Math.max(0, Math.floor(cx - side));
  const x1 = Math.min(gray.cols - 1, Math.floor(cx + side));
  const y0 = Math.max(0, Math.floor(cy - side));
  const y1 = Math.min(gray.rows - 1, Math.floor(cy + side));
  const cols = gray.cols;
  const data = gray.data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * cols;
    for (let x = x0; x <= x1; x++) {
      const v = data[row + x];
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return { mean: 0, stddev: 999 };
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return { mean, stddev: Math.sqrt(Math.max(0, variance)) };
}

/**
 * 원 rim 위 N 점에서 finite difference 로 측정한 평균 gradient magnitude.
 * 진짜 coin rim: 강한 transition (~25-50)
 * Napkin 구멍 / scattered 가장자리: 약한 transition (~5-15)
 *
 * 32 angles 균등 샘플. 각 점에서 x/y finite difference (±1 픽셀):
 *   gx = data[x+1, y] - data[x-1, y]
 *   gy = data[x, y+1] - data[x, y-1]
 *   magnitude = sqrt(gx² + gy²)
 * 이미지 경계 벗어나는 샘플은 제외.
 */
function meanRimGradient(
  gray: CvMat,
  cx: number,
  cy: number,
  r: number,
): number {
  const samples = 32;
  const cols = gray.cols;
  const rows = gray.rows;
  const data = gray.data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const x = Math.round(cx + r * Math.cos(angle));
    const y = Math.round(cy + r * Math.sin(angle));
    if (x < 1 || x >= cols - 1 || y < 1 || y >= rows - 1) continue;
    const gx = data[y * cols + (x + 1)] - data[y * cols + (x - 1)];
    const gy = data[(y + 1) * cols + x] - data[(y - 1) * cols + x];
    sum += Math.sqrt(gx * gx + gy * gy);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * 원 외곽 ring (반경 r 부터 r*1.25 까지) 의 평균 grayscale 측정.
 * 진짜 동전: napkin 위에 놓임 → ring 외부도 밝음 (~napkin 색)
 * 커피에 둘러싸인 napkin 구멍 (false positive): ring 외부는 어두운 커피
 * → interior - exterior 차이로 동전 vs 구멍 구분.
 *
 * 이미지 경계를 벗어난 픽셀은 제외 (off-image). count 0 이면 999 반환 (필터 통과).
 */
function meanIntensityRingOutside(
  gray: CvMat,
  cx: number,
  cy: number,
  r: number,
): number {
  const innerR = r;
  const outerR = r * 1.25;
  const innerR2 = innerR * innerR;
  const outerR2 = outerR * outerR;
  const x0 = Math.max(0, Math.floor(cx - outerR));
  const x1 = Math.min(gray.cols - 1, Math.floor(cx + outerR));
  const y0 = Math.max(0, Math.floor(cy - outerR));
  const y1 = Math.min(gray.rows - 1, Math.floor(cy + outerR));
  const cols = gray.cols;
  const data = gray.data;
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    const row = y * cols;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const distSq = dx * dx + dy2;
      if (distSq < innerR2) continue; // 동전 내부, skip
      if (distSq > outerR2) continue; // ring 외부, skip
      sum += data[row + x];
      count++;
    }
  }
  // ring 픽셀 부족 (이미지 경계 벗어남) → 외부 검증 못 함, 통과시킴 (filter pass)
  if (count < 50) return 999;
  return sum / count;
}

/**
 * HoughCircles 동전 검출 + 분기 + mm/pixel 환산.
 *
 * 분기:
 *  - 0개 → no_coin
 *  - 1개 정상 → 사용자 지정 coinType 의 직경으로 mm/pixel 환산 + 신뢰도
 *  - 1개지만 가장자리 잘림 → partial_coin
 *  - N개 (N > 1):
 *      - 가장 큰 원이 dominant (1.43x 이상 큼) → 가장 큰 것을 동전으로 채택
 *      - 비슷한 크기 → multi_coin reject
 *
 * coinType 은 사용자가 촬영 전 선택 (coin-select 화면) — auto-classify 안 함.
 */
export async function detectCoin(
  canvas: HTMLCanvasElement,
  coinType: "100" | "500",
  coinHint?: { x: number; y: number } | null,
): Promise<CoinDetection> {
  return withMatScope(async (scope) => {
    const src = scope.track(cv.imread(canvas));
    // grayOriginal: blur 미적용 — sharp edge 보존 → rim gradient 측정용.
    const grayOriginal = scope.track(new cv.Mat());
    cv.cvtColor(src, grayOriginal, cv.COLOR_RGBA2GRAY);
    // gray (blurred): HoughCircles + intensity stats 용. blur=7 noise 억제.
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 7);

    const circles = scope.track(new cv.Mat());
    cv.HoughCircles(
      gray,
      circles,
      cv.HOUGH_GRADIENT,
      1, // dp
      gray.rows / 3, // minDist — 이전 rows/4 보다 보수적 (서로 더 멀리 있어야 함)
      100, // param1 (Canny 상위 임계)
      50, // param2 (검출 임계, false positive 는 intensity/stddev 필터로 차단)
      Math.round(gray.rows * 0.05), // minRadius (이미지 5%)
      Math.round(gray.rows * 0.4), // maxRadius (이미지 40%)
    );

    const numCircles = circles.cols;

    if (numCircles === 0) {
      throw { kind: "no_coin" } satisfies AnalysisError;
    }

    // 검출된 원들을 radius 내림차순 정렬 (data32F: [cx0, cy0, r0, cx1, cy1, r1, ...])
    const sortedCircles: Array<{ cx: number; cy: number; r: number }> = [];
    for (let i = 0; i < numCircles; i++) {
      sortedCircles.push({
        cx: circles.data32F[i * 3],
        cy: circles.data32F[i * 3 + 1],
        r: circles.data32F[i * 3 + 2],
      });
    }
    sortedCircles.sort((a, b) => b.r - a.r);

    // 후보 동전 필터 — interior 통계 + exterior ring 비교.
    //   interior mean/stddev: 동전 metal 균일성 검증 (mean 110-225, stddev ≤42)
    //   exterior mean: napkin 위 동전 vs 커피 둘러싸인 napkin 구멍 구분
    //     |interior - exterior| > 70 → napkin 구멍 (false positive) reject
    const annotated = sortedCircles.map((c) => {
      const interior = intensityStatsInCircle(gray, c.cx, c.cy, c.r);
      const exterior = meanIntensityRingOutside(gray, c.cx, c.cy, c.r);
      // rim gradient 는 unblurred gray 사용 — sharp edge 보존
      const rimGradient = meanRimGradient(grayOriginal, c.cx, c.cy, c.r);
      return { ...c, ...interior, exterior, rimGradient };
    });
    console.log(
      "[coin-detect] all circles:",
      annotated
        .map(
          (c) =>
            `r=${c.r.toFixed(0)}@(${c.cx.toFixed(0)},${c.cy.toFixed(0)}) i=${c.mean.toFixed(0)}±${c.stddev.toFixed(0)} ext=${c.exterior.toFixed(0)} grad=${c.rimGradient.toFixed(0)}`,
        )
        .join(" | "),
    );

    const coinCandidates = annotated.filter((c) => {
      // interior 통계 필터
      if (c.mean < COIN_MIN_MEAN_INTENSITY) return false;
      if (c.mean > COIN_MAX_MEAN_INTENSITY) return false;
      if (c.stddev > COIN_MAX_STDDEV) return false;
      // exterior ring 필터: 동전이면 외부도 napkin (밝음). interior - exterior 작음.
      // c.exterior === 999 (이미지 경계 벗어남) 이면 검증 skip — 통과시킴.
      // STRONG GRADIENT BYPASS: rim gradient ≥ 50 이면 sharp metal edge 확정 →
      // |int-ext| 임계 우회 (진짜 동전 false reject 방지).
      if (
        c.exterior !== 999 &&
        c.rimGradient < COIN_GRADIENT_STRONG_BYPASS
      ) {
        const diff = Math.abs(c.mean - c.exterior);
        if (diff > COIN_MAX_INTERIOR_EXTERIOR_DIFF) return false;
      }
      // rim gradient 필터: 진짜 coin rim 은 sharp transition. napkin 구멍 / 약한 edge reject.
      if (c.rimGradient < COIN_MIN_RIM_GRADIENT) return false;
      return true;
    });
    console.log(
      `[coin-detect] coin candidates after filter (mean [${COIN_MIN_MEAN_INTENSITY}..${COIN_MAX_MEAN_INTENSITY}], stddev≤${COIN_MAX_STDDEV}, |int-ext|≤${COIN_MAX_INTERIOR_EXTERIOR_DIFF} OR grad≥${COIN_GRADIENT_STRONG_BYPASS}, gradient≥${COIN_MIN_RIM_GRADIENT}): ${coinCandidates.length}`,
    );

    if (coinCandidates.length === 0) {
      throw { kind: "no_coin" } satisfies AnalysisError;
    }

    // Hint 처리 — 사용자가 동전 위치 탭한 경우. hint 에 가장 가까운 candidate 채택.
    // multi_coin 검사 우회 (사용자가 명시적으로 "이 동전" 지정).
    let selectedCandidate: (typeof coinCandidates)[number];
    if (coinHint) {
      const hintX = coinHint.x * gray.cols;
      const hintY = coinHint.y * gray.rows;
      const sortedByDist = [...coinCandidates].sort((a, b) => {
        const da = Math.hypot(a.cx - hintX, a.cy - hintY);
        const db = Math.hypot(b.cx - hintX, b.cy - hintY);
        return da - db;
      });
      selectedCandidate = sortedByDist[0];
      const dist = Math.hypot(
        selectedCandidate.cx - hintX,
        selectedCandidate.cy - hintY,
      );
      console.log(
        `[coin-detect] hint at (${hintX.toFixed(0)},${hintY.toFixed(0)}). ` +
          `nearest candidate: r=${selectedCandidate.r.toFixed(1)} @(${selectedCandidate.cx.toFixed(0)},${selectedCandidate.cy.toFixed(0)}) dist=${dist.toFixed(0)}px. ` +
          `multi_coin 검사 우회.`,
      );
    } else if (coinCandidates.length > 1) {
      // hint 없음 — 자동 검출 분기 (가장 큰 것 + concentric/separated 검사)
      const biggest = coinCandidates[0];
      const filtered = coinCandidates.filter(
        (c) => c.r >= biggest.r * NOISE_RADIUS_RATIO,
      );

      const separatedCircles = filtered.slice(1).filter((c) => {
        const dx = c.cx - biggest.cx;
        const dy = c.cy - biggest.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist > biggest.r * CONCENTRIC_DISTANCE_FACTOR;
      });

      console.log(
        `[coin-detect] ${coinCandidates.length} coin candidates. biggest r=${biggest.r.toFixed(1)} center=(${biggest.cx.toFixed(0)},${biggest.cy.toFixed(0)}) i=${biggest.mean.toFixed(0)}±${biggest.stddev.toFixed(0)}. ` +
          `${filtered.length - 1} non-noise, ${separatedCircles.length} separated.`,
      );

      if (separatedCircles.length > 0) {
        throw {
          kind: "multi_coin",
          count: filtered.length,
        } satisfies AnalysisError;
      }
      selectedCandidate = biggest;
    } else {
      selectedCandidate = coinCandidates[0];
    }

    const { cx, cy, r } = selectedCandidate;

    // partial_coin 검사 — 동전이 이미지 가장자리에 잘리면 mmPerPixel 환산 부정확.
    // 단, 사용자가 hint 로 명시한 동전은 신뢰 (작은 clip 은 측정 가능, 자동 검출
    // 실수 방지보다 사용자 의도 우선).
    if (!coinHint) {
      if (
        cx - r < EDGE_MARGIN_PX ||
        cy - r < EDGE_MARGIN_PX ||
        cx + r > gray.cols - EDGE_MARGIN_PX ||
        cy + r > gray.rows - EDGE_MARGIN_PX
      ) {
        throw { kind: "partial_coin" } satisfies AnalysisError;
      }
    } else {
      // hint 있으면 partial 경고만 로그
      if (
        cx - r < 0 ||
        cy - r < 0 ||
        cx + r > gray.cols ||
        cy + r > gray.rows
      ) {
        console.warn(
          `[coin-detect] hint 동전이 이미지 경계 잘림 — mmPerPixel 환산이 부정확할 수 있음. r=${r.toFixed(1)} center=(${cx.toFixed(0)},${cy.toFixed(0)})`,
        );
      }
    }

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
  computeCoinConfidence,
  MIN_BRIGHTNESS,
  MIN_LAPLACIAN_VAR,
};
