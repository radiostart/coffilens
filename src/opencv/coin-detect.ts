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
import { imreadFromCanvas } from "./canvas-mat";
import { probePartialCoinAtEdges } from "./partial-coin-probe";
import type {
  AnalysisError,
  CandidateInfo,
  CandidatePosition,
  CandidateRejectReason,
} from "./errors";

declare const cv: {
  imread: (canvas: HTMLCanvasElement | OffscreenCanvas) => CvMat;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  medianBlur: (src: CvMat, dst: CvMat, ksize: number) => void;
  GaussianBlur: (
    src: CvMat,
    dst: CvMat,
    ksize: { width: number; height: number },
    sigmaX: number,
  ) => void;
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
  LUT: (src: CvMat, lut: CvMat, dst: CvMat) => void;
  Mat: new (...args: unknown[]) => CvMat;
  MatVector: new (...args: unknown[]) => CvMat;
  Size: new (width: number, height: number) => { width: number; height: number };
  CLAHE: new (
    clipLimit?: number,
    tileGridSize?: { width: number; height: number },
  ) => CvCLAHE;
  COLOR_RGBA2GRAY: number;
  HOUGH_GRADIENT: number;
  CV_64F: number;
  CV_8U: number;
};

interface CvCLAHE {
  apply: (src: CvMat, dst: CvMat) => void;
  delete: () => void;
}

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
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<InputQualityResult> {
  return withMatScope(async (scope) => {
    const src = scope.track(imreadFromCanvas(canvas));
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

// Stddev strong-bypass cap (2026-05-09) — 학 면 / 이순신 면 (textured 부조) 의
// 동전 face design 으로 stddev 가 ~45 까지 올라가 COIN_MAX_STDDEV=42 임계를
// 초과해 진짜 동전이 coffee_cluster 로 오판 reject 되는 회귀 차단.
//
// 사용자 가이드 (capture-guide: "숫자 면 위") 가 1차 방어, 코드 bypass 가 2차
// 방어 (사용자가 학 면 위로 둔 사진의 backup).
//
// 메커니즘: rim gradient ≥ COIN_GRADIENT_STRONG_BYPASS (=50, sharp metal edge =
// 진짜 동전 신호) AND stddev ≤ 55 인 경우만 coffee_cluster 임계 우회. 즉
// 진짜 metal rim 신호가 충분히 강할 때만 stddev 관용 부여 — 약한 rim 의
// 그림자 boundary / napkin texture 는 여전히 reject.
//
// **cap 55 의 결정 근거** (현 fixture 데이터):
//   진짜 동전 학 면 stddev: 45 (test-vs3-051)
//   거짓 양성 위험 가장 높은 케이스: test-vs3-multi 커피 cluster
//     (stddev 59, grad 53) — cap 55 미만이라 safe margin 4 px stddev
//   다른 커피 cluster: 대부분 grad < 50 라 bypass 자체 적용 안 됨
//
// **회귀 검증** (batch-analyze, 2026-05-09):
//   전 baseline fixture 7/7 byte-identical (변경 없음 — 통과 후보들이 stddev<42
//   이므로 bypass 무관).
const COIN_MAX_STDDEV_RELAXED = 55;

// `meanIntensityRingOutside` 가 ring 픽셀 부족(이미지 경계 벗어남) 시 반환하는
// "exterior 측정 불가" sentinel. 이 값이면 |int-ext| 검증을 통과시킨다.
const EXTERIOR_SENTINEL_NONE = 999;

// 2026-05-06 의 MAX_HINT_DIST_FACTOR (Hough 후보 중 hint 와 가까운 것 선택용) 은
// 2026-05-09 detectCoinFromHint 도입 후 제거됨 — hint 경로는 Hough 자체를
// 바이패스해 1D radius sweep 사용, "가까운 후보" 개념 불필요.

/**
 * 동적 감마 — 어두운 사진에서 HoughCircles 검출률 향상.
 *
 * 적용 위치: `coinDetectGray` (HoughCircles 입력) 만. validation
 * (intensityStatsInCircle / meanRimGradient / meanIntensityRingOutside) 은
 * 원본 `gray`/`grayOriginal` 사용 — reject 임계 (mean<110 등) 의 의미 보존,
 * 감마로 false positive 만들지 않음.
 *
 * γ < 1: 어두운 영역 lift → Canny 가 어두운 동전 rim edge 검출 ↑.
 * γ = 1: no-op (충분히 밝은 사진).
 *
 * brightness preflight (mean<80 reject) 통과한 [80, ∞) 범위에서만 호출됨.
 */
function chooseGamma(meanIntensity: number): number {
  if (meanIntensity < 100) return 0.55;
  if (meanIntensity < 140) return 0.75;
  return 1.0;
}

const gammaLutCache = new Map<number, Uint8Array>();

function getGammaLUTData(gamma: number): Uint8Array {
  const key = Math.round(gamma * 100) / 100;
  const cached = gammaLutCache.get(key);
  if (cached) return cached;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.round(255 * Math.pow(i / 255, gamma)));
  }
  gammaLutCache.set(key, lut);
  return lut;
}

function applyGamma(src: CvMat, dst: CvMat, gamma: number): void {
  const lutData = getGammaLUTData(gamma);
  // eslint-disable-next-line local/no-direct-mat -- short-lived LUT, immediately deleted in finally
  const lutMat = new cv.Mat(1, 256, cv.CV_8U);
  try {
    // OpenCV.js Mat.data 는 Uint8Array view — 직접 set 가능.
    lutMat.data.set(lutData);
    cv.LUT(src, lutMat, dst);
  } finally {
    lutMat.delete();
  }
}

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
  if (count < 50) return EXTERIOR_SENTINEL_NONE;
  return sum / count;
}

