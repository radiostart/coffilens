/**
 * verify-shadow-detect — `detectPartialShadow` 가 fixture 들을 올바르게 분류하는지 검증.
 *
 * 사용법:
 *   npx tsx scripts/verify-shadow-detect.ts
 *
 * 입력:
 *   shadow positive: fixtures/shadow-2026-05-08/*.jpeg
 *   shadow negative: fixtures/test-vs3-100.jpg, test-vs3-09.jpg, test-vs3-11.jpg, test-vs3-13.jpg
 *
 * 출력: 각 사진의 evennessRatio, darkClusterSize, hasShadow 분류 + 분류 정확도.
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

async function setupGlobals(): Promise<{
  dom: JSDOM;
  loadCv: () => Promise<void>;
}> {
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
    const requirePolyfill = (id: string) => {
      if (id === "fs") return fs;
      if (id === "path") return { resolve, basename };
      if (id === "crypto") return {};
      return {};
    };
    const factory = new Function(
      "module",
      "exports",
      "require",
      opencvCode + "\nreturn module.exports;",
    );
    const moduleObj: { exports: unknown } = { exports: {} };
    factory(moduleObj, moduleObj.exports, requirePolyfill);
    // @ts-expect-error global cv
    globalThis.cv = moduleObj.exports;

    await new Promise<void>((res, rej) => {
      const start = Date.now();
      const check = setInterval(() => {
        // @ts-expect-error polyfill
        const cv = globalThis.cv;
        if (cv && typeof cv.Mat === "function") {
          clearInterval(check);
          res();
          return;
        }
        if (Date.now() - start > 30_000) {
          clearInterval(check);
          rej(new Error("OpenCV runtime init timeout (30s)"));
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

async function decodeImageToCanvas(
  fixturePath: string,
  dom: JSDOM,
): Promise<HTMLCanvasElement> {
  const image = sharp(fixturePath).rotate();
  const rawMeta = await sharp(fixturePath).metadata();
  const isRotatedQuarterTurn =
    rawMeta.orientation !== undefined && rawMeta.orientation >= 5;
  const postW = isRotatedQuarterTurn ? rawMeta.height! : rawMeta.width!;
  const postH = isRotatedQuarterTurn ? rawMeta.width! : rawMeta.height!;

  const TARGET = 1280;
  const longEdge = Math.max(postW, postH);
  const scale = longEdge <= TARGET ? 1 : TARGET / longEdge;
  const dstW = Math.round(postW * scale);
  const dstH = Math.round(postH * scale);

  const { data } = await image
    .resize(dstW, dstH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // @ts-expect-error polyfill
  const ImageData = globalThis.ImageData as typeof globalThis.ImageData;
  const imageData = new ImageData(new Uint8ClampedArray(data), dstW, dstH);

  const stubCtxFactory = (
    targetCanvas: { width: number; height: number },
  ) => ({
    drawImage: () => {},
    getImageData: () => imageData,
    putImageData: () => {},
    fillRect: () => {},
    fillStyle: "",
    canvas: targetCanvas,
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

interface Sample {
  path: string;
  expected: boolean; // true = shadow, false = no shadow
}

async function main() {
  const samples: Sample[] = [
    { path: "fixtures/shadow-2026-05-08/shadow-001.jpeg", expected: true },
    { path: "fixtures/shadow-2026-05-08/shadow-002.jpeg", expected: true },
    { path: "fixtures/shadow-2026-05-09/fail-001.jpeg", expected: true },
    { path: "fixtures/shadow-2026-05-09/fail-002.jpeg", expected: true },
    { path: "fixtures/shadow-2026-05-09/fail-003.jpeg", expected: true },
    { path: "fixtures/test-vs3-100.jpg", expected: false },
    { path: "fixtures/test-vs3-09.jpg", expected: false },
    { path: "fixtures/test-vs3-11.jpg", expected: false },
    { path: "fixtures/test-vs3-13.jpg", expected: false },
    { path: "fixtures/test-500-fine.jpg", expected: false },
  ];

  const { dom, loadCv } = await setupGlobals();
  console.log(`[shadow-verify] loading OpenCV...`);
  await loadCv();
  console.log(`[shadow-verify] OpenCV ready\n`);

  const shadowMod = await import(resolve(ROOT, "src/opencv/shadow-detect.ts"));

  console.log(
    `file                                         expected  evenness  darkest  brightest  cluster  predict   ${"correct?".padEnd(8)}`,
  );
  let correct = 0;
  for (const s of samples) {
    const fullPath = resolve(ROOT, s.path);
    try {
      const canvas = await decodeImageToCanvas(fullPath, dom);
      const report = await shadowMod.detectPartialShadow(canvas);
      const ok = report.hasShadow === s.expected;
      if (ok) correct++;
      const name = basename(s.path).padEnd(45);
      console.log(
        `${name}${(s.expected ? "Y" : "N").padEnd(10)}${report.evennessRatio.toFixed(3).padStart(8)}  ${report.darkestCellMean.toFixed(0).padStart(7)}  ${report.brightestCellMean.toFixed(0).padStart(9)}  ${report.darkClusterSize.toString().padStart(7)}  ${(report.hasShadow ? "Y" : "N").padEnd(8)} ${ok ? "✓" : "✗"}`,
      );
      if (process.env.DUMP_GRID) {
        for (const row of report.cellMeans ?? []) {
          console.log(
            `   ` + row.map((v: number) => v.toFixed(0).padStart(4)).join(" "),
          );
        }
      }
    } catch (e) {
      console.log(`${s.path}: ERROR ${e}`);
    }
  }
  console.log(`\nAccuracy: ${correct}/${samples.length}`);
  if (correct < samples.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
