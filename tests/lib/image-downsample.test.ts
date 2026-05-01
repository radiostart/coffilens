import { describe, it, expect } from "vitest";
import { downsampleImage } from "../../src/lib/image-downsample";

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // 빈 캔버스라도 drawImage 입력으로 동작
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}

describe("downsampleImage", () => {
  it("1080×1920 → 720×1280 (긴변 1280)", () => {
    const src = makeCanvas(1080, 1920);
    const dst = downsampleImage(src);
    expect(dst.width).toBe(720);
    expect(dst.height).toBe(1280);
  });

  it("1280×720 → 그대로 (이미 임계 이하)", () => {
    const src = makeCanvas(1280, 720);
    const dst = downsampleImage(src);
    expect(dst.width).toBe(1280);
    expect(dst.height).toBe(720);
  });

  it("정사각형 2000×2000 → 1280×1280", () => {
    const src = makeCanvas(2000, 2000);
    const dst = downsampleImage(src);
    expect(dst.width).toBe(1280);
    expect(dst.height).toBe(1280);
  });

  it("작은 480×640 → 그대로 (긴변 < 1280)", () => {
    const src = makeCanvas(480, 640);
    const dst = downsampleImage(src);
    expect(dst.width).toBe(480);
    expect(dst.height).toBe(640);
  });

  it("크기 0 입력 시 throw", () => {
    const src = makeCanvas(0, 0);
    expect(() => downsampleImage(src)).toThrow(/dimensions are zero/);
  });

  it("긴변 가로 비율 → 긴변 1280 으로 정확히 스케일", () => {
    const src = makeCanvas(2560, 1440);
    const dst = downsampleImage(src);
    expect(dst.width).toBe(1280);
    expect(dst.height).toBe(720);
  });
});