interface AnnotatedCircle {
  cx: number;
  cy: number;
  r: number;
  mean: number;
  stddev: number;
  exterior: number;
  rimGradient: number;
}

/**
 * **CLAHE retry bypass relaxation (2026-05-09)**: baseline 에서 0 candidate 였던
 * 사진은 그림자 등으로 grayOriginal 의 rim gradient 자체가 약함. CLAHE 가 코인
 * 위치는 정확히 찾았지만 (Hough 통과) grayOriginal grad 측정이 strong-bypass
 * 50 못 넘는 경우 → 한 끗 차이로 too_dark/low_contrast reject. retry 한정
 * 35 로 완화 (정상 케이스 영향 0 — baseline 통과 사진은 retry 자체가 안 일어남).
 *
 * fixture 검증 (fail-002.jpeg, 2026-05-09): CLAHE 후 r=153 grad=45 → 35 임계로 PASS.
 */
const COIN_GRADIENT_STRONG_BYPASS_RELAXED = 35;

/**
 * **Phantom size sanity (2026-05-09)**: HoughCircles 가 배경/그림자 boundary
 * 를 거대한 phantom 원으로 false-detect 하는 회귀 차단. test-vs3-051 케이스:
 * r=449 in 960×1280 (47% of min dim) → 진짜 동전 r=97 보다 4.6배 큰 phantom
 * 이 "biggest passes wins" 선택 로직에 잡혀 partial_coin 으로 fail.
 *
 * **임계 결정 근거** (현 fixture 데이터, 모두 960×1280):
 *   진짜 동전 max r/min:   19.9% (test-vs3-09 close-up, r=190.8)
 *   phantom (test-vs3-051):  47.0% (r=449)
 *   임계 35% — 정상 case max 19.9% 위로 1.75x 마진, phantom 12% 아래 거리 충분
 *
 * Hough 의 maxRadius 자체는 안 건드림 (gray.rows*0.4 = 40% of height).
 * post-Hough candidate 단계에서 reject — 진단 로그에 phantom 가시화 +
 * 사용자에게 "oversized" 패턴 hint 노출 가능.
 */
const COIN_MAX_RADIUS_RATIO = 0.35;

/**
 * 후보 원이 동전 filter 를 통과했는지 — 통과하면 null, fail 하면 첫 fail 이유.
 * `coinCandidates` filter 와 `no_coin` 진단 candidate 분류가 동일 ladder 를 공유.
 *
 * @param maxR 이미지 min(w,h) × COIN_MAX_RADIUS_RATIO — phantom size sanity.
 *             0 또는 미지정 시 size 검사 skip (테스트 mock 호환).
 */
function deriveRejectReason(
  c: AnnotatedCircle,
  bypassGrad: number = COIN_GRADIENT_STRONG_BYPASS,
  maxR: number = 0,
): CandidateRejectReason | null {
  // size sanity 가 가장 먼저 — phantom 은 mean/stddev/grad 가 동전스럽게 보일
  // 수 있어 다른 필터를 통과할 위험. 절대 크기 자체로 즉시 reject.
  if (maxR > 0 && c.r > maxR) return "oversized";
  if (c.mean < COIN_MIN_MEAN_INTENSITY && c.rimGradient < bypassGrad) {
    return "too_dark";
  }
  if (c.mean > COIN_MAX_MEAN_INTENSITY) return "too_bright";
  // stddev strong-bypass: 진짜 동전 face (학/이순신 부조) 의 stddev~45 회복.
  // grad ≥ bypassGrad AND stddev ≤ COIN_MAX_STDDEV_RELAXED 일 때만 임계 우회.
  if (
    c.stddev > COIN_MAX_STDDEV &&
    (c.rimGradient < bypassGrad || c.stddev > COIN_MAX_STDDEV_RELAXED)
  ) {
    return "coffee_cluster";
  }
  if (
    c.exterior !== EXTERIOR_SENTINEL_NONE &&
    c.rimGradient < bypassGrad &&
    Math.abs(c.mean - c.exterior) > COIN_MAX_INTERIOR_EXTERIOR_DIFF
  ) {
    return "low_contrast";
  }
  if (c.rimGradient < COIN_MIN_RIM_GRADIENT) return "weak_rim";
  return null;
}

const POSITION_GRID = {
  LT: "좌상단",
  CT: "위쪽",
  RT: "우상단",
  LC: "왼쪽",
  CC: "가운데",
  RC: "오른쪽",
  LB: "좌하단",
  CB: "아래쪽",
  RB: "우하단",
} as const satisfies Record<string, CandidatePosition>;

