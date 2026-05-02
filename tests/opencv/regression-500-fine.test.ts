/**
 * regression-500-fine — 실 OpenCV.js + 실 fixture 로 파이프라인 검증.
 *
 * 기본 RUN_REAL_OPENCV 환경변수 미설정 시 skip — vitest 117 기본 스위트의
 * mock-only 흐름을 깨지 않음.
 *
 * 실행:
 *   RUN_REAL_OPENCV=1 npm test -- regression-500-fine
 *
 * 의도: tune-pipeline.ts 의 일회성 검증 결과를 회귀 테스트로 잠금.
 * fine grind + 500원 fixture 의 D50/입자수/동전크기를 보장.
 */

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const SHOULD_RUN = process.env.RUN_REAL_OPENCV === "1";

describe.skipIf(!SHOULD_RUN)("regression: test-500-fine.jpg", () => {
  it(
    "fine grind 500원 fixture 분석 결과 (coin/D50/particleCount)",
    async () => {
      const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
      Object.assign(globalThis, {
        window: dom.window,
        document: dom.window.document,
        HTMLCanvasElement: dom.window.HTMLCanvasElement,
        HTMLImageElement: dom.window.HTMLImageElement,
        HTMLVideoElement: dom.window.HTMLVideoElement,
        ImageData: dom.window.ImageData,
      });

      // 이미지 로드 + 다운샘플
      const fixturePath = resolve(ROOT, "fixtures/test-500-fine.jpg");
      const img = sharp(fixturePath).rotate();
      const meta = await img.metadata();
      const longEdge = Math.max(meta.width!, meta.height!);
      const scale = longEdge <= 1280 ? 1 : 1280 / longEdge;
      const dstW = Math.round(meta.width! * scale);
      const dstH = Math.round(meta.height! * scale);
      const { data } = await img
        .resize(dstW, dstH)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const canvas = dom.window.document.createElement("canvas");
      canvas.width = dstW;
      canvas.height = dstH;
      const imageData = new dom.window.ImageData(
        new Uint8ClampedArray(data),
        dstW,
        dstH,
      );
      // @ts-expect-error — jsdom/opencv polyfill
      canvas.getContext = () => ({
        drawImage: () => {},
        getImageData: () => imageData,
        putImageData: () => {},
        fillRect: () => {},
        fillStyle: "",
      });

      // OpenCV 로드
      const opencvCode = await fs.readFile(
        resolve(ROOT, "public/opencv.js"),
        "utf8",
      );
      const factory = new Function(
        "module",
        opencvCode + "\nreturn module.exports;",
      );
      const moduleObj: { exports: unknown } = { exports: {} };
      factory(moduleObj);
      // @ts-expect-error — jsdom/opencv polyfill
      globalThis.cv = moduleObj.exports;
      await new Promise<void>((res) => {
        // @ts-expect-error — jsdom/opencv polyfill
        const cvg = globalThis.cv;
        if (cvg && typeof cvg.imread === "function") return res();
        if (cvg) cvg.onRuntimeInitialized = () => res();
        setTimeout(res, 8000);
      });

      // 파이프라인 실행
      const { runPipeline } = await import("../../src/opencv/pipeline");
      const ac = new AbortController();
      const result = await runPipeline(canvas, "500", ac.signal);

      // 검증
      expect(result.coin.coinType).toBe("500");
      expect(result.coin.diameterMm).toBe(26.5);
      expect(result.coin.radiusPx).toBeGreaterThanOrEqual(60);
      expect(result.coin.radiusPx).toBeLessThanOrEqual(250);
      expect(result.stats.particleCount).toBeGreaterThanOrEqual(200);
      expect(result.stats.d50).toBeLessThan(500);
    },
    30_000, // 실 OpenCV 호출 → 타임아웃 여유
  );
});
