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
  Mat: new (
    rows?: number,
    cols?: number,
    type?: number,
    data?: ArrayLike<number>,
  ) => CvMat;
  CV_8UC4?: number;
};

export function imreadFromCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CvMat {
  // Path 1: HTMLCanvasElement (main thread, 테스트) → cv.imread.
  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement &&
    typeof cv.imread === "function"
  ) {
    return cv.imread(canvas);
  }

  // Worker / OffscreenCanvas — ImageData 직접 추출.
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("imreadFromCanvas: 2d context unavailable");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Path 2: cv.matFromImageData (OpenCV.js 표준 API).
  if (typeof cv.matFromImageData === "function") {
    return cv.matFromImageData(imageData);
  }

  // Path 3: manual Mat 생성 (OpenCV.js 일부 빌드는 matFromImageData 미노출).
  // CV_8UC4 = 24. constants 가 init 전이거나 안 노출된 경우 hardcoded value 사용.
  const type = typeof cv.CV_8UC4 === "number" ? cv.CV_8UC4 : 24;
  const mat = new cv.Mat(imageData.height, imageData.width, type);
  mat.data.set(imageData.data);
  return mat;
}
