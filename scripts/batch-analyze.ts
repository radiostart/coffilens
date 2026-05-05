/**
 * batch-analyze — 동일 분쇄도 다각도 사진 N장을 일괄 측정하고 분산 분석.
 *
 * 사용법:
 *   npx tsx scripts/batch-analyze.ts <glob-or-directory> [coinType]
 * 예) npx tsx scripts/batch-analyze.ts "~/Downloads/KakaoTalk_Photo_2026-05-05-14-10-*.jpeg" 500
 *
 * 출력: 각 사진의 D10/D50/D90/uniformity/fines% + 그룹 통계 (mean, std, CoV).
 *
 * 구조: tune-pipeline.ts 의 OpenCV/jsdom 셋업을 재사용. WASM 1회 로드 + N회 측정.
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { glob } from "node:fs/promises";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

interface ShotResult {
  file: string;
  ok: boolean;
  error?: string;
  coinRadiusPx?: number;
  mmPerPx?: number;
  particleCount?: number;
  d10?: number;
  d50?: number;
  d90?: number;
  uniformity?: number;
  finesPercent?: number;
  totalAreaMm2?: number;
  durationMs?: number;
  // Phase 1 — boulder/clump 분리 회귀 metric.
  boulderCount?: number;
  boulderAreaPct?: number;
  clumpCount?: number;
  clumpAreaPct?: number;
}

async function expandGlob(input: string): Promise<string[]> {
  const expanded = input.replace(/^~/, process.env.HOME ?? "");
  // simple glob via fs.glob (Node 22+)
  if (expanded.includes("*") || expanded.includes("?")) {
    const out: string[] = [];
    for await (const f of glob(expanded)) out.push(f);
    return out.sort();
  }
  const stat = await fs.stat(expanded);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(expanded);
    return entries
      .filter((n) => /\.(jpe?g|png)$/i.test(n))
      .map((n) => resolve(expanded, n))
      .sort();
  }
  return [expanded];
}

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

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error("usage: batch-analyze.ts <glob-or-dir> [coinType]");
    process.exit(2);
  }
  const coinType = (process.argv[3] ?? "500") as "100" | "500";

  const files = await expandGlob(inputArg);
  if (files.length === 0) {
    console.error(`no files matched: ${inputArg}`);
    process.exit(2);
  }
  console.log(`[batch] ${files.length} files matched, coinType=${coinType}`);

  const { dom, loadCv } = await setupGlobals();
  console.log(`[batch] loading OpenCV...`);
  await loadCv();
  console.log(`[batch] OpenCV ready`);

  const pipelineMod = await import(resolve(ROOT, "src/opencv/pipeline.ts"));

  const results: ShotResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = basename(f);
    process.stdout.write(`[${i + 1}/${files.length}] ${name} ... `);
    try {
      const canvas = await decodeImageToCanvas(f, dom);
      const ac = new AbortController();
      const result = await pipelineMod.runPipeline(
        canvas,
        coinType,
        ac.signal,
        { onProgress: () => {} },
        null,
      );
      const r: ShotResult = {
        file: name,
        ok: true,
        coinRadiusPx: result.coin.radiusPx,
        mmPerPx: result.coin.mmPerPixel,
        particleCount: result.stats.particleCount,
        d10: result.stats.d10,
        d50: result.stats.d50,
        d90: result.stats.d90,
        uniformity: result.stats.uniformity,
        finesPercent: result.stats.finesPercent,
        totalAreaMm2: result.stats.totalAreaMm2,
        durationMs: Math.round(result.durationMs),
        boulderCount: result.stats.boulders.count,
        boulderAreaPct: result.stats.boulders.areaRatio,
        clumpCount: result.stats.clumps.count,
        clumpAreaPct: result.stats.clumps.areaRatio,
      };
      results.push(r);
      console.log(
        `D50=${r.d50?.toFixed(0)}µm count=${r.particleCount} fines=${r.finesPercent?.toFixed(1)}% ` +
          `boulder=${r.boulderCount}(${r.boulderAreaPct?.toFixed(1)}%) ` +
          `clump=${r.clumpCount}(${r.clumpAreaPct?.toFixed(1)}%) (${r.durationMs}ms)`,
      );
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "kind" in err
          ? `${(err as { kind: string }).kind}`
          : err instanceof Error
            ? err.message
            : String(err);
      results.push({ file: name, ok: false, error: msg });
      console.log(`ERROR: ${msg}`);
    }
  }

  // Summary
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY ===`);
  console.log(`success: ${ok.length}/${results.length}`);
  if (fail.length) {
    console.log(`failed: ${fail.length}`);
    for (const f of fail) console.log(`  ${f.file}: ${f.error}`);
  }

  if (ok.length === 0) {
    process.exit(1);
  }

  function stat(arr: number[]) {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance =
      arr.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
    const std = Math.sqrt(variance);
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const cov = mean !== 0 ? (std / mean) * 100 : 0;
    return { n, mean, std, min, max, cov };
  }

  const fields: Array<keyof ShotResult> = [
    "coinRadiusPx",
    "mmPerPx",
    "particleCount",
    "d10",
    "d50",
    "d90",
    "uniformity",
    "finesPercent",
    "totalAreaMm2",
    "boulderCount",
    "boulderAreaPct",
    "clumpCount",
    "clumpAreaPct",
  ];
  console.log(`\n=== METRICS (n=${ok.length}) ===`);
  console.log(`field                  mean        std       min       max      CoV%`);
  for (const f of fields) {
    const vals = ok
      .map((r) => r[f] as number | undefined)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) continue;
    const s = stat(vals);
    const fmt = (x: number) =>
      Math.abs(x) < 1 ? x.toFixed(4) : x.toFixed(1);
    console.log(
      `${f.padEnd(22)} ${fmt(s.mean).padStart(8)}  ${fmt(s.std).padStart(8)}  ${fmt(s.min).padStart(8)}  ${fmt(s.max).padStart(8)}  ${s.cov.toFixed(1).padStart(6)}`,
    );
  }

  // Per-shot table
  console.log(`\n=== PER-SHOT ===`);
  console.log(
    `file                                            mmPerPx   D10    D50    D90   uni  fines%  count  bld(area%)  clmp(area%)`,
  );
  for (const r of ok) {
    if (
      r.mmPerPx === undefined ||
      r.d50 === undefined ||
      r.d10 === undefined ||
      r.d90 === undefined ||
      r.uniformity === undefined ||
      r.finesPercent === undefined ||
      r.particleCount === undefined
    )
      continue;
    const bld = `${r.boulderCount ?? 0}(${(r.boulderAreaPct ?? 0).toFixed(1)}%)`;
    const clmp = `${r.clumpCount ?? 0}(${(r.clumpAreaPct ?? 0).toFixed(1)}%)`;
    console.log(
      `${r.file.padEnd(46)} ${r.mmPerPx.toFixed(4)}  ${r.d10.toFixed(0).padStart(4)}  ${r.d50.toFixed(0).padStart(4)}  ${r.d90.toFixed(0).padStart(4)}  ${r.uniformity.toFixed(2)}  ${r.finesPercent.toFixed(1).padStart(5)}  ${r.particleCount.toString().padStart(5)}  ${bld.padStart(10)}  ${clmp.padStart(10)}`,
    );
  }

  // JSON output for downstream tooling
  const outPath = resolve(ROOT, ".gstack/batch-analyze-result.json");
  await fs.mkdir(resolve(ROOT, ".gstack"), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\n[batch] full JSON written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
