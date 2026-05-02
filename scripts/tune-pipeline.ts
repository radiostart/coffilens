/**
 * tune-pipeline — 실 OpenCV 파이프라인을 fixture 이미지에 돌려 결과 출력.
 *
 * 사용법 (이 파일을 coffilens/scripts/tune-pipeline.ts 로 옮긴 후):
 *   export PATH=/Users/jay-p/.nvm/versions/node/v24.15.0/bin:$PATH
 *   npx tsx scripts/tune-pipeline.ts [fixture_path]
 *
 * 기본 fixture: fixtures/test-500-fine.jpg.
 * coinType 은 fixture 파일명에서 파싱 (test-500-* → "500", test-100-* → "100").
 *
 * 의존성:
 *   - jsdom (이미 devDependency)
 *   - sharp (이미 devDependency) — JPEG → 디코딩 → ImageData
 *   - @techstark/opencv-js (production dep) — node 환경에서도 동작
 *
 * 한계:
 *   - jsdom 의 HTMLCanvasElement 는 getContext 미지원 → ImageData 를 직접
 *     주입하는 stub 으로 우회.
 *   - sharp 으로 미리 EXIF 회전 + 1280px 다운샘플 후 ImageData 를 만든다.
 *   - downsampleImage() 의 ctx.drawImage 는 stub noop — 입력 canvas 가
 *     이미 다운샘플된 상태로 통과.
 */

import { promises as fs } from "node:fs";
import { resolve, basename } from "node:path";
import { JSDOM } from "jsdom";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");

