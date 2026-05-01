/**
 * OpenCV.js lazy loader.
 *
 * - 8MB 다운로드 (script tag injection)
 * - 진행률 콜백 (Content-Length 기반)
 * - CDN 다중 미러 fallback (sweep Issue 7)
 * - 재시도 3회 (지수 backoff)
 * - 동시 호출 시 단일 promise 공유 (중복 다운로드 방지)
 */

declare global {
  interface Window {
    cv?: { onRuntimeInitialized?: () => void } & Record<string, unknown>;
  }
}

const CDN_MIRRORS = [
  "https://docs.opencv.org/4.10.0/opencv.js",
  "https://cdn.jsdelivr.net/gh/opencv/opencv@4.10.0/opencv.js",
  "https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.10.0/opencv.js",
];

const MAX_RETRIES = 3;
const RUNTIME_TIMEOUT_MS = 30_000;

let loadPromise: Promise<void> | null = null;

export interface LoaderOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export type OpenCVLoadCause = "network" | "cors" | "timeout";

export class OpenCVLoadError extends Error {
  readonly kind = "opencv_load_fail";
  constructor(
    public readonly cause: OpenCVLoadCause,
    public readonly underlying?: unknown,
  ) {
    super(`OpenCV.js 로드 실패 (${cause})`);
  }
}

/**
 * loadOpenCV — 동시 호출 시 동일 promise 공유.
 *
 * Async 래퍼 제거: `async function` 으로 감싸면 매 호출마다 새 promise 가 wrap 되어
 * `loadOpenCV() === loadOpenCV()` 가 false 가 됨. 그래서 일반 함수로 IIFE 반환.
 */
export function loadOpenCV(opts: LoaderOptions = {}): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let lastErr: unknown;
    let lastCause: "network" | "cors" | "timeout" = "network";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 미러 순회 — 매 attempt 마다 다음 미러로
      const mirror = CDN_MIRRORS[attempt % CDN_MIRRORS.length];
      try {
        opts.signal?.throwIfAborted();
        await fetchAndInject(mirror, opts.onProgress, opts.signal);
        await waitForRuntime(opts.signal);
        return;
      } catch (e) {
        lastErr = e;
        lastCause = classifyCause(e);

        if (e instanceof DOMException && e.name === "AbortError") {
          throw e; // 사용자 cancel — 재시도 없이 즉시 throw
        }

        // 지수 backoff — abort signal 으로 일찍 깨움
        if (attempt < MAX_RETRIES - 1) {
          await sleepWithAbort(500 * 2 ** attempt, opts.signal);
        }
      }
    }

    loadPromise = null; // 다음 호출에서 재시도 가능
    throw new OpenCVLoadError(lastCause, lastErr);
  })();

  return loadPromise;
}

/** 테스트용 — 캐시된 promise 리셋 */
export function _resetLoaderForTests(): void {
  loadPromise = null;
  if (typeof window !== "undefined") {
    delete window.cv;
  }
}

async function fetchAndInject(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  let loaded = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ReadableStream not available");

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total > 0) onProgress?.(loaded, total);
  }

  // 스크립트 본문 합쳐서 Blob URL 로 inject
  const blob = new Blob(chunks, { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await injectScript(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`script load fail: ${src}`));
    document.head.appendChild(script);
  });
}

async function waitForRuntime(signal?: AbortSignal): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("window unavailable (non-browser env)");
  }

  // 이미 초기화 완료
  if (window.cv && Object.keys(window.cv).length > 1) return;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`runtime init timeout (${RUNTIME_TIMEOUT_MS}ms)`));
    }, RUNTIME_TIMEOUT_MS);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );

    if (window.cv) {
      window.cv.onRuntimeInitialized = () => {
        clearTimeout(timeout);
        resolve();
      };
    } else {
      // 스크립트가 cv 를 늦게 노출하는 경우 — 폴링
      const poll = setInterval(() => {
        if (window.cv) {
          clearInterval(poll);
          window.cv.onRuntimeInitialized = () => {
            clearTimeout(timeout);
            resolve();
          };
        }
      }, 50);
      signal?.addEventListener("abort", () => clearInterval(poll), {
        once: true,
      });
    }
  });
}

function classifyCause(e: unknown): "network" | "cors" | "timeout" {
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    if (m.includes("timeout")) return "timeout";
    if (m.includes("cors") || m.includes("blocked by")) return "cors";
  }
  return "network";
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
