/**
 * diagnose-shadow — 그림자 contour 영향 진단 (Step 1, 변경 없음).
 *
 * 가설: adaptive threshold 가 grayscale 입력에서 입자 + 그림자를 한 contour 로
 * 잡는다. saturation 채널 (HSV S) 은 그림자(무채색) 를 구분 못하지만 입자(갈색,
 * saturated) 만 잡혀 그림자 분리가 가능할 것.
 *
 * 측정:
 *  - 두 채널 (gray vs saturation) 로 동일 adaptive threshold 적용
 *  - 결과 contour 개수 / 총 면적 비교
 *  - gray contour 마다 saturation 매칭 → 면적 ratio + centroid offset 분포
 *
 * 사용법:
 *   npx tsx scripts/diagnose-shadow.ts <image-path> [coinType=500]
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

interface CvMat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32S: Int32Array;
  delete(): void;
  type(): number;
  channels(): number;
}
interface CvMatVector {
  size(): number;
  get(i: number): CvMat;
  delete(): void;
}

async function setupGlobals(): Promise<{ dom: JSDOM; loadCv: () => Promise<void> }> {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  // @ts-expect-error polyfill
  globalThis.window = dom.window;
  // @ts-expect-error polyfill
  globalThis.document = dom.window.document;
  // @ts-expect-error polyfill
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  // @ts-expect-error polyfill
  globalThis.HTMLImageElement = dom.window.HTMLImageElement;
  // @ts-expect-error polyfill
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;

  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = "srgb" as const;
    constructor(data: Uint8ClampedArray, w: number, h: number) {
      this.data = data;
      this.width = w;
      this.height = h;
    }
  }
  // @ts-expect-error polyfill
  globalThis.ImageData = ImageDataPolyfill;
  // @ts-expect-error polyfill
  dom.window.ImageData = ImageDataPolyfill;

  const loadCv = async () => {
    const opencvPath = resolve(ROOT, "public/opencv.js");
    const opencvCode = await fs.readFile(opencvPath, "utf8");
    const requirePolyfill = () => ({});
    const factory = new Function(
      "module",
      "exports",
      "require",
      opencvCode + "\nreturn module.exports;",
    );
    const moduleObj: { exports: unknown } = { exports: {} };
    factory(moduleObj, moduleObj.exports, requirePolyfill);
    // @ts-expect-error polyfill
    globalThis.cv = moduleObj.exports;
    await new Promise<void>((res, rej) => {
      const start = Date.now();
      const check = setInterval(() => {
        // @ts-expect-error polyfill
        if (globalThis.cv?.Mat && typeof globalThis.cv.Mat === "function") {
          clearInterval(check);
          res();
          return;
        }
        if (Date.now() - start > 30_000) {
          clearInterval(check);
          rej(new Error("OpenCV init timeout"));
        }
      }, 50);
      // @ts-expect-error polyfill
      if (globalThis.cv) {
        // @ts-expect-error polyfill
        globalThis.cv.onRuntimeInitialized = () => {
          clearInterval(check);
          res();
        };
      }
    });
  };
  return { dom, loadCv };
}

async function decodeImageToCanvas(fixturePath: string, dom: JSDOM): Promise<HTMLCanvasElement> {
  const image = sharp(fixturePath).rotate();
  const rawMeta = await sharp(fixturePath).metadata();
  const isRotated = rawMeta.orientation !== undefined && rawMeta.orientation >= 5;
  const postW = isRotated ? rawMeta.height! : rawMeta.width!;
  const postH = isRotated ? rawMeta.width! : rawMeta.height!;

  const TARGET = 1280;
  const longEdge = Math.max(postW, postH);
  const scale = longEdge <= TARGET ? 1 : TARGET / longEdge;
  const dstW = Math.round(postW * scale);
  const dstH = Math.round(postH * scale);

  const { data } = await image.resize(dstW, dstH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // @ts-expect-error polyfill
  const ImageData = globalThis.ImageData;
  const imageData = new ImageData(new Uint8ClampedArray(data), dstW, dstH);

  const stubCtxFactory = (target: { width: number; height: number }) => ({
    drawImage: () => {},
    getImageData: () => imageData,
    putImageData: () => {},
    canvas: target,
  });
  // @ts-expect-error polyfill
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    // @ts-expect-error polyfill
    return stubCtxFactory(this);
  };
  const canvas = dom.window.document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  // @ts-expect-error polyfill
  return canvas;
}

interface ContourMetrics {
  count: number;
  totalArea: number;
  centroids: Array<{ cx: number; cy: number; area: number }>;
}

function extractContours(binary: CvMat): ContourMetrics {
  // @ts-expect-error polyfill
  const cv = globalThis.cv;
  const contours = new cv.MatVector() as CvMatVector;
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const result: ContourMetrics = { count: 0, totalArea: 0, centroids: [] };
  const n = contours.size();
  for (let i = 0; i < n; i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area < 2) {
      try {
        c.delete();
      } catch {
        /* ignore */
      }
      continue;
    }
    const m = cv.moments(c);
    if (m.m00 > 0) {
      result.centroids.push({ cx: m.m10 / m.m00, cy: m.m01 / m.m00, area });
    }
    result.count++;
    result.totalArea += area;
    try {
      c.delete();
    } catch {
      /* ignore */
    }
  }
  contours.delete();
  hierarchy.delete();
  return result;
}

