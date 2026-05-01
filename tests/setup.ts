import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom 의 HTMLCanvasElement 는 getContext 가 null 반환 — 테스트용 stub.
// 실제 그리기 동작 X — drawImage 등 호출만 받아서 무시.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: "",
})) as unknown as HTMLCanvasElement["getContext"];

afterEach(() => {
  cleanup();
});
