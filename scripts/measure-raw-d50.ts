/**
 * measure-raw-d50 — sieve calibration anchor 등록용 raw image-space D50 측정.
 *
 * production pipeline 과 *별개* — `applyImageToSieveCalibration` 호출 전
 * `computeStats` 출력만 그대로 출력한다. anchor 등록 작업의 awkward 흐름
 * (defaultRatio 임시 변경 후 원복) 을 단일 명령으로 단순화.
 *
 * production 측정 결과에 영향 0 — 이 스크립트는 읽기 전용 진단 도구.
 *
 * 사용법:
 *   npx tsx scripts/measure-raw-d50.ts <image-path> <coinType> [hintX hintY]
 *
 *   <coinType>      : "100" 또는 "500"
 *   [hintX hintY]   : (선택) 0~1 상대 좌표. 사용자 탭 위치 시뮬레이션. 미지정 시 자동 검출.
 *
 * 예:
 *   npx tsx scripts/measure-raw-d50.ts ./fixtures/test-vs3-11.jpg 500
 *
 * 출력: anchor 등록용 JSON 템플릿 + 진단 정보. targetD50um 만 채워서
 *       src/opencv/calibration-data.json 의 anchors 배열에 추가.
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

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

  const opencvCode = await fs.readFile(
    resolve(ROOT, "public/opencv.js"),
    "utf8",
  );
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
  const rotated = meta.orientation !== undefined && meta.orientation >= 5;
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
  const path = process.argv[2];
  const coinType = process.argv[3] as "100" | "500";
  const hintX = process.argv[4] ? parseFloat(process.argv[4]) : null;
  const hintY = process.argv[5] ? parseFloat(process.argv[5]) : null;
  if (!path || (coinType !== "100" && coinType !== "500")) {
    console.error(
      "usage: measure-raw-d50.ts <image-path> <100|500> [hintX hintY]",
    );
    process.exit(2);
  }

  const dom = await setupGlobals();

  // production pipeline 과 *동일* 모듈 import — calibration 직전 단계까지만.
  const { detectCoin } = await import(
    resolve(ROOT, "src/opencv/coin-detect.ts")
  );
  const { segmentParticles } = await import(
    resolve(ROOT, "src/opencv/particle-segment.ts")
  );
  const { computeStats } = await import(resolve(ROOT, "src/opencv/statistics.ts"));

  const canvas = await decodeToCanvas(resolve(ROOT, path), dom);
  const hint =
    hintX !== null && hintY !== null ? { x: hintX, y: hintY } : null;

  const coin = await detectCoin(canvas, coinType, hint);
  const segmentation = await segmentParticles(canvas, coin);
  // **핵심**: applyImageToSieveCalibration 호출 안 함 — raw image-space stats
  const rawStats = computeStats(segmentation.contours, coin.mmPerPixel);

  // anchor 등록용 JSON 템플릿
  const filename = basename(path);
  const label = filename.replace(/\.\w+$/, "");
  const template = {
    label: `<grinder@setting (${label})>`,
    rawD50um: Math.round(rawStats.d50),
    targetD50um: 0,
    notes: `${filename}, mmPerPx=${coin.mmPerPixel.toFixed(4)}, count=${rawStats.particleCount}, ${new Date().toISOString().slice(0, 10)}`,
  };

  console.log(`\n=== Raw image-space measurement (calibration 미적용) ===`);
  console.log(`  fixture       : ${filename}`);
  console.log(`  coin r        : ${coin.radiusPx.toFixed(1)}px`);
  console.log(`  mmPerPx       : ${coin.mmPerPixel.toFixed(4)}`);
  console.log(`  particle 개수 : ${rawStats.particleCount}`);
  console.log(`  raw D10       : ${Math.round(rawStats.d10)}μm`);
  console.log(`  raw D50       : ${Math.round(rawStats.d50)}μm  ← anchor rawD50um`);
  console.log(`  raw D90       : ${Math.round(rawStats.d90)}μm`);
  console.log(`  uniformity    : ${rawStats.uniformity.toFixed(2)}`);
  console.log(`  fines%        : ${rawStats.finesPercent.toFixed(1)}%`);

  console.log(`\n=== anchor 등록 템플릿 ===`);
  console.log(`# 1) sieve 분급으로 fraction 의 평균 직경 결정 (e.g., #30~#35 사이 → 550μm)`);
  console.log(`# 2) 아래 JSON 의 "label" 과 "targetD50um" 을 채움`);
  console.log(`# 3) src/opencv/calibration-data.json 의 anchors 배열에 추가`);
  console.log(JSON.stringify(template, null, 2));
  console.log("");

  if (rawStats.particleCount < 100) {
    console.warn(
      `⚠️  입자 수 ${rawStats.particleCount} 개 < 권장 100. 통계 신뢰도 낮음 — 입자 양 늘려 재촬영 권장.`,
    );
  }
  if (coin.mmPerPixel > 0.20) {
    console.warn(
      `⚠️  mmPerPx ${coin.mmPerPixel.toFixed(3)} > 0.20 (코인 작게 찍힘). 미세 입자 검출 한계 — 가까이 촬영 권장.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