async function main() {
  const fixture = process.argv[2];
  const coinType = (process.argv[3] ?? "500") as "100" | "500";
  if (!fixture) {
    console.error("usage: diagnose-shadow.ts <image-path> [coinType]");
    process.exit(2);
  }

  const { dom, loadCv } = await setupGlobals();
  console.log(`[diag] loading OpenCV...`);
  await loadCv();
  console.log(`[diag] OpenCV ready`);

  const canvas = await decodeImageToCanvas(fixture, dom);
  console.log(`[diag] image: ${basename(fixture)} (${canvas.width}x${canvas.height})`);

  const coinMod = await import(resolve(ROOT, "src/opencv/coin-detect.ts"));
  const coin = await coinMod.detectCoin(canvas, coinType);
  console.log(
    `[diag] coin: r=${coin.radiusPx.toFixed(1)} @(${coin.centerX.toFixed(0)},${coin.centerY.toFixed(0)}) mmPerPx=${coin.mmPerPixel.toFixed(4)}`,
  );

  // @ts-expect-error polyfill
  const cv = globalThis.cv;
  const canvasMod = await import(resolve(ROOT, "src/opencv/canvas-mat.ts"));
  const src = canvasMod.imreadFromCanvas(canvas);

  // 동전 mask
  const MASK_MARGIN_MM = 5;
  const marginPx = MASK_MARGIN_MM / coin.mmPerPixel;
  const maskRadius = Math.round(coin.radiusPx + marginPx);
  const coinMask = cv.Mat.ones(src.rows, src.cols, cv.CV_8U);
  cv.circle(coinMask, new cv.Point(coin.centerX, coin.centerY), maskRadius, new cv.Scalar(0), -1);

  const blockSize = Math.round((src.rows / 1280) * 21) | 1;
  const ADAPT_C = 7;

  // [Channel A] grayscale
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const grayBin = new cv.Mat();
  cv.adaptiveThreshold(
    gray,
    grayBin,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    blockSize,
    ADAPT_C,
  );
  const grayMasked = new cv.Mat();
  cv.bitwise_and(grayBin, grayBin, grayMasked, coinMask);
  const grayContours = extractContours(grayMasked);

  // [Channel B] saturation (HSV S)
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const channels = new cv.MatVector();
  cv.split(hsv, channels);
  const sat = channels.get(1); // S 채널
  // saturation 은 입자(brown) > shadow(0). 임계 이상을 입자로 → INV 안 함, BINARY 사용.
  // 다만 일관성 위해 invert 한 후 동일 INV 처리 — 255 - sat 적용.
  const satInv = new cv.Mat();
  cv.bitwise_not(sat, satInv);
  // satInv: low S (shadow/napkin) → 높은 값, high S (coffee) → 낮은 값. adaptive
  // threshold INV 로 "낮은 값" = coffee 픽셀 추출.
  const satBin = new cv.Mat();
  cv.adaptiveThreshold(
    satInv,
    satBin,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    blockSize,
    ADAPT_C,
  );
  const satMasked = new cv.Mat();
  cv.bitwise_and(satBin, satBin, satMasked, coinMask);
  const satContours = extractContours(satMasked);

  console.log(`\n[Result]`);
  console.log(
    `gray:      contours=${grayContours.count} totalArea=${Math.round(grayContours.totalArea)}px²`,
  );
  console.log(
    `sat:       contours=${satContours.count} totalArea=${Math.round(satContours.totalArea)}px²`,
  );
  console.log(
    `delta:     count ${(((satContours.count - grayContours.count) / Math.max(1, grayContours.count)) * 100).toFixed(1)}%, ` +
      `area ${(((satContours.totalArea - grayContours.totalArea) / Math.max(1, grayContours.totalArea)) * 100).toFixed(1)}%`,
  );

  // 매칭: gray contour 마다 가장 가까운 sat contour 찾고 면적/centroid 비교
  const RADIUS_PX = Math.round((src.rows / 1280) * 30); // 이미지 비례 매칭 반경
  let matched = 0;
  let totalCentroidShift = 0;
  let totalAreaRatio = 0;
  const shifts: number[] = [];
  const ratios: number[] = [];
  const unmatchedAreas: number[] = [];
  const matchedGrayAreas: number[] = [];
  let mergeCount = 0; // sat/gray > 1.5 — sat 이 인접 입자 합친 케이스
  for (const g of grayContours.centroids) {
    let best: { dist: number; cent: typeof g } | null = null;
    for (const s of satContours.centroids) {
      const d = Math.hypot(g.cx - s.cx, g.cy - s.cy);
      if (d < RADIUS_PX && (!best || d < best.dist)) {
        best = { dist: d, cent: s };
      }
    }
    if (best) {
      matched++;
      totalCentroidShift += best.dist;
      const ratio = best.cent.area / g.area;
      totalAreaRatio += ratio;
      shifts.push(best.dist);
      ratios.push(ratio);
      matchedGrayAreas.push(g.area);
      if (ratio > 1.5) mergeCount++;
    } else {
      unmatchedAreas.push(g.area);
    }
  }
  unmatchedAreas.sort((a, b) => a - b);
  matchedGrayAreas.sort((a, b) => a - b);
  shifts.sort((a, b) => a - b);
  ratios.sort((a, b) => a - b);
  const median = (xs: number[]) => (xs.length === 0 ? 0 : xs[Math.floor(xs.length / 2)]);

  console.log(
    `matched (within ${RADIUS_PX}px): ${matched}/${grayContours.count} ` +
      `(${((matched / Math.max(1, grayContours.count)) * 100).toFixed(0)}%)`,
  );
  if (matched > 0) {
    console.log(
      `centroid shift: mean=${(totalCentroidShift / matched).toFixed(2)}px median=${median(shifts).toFixed(2)}px max=${shifts[shifts.length - 1].toFixed(2)}px`,
    );
    console.log(
      `area sat/gray:  mean=${(totalAreaRatio / matched).toFixed(3)} median=${median(ratios).toFixed(3)} ` +
        `(<1 = sat 작음, 그림자 분리됨)`,
    );
    console.log(
      `merged contours (sat/gray > 1.5): ${mergeCount}/${matched} (${((mergeCount / matched) * 100).toFixed(1)}%)`,
    );
  }
  if (unmatchedAreas.length > 0) {
    const p25 = unmatchedAreas[Math.floor(unmatchedAreas.length * 0.25)];
    const p50 = median(unmatchedAreas);
    const p75 = unmatchedAreas[Math.floor(unmatchedAreas.length * 0.75)];
    const p90 = unmatchedAreas[Math.floor(unmatchedAreas.length * 0.9)];
    console.log(
      `unmatched gray (gray-only): n=${unmatchedAreas.length} ` +
        `area p25=${p25.toFixed(0)} p50=${p50.toFixed(0)} p75=${p75.toFixed(0)} p90=${p90.toFixed(0)}px²`,
    );
    // mmPerPx 환산해 µm 단위도 같이 (300µm 미분 임계 비교용)
    const mmPerPx = coin.mmPerPixel;
    const areaToUm = (a: number) => Math.sqrt(a / Math.PI) * 2 * mmPerPx * 1000;
    console.log(
      `  → diameter (equivalent circular): p25=${areaToUm(p25).toFixed(0)}µm p50=${areaToUm(p50).toFixed(0)}µm p75=${areaToUm(p75).toFixed(0)}µm p90=${areaToUm(p90).toFixed(0)}µm`,
    );
  }
  if (matchedGrayAreas.length > 0) {
    const p25 = matchedGrayAreas[Math.floor(matchedGrayAreas.length * 0.25)];
    const p50 = median(matchedGrayAreas);
    const p75 = matchedGrayAreas[Math.floor(matchedGrayAreas.length * 0.75)];
    console.log(
      `matched gray:   n=${matchedGrayAreas.length} ` +
        `area p25=${p25.toFixed(0)} p50=${p50.toFixed(0)} p75=${p75.toFixed(0)}px² (비교용)`,
    );
  }

  // 마지막에 모든 Mat 정리
  src.delete();
  coinMask.delete();
  gray.delete();
  grayBin.delete();
  grayMasked.delete();
  rgb.delete();
  hsv.delete();
  channels.delete();
  sat.delete();
  satInv.delete();
  satBin.delete();
  satMasked.delete();
}

main().catch((e) => {
  console.error("[diag] failed:", e);
  process.exit(1);
});
