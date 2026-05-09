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

// `meanIntensityRingOutside` 가 ring 픽셀 부족(이미지 경계 벗어남) 시 반환하는
// "exterior 측정 불가" sentinel. 이 값이면 |int-ext| 검증을 통과시킨다.
const EXTERIOR_SENTINEL_NONE = 999;

// hint 와 후보 중심 거리 허용 한도 — `dist > selected.r * MAX_HINT_DIST_FACTOR`
// 이면 사용자가 가리킨 동전과 후보가 같은 원이라고 보기 어려워 거절.
//
// 배경 (2026-05-06, fixture 014): HoughCircles 가 진짜 동전을 못 찾고 phantom
// 1개만 잡힌 케이스에서, hint(738,930) 와 phantom(384,665) 거리 443px 였음에도
// "가장 가까운" 이라는 이유만으로 phantom 이 선택되어 silent false positive
// 발생. r=131 의 3.4 배 거리인데 sanity check 가 없었음.
//
// 1.5 = hint 가 후보 원 밖으로 반지름의 50% 까지 벗어나도 허용 — 사용자 탭
// 부정확성(rim 근처 탭) 흡수. 이보다 멀면 다른 객체로 간주해 no_coin throw.
const MAX_HINT_DIST_FACTOR = 1.5;

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
 * 후보 원이 동전 filter 를 통과했는지 — 통과하면 null, fail 하면 첫 fail 이유.
 * `coinCandidates` filter 와 `no_coin` 진단 candidate 분류가 동일 ladder 를 공유.
 */
