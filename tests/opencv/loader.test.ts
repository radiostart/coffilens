import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadOpenCV,
  OpenCVLoadError,
  _resetLoaderForTests,
} from "../../src/opencv/loader";

function makeStreamingResponse(body: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "content-length": String(body.length) },
  });
}

beforeEach(() => {
  _resetLoaderForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetLoaderForTests();
});

describe("loadOpenCV", () => {
  it("3회 모두 실패 시 OpenCVLoadError throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    await expect(loadOpenCV()).rejects.toBeInstanceOf(OpenCVLoadError);
  });

  it("AbortSignal 으로 즉시 cancel", async () => {
    const ac = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("never")), 1000),
          ),
      ),
    );

    const promise = loadOpenCV({ signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("동일 promise 가 동시 호출 시 공유됨", async () => {
    // 무한 대기 fetch — 두 promise 가 같은 인스턴스인지만 확인
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );

    const p1 = loadOpenCV();
    const p2 = loadOpenCV();
    expect(p1).toBe(p2);
  });

  it("HTTP 4xx 응답 → fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );

    await expect(loadOpenCV()).rejects.toBeInstanceOf(OpenCVLoadError);
  });

  it("OpenCVLoadError 가 cause 분류 포함", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    try {
      await loadOpenCV();
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(OpenCVLoadError);
      expect((e as OpenCVLoadError).cause).toBe("network");
      expect((e as OpenCVLoadError).kind).toBe("opencv_load_fail");
    }
  });

  // 스트리밍 응답 — 진행률 콜백 + 정상 종료 (jsdom 에서 script.onload + cv 초기화 stub)
  it("진행률 콜백 + 정상 로드", async () => {
    const onProgress = vi.fn();
    const body = "// fake opencv";

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(makeStreamingResponse(body))),
    );

    // jsdom 은 script src 로딩을 실제 fetch 안 함 → onload 자동 호출 stub.
    // 또한 window.cv 를 미리 채워 waitForRuntime 즉시 종료.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = realCreate(tag) as HTMLScriptElement;
      if (tag === "script") {
        // src 설정 이후 microtask 로 onload 발화
        Object.defineProperty(el, "src", {
          set() {
            // multi-key cv 를 미리 주입
            (
              window as unknown as { cv: Record<string, unknown> }
            ).cv = {
              Mat: function () {},
              MatVector: function () {},
              onRuntimeInitialized: () => {},
            };
            queueMicrotask(() =>
              (window as unknown as { cv: { onRuntimeInitialized: () => void } }).cv.onRuntimeInitialized(),
            );
            queueMicrotask(() => el.onload?.(new Event("load")));
          },
        });
      }
      return el;
    }) as typeof document.createElement);

    await loadOpenCV({ onProgress });

    expect(onProgress).toHaveBeenCalled();
    const lastCall = onProgress.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe(body.length);
    expect(lastCall?.[1]).toBe(body.length);
  });
});
