/**
 * sync-opencv — node_modules/@techstark/opencv-js → public/opencv.js 복사.
 *
 * 호출 시점:
 *  - postinstall (npm install 시 자동)
 *  - prebuild (안전망)
 *
 * public/opencv.js 는 .gitignore — npm 의존성에서 자동 동기화되므로
 * 소스 트래킹 불필요. 누구나 `npm install` 한 번으로 같은 파일 확보.
 */

import { copyFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = resolve(ROOT, "node_modules/@techstark/opencv-js/dist/opencv.js");
const DST = resolve(ROOT, "public/opencv.js");

if (!existsSync(SRC)) {
  console.warn(`[sync-opencv] source not found: ${SRC}`);
  console.warn("[sync-opencv] @techstark/opencv-js 가 설치되지 않았습니다 — npm install 먼저 실행");
  process.exit(0); // postinstall 환경 (예: --ignore-scripts) 에서 graceful skip
}

copyFileSync(SRC, DST);
const sizeMB = (statSync(DST).size / 1024 / 1024).toFixed(1);
console.log(`[sync-opencv] ✓ ${SRC.replace(ROOT + "/", "")} → public/opencv.js (${sizeMB}MB)`);