/** image 폭/높이 1/3 분할 → 9-zone 격자 라벨. UI 친화 (raw px 노출 X). */
function derivePosition(
  cx: number,
  cy: number,
  w: number,
  h: number,
): CandidatePosition {
  const xz = cx < w / 3 ? "L" : cx > (2 * w) / 3 ? "R" : "C";
  const yz = cy < h / 3 ? "T" : cy > (2 * h) / 3 ? "B" : "C";
  return POSITION_GRID[`${xz}${yz}` as keyof typeof POSITION_GRID];
}

/**
 * **Tap-based 동전 검출 (ROI Hough, 2026-05-09)**: 사용자 탭 주변 ROI 만
 * crop 후 Hough 의 3D voting 사용. 전체 이미지 Hough 의 그림자 boundary
 * phantom circle 회귀가 ROI 밖이라 차단되고, 1D sweep 의 약점 (500원 코인
 * 내부 동심 feature — 학 그림 + "한국은행" ring — 이 외곽 rim 보다 강하게
 * 잡히는 회귀) 은 Hough vote 누적이 *완전한 외곽 rim* 을 우세하게 잡아 회피.
 *
 * 사용자 탭 부정확 (±50px) 도 ROI 안에서 Hough 가 자동 보정 — 1D sweep
 * 처럼 hint 위치를 그대로 center 로 강제하지 않음.
 */
