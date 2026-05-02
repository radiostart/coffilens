/**
 * canvas → cv.Mat 변환 helper.
 *
 * **왜 필요한가**: OpenCV.js 의 `cv.imread(canvas)` 는 내부적으로
 * `imageSource instanceof HTMLCanvasElement || HTMLImageElement` 체크 후
 * 통과하지 않으면 `"imageSource should be canvas or img element"` 에러를
 * throw. Worker context 에서 OffscreenCanvas 는 이 체크 통과 못 함 →
 * cv.imread 사용 불가.
 *
 * **해결**: HTMLCanvasElement 면 cv.imread (기존 동작 유지 + 테스트 호환),
 * OffscreenCanvas 면 getImageData 후 cv.matFromImageData (worker 호환).
 */

interface CvMat {
  delete(): void;
  rows: number;
  cols: number;
  data: Uint8Array;
}

declare const cv: {
  imread?: (canvas: HTMLCanvasElement | OffscreenCanvas) => CvMat;
  matFromImageData?: (imageData: ImageData) => CvMat;
};

export function imreadFromCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CvMat {
  // Main thread (HTMLCanvasElement) — cv.imread 그대로 사용. 테스트 mock 호환.
  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement &&
    typeof cv.imread === "function"
  ) {
    return cv.imread(canvas);
  }

  // Worker context (OffscreenCanvas) — getImageData → matFromImageData.
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("imreadFromCanvas: 2d context unavailable");
  if (typeof cv.matFromImageData !== "function") {
    throw new Error("imreadFromCanvas: cv.matFromImageData unavailable");
  }
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return cv.matFromImageData(imageData);
}
