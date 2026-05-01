import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "fake-indexeddb/auto";

// jsdom 의 HTMLCanvasElement 는 getContext 가 null 반환 — 테스트용 stub.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: "",
})) as unknown as HTMLCanvasElement["getContext"];

// jsdom 의 toBlob 은 미지원 — 빈 Blob 반환 stub.
HTMLCanvasElement.prototype.toBlob = function toBlob(
  callback: BlobCallback,
): void {
  setTimeout(
    () => callback(new Blob([new Uint8Array(0)], { type: "image/jpeg" })),
    0,
  );
};

afterEach(() => {
  cleanup();
});