async function detectCoinFromHint(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  coinType: "100" | "500",
  hint: { x: number; y: number },
): Promise<CoinDetection> {
  return withMatScope(async (scope) => {
    const src = scope.track(imreadFromCanvas(canvas));
    const grayOriginal = scope.track(new cv.Mat());
    cv.cvtColor(src, grayOriginal, cv.COLOR_RGBA2GRAY);
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 7);

    const cxHint = hint.x * gray.cols;
    const cyHint = hint.y * gray.rows;

    // ROI: 800×800 box 중심 hint, image 작으면 image 절반.
    const ROI_HALF = Math.min(
      400,
      Math.floor(Math.min(gray.rows, gray.cols) / 2),
    );
    const x0 = Math.max(0, Math.round(cxHint - ROI_HALF));
    const y0 = Math.max(0, Math.round(cyHint - ROI_HALF));
    const w = Math.min(gray.cols - x0, ROI_HALF * 2);
    const h = Math.min(gray.rows - y0, ROI_HALF * 2);

    // ROI 직접 복사 (Mat.roi typing 회피, 800×800 = 640K read, ms 단위).
    // eslint-disable-next-line local/no-direct-mat -- ROI Mat: scope.track 으로 추적, lifetime 동일
    const roiBlurred = scope.track(new cv.Mat(h, w, cv.CV_8U));
    for (let y = 0; y < h; y++) {
      const srcRow = (y0 + y) * gray.cols;
      const dstRow = y * w;
      for (let x = 0; x < w; x++) {
        roiBlurred.data[dstRow + x] = gray.data[srcRow + x0 + x];
      }
    }
    const blurKernel = h >= 1600 ? 23 : 15;
    const houghInput = scope.track(new cv.Mat());
    cv.GaussianBlur(
      roiBlurred,
      houghInput,
      new cv.Size(blurKernel, blurKernel),
      0,
    );

    // ROI Hough — param2 30 (본 Hough 50 보다 완화. ROI 좁아 false positive
    // 위험 작음 + partial-shadow rim 도 검출).
    const circles = scope.track(new cv.Mat());
    cv.HoughCircles(
      houghInput,
      circles,
      cv.HOUGH_GRADIENT,
      1,
      Math.max(50, h / 3),
      100,
      30,
      Math.round(Math.min(w, h) * 0.05),
      Math.round(Math.min(w, h) * 0.45),
    );
    const numCircles = circles.cols;
    console.log(
      `[coin-detect][tap] hint=(${cxHint.toFixed(0)},${cyHint.toFixed(0)}) ROI=${w}×${h}@(${x0},${y0}) → ${numCircles} circles`,
    );

    if (numCircles === 0) {
      throw {
        kind: "no_coin",
        candidates: [
          {
            position: derivePosition(cxHint, cyHint, gray.cols, gray.rows),
            rejectReason: "weak_rim",
            debug: {
              cxRel: cxHint / gray.cols,
              cyRel: cyHint / gray.rows,
              rRel: 0,
              mean: 0,
              rimGradient: 0,
            },
          },
        ],
      } satisfies AnalysisError;
    }

    // hint 와 가장 가까운 circle 선택 (ROI 좌표계)
    const cxHintRoi = cxHint - x0;
    const cyHintRoi = cyHint - y0;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < numCircles; i++) {
      const cxR = circles.data32F[i * 3];
      const cyR = circles.data32F[i * 3 + 1];
      const d = Math.hypot(cxR - cxHintRoi, cyR - cyHintRoi);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const houghCx = circles.data32F[bestIdx * 3] + x0;
    const houghCy = circles.data32F[bestIdx * 3 + 1] + y0;
    const houghR = circles.data32F[bestIdx * 3 + 2];

    // **circle refinement (RANSAC + Kasa)**: (cx, cy, r) 모두 sub-pixel 보정.
    // 실패 시 Hough 결과 fallback.
    const refined = refineCenterRansacKasa(
      grayOriginal,
      houghCx,
      houghCy,
      houghR,
    );
    const cx = refined ? refined.cx : houghCx;
    const cy = refined ? refined.cy : houghCy;
    const r = refined ? refined.r : houghR;
    if (refined) {
      const houghGrad = meanRimGradient(grayOriginal, houghCx, houghCy, houghR);
      const refinedGrad = meanRimGradient(grayOriginal, cx, cy, r);
      console.log(
        `[coin-detect][tap] circle refined: (${houghCx.toFixed(1)},${houghCy.toFixed(1)},r=${houghR.toFixed(1)}) → (${cx.toFixed(2)},${cy.toFixed(2)},r=${r.toFixed(2)}) Δc=${Math.hypot(cx - houghCx, cy - houghCy).toFixed(2)}px Δr=${(r - houghR).toFixed(2)}px | rim grad ${houghGrad.toFixed(1)} → ${refinedGrad.toFixed(1)}`,
      );
    }

    // 전체 이미지 좌표계에서 검증
    const interior = intensityStatsInCircle(gray, cx, cy, r);
    const exterior = meanIntensityRingOutside(gray, cx, cy, r);
    const rimGrad = meanRimGradient(grayOriginal, cx, cy, r);
    const annotated: AnnotatedCircle = {
      cx,
      cy,
      r,
      mean: interior.mean,
      stddev: interior.stddev,
      exterior,
      rimGradient: rimGrad,
    };
    console.log(
      `[coin-detect][tap] selected r=${r.toFixed(1)}@(${cx.toFixed(0)},${cy.toFixed(0)}) i=${annotated.mean.toFixed(0)}±${annotated.stddev.toFixed(0)} ext=${annotated.exterior.toFixed(0)} grad=${annotated.rimGradient.toFixed(0)}`,
    );
    // 사용자가 *명시적으로* 코인 위치 탭 → CLAHE retry 와 동일 bypass=35
    // 완화 적용 (그림자 진 marginal coin 에서도 통과). 일반 Hough 경로 의
    // 기본 50 보다 완화 — 사용자 의도 신뢰.
    const tapMaxR = Math.min(gray.cols, gray.rows) * COIN_MAX_RADIUS_RATIO;
    const reason = deriveRejectReason(
      annotated,
      COIN_GRADIENT_STRONG_BYPASS_RELAXED,
      tapMaxR,
    );
    if (reason !== null) {
      throw {
        kind: "no_coin",
        candidates: [
          {
            position: derivePosition(cx, cy, gray.cols, gray.rows),
            rejectReason: reason,
            debug: {
              cxRel: cx / gray.cols,
              cyRel: cy / gray.rows,
              rRel: r / gray.cols,
              mean: annotated.mean,
              rimGradient: annotated.rimGradient,
            },
          },
        ],
      } satisfies AnalysisError;
    }

    // partial_coin 경고만 (hint 명시 신뢰)
    if (cx - r < 0 || cy - r < 0 || cx + r > gray.cols || cy + r > gray.rows) {
      console.warn(
        `[coin-detect][tap] hint 동전이 이미지 경계 잘림 — mmPerPixel 부정확 가능. r=${r.toFixed(1)} center=(${cx.toFixed(0)},${cy.toFixed(0)})`,
      );
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
 * **hint dispatch**: coinHint 제공 시 detectCoinFromHint 로 위임 — Hough 의
 * 3D 탐색 대신 1D radius sweep 사용. 그림자 phantom circle 회귀 차단 + 더 빠름.
 *
 * coinType 은 사용자가 촬영 전 선택 (coin-select 화면) — auto-classify 안 함.
 */
export async function detectCoin(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  coinType: "100" | "500",
  coinHint?: { x: number; y: number } | null,
): Promise<CoinDetection> {
  if (coinHint) {
    return detectCoinFromHint(canvas, coinType, coinHint);
  }
  return withMatScope(async (scope) => {
    const src = scope.track(imreadFromCanvas(canvas));
    // grayOriginal: blur 미적용 — sharp edge 보존 → rim gradient 측정용.
    const grayOriginal = scope.track(new cv.Mat());
    cv.cvtColor(src, grayOriginal, cv.COLOR_RGBA2GRAY);
    // gray (blurred): HoughCircles + intensity stats 용. blur=7 noise 억제.
    const gray = scope.track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, gray, 7);

    // **속도 최적화 (2026-05-02)**: HoughCircles 전용 입력에 강한 blur 추가.
    // 미세한 coffee 입자 texture (espresso worst case 30s 의 주요 원인) 가
    // Canny edge 폭증을 일으킴. coinDetect 는 큰 circle (동전, ~100-200px) 만
    // 찾으면 되므로 small-scale texture suppress 해도 무관.
    //
    // 측정용 (intensity stats / particle segment) 은 기존 gray 그대로 사용 —
    // 이 Mat 은 detection 전용. 분쇄도 측정 정확도 영향 X.
    //
    // GaussianBlur kernel — image 해상도 비례 (1280: 15, 1920: 23).
    // coffee 입자 (1-3px @ 1280, 1.5-4.5px @ 1920) 완전 흐리게, 동전 윤곽 보존.
    // 2026-05-02 C2: TARGET_LONG_EDGE 1280→1920 변경에 맞춰 kernel 비례 ↑.
    const blurKernel =
      gray.rows >= 1600 ? 23 : 15; // 1.5x scale at higher resolution

    // **동적 감마 (2026-05-04)**: 어두운 사진에서 HoughCircles 검출률 향상.
    // coinDetectGray 만 lift — validation 은 원본 gray/grayOriginal 사용해
    // reject 임계의 의미 보존 (false positive 방지). 효과: 그림자 / 실내 약광
    // 사진의 동전을 더 많이 찾아 mmPerPixel anchor 가 잡히는 사진 ↑ →
    // 모든 mm 환산 (D-value, fines%, clumps) 의 정확도 ↑.
    const photoMean = cv.mean(gray)[0];
    const gamma = chooseGamma(photoMean);

    // coinDetectGray 빌더 — 1차는 CLAHE off (baseline 동작 보존), 0 candidate
    // 시 CLAHE on 으로 재시도 (그림자 fallback). primary path 에 CLAHE 항상
    // 적용은 marginal-pass 케이스 (mean<110 + grad≥50 strong-bypass) 를
    // 깨뜨림 — Hough 가 다른 원을 찾고 rim gradient 가 약해져 too_dark reject.
    // 검증: shadow-001.jpeg (2026-05-08) baseline PASS, primary-CLAHE FAIL.
    function buildCoinDetectGray(useClahe: boolean): CvMat {
      const dst = scope.track(new cv.Mat());
      let source: CvMat = gray;
      if (gamma < 1.0) {
        const lifted = scope.track(new cv.Mat());
        applyGamma(gray, lifted, gamma);
        source = lifted;
      }
      if (useClahe) {
        const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
        const equalized = scope.track(new cv.Mat());
        try {
          clahe.apply(source, equalized);
        } finally {
          clahe.delete();
        }
        cv.GaussianBlur(
          equalized,
          dst,
          new cv.Size(blurKernel, blurKernel),
          0,
        );
      } else {
        cv.GaussianBlur(
          source,
          dst,
          new cv.Size(blurKernel, blurKernel),
          0,
        );
      }
      return dst;
    }

    if (gamma < 1.0) {
      console.log(
        `[coin-detect] dark photo (mean=${photoMean.toFixed(0)}) → γ=${gamma.toFixed(2)} lift on HoughCircles input only`,
      );
    }

    type AnnotatedWithReason = AnnotatedCircle & {
      reason: CandidateRejectReason | null;
    };

    function runDetectionPass(useClahe: boolean): {
      numCircles: number;
      annotated: AnnotatedWithReason[];
      candidates: AnnotatedWithReason[];
    } {
      const cdg = buildCoinDetectGray(useClahe);
      const circles = scope.track(new cv.Mat());
      cv.HoughCircles(
        cdg,
        circles,
        cv.HOUGH_GRADIENT,
        1, // dp
        gray.rows / 3, // minDist
        100, // param1 (Canny 상위 임계)
        50, // param2 (검출 임계)
        Math.round(gray.rows * 0.05), // minRadius (이미지 5%)
        Math.round(gray.rows * 0.4), // maxRadius (이미지 40%)
      );
      const numCircles = circles.cols;
      const tag = useClahe ? "[CLAHE]" : "";
      if (numCircles === 0) {
        console.log(`[coin-detect]${tag} HoughCircles found 0 circles`);
        return { numCircles, annotated: [], candidates: [] };
      }
      const sortedCircles: Array<{ cx: number; cy: number; r: number }> = [];
      for (let i = 0; i < numCircles; i++) {
        sortedCircles.push({
          cx: circles.data32F[i * 3],
          cy: circles.data32F[i * 3 + 1],
          r: circles.data32F[i * 3 + 2],
        });
      }
      sortedCircles.sort((a, b) => b.r - a.r);

      const bypassGrad = useClahe
        ? COIN_GRADIENT_STRONG_BYPASS_RELAXED
        : COIN_GRADIENT_STRONG_BYPASS;
      const maxR = Math.min(gray.cols, gray.rows) * COIN_MAX_RADIUS_RATIO;
      const ann: AnnotatedWithReason[] = sortedCircles.map((c) => {
        const interior = intensityStatsInCircle(gray, c.cx, c.cy, c.r);
        const exterior = meanIntensityRingOutside(gray, c.cx, c.cy, c.r);
        const rimGradient = meanRimGradient(grayOriginal, c.cx, c.cy, c.r);
        const enriched = { ...c, ...interior, exterior, rimGradient };
        return {
          ...enriched,
          reason: deriveRejectReason(enriched, bypassGrad, maxR),
        };
      });
      console.log(
        `[coin-detect]${tag} all circles:`,
        ann
          .map(
            (c) =>
              `r=${c.r.toFixed(0)}@(${c.cx.toFixed(0)},${c.cy.toFixed(0)}) i=${c.mean.toFixed(0)}±${c.stddev.toFixed(0)} ext=${c.exterior.toFixed(0)} grad=${c.rimGradient.toFixed(0)}`,
          )
          .join(" | "),
      );
      const cands = ann.filter((c) => c.reason === null);
      console.log(
        `[coin-detect]${tag} coin candidates after filter (mean [${COIN_MIN_MEAN_INTENSITY}..${COIN_MAX_MEAN_INTENSITY}] OR grad≥${COIN_GRADIENT_STRONG_BYPASS}, stddev≤${COIN_MAX_STDDEV}, |int-ext|≤${COIN_MAX_INTERIOR_EXTERIOR_DIFF} OR grad≥${COIN_GRADIENT_STRONG_BYPASS}, gradient≥${COIN_MIN_RIM_GRADIENT}): ${cands.length}`,
      );
      console.log(
        `[coin-detect]${tag} reasons:`,
        ann
          .map((c) => `r=${c.r.toFixed(0)}@(${c.cx.toFixed(0)},${c.cy.toFixed(0)}) → ${c.reason ?? "PASS"}`)
          .join(" | "),
      );
      return { numCircles, annotated: ann, candidates: cands };
    }

    // **CLAHE fallback (2026-05-08)**: 1차 시도는 baseline (CLAHE 없음). 0
    // candidate 일 때만 CLAHE 적용해 재시도. primary 에 CLAHE 항상 적용은
    // marginal-pass 케이스 (mean<110, grad≥50 strong-bypass) 에서 Hough 가
    // 다른 원을 찾고 rim gradient 가 약해져 too_dark reject — 검증된 회귀.
    // fallback 패턴은 작동하던 사진에 영향 0, 실패 사진에 escape hatch 만 추가.
    let pass = runDetectionPass(false);
    if (pass.candidates.length === 0) {
      console.log(
        `[coin-detect] no candidates on baseline (numCircles=${pass.numCircles}) → retrying with CLAHE fallback`,
      );
      const claheRetry = runDetectionPass(true);
      // CLAHE 시도가 후보를 만들었으면 그쪽 채택. 둘 다 0 이면 baseline 정보
      // (annotated, candidates) 보존해 no_coin 진단에 사용.
      if (claheRetry.candidates.length > 0) {
        pass = claheRetry;
      } else if (pass.numCircles === 0 && claheRetry.numCircles > 0) {
        // baseline 0 circles 였는데 CLAHE 가 circles (전부 reject) 라도 만들었으면
        // 사용자 진단 정보 더 풍부 → annotated 채택.
        pass = claheRetry;
      }
    }

    const annotated = pass.annotated;
    const coinCandidates = pass.candidates;

    if (pass.numCircles === 0) {
      // **Edge-arc probe (2026-05-05)**: HoughCircles 가 0 circle 반환한 경우,
      // 동전이 프레임 가장자리로 잘려서 full circle 인식 실패한 케이스 일 수 있음.
      const arcHit = probePartialCoinAtEdges(gray, scope);
      if (arcHit) {
        console.log(
          `[coin-detect] partial-coin probe hit: r=${arcHit.r.toFixed(0)} center=(${arcHit.cx.toFixed(0)},${arcHit.cy.toFixed(0)}) fit=${(arcHit.fitFrac * 100).toFixed(0)}%`,
        );
        throw { kind: "partial_coin" } satisfies AnalysisError;
      }
      throw { kind: "no_coin" } satisfies AnalysisError;
    }

    if (coinCandidates.length === 0) {
      // **Edge-arc probe**: HoughCircles 가 후보를 찾았지만 모두 reject 된 경우.
      const arcHit = probePartialCoinAtEdges(gray, scope);
      if (arcHit) {
        console.log(
          `[coin-detect] partial-coin probe hit (post-filter): r=${arcHit.r.toFixed(0)} center=(${arcHit.cx.toFixed(0)},${arcHit.cy.toFixed(0)}) fit=${(arcHit.fitFrac * 100).toFixed(0)}%`,
        );
        throw { kind: "partial_coin" } satisfies AnalysisError;
      }
      const candidates: CandidateInfo[] = annotated
        .filter((c): c is typeof c & { reason: CandidateRejectReason } =>
          c.reason !== null,
        )
        .map((c) => ({
          position: derivePosition(c.cx, c.cy, gray.cols, gray.rows),
          rejectReason: c.reason,
        }));
      throw { kind: "no_coin", candidates } satisfies AnalysisError;
    }

    let selectedCandidate: (typeof coinCandidates)[number];
    // hint 경로는 detectCoinFromHint 가 이미 처리 — 이 지점 도달 시 hint 없음 가정.
    // Hough 자동 검출 분기 (가장 큰 후보 + concentric/separated 검사).
    if (coinCandidates.length > 1) {
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

    const { cx: houghCx, cy: houghCy, r: houghR } = selectedCandidate;

    // **circle refinement (RANSAC + Kasa)**: (cx, cy, r) 모두 sub-pixel 보정.
    // 실패 시 Hough 결과 fallback.
    const refined = refineCenterRansacKasa(
      grayOriginal,
      houghCx,
      houghCy,
      houghR,
    );
    const cx = refined ? refined.cx : houghCx;
    const cy = refined ? refined.cy : houghCy;
    const r = refined ? refined.r : houghR;
    if (refined) {
      const houghGrad = meanRimGradient(grayOriginal, houghCx, houghCy, houghR);
      const refinedGrad = meanRimGradient(grayOriginal, cx, cy, r);
      console.log(
        `[coin-detect] circle refined: (${houghCx.toFixed(1)},${houghCy.toFixed(1)},r=${houghR.toFixed(1)}) → (${cx.toFixed(2)},${cy.toFixed(2)},r=${r.toFixed(2)}) Δc=${Math.hypot(cx - houghCx, cy - houghCy).toFixed(2)}px Δr=${(r - houghR).toFixed(2)}px | rim grad ${houghGrad.toFixed(1)} → ${refinedGrad.toFixed(1)}`,
      );
    }

    // partial_coin 검사 — 동전이 이미지 가장자리에 잘리면 mmPerPixel 환산 부정확.
    if (
      cx - r < EDGE_MARGIN_PX ||
      cy - r < EDGE_MARGIN_PX ||
      cx + r > gray.cols - EDGE_MARGIN_PX ||
      cy + r > gray.rows - EDGE_MARGIN_PX
    ) {
      throw { kind: "partial_coin" } satisfies AnalysisError;
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
 * **RANSAC + Kasa rim circle fit** — Hough 의 양자화 (cx, cy, r) 를 외곽 rim
 * edge 로부터 sub-pixel 보정.
 *
 * 동기: Hough 가 (cx, cy, r) 을 1~2px 양자화 → 코인 시각 표시 / 입자 mask 위치
 * 가 약간 어긋남. 외곽 rim 은 face 종류 (100원 앞/뒷, 500원 앞/뒷) 무관하게
 * 가장 일관된 feature → 거기서 직접 fit 하면 정확.
 *
 * 알고리즘:
 *   1. annulus (r ± half) 안에서 finite-diff gradient 큰 픽셀만 수집
 *   2. RANSAC: 무작위 3점 → circumscribed circle → inlier 수 카운트 → 최다 모델 채택
 *   3. consensus set 에 Kasa algebraic fit (3×3 linear system) 으로 sub-pixel
 *
 * **결과 (cx, cy, r) 모두 사용** (2026-05-09 정정): 초기 정책은 r 보존 (Hough
 * r 유지) 으로 측정값 byte-identical 보장이 목적이었으나 검증 결과 *역효과*:
 *   - rim gradient 메트릭으로 측정 시 (cx_ref, cy_ref, r_hough) 의 rim 정렬이
 *     Hough 보다 87% **악화** (r 미스매치로 32 sample 위치가 rim 에서 빗나감)
 *   - (cx_ref, cy_ref, r_ref) 의 rim 정렬은 Hough 보다 65% **개선** (+4~+41 grad)
 * 즉 Kasa fit 의 (center, r) 는 같이 쓸 때만 의미 있고, center 만 빼서 Hough
 * r 과 결합하는 건 양쪽 optimum 의 단점만 결합 (Frankenstein). 따라서 *full
 * 출력 사용* 으로 정정.
 *
 * **측정 영향**: refined.r 사용 → mmPerPixel = D / (2 × refined.r) 도 변경 →
 * D-value 등 측정값 미세 변화 (μm 단위). 사용자 정책 결정 (2026-05-09):
 * "동전 사이즈 검출 변경에 따른 마이크론 값 변화는 당연" — rim 정렬 정확도
 * 향상의 trade-off 로 수용.
 *
 * **결정성**: RANSAC 의 randomness 가 측정 비결정성을 만들면 곤란. seed 를
 * Hough 출력 (cx0, cy0, r0) 에서 유도 → 같은 사진에 항상 같은 결과.
 *
 * 실패 (edge 점 < min, inlier < min, 선형계 특이) → null 반환. caller fallback.
 */

const REFINE_ANNULUS_HALF = 5;
const REFINE_GRAD_THRESHOLD = 30; // finite-diff |Δ| ≥ 30 → edge 점
const REFINE_RANSAC_ITER = 100;
const REFINE_INLIER_PX = 1.5;
const REFINE_MIN_INLIERS = 50;
const REFINE_MIN_EDGE_POINTS = 100;

function makeLcgRng(seed: number): () => number {
  // 간단한 LCG (Numerical Recipes). 결정적이며 분포 충분히 균일.
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** 3 점 외접원 — 양자화된 RANSAC 후보 모델 생성에 사용. */
function circumscribedCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): { cx: number; cy: number; r: number } | null {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null; // colinear
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const dx = ax - ux;
  const dy = ay - uy;
  return { cx: ux, cy: uy, r: Math.sqrt(dx * dx + dy * dy) };
}

/**
 * Kasa algebraic fit on N points: minimize Σ(x²+y² + Dx + Ey + F)²
 * Normal equation: 3×3 linear system. center=(-D/2, -E/2), r=√((D²+E²)/4 - F)
 */
function kasaFit(
  points: Array<{ x: number; y: number }>,
): { cx: number; cy: number; r: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    sxxx = 0,
    syyy = 0,
    sxyy = 0,
    sxxy = 0;
  for (const p of points) {
    const x = p.x;
    const y = p.y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxxx += x * x * x;
    syyy += y * y * y;
    sxyy += x * y * y;
    sxxy += x * x * y;
  }
  // [sxx sxy sx ] [D]   [-(sxxx + sxyy)]
  // [sxy syy sy ] [E] = [-(syyy + sxxy)]
  // [sx  sy  n  ] [F]   [-(sxx  + syy )]
  const a = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const b = [-(sxxx + sxyy), -(syyy + sxxy), -(sxx + syy)];
  const det = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D0 = det(a);
  if (Math.abs(D0) < 1e-9) return null;
  const sub = (col: number, vec: number[]): number[][] =>
    a.map((row, i) => row.map((v, j) => (j === col ? vec[i] : v)));
  const D = det(sub(0, b)) / D0;
  const E = det(sub(1, b)) / D0;
  const F = det(sub(2, b)) / D0;
  const cx = -D / 2;
  const cy = -E / 2;
  const r2 = (D * D + E * E) / 4 - F;
  if (r2 <= 0) return null;
  return { cx, cy, r: Math.sqrt(r2) };
}

/**
 * RANSAC + Kasa rim center refinement.
 *
 * @param grayOriginal sharp gray (no median blur — gradient 보존)
 * @param cx0,cy0,r0   Hough 의 rough 검출 결과
 * @returns refined (cx, cy, r) — caller 는 cx/cy 만 사용 권장 (r 은 보존)
 */
function refineCenterRansacKasa(
  grayOriginal: CvMat,
  cx0: number,
  cy0: number,
  r0: number,
): { cx: number; cy: number; r: number } | null {
  const cols = grayOriginal.cols;
  const rows = grayOriginal.rows;
  const data = grayOriginal.data;
  const innerR = Math.max(1, r0 - REFINE_ANNULUS_HALF);
  const outerR = r0 + REFINE_ANNULUS_HALF;
  const innerR2 = innerR * innerR;
  const outerR2 = outerR * outerR;
  const x0 = Math.max(1, Math.floor(cx0 - outerR));
  const x1 = Math.min(cols - 2, Math.ceil(cx0 + outerR));
  const y0 = Math.max(1, Math.floor(cy0 - outerR));
  const y1 = Math.min(rows - 2, Math.ceil(cy0 + outerR));
  const gradT2 = REFINE_GRAD_THRESHOLD * REFINE_GRAD_THRESHOLD;

  // Step 1: annulus 안 finite-diff gradient ≥ threshold 픽셀 수집.
  const points: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy0;
    const dy2 = dy * dy;
    const row = y * cols;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx0;
      const d2 = dx * dx + dy2;
      if (d2 < innerR2 || d2 > outerR2) continue;
      const gx = data[row + (x + 1)] - data[row + (x - 1)];
      const gy = data[(y + 1) * cols + x] - data[(y - 1) * cols + x];
      if (gx * gx + gy * gy < gradT2) continue;
      points.push({ x, y });
    }
  }
  if (points.length < REFINE_MIN_EDGE_POINTS) return null;

  // Step 2: RANSAC. 결정적 seed = Hough 출력에서 유도.
  const rng = makeLcgRng(
    Math.floor(cx0) ^ (Math.floor(cy0) << 8) ^ (Math.floor(r0) << 16),
  );
  const N = points.length;
  let bestInlierCount = 0;
  let bestFit: { cx: number; cy: number; r: number } | null = null;
  for (let iter = 0; iter < REFINE_RANSAC_ITER; iter++) {
    const i1 = Math.floor(rng() * N);
    let i2 = Math.floor(rng() * N);
    if (i2 === i1) i2 = (i1 + 1) % N;
    let i3 = Math.floor(rng() * N);
    if (i3 === i1 || i3 === i2) i3 = (Math.max(i1, i2) + 1) % N;
    const fit = circumscribedCircle(
      points[i1].x,
      points[i1].y,
      points[i2].x,
      points[i2].y,
      points[i3].x,
      points[i3].y,
    );
    if (!fit) continue;
    // sanity: 중심이 Hough 에서 너무 멀거나 r 이 크게 다르면 polluted sample → skip.
    if (
      Math.hypot(fit.cx - cx0, fit.cy - cy0) > r0 * 0.2 ||
      Math.abs(fit.r - r0) > r0 * 0.2
    ) {
      continue;
    }
    let inlierCount = 0;
    for (const p of points) {
      const ddx = p.x - fit.cx;
      const ddy = p.y - fit.cy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (Math.abs(d - fit.r) <= REFINE_INLIER_PX) inlierCount++;
    }
    if (inlierCount > bestInlierCount) {
      bestInlierCount = inlierCount;
      bestFit = fit;
    }
  }
  if (!bestFit || bestInlierCount < REFINE_MIN_INLIERS) return null;

  // Step 3: best 모델로 inlier 재수집 후 Kasa LSE refit (sub-pixel).
  const inliers: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    const ddx = p.x - bestFit.cx;
    const ddy = p.y - bestFit.cy;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (Math.abs(d - bestFit.r) <= REFINE_INLIER_PX) inliers.push(p);
  }
  if (inliers.length < REFINE_MIN_INLIERS) return null;
  const refined = kasaFit(inliers);
  if (!refined) return null;
  // 최종 sanity: Hough 에서 너무 벗어나면 거부.
  if (
    Math.hypot(refined.cx - cx0, refined.cy - cy0) > r0 * 0.1 ||
    Math.abs(refined.r - r0) > r0 * 0.1
  ) {
    return null;
  }
  return refined;
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
