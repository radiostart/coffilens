/**
 * 이미지 다운샘플링 — 1080×1920 → 1280px 긴변 으로 리사이즈.
 *
 * WebView 메모리 피크 ~150MB → ~70MB 절감 (plain.md Section 6).
 * 분석 정확도는 영향 없음 (입자 분리에 충분).
 *
 * 입력: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
 * 출력: HTMLCanvasElement (긴변 ≤ 1280)
 */

const TARGET_LONG_EDGE = 1280;

interface SourceDimensions {
  width: number;
  height: number;
}

function getDimensions(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): SourceDimensions {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

export function downsampleImage(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): HTMLCanvasElement {
  const { width: srcW, height: srcH } = getDimensions(source);
  if (srcW === 0 || srcH === 0) {
    throw new Error("downsampleImage: source dimensions are zero");
  }

  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge <= TARGET_LONG_EDGE ? 1 : TARGET_LONG_EDGE / longEdge;
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  // NOTE: willReadFrequently:true 시도했으나 일부 브라우저에서 canvas
  // 렌더링 path 변경 → 픽셀값 미세 차이 → HoughCircles 결과 변화 →
  // coin filter edge case 영향 (실측: |int-ext| 59 → 73 으로 변동, 70 임계
  // flip). 결정적 동작 우선 → 옵션 미사용. perf 경고는 차후 OpenCV
  // 내부 canvas 처리 개선 시 함께 해결.
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("downsampleImage: 2d context unavailable");

  ctx.drawImage(source, 0, 0, dstW, dstH);
  return canvas;
}

export const _internalForTests = { TARGET_LONG_EDGE };