async function main() {
  const fixtureArg = process.argv[2] ?? "fixtures/test-500-fine.jpg";
  const fixturePath = resolve(ROOT, fixtureArg);
  console.log(`[tune] fixture = ${fixturePath}`);

  // 두 번째 인자 또는 환경변수로 coinType override 가능 (multi-coin fixture 양쪽 path 검증용).
  const coinTypeOverride = (process.argv[3] ?? process.env.COIN_TYPE) as
    | "100"
    | "500"
    | undefined;
  const coinType =
    coinTypeOverride ?? parseCoinTypeFromFilename(basename(fixturePath));
  console.log(`[tune] coinType = ${coinType}${coinTypeOverride ? " (override)" : ""}`);

  // coinHint — env var COIN_HINT="x,y" (상대 좌표 0~1). 예: COIN_HINT=0.46,0.15
  const coinHint = (() => {
    const raw = process.env.COIN_HINT;
    if (!raw) return null;
    const [xStr, yStr] = raw.split(",");
    const x = Number(xStr);
    const y = Number(yStr);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  })();
  if (coinHint) {
    console.log(`[tune] coinHint = (${coinHint.x}, ${coinHint.y}) [relative]`);
  }

  // 1. JSDOM 글로벌 설정 + ImageData 폴리필 (jsdom 미제공)
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  // @ts-expect-error — globalThis 에 jsdom 타입 주입
  globalThis.window = dom.window;
  // @ts-expect-error — jsdom/opencv polyfill
  globalThis.document = dom.window.document;
  // @ts-expect-error — jsdom/opencv polyfill
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  // @ts-expect-error — jsdom/opencv polyfill
  globalThis.HTMLImageElement = dom.window.HTMLImageElement;
  // @ts-expect-error — jsdom/opencv polyfill
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  // jsdom 은 ImageData constructor 미제공 — 최소 polyfill (data/width/height 만 사용)
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
  // @ts-expect-error — polyfill 주입
  globalThis.ImageData = ImageDataPolyfill;
  // @ts-expect-error — jsdom/opencv polyfill
  dom.window.ImageData = ImageDataPolyfill;

  // 2. sharp 으로 이미지 디코딩 + 1280px 다운샘플 (EXIF 자동 회전 포함)
  //
  // **버그 수정 (2026-05-02 후속)**: sharp.metadata() 는 EXIF rotate 가 queued
  // 되어 있어도 PRE-rotate 차원 반환. 이걸 resize 에 넘기면 cover-fit center crop
  // 으로 portrait 사진의 상하단 (보통 동전 위치) 이 잘려나가 HoughCircles 가
  // false-positive 코인을 잡음.
  //
  // 수정: EXIF orientation 5~8 (90°/270° 회전) 시 width/height swap 후 resize.
  // browser 의 <img> + canvas 처리와 동일한 결과 얻기 위함.
  const image = sharp(fixturePath).rotate(); // EXIF 자동 회전
  const rawMeta = await sharp(fixturePath).metadata(); // EXIF orientation 검사
  const isRotatedQuarterTurn =
    rawMeta.orientation !== undefined && rawMeta.orientation >= 5;
  // post-rotate 차원: 5~8 은 90°/270° 회전이라 W/H swap.
  const postW = isRotatedQuarterTurn ? rawMeta.height! : rawMeta.width!;
  const postH = isRotatedQuarterTurn ? rawMeta.width! : rawMeta.height!;
  console.log(
    `[tune] source: ${rawMeta.width}×${rawMeta.height} → post-rotate ${postW}×${postH} (orientation=${rawMeta.orientation ?? 1})`,
  );

  const longEdge = Math.max(postW, postH);
  const scale = longEdge <= 1280 ? 1 : 1280 / longEdge;
  const dstW = Math.round(postW * scale);
  const dstH = Math.round(postH * scale);
  console.log(`[tune] downsample → ${dstW}×${dstH} (scale=${scale.toFixed(3)})`);

  const { data, info } = await image
    .resize(dstW, dstH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`[tune] decoded RGBA buffer: ${info.width}×${info.height} (${data.length} bytes)`);

  // 3. canvas mock — HTMLCanvasElement 전역 prototype 에 stub 주입.
  //    downsampleImage() 가 document.createElement("canvas") 한 새 canvas 도
  //    동일 stub 사용. 새 canvas 의 drawImage 는 동일 imageData 를 그대로 보유한
  //    것처럼 동작 (이미 sharp 로 1280×960 으로 사전 downsample 했으므로 OK).
  const imageData = new ImageDataPolyfill(
    new Uint8ClampedArray(data),
    dstW,
    dstH,
  );
  const stubCtxFactory = (
    targetCanvas: { width: number; height: number },
  ) => ({
    drawImage: () => {
      // no-op — 입력 buffer 는 이미 디코딩 완료, 모든 canvas 가 같은 imageData 공유
    },
    getImageData: () => {
      // 모든 canvas 가 1280×960 imageData 공유 (입력이 이미 그 크기)
      return imageData;
    },
    putImageData: () => {},
    fillRect: () => {},
    fillStyle: "",
    canvas: targetCanvas,
  });
  // 전역 prototype 패치 — document.createElement("canvas") 가 만드는 canvas 모두 적용
  // @ts-expect-error — jsdom/opencv polyfill
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    // @ts-expect-error — jsdom/opencv polyfill
    return stubCtxFactory(this);
  };

  const canvas = dom.window.document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;

  // 4. OpenCV.js 로딩 (UMD module → global cv)
  console.log(`[tune] loading OpenCV.js...`);
  const opencvPath = resolve(ROOT, "public/opencv.js");
  const opencvCode = await fs.readFile(opencvPath, "utf8");
  // UMD bundle 은 module/exports/require 필요. require 는 fs/path 등 node 모듈 lookup.
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
  // @ts-expect-error — global cv
  globalThis.cv = moduleObj.exports;

  // OpenCV WASM 초기화 대기 — cv.Mat 이 constructor 로 사용 가능해야 진짜 준비됨
  // (cv.imread 는 즉시 존재하지만 Mat 은 WASM init 후에만 attach)
  await new Promise<void>((res, rej) => {
    const start = Date.now();
    const check = setInterval(() => {
      // @ts-expect-error — jsdom/opencv polyfill
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
    // 콜백 신호도 동시 setup
    // @ts-expect-error — jsdom/opencv polyfill
    if (globalThis.cv) {
      // @ts-expect-error — jsdom/opencv polyfill
      globalThis.cv.onRuntimeInitialized = () => {
        clearInterval(check);
        res();
      };
    }
  });
  console.log(
    // @ts-expect-error — jsdom/opencv polyfill
    `[tune] OpenCV ready (cv.Mat=${typeof globalThis.cv.Mat}, imread=${typeof globalThis.cv.imread})`,
  );

  // 5. runPipeline 호출
  const pipelineMod = await import(resolve(ROOT, "src/opencv/pipeline.ts"));
  const ac = new AbortController();
  try {
    const result = await pipelineMod.runPipeline(
      canvas,
      coinType,
      ac.signal,
      {
        onProgress: (step: string, percent: number) =>
          console.log(`[tune] progress: ${step} ${percent}%`),
      },
      coinHint,
    );

    console.log("\n=== RESULT ===");
    console.log("coin:", JSON.stringify(result.coin, null, 2));
    console.log("stats:", JSON.stringify({
      d10: result.stats.d10,
      d50: result.stats.d50,
      d90: result.stats.d90,
      particleCount: result.stats.particleCount,
      uniformity: result.stats.uniformity,
      finesPercent: result.stats.finesPercent,
      totalAreaMm2: result.stats.totalAreaMm2,
    }, null, 2));
    console.log("confidence:", JSON.stringify(result.confidence, null, 2));
    console.log(`durationMs: ${Math.round(result.durationMs)}`);

    // 성공 기준 체크 (sieve-equivalent scale)
    console.log("\n=== SUCCESS CRITERIA ===");
    const checks = {
      "coin detected (single)": result.coin.coinType === coinType,
      "coin radius reasonable (60-250px)":
        result.coin.radiusPx >= 60 && result.coin.radiusPx <= 250,
      "particles >= 200": result.stats.particleCount >= 200,
      "D50 sane (100~2000μm sieve range)":
        result.stats.d50 >= 100 && result.stats.d50 <= 2000,
    };
    for (const [k, v] of Object.entries(checks)) {
      console.log(`  ${v ? "[OK]" : "[FAIL]"} ${k}`);
    }
  } catch (err: unknown) {
    console.error("\n=== PIPELINE ERROR ===");
    if (err && typeof err === "object" && "kind" in err) {
      console.error("AnalysisError:", JSON.stringify(err, null, 2));
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

function parseCoinTypeFromFilename(name: string): "100" | "500" {
  // 100원 매칭: filename 어디든 "-100" 또는 "-100." 패턴. 예) test-100-fine.jpg,
  // test-vs3-100.jpg 모두 매치. 500원은 default.
  if (/-100[-.]/.test(name)) return "100";
  return "500";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
