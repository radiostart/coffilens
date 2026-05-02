/**
 * 이미지 다운샘플링 — 1080×1920 → 1280px 긴변 으로 리사이즈.
 *
 * WebView 메모리 피크 ~150MB → ~70MB 절감 (plain.md Section 6).
 * 분석 정확도는 영향 없음 (입자 분리에 충분).
 *
 * 입력: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas
 * 출력: HTMLCanvasElement | OffscreenCanvas (긴변 ≤ 1280)
 *
 * Worker context 지원: document 없으면 OffscreenCanvas 사용.
 */

// **C2 (1920px) 시도 → 보류 (2026-05-02)**:
// preflight blur 임계 (MIN_LAPLACIAN_VAR=100) 가 1280 기준으로 튜닝됨.
// 1920 에서 동일 사진 laplacian variance 96.4 로 임계 미달 → false-positive
// blur reject. 추가 임계 스케일링 필요해 회귀 위험. C1 (adaptive MIN) 만
// 으로도 fines 회복 효과 충분하므로 1280 유지. 1920 은 향후 ground-truth
// fixture 도착 후 재검토.
const TARGET_LONG_EDGE = 1280;

type SourceLike =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas;
type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

interface SourceDimensions {
  width: number;
  height: number;
}

function getDimensions(source: SourceLike): SourceDimensions {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

function createCanvas(width: number, height: number): CanvasLike {
  // worker context: document 없음 → OffscreenCanvas 사용.
  if (typeof document === "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function downsampleImage(source: SourceLike): CanvasLike {
  const { width: srcW, height: srcH } = getDimensions(source);
  if (srcW === 0 || srcH === 0) {
    throw new Error("downsampleImage: source dimensions are zero");
  }

  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge <= TARGET_LONG_EDGE ? 1 : TARGET_LONG_EDGE / longEdge;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = createCanvas(dstW, dstH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("downsampleImage: 2d context unavailable");

  // OffscreenCanvas drawImage 도 동일 시그니처. CanvasImageSource 타입 호환.
  (ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(
    source as CanvasImageSource,
    0,
    0,
    dstW,
    dstH,
  );
  return canvas;
}

export const _internalForTests = { TARGET_LONG_EDGE };
