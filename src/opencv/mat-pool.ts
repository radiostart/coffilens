/**
 * MatScope — RAII 스타일 OpenCV.js Mat 누수 방지.
 *
 * cv.Mat / cv.MatVector 등은 WASM 힙 할당이라 GC 대상이 아님.
 * `.delete()` 누락 시 영구 누수 → ~100건 측정 후 WebView 크래시.
 *
 * 모든 Mat 생성은 `scope.track()` 으로 감싸야 함.
 * `withMatScope()` 헬퍼가 try/finally 로 자동 정리.
 *
 * ESLint `local/no-direct-mat` 룰이 패턴 미준수를 컴파일 타임에 차단.
 */

export interface Disposable {
  delete: () => void;
}

/** OpenCV.js global namespace shape — loader 가 window 에 주입 */
export interface CvNamespace {
  Mat: new (...args: unknown[]) => Disposable;
  MatVector: new (...args: unknown[]) => Disposable;
  [key: string]: unknown;
}

export class MatScope {
  private mats: Disposable[] = [];

  /** Mat 생성 시 반드시 이 메서드로 추적 */
  track<T extends Disposable>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** 추적 중인 Mat 개수 (디버깅/테스트) */
  size(): number {
    return this.mats.length;
  }

  /** finally 에서 호출. 모든 추적 Mat 해제. 이미 해제된 경우 무시 */
  dispose(): void {
    for (const m of this.mats) {
      try {
        m.delete();
      } catch {
        // 이미 해제 또는 잘못된 참조 — silently ignore
      }
    }
    this.mats = [];
  }
}

/** 헬퍼: 자동 dispose. fn 이 throw 해도 finally 에서 정리. */
export async function withMatScope<T>(
  fn: (scope: MatScope) => Promise<T> | T,
): Promise<T> {
  const scope = new MatScope();
  try {
    return await fn(scope);
  } finally {
    scope.dispose();
  }
}

