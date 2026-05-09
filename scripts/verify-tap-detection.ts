/**
 * verify-tap-detection — 그림자 fixture 에 대해 hint(=Hough 가 찾은 코인 중심)
 * 를 주입했을 때 detectCoinFromHint 의 1D sweep 결과를 baseline (Hough) 와 비교.
 *
 * 시나리오:
 *  - "사용자가 정확히 코인 중심 탭" 시뮬레이션 (실제 UI 와 동일 경로)
 *  - shadow boundary edge 가 phantom 으로 잡히는 회귀가 1D sweep 에선 사라지는지 검증
 *
 * 사용법:
 *   npx tsx scripts/verify-tap-detection.ts
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

interface Fixture {
  path: string;
  coinType: "100" | "500";
  // baseline (Hough) 결과 — hint 좌표로 사용 + r 비교 기준
  baselineR: number;
  baselineCx: number;
  baselineCy: number;
}

const FIXTURES: Fixture[] = [
  // shadow-2026-05-08 (100원)
  {
    path: "fixtures/shadow-2026-05-08/shadow-001.jpeg",
    coinType: "100",
    baselineR: 122.8,
    baselineCx: 515,
    baselineCy: 1054,
  },
  {
    path: "fixtures/shadow-2026-05-08/shadow-002.jpeg",
    coinType: "100",
    baselineR: 142.8,
    baselineCx: 517,
    baselineCy: 1105,
  },
  // shadow-2026-05-09 (500원) — fail-003 가 사용자 보고 케이스
  {
    path: "fixtures/shadow-2026-05-09/fail-002.jpeg",
    coinType: "500",
    baselineR: 152.5,
    baselineCx: 656,
    baselineCy: 1031,
  },
  {
    path: "fixtures/shadow-2026-05-09/fail-003.jpeg",
    coinType: "500",
    baselineR: 152.8,
    baselineCx: 669,
    baselineCy: 1003,
  },
];

async function setupGlobals() {
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
    constructor(d: Uint8ClampedArray, w: number, h: number) {
      this.data = d;
      this.width = w;
      this.height = h;
    }
  }
  // @ts-expect-error polyfill
  globalThis.ImageData = ImageDataPolyfill;
  // @ts-expect-error polyfill
  dom.window.ImageData = ImageDataPolyfill;

  const opencvCode = await fs.readFile(resolve(ROOT, "public/opencv.js"), "utf8");
  const factory = new Function(
    "module",
    "exports",
    "require",
    opencvCode + "\nreturn module.exports;",
  );
  const moduleObj: { exports: unknown } = { exports: {} };
  factory(moduleObj, moduleObj.exports, (id: string) => {
    if (id === "fs") return fs;
    if (id === "path") return { resolve, basename };
    return {};
  });
  // @ts-expect-error global
  globalThis.cv = moduleObj.exports;
  await new Promise<void>((res, rej) => {
    const start = Date.now();
    const check = setInterval(() => {
      // @ts-expect-error
      const cv = globalThis.cv;
      if (cv && typeof cv.Mat === "function") {
        clearInterval(check);
        res();
        return;
      }
      if (Date.now() - start > 30000) {
        clearInterval(check);
        rej(new Error("cv timeout"));
      }
    }, 50);
    // @ts-expect-error
    if (globalThis.cv) {
      // @ts-expect-error
      globalThis.cv.onRuntimeInitialized = () => {
        clearInterval(check);
        res();
      };
    }
  });
  return dom;
}

async function decodeToCanvas(
  path: string,
  dom: JSDOM,
): Promise<HTMLCanvasElement> {
  const meta = await sharp(path).metadata();
  const rotated =
    meta.orientation !== undefined && meta.orientation >= 5;
  const postW = rotated ? meta.height! : meta.width!;
  const postH = rotated ? meta.width! : meta.height!;
  const TARGET = 1280;
  const longEdge = Math.max(postW, postH);
  const scale = longEdge <= TARGET ? 1 : TARGET / longEdge;
  const dstW = Math.round(postW * scale);
  const dstH = Math.round(postH * scale);
  const { data } = await sharp(path)
    .rotate()
    .resize(dstW, dstH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // @ts-expect-error
  const ImageData = globalThis.ImageData;
  const imageData = new ImageData(new Uint8ClampedArray(data), dstW, dstH);
  // @ts-expect-error polyfill
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: () => {},
      getImageData: () => imageData,
      putImageData: () => {},
      fillRect: () => {},
      // @ts-expect-error
      canvas: this,
    };
  };
  const canvas = dom.window.document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  // @ts-expect-error
  return canvas;
}

async function main() {
  const dom = await setupGlobals();
  const { detectCoin } = await import(resolve(ROOT, "src/opencv/coin-detect.ts"));
  console.log(
    `${"fixture".padEnd(36)}  scenario           baseline_r  hint_r  Δ`,
  );

  // 시나리오: 정확 탭 + off-center 탭 (사용자 실 탭 부정확성 시뮬레이션)
  const scenarios = [
    { label: "center", offsetX: 0, offsetY: 0 },
    { label: "off+30,+30", offsetX: 30, offsetY: 30 },
    { label: "off-30,-30", offsetX: -30, offsetY: -30 },
    { label: "off+50,0", offsetX: 50, offsetY: 0 },
  ];

  for (const fx of FIXTURES) {
    const canvas = await decodeToCanvas(resolve(ROOT, fx.path), dom);
    for (const sc of scenarios) {
      const cxPx = fx.baselineCx + sc.offsetX;
      const cyPx = fx.baselineCy + sc.offsetY;
      const hint = { x: cxPx / canvas.width, y: cyPx / canvas.height };
      try {
        const result = await detectCoin(canvas, fx.coinType, hint);
        const delta = result.radiusPx - fx.baselineR;
        console.log(
          `${basename(fx.path).padEnd(36)}  ${sc.label.padEnd(18)} ${fx.baselineR.toFixed(1).padStart(10)}  ${result.radiusPx.toFixed(1).padStart(6)}  ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)}`,
        );
      } catch (e: unknown) {
        const kind = (e as { kind?: string }).kind ?? String(e);
        console.log(
          `${basename(fx.path).padEnd(36)}  ${sc.label.padEnd(18)} ${fx.baselineR.toFixed(1).padStart(10)}  ERROR: ${kind}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
