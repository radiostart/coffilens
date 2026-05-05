/**
 * **합성 grind fixture 생성** — boulder/clump shape classifier 검증용 (Phase 1).
 *
 * 사용:
 *   npx tsx scripts/build-grind-fixtures.ts
 *
 * 출력 (fixtures/synthetic/):
 *   - coarse-boulder.synth.jpg   : 동전 + 큰 단일 입자 (boulder, 원형) 다수
 *   - medium-clump.synth.jpg     : 동전 + 정상 입자 + 응집 (clump, 겹침) 다수
 *   - french-press-mock.synth.jpg: 동전 + 거친 분쇄 mix (boulder + normal)
 *
 * **목적**: shape classifier 동작 검증.
 *  - boulder fixture → boulder count > 0, clump count ≈ 0
 *  - clump fixture   → clump count > 0, boulder count ≈ 0
 *
 * **한계**: 합성이라 실제 photo 의 lighting/paper texture 검증 불가.
 *   진짜 French Press / coarse drip 사진 추가 시 더 정확한 calibration 가능.
 *
 * **이미지 spec**:
 *   - 1280×960 (앱 다운샘플 후 사이즈 일치)
 *   - 동전: 우상단 r=110px (mmPerPx ≈ 0.12 → 500원 d=26.5mm)
 *   - 흰 배경 (#f8f8f6, paper)
 *   - 입자: 어두운 갈색 (#3a2614)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";

const FIX_DIR = "fixtures/synthetic";
const W = 1280;
const H = 960;
const COIN_CX = 1000;
const COIN_CY = 280;
const COIN_R = 110;

// 500원 동전 직경 26.5mm → mmPerPx = 26.5 / (2*110) ≈ 0.120
// CLUMP_MIN_DIAMETER_UM = 1500µm = 1.5mm = 12.5px @ mmPerPx 0.12
// → boulder 입자 D=2000µm = 16.7px radius (실제 그림 픽셀)
//   boulder radius px = (2000 / 1000) / 2 / 0.12 = 8.33 px (반지름)

// SVG circle 헬퍼 — fill: 어두운 갈색
function circle(cx: number, cy: number, r: number, opacity = 1): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3a2614" fill-opacity="${opacity}"/>`;
}

// 동전 SVG (회색 원, rim 있음) — HoughCircles 검출 가능하게.
function coin(cx: number, cy: number, r: number): string {
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#bcbcbc" stroke="#888" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.85}" fill="none" stroke="#999" stroke-width="1.5"/>
    <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="36" fill="#777" font-weight="bold">500</text>
  `;
}

interface Particle {
  cx: number;
  cy: number;
  rPx: number;
}

// 정상 입자 분포 — log-normal, 100~600µm
// mmPerPx 0.12 → 100µm = 0.42 px radius (very small), 600µm = 2.5 px
function normalParticles(n: number, region: { x0: number; y0: number; x1: number; y1: number }): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const cx = region.x0 + Math.random() * (region.x1 - region.x0);
    const cy = region.y0 + Math.random() * (region.y1 - region.y0);
    // log-normal radius 1~3 px (200~600µm)
    const u = Math.random(), v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const rPx = Math.max(1, Math.round(2 + z * 0.5));
    out.push({ cx, cy, rPx });
  }
  return out;
}

// Boulder — 단일 큰 원형 입자 (D 2000~3500µm, radius 8~15 px)
function boulderParticles(n: number, region: { x0: number; y0: number; x1: number; y1: number }): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const cx = region.x0 + Math.random() * (region.x1 - region.x0);
    const cy = region.y0 + Math.random() * (region.y1 - region.y0);
    const rPx = 8 + Math.round(Math.random() * 7);
    out.push({ cx, cy, rPx });
  }
  return out;
}

// Clump — 겹쳐진 작은 원 N개 (irregular shape, low solidity).
// findContours 가 합쳐진 contour 로 인식 → ≥1500µm + low circularity.
function clumpParticles(n: number, region: { x0: number; y0: number; x1: number; y1: number }): Particle[] {
  const out: Particle[] = [];
  for (let c = 0; c < n; c++) {
    const baseCx = region.x0 + Math.random() * (region.x1 - region.x0);
    const baseCy = region.y0 + Math.random() * (region.y1 - region.y0);
    // 5-8 작은 원이 겹쳐 응집체 형성
    const subCount = 5 + Math.round(Math.random() * 3);
    for (let s = 0; s < subCount; s++) {
      const angle = (s / subCount) * 2 * Math.PI + Math.random() * 0.5;
      const dist = 2 + Math.random() * 4;
      out.push({
        cx: baseCx + Math.cos(angle) * dist,
        cy: baseCy + Math.sin(angle) * dist,
        rPx: 3 + Math.round(Math.random() * 3),
      });
    }
  }
  return out;
}

function svgFor(particles: Particle[]): string {
  const particleSvg = particles
    .map((p) => circle(p.cx, p.cy, p.rPx))
    .join("\n");
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#f8f8f6"/>
      ${coin(COIN_CX, COIN_CY, COIN_R)}
      ${particleSvg}
    </svg>
  `;
}

async function render(filename: string, particles: Particle[]): Promise<void> {
  const svg = svgFor(particles);
  const out = path.join(FIX_DIR, filename);
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92 })
    .toFile(out);
  console.log(`✓ ${out} (${particles.length} particles)`);
}

async function main(): Promise<void> {
  fs.mkdirSync(FIX_DIR, { recursive: true });

  // **fixture 1: coarse-boulder** — 동전 + 큰 단일 입자 (boulder) 다수.
  // 정상 입자 작게 + boulder 20개. Phase 1 classifier 가 boulder 인식해야.
  const boulderPs = [
    ...normalParticles(150, { x0: 50, y0: 400, x1: 900, y1: 920 }),
    ...boulderParticles(20, { x0: 100, y0: 450, x1: 850, y1: 880 }),
  ];
  await render("coarse-boulder.synth.jpg", boulderPs);

  // **fixture 2: medium-clump** — 정상 입자 + 응집체 (clump).
  // clump 8개 (각 5-8 sub-circles 겹침). classifier 가 clump 분류해야.
  const clumpPs = [
    ...normalParticles(200, { x0: 50, y0: 400, x1: 900, y1: 920 }),
    ...clumpParticles(8, { x0: 100, y0: 450, x1: 850, y1: 880 }),
  ];
  await render("medium-clump.synth.jpg", clumpPs);

  // **fixture 3: french-press-mock** — boulder + normal mix (거친 분쇄 emulation).
  // 큰 입자 위주. 정상 입자 적게.
  const frenchPs = [
    ...normalParticles(80, { x0: 50, y0: 400, x1: 900, y1: 920 }),
    ...boulderParticles(15, { x0: 100, y0: 450, x1: 850, y1: 880 }),
  ];
  await render("french-press-mock.synth.jpg", frenchPs);

  console.log(
    "\n[build-grind-fixtures] Done. Run regression to verify classifier:\n" +
      "  npx tsx scripts/batch-analyze.ts fixtures/synthetic/ 500\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