function deriveRejectReason(
  c: AnnotatedCircle,
  bypassGrad: number = COIN_GRADIENT_STRONG_BYPASS,
): CandidateRejectReason | null {
  if (c.mean < COIN_MIN_MEAN_INTENSITY && c.rimGradient < bypassGrad) {
    return "too_dark";
  }
  if (c.mean > COIN_MAX_MEAN_INTENSITY) return "too_bright";
  if (c.stddev > COIN_MAX_STDDEV) return "coffee_cluster";
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
  canvas: HTMLCanvasElement | OffscreenCanvas,
  coinType: "100" | "500",
  coinHint?: { x: number; y: number } | null,
): Promise<CoinDetection> {
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
      const ann: AnnotatedWithReason[] = sortedCircles.map((c) => {
        const interior = intensityStatsInCircle(gray, c.cx, c.cy, c.r);
        const exterior = meanIntensityRingOutside(gray, c.cx, c.cy, c.r);
        const rimGradient = meanRimGradient(grayOriginal, c.cx, c.cy, c.r);
        const enriched = { ...c, ...interior, exterior, rimGradient };
        return { ...enriched, reason: deriveRejectReason(enriched, bypassGrad) };
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
    if (coinHint) {
      // hint 있으면 필터 통과한 후보 중 가장 가까운 것 선택. multi_coin
      // 검사 우회 (사용자가 "이 동전" 명시).
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
      const maxDist = selectedCandidate.r * MAX_HINT_DIST_FACTOR;
      console.log(
        `[coin-detect] hint at (${hintX.toFixed(0)},${hintY.toFixed(0)}). ` +
          `nearest candidate: r=${selectedCandidate.r.toFixed(1)} @(${selectedCandidate.cx.toFixed(0)},${selectedCandidate.cy.toFixed(0)}) dist=${dist.toFixed(0)}px (max ${maxDist.toFixed(0)}px).`,
      );
      if (dist > maxDist) {
        // hint 와 어떤 후보도 매칭되지 않음 — phantom 이 가장 가까워도 사용자가
        // 가리킨 동전이 아닐 가능성이 높음. silent false positive 방지를 위해
        // no_coin 으로 명시 실패 (사용자가 다시 찍거나 hint 재지정).
        console.warn(
          `[coin-detect] hint mismatch: 가장 가까운 후보가 hint 에서 ${dist.toFixed(0)}px 떨어짐 (한도 ${maxDist.toFixed(0)}px). 사용자가 가리킨 동전과 다른 객체로 판단 → no_coin.`,
        );
        const candidates: CandidateInfo[] = annotated.map((c) => ({
          position: derivePosition(c.cx, c.cy, gray.cols, gray.rows),
          rejectReason: c.reason ?? "hint_too_far",
        }));
        throw { kind: "no_coin", candidates } satisfies AnalysisError;
      }
    } else {
      if (coinCandidates.length > 1) {
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
    }

    const { cx, cy } = selectedCandidate;
    // **Radius refinement (2026-05-09)**: 그림자 케이스에서 Hough 가 boundary
    // edge 영향으로 r 부풀린 회귀를 *선정된 1개 후보 한정* 으로 보정.
    // r±10% sweep 후 rim gradient peak 위치 r 로 교체.
    //
    // 그림자 감지 게이트 (4x4 grid 균일성 + dark cluster 크기 [3,6]) — 비-그림자
    // 사진은 refinement skip 으로 byte-identical 보장. shadow-detect.ts 와 동일
    // 휴리스틱.
    const r = (() => {
      const initR = selectedCandidate.r;
      // 그림자 감지 — 비-그림자 fixture 의 baseline 동작 보존
      const grid = 4;
      const cellW = Math.floor(gray.cols / grid);
      const cellH = Math.floor(gray.rows / grid);
      const data = gray.data;
      const cols = gray.cols;
      const cells: number[][] = [];
      for (let gy = 0; gy < grid; gy++) {
        const row: number[] = [];
        for (let gx = 0; gx < grid; gx++) {
          const x0 = gx * cellW;
          const y0 = gy * cellH;
          const x1 = gx === grid - 1 ? gray.cols : x0 + cellW;
          const y1 = gy === grid - 1 ? gray.rows : y0 + cellH;
          let sum = 0;
          let count = 0;
          for (let yy = y0; yy < y1; yy++) {
            const rr = yy * cols;
            for (let xx = x0; xx < x1; xx++) {
              sum += data[rr + xx];
              count++;
            }
          }
          row.push(count > 0 ? sum / count : 0);
        }
        cells.push(row);
      }
      let minMean = Infinity;
      let maxMean = -Infinity;
      for (const row of cells) {
        for (const v of row) {
          if (v < minMean) minMean = v;
          if (v > maxMean) maxMean = v;
        }
      }
      const evennessRatio = maxMean > 0 ? minMean / maxMean : 1;
      if (evennessRatio >= 0.65) return initR;
      // dark cluster size check (3-6 = phone shadow patch, not lighting band)
      const darkThreshold = maxMean * 0.75;
      const isDark = cells.map((row) => row.map((v) => v < darkThreshold));
      const visited = isDark.map((row) => row.map(() => false));
      let maxCluster = 0;
      for (let gy = 0; gy < grid; gy++) {
        for (let gx = 0; gx < grid; gx++) {
          if (!isDark[gy][gx] || visited[gy][gx]) continue;
          const stack: Array<[number, number]> = [[gx, gy]];
          let size = 0;
          while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            if (x < 0 || x >= grid || y < 0 || y >= grid) continue;
            if (visited[y][x] || !isDark[y][x]) continue;
            visited[y][x] = true;
            size++;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
          }
          if (size > maxCluster) maxCluster = size;
        }
      }
      if (maxCluster < 3 || maxCluster > 6) return initR;

      // 그림자 감지 — sweep refinement 적용.
      // 전략: ±10% sweep 후 peak grad 의 95% 이상인 *eligible local maxima* 의
      // **평균 r** 채택. 그림자 케이스에서 Hough 가 (실제 rim) + (그림자
      // boundary edge) 둘 다 동등 강도 vote 받아 한쪽으로 치우친 회귀를 보정 —
      // 두 peak 의 중점이 실제 rim 추정치에 가까움.
      //
      // 단일 peak 만 eligible 이면 mean = 그 단일 r → 다른 그림자 fixture
      // (shadow-001/002, fail-002) 의 측정값 영향 0 (단일 peak 케이스).
      // dual peak 케이스 (fail-003: r=143 grad=80, r=153 grad=80) 에서만
      // mean ~148 로 수렴해 너무 작게 잡힌 회귀 추가 보정.
      const swStart = Math.max(1, Math.round(initR * 0.9));
      const swEnd = Math.round(initR * 1.1);
      const grads: { r: number; g: number }[] = [];
      let peakG = -Infinity;
      for (let testR = swStart; testR <= swEnd; testR++) {
        const g = meanRimGradient(grayOriginal, cx, cy, testR);
        grads.push({ r: testR, g });
        if (g > peakG) peakG = g;
      }
      const eligibleThreshold = peakG * 0.95;
      const eligibleMaxima: number[] = [];
      for (let i = 0; i < grads.length; i++) {
        const cand = grads[i];
        if (cand.g < eligibleThreshold) continue;
        const left = i > 0 ? grads[i - 1].g : -Infinity;
        const right = i < grads.length - 1 ? grads[i + 1].g : -Infinity;
        if (cand.g >= left && cand.g >= right) {
          eligibleMaxima.push(cand.r);
        }
      }
      let bestR: number = initR;
      if (eligibleMaxima.length > 0) {
        const meanR =
          eligibleMaxima.reduce((a, b) => a + b, 0) / eligibleMaxima.length;
        bestR = meanR;
      }
      const initGrad = meanRimGradient(grayOriginal, cx, cy, initR);
      if (Math.abs(bestR - initR) > 0.5) {
        const bestGrad = meanRimGradient(grayOriginal, cx, cy, bestR);
        console.log(
          `[coin-detect] shadow detected → radius refined: ${initR.toFixed(1)} → ${bestR.toFixed(1)} (grad ${initGrad.toFixed(0)} → ${bestGrad.toFixed(0)}, peak=${peakG.toFixed(0)}, eligible=[${eligibleMaxima.join(",")}])`,
        );
      } else {
        bestR = initR; // sub-pixel 보존
      }
      return bestR;
    })();

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
