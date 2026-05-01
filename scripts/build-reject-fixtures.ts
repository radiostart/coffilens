/**
 * 합성 reject fixture 생성 스크립트.
 *
 * 사용: npx tsx scripts/build-reject-fixtures.ts
 *
 * 입력: fixtures/grind-anchor-{NNN}.jpg (manifest.json 의 첫 anchor entry)
 * 출력: fixtures/synthetic/{no-coin,two-coins,partial-coin,cup-edge}.synth.jpg
 *
 * 합성 방법:
 *  - no-coin: anchor 의 동전 영역 흰색 마스킹 (placeholder 좌표 — 실제 좌표는 anchor 촬영 후 조정)
 *  - two-coins: anchor 좌우 반전 합성으로 동전 2개로 보이게
 *  - partial-coin: 우측 25% crop 으로 동전 가장자리 잘림
 *  - cup-edge: 큰 호(arc) SVG 합성으로 가짜 원형 노이즈
 *
 * 합성 후 manifest.json 에 reject entry 4개를 수동 추가:
 *   - no-coin/two-coins/partial-coin: { kind: "reject", expected_error: "no_coin" | "multi_coin" | "partial_coin" }
 *   - cup-edge: { kind: "reject", expected_low_confidence: true }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";

interface AnchorFixture {
  file: string;
  kind: "anchor";
  ground_truth_d50_um: number;
  tolerance_um: number;
  source: string;
  shooting?: Record<string, unknown>;
}

interface Manifest {
  version: number;
  fixtures: Array<AnchorFixture | { kind: string; [key: string]: unknown }>;
}

const FIX_DIR = "fixtures";
const OUT_DIR = path.join(FIX_DIR, "synthetic");

async function main(): Promise<void> {
  const manifestPath = path.join(FIX_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`${manifestPath} 없음 — D0 anchor fixture 준비 필요`);
  }

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as Manifest;
  const anchor = manifest.fixtures.find(
    (f): f is AnchorFixture => f.kind === "anchor",
  );
  if (!anchor) {
    throw new Error(
      "manifest.json: anchor fixture 없음 — D0 작업 + manifest 등록 필요",
    );
  }

  const SRC = path.join(FIX_DIR, anchor.file);
  if (!fs.existsSync(SRC)) {
    throw new Error(`${SRC} 없음 — anchor 파일 경로 확인`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const meta = await sharp(SRC).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`${SRC} 의 width/height 추출 실패`);
  }

  // 1. no-coin: 동전 영역 흰색 마스킹.
  //    placeholder 좌표 — 실제 anchor 촬영 후 동전 위치 측정해 조정.
  //    안전한 출발점: 우측 30% crop (동전이 좌측·중앙에 있다고 가정).
  await sharp(SRC)
    .extract({
      left: Math.floor(meta.width * 0.3),
      top: 0,
      width: Math.floor(meta.width * 0.7),
      height: meta.height,
    })
    .resize(meta.width, meta.height, { fit: "cover" })
    .toFile(path.join(OUT_DIR, "no-coin.synth.jpg"));

  // 2. two-coins: 좌우 반전 합성으로 동전 2개로 보이게.
  const halfW = Math.floor(meta.width / 2);
  const half = await sharp(SRC)
    .extract({ left: 0, top: 0, width: halfW, height: meta.height })
    .toBuffer();
  const flipped = await sharp(SRC)
    .flop()
    .extract({ left: 0, top: 0, width: halfW, height: meta.height })
    .toBuffer();
  await sharp({
    create: {
      width: meta.width,
      height: meta.height,
      channels: 3,
      background: "white",
    },
  })
    .composite([
      { input: half, left: 0, top: 0 },
      { input: flipped, left: halfW, top: 0 },
    ])
    .jpeg()
    .toFile(path.join(OUT_DIR, "two-coins.synth.jpg"));

  // 3. partial-coin: 우측 25% crop — 동전이 우측 가장자리에 걸림.
  await sharp(SRC)
    .extract({
      left: Math.floor(meta.width * 0.25),
      top: 0,
      width: Math.floor(meta.width * 0.75),
      height: meta.height,
    })
    .toFile(path.join(OUT_DIR, "partial-coin.synth.jpg"));

  // 4. cup-edge: 이미지 하단에 큰 호(arc) — 컵받침 시뮬.
  //    SVG path: 60% 높이에서 시작, 95% 높이까지 휘는 곡선.
  const arcSvg = `
    <svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 0 ${meta.height * 0.6} Q ${meta.width / 2} ${meta.height * 0.95} ${meta.width} ${meta.height * 0.6}"
        stroke="black"
        stroke-width="40"
        fill="none"
      />
    </svg>
  `;
  await sharp(SRC)
    .composite([{ input: Buffer.from(arcSvg), blend: "multiply" }])
    .toFile(path.join(OUT_DIR, "cup-edge.synth.jpg"));

  console.log(`Generated 4 synthetic reject fixtures in ${OUT_DIR}/`);
  console.log("Next: manifest.json 에 reject entry 4개 추가 (스크립트 헤더 참조)");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
