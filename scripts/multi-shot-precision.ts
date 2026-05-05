/**
 * **Multi-shot precision 실측** — 같은 분쇄도 N장 평균 시 D50 std 가 √N 으로
 * 줄어드는지 fixture 데이터로 실증.
 *
 * 사용:
 *   npx tsx scripts/multi-shot-precision.ts
 *
 * 절차:
 *  1. 14장 multi-shot fixture 모두 통과 (10 success)
 *  2. 단일 shot N개의 D50 분포 → σ_single
 *  3. K shot subset 무작위 추출 → combineStats() → averaged D50
 *  4. 다양한 K (1, 2, 3, 5, 7, 10) 에 대해 100번 반복 → σ_K
 *  5. 이론값 (σ_single / √K) vs 실측 σ_K 비교
 *
 * 이론 검증: 평균값의 표준오차 = σ / √N (Central Limit Theorem).
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { glob } from "node:fs/promises";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_DIR = "fixtures/multi-shot-2026-05-05";

interface ShotStats {
  file: string;
  d10: number;
  d50: number;
  d90: number;
  uniformity: number;
  diameters: number[];
  totalAreaMm2: number;
  finesPercent: number;
  particleCount: number;
  boulders: { count: number; totalAreaMm2: number; areaRatio: number };
  clumps: { count: number; totalAreaMm2: number; areaRatio: number };
}

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
  // @ts-expect-error polyfill
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
  return dom;
}

async function decodeToCanvas(
  fixturePath: string,
  dom: JSDOM,
): Promise<HTMLCanvasElement> {
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
  const { data } = await image
    .resize(dstW, dstH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // @ts-expect-error polyfill
  const ImageData = globalThis.ImageData as typeof globalThis.ImageData;
  const imageData = new ImageData(new Uint8ClampedArray(data), dstW, dstH);
  const stub = (target: { width: number; height: number }) => ({
    drawImage: () => {},
    getImageData: () => imageData,
    putImageData: () => {},
    fillRect: () => {},
    fillStyle: "",
    canvas: target,
  });
  // @ts-expect-error polyfill
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    // @ts-expect-error polyfill
    return stub(this);
  };
  const canvas = dom.window.document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  // @ts-expect-error
  return canvas;
}

function stat(arr: number[]) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance =
    arr.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  return { n, mean, std: Math.sqrt(variance) };
}

// Random K-subset of array (0..N-1 indices)
function randSubset(N: number, K: number): number[] {
  const idx = Array.from({ length: N }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, K);
}

async function main() {
  const dom = await setupGlobals();

  const dir = resolve(ROOT, FIXTURE_DIR);
  const files: string[] = [];
  for await (const f of glob(`${dir}/*.jpeg`)) files.push(f);
  files.sort();
  console.log(`[multi-shot] ${files.length} files in ${FIXTURE_DIR}`);

  const pipelineMod = await import(resolve(ROOT, "src/opencv/pipeline.ts"));
  const statsMod = await import(resolve(ROOT, "src/opencv/statistics.ts"));

  // Pass 1: 모든 사진 측정해서 stats 수집
  const all: ShotStats[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = basename(f);
    process.stdout.write(`[${i + 1}/${files.length}] ${name} ... `);
    try {
      const canvas = await decodeToCanvas(f, dom);
      const ac = new AbortController();
      const result = await pipelineMod.runPipeline(
        canvas,
        "500",
        ac.signal,
        { onProgress: () => {} },
        null,
      );
      all.push({
        file: name,
        d10: result.stats.d10,
        d50: result.stats.d50,
        d90: result.stats.d90,
        uniformity: result.stats.uniformity,
        diameters: result.stats.diameters,
        totalAreaMm2: result.stats.totalAreaMm2,
        finesPercent: result.stats.finesPercent,
        particleCount: result.stats.particleCount,
        boulders: result.stats.boulders,
        clumps: result.stats.clumps,
      });
      console.log(`D50=${result.stats.d50.toFixed(0)}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "kind" in err
          ? `${(err as { kind: string }).kind}`
          : err instanceof Error
            ? err.message
            : String(err);
      console.log(`SKIP (${msg})`);
    }
  }

  console.log(
    `\n=== Pass 1: ${all.length} shots succeeded (single-shot baseline) ===`,
  );

  // 단일 shot 통계
  const singleD50s = all.map((s) => s.d50);
  const singleD90s = all.map((s) => s.d90);
  const singleD10s = all.map((s) => s.d10);
  const sd50 = stat(singleD50s);
  const sd90 = stat(singleD90s);
  const sd10 = stat(singleD10s);
  console.log(
    `  D50: mean=${sd50.mean.toFixed(1)} σ=${sd50.std.toFixed(1)} (실측 single-shot std)`,
  );
  console.log(
    `  D10: mean=${sd10.mean.toFixed(1)} σ=${sd10.std.toFixed(1)}`,
  );
  console.log(
    `  D90: mean=${sd90.mean.toFixed(1)} σ=${sd90.std.toFixed(1)}`,
  );

  // Pass 2: K-shot averaging — Monte Carlo 1000회 반복
  console.log(`\n=== Pass 2: Multi-shot averaging (Monte Carlo n=1000) ===`);
  console.log(
    `K   theoretical_σ   measured_σ   measured_mean   confidence_band`,
  );
  console.log(
    `---  ------------   ----------   -------------   ---------------`,
  );

  const Ks = [1, 2, 3, 5, 7, 10].filter((k) => k <= all.length);
  for (const K of Ks) {
    const trials = 1000;
    const d50Means: number[] = [];
    for (let t = 0; t < trials; t++) {
      const subset = randSubset(all.length, K).map((i) => all[i]);
      const combined = statsMod.combineStats(subset);
      d50Means.push(combined.d50);
    }
    const m = stat(d50Means);
    const theoretical = sd50.std / Math.sqrt(K);
    const band = statsMod.computeConfidenceBand(K);
    console.log(
      `${K.toString().padStart(2)}    ` +
        `±${theoretical.toFixed(1).padStart(5)}µm     ` +
        `±${m.std.toFixed(1).padStart(5)}µm     ` +
        `${m.mean.toFixed(1).padStart(7)}µm        ` +
        `±${band.d50Pm}µm (UI 표시값)`,
    );
  }

  // Pass 3: 모든 10장 합친 best-effort 결과
  console.log(`\n=== Pass 3: All ${all.length} shots combined (final precision) ===`);
  const combinedAll = statsMod.combineStats(all);
  console.log(
    `  Combined D50: ${combinedAll.d50.toFixed(1)}µm ` +
      `(particleCount=${combinedAll.particleCount})`,
  );
  console.log(
    `  Combined D90: ${combinedAll.d90.toFixed(1)}µm`,
  );
  console.log(
    `  Combined uniformity: ${combinedAll.uniformity.toFixed(2)}`,
  );
  console.log(
    `  Combined boulders: ${combinedAll.boulders.count}개 (${combinedAll.boulders.areaRatio.toFixed(1)}%)`,
  );
  console.log(
    `  Combined clumps: ${combinedAll.clumps.count}개 (${combinedAll.clumps.areaRatio.toFixed(1)}%)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
