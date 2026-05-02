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

// OpenCV.js 는 자체 도메인에서만 서빙 (외부 CDN 0개).
//   - 소스: @techstark/opencv-js npm 의존성
//   - 동기화: scripts/sync-opencv.ts (postinstall/predev/prebuild hook)
//   - 위치: public/opencv.js → dev=granite, prod=토스 CDN 통합 배포
//
// 변수명은 호환성 유지 (CDN_MIRRORS) — 의미는 "URL 후보".
// 외부 CDN 의존성 제거 사유:
//   1. 사용자 환경에서 docs.opencv.org 8MB 다운로드 stall 재현
//   2. F00 capability matrix "외부 통신 사유" 검수 항목 자동 N/A
//   3. 오프라인/네트워크 변동에도 robust
const CDN_MIRRORS = ["/opencv.js"];

const MAX_RETRIES = 1; // 자체 서빙 실패 시 retry 의미 없음
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
  // 이미 완전히 로드됨 — 즉시 resolve.
  if (isCvReady()) {
    console.log("[loader] cv already ready, instant resolve");
    return Promise.resolve();
  }
  if (loadPromise) {
    console.log("[loader] reusing existing promise");
    return loadPromise;
  }
  console.log("[loader] starting fresh, mirrors:", CDN_MIRRORS);

  loadPromise = (async () => {
    let lastErr: unknown;
    let lastCause: "network" | "cors" | "timeout" = "network";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // 미러 순회 — 매 attempt 마다 다음 미러로
      const mirror = CDN_MIRRORS[attempt % CDN_MIRRORS.length];
      console.log(`[loader] attempt ${attempt + 1}/${MAX_RETRIES} url=${mirror}`);
      try {
        opts.signal?.throwIfAborted();
        await fetchAndInject(mirror, opts.onProgress, opts.signal);
        console.log(`[loader] fetch+inject done for ${mirror}`);
        await waitForRuntime(opts.signal);
        console.log("[loader] runtime ready");
        return;
      } catch (e) {
        console.warn(`[loader] attempt ${attempt + 1} failed`, e);
        lastErr = e;
        lastCause = classifyCause(e);

        if (e instanceof DOMException && e.name === "AbortError") {
          // 사용자 cancel (또는 StrictMode dev cleanup) — 즉시 throw.
          // loadPromise 리셋해야 다음 호출이 새 promise 로 재시도 가능.
          loadPromise = null;
          throw e;
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

/**
 * 실제 ready 여부 — WASM 초기화 완료 시점에 cv.Mat 이 constructor 로 붙음.
 * window.cv 객체가 존재해도 config 키 (wasmBinaryFile, locateFile 등) 만 있는
 * 상태라면 cv.Mat 은 아직 undefined. 이 체크가 진짜 신호.
 */
function isCvReady(): boolean {
  if (typeof window === "undefined") return false;
  const cv = window.cv as { Mat?: unknown } | undefined;
  return !!cv && typeof cv.Mat === "function";
}

async function waitForRuntime(signal?: AbortSignal): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("window unavailable (non-browser env)");
  }

  if (isCvReady()) return;

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

    // 두 신호로 ready 감지:
    //  1. cv.onRuntimeInitialized 콜백 (정식 진입점)
    //  2. cv.Mat constructor 폴링 (콜백 미발화 케이스 대비, 50ms 간격)
    function tryResolve() {
      if (isCvReady()) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
        return true;
      }
      return false;
    }

    const poll = setInterval(tryResolve, 50);
    signal?.addEventListener("abort", () => clearInterval(poll), {
      once: true,
    });

    function attachCallback() {
      if (window.cv) {
        const prev = window.cv.onRuntimeInitialized;
        window.cv.onRuntimeInitialized = () => {
          if (typeof prev === "function") prev();
          tryResolve();
        };
      }
    }
    if (window.cv) {
      attachCallback();
    } else {
      // window.cv 자체가 아직 없음 — 폴링이 잡아줌
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
