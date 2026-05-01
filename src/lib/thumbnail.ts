/**
 * Thumbnail 생성 — frame canvas → JPEG Blob.
 *
 * 결과 카드 + 측정 기록 리스트에 표시. ~50KB 목표.
 */

const DEFAULT_MAX_SIZE = 320;
const DEFAULT_QUALITY = 0.7;

export async function makeThumbnail(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  maxSize = DEFAULT_MAX_SIZE,
  quality = DEFAULT_QUALITY,
): Promise<Blob> {
  const { width, height } = getDimensions(source);
  if (width === 0 || height === 0) {
    throw new Error("makeThumbnail: source dimensions are zero");
  }

  const longEdge = Math.max(width, height);
  const scale = longEdge <= maxSize ? 1 : maxSize / longEdge;
  const dstW = Math.round(width * scale);
  const dstH = Math.round(height * scale);

  const dst = document.createElement("canvas");
  dst.width = dstW;
  dst.height = dstH;
  const ctx = dst.getContext("2d");
  if (!ctx) throw new Error("makeThumbnail: 2d context unavailable");
  ctx.drawImage(source, 0, 0, dstW, dstH);

  return new Promise((resolve, reject) => {
    dst.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("makeThumbnail: toBlob returned null"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function getDimensions(
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
): { width: number; height: number } {
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
