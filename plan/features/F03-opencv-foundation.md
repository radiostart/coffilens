# F03 — OpenCV Foundation (Loader + MatScope + Camera)

**Status**: 🟡 미시작
**Estimated effort**: 1 day (D4)
**Dependencies**: F00, F02 (라우터)
**Blocks**: F04, F05, F06 (전 OpenCV 작업)
**plain.md 참조**: Section 6 (파이프라인 0~2단계 일부), Section 11 (Mat 누수, OpenCV 다운로드 실패), Section 12 (opencv/, lib/)

---

## 목표

OpenCV.js lazy load + 다운로드 실패 처리 + **MatScope (RAII) 패턴 셋업** + 카메라 컴포넌트 + 권한 추상화. 이후 모든 OpenCV 작업의 기반.

---

## 산출물

### 신규 파일
- `src/opencv/loader.ts` — lazy load + 재시도 + 진행률 콜백
- `src/opencv/mat-pool.ts` — **MatScope (RAII)** ★
- `src/opencv/errors.ts` — `AnalysisError` discriminated union 초안 (F04~F06에서 확장)
- `src/routes/camera.tsx` — 카메라 화면 + 가이드 박스
- `src/routes/analyzing.tsx` — 분석 중 화면 (진행률 + 취소 버튼, 실제 파이프라인은 F06)
- `src/components/coin-overlay.tsx` — 카메라 위 동전 가이드 박스
- `src/lib/permissions.ts` — 카메라 권한 추상화 (iOS/AOS 차이 흡수)
- `eslint-rules/no-direct-mat.ts` — `new cv.Mat()` 직접 호출 차단 ★

### 수정 파일
- `.eslintrc.json` — `no-direct-mat` 룰 등록

---

## 구현 디테일

### opencv/mat-pool.ts ★ (메모리 누수 방지 핵심)
```ts
declare const cv: any; // OpenCV.js global

export class MatScope {
  private mats: any[] = [];

  /** Mat 생성 시 반드시 이 메서드로 추적 */
  track<T>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** finally 에서 호출. 모든 추적 Mat 해제 */
  dispose(): void {
    for (const m of this.mats) {
      try { m.delete(); } catch (_) { /* 이미 해제된 경우 무시 */ }
    }
    this.mats = [];
  }
}

/** 헬퍼: 자동 dispose */
export async function withMatScope<T>(fn: (scope: MatScope) => Promise<T>): Promise<T> {
  const scope = new MatScope();
  try { return await fn(scope); }
  finally { scope.dispose(); }
}
```

### opencv/loader.ts
```ts
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
const MAX_RETRIES = 3;

let loadPromise: Promise<void> | null = null;

export interface LoaderOptions {
  onProgress?: (loaded: number, total: number) => void;
}

export async function loadOpenCV(opts: LoaderOptions = {}): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await fetchAndExecute(OPENCV_URL, opts.onProgress);
        await waitForRuntime();
        return;
      } catch (e) {
        lastErr = e;
        // 지수 backoff
        await sleep(500 * 2 ** attempt);
      }
    }
    loadPromise = null; // 다음 호출에서 재시도 가능
    throw new OpenCVLoadError(lastErr);
  })();

  return loadPromise;
}

export class OpenCVLoadError extends Error {
  constructor(public cause: unknown) {
    super('OpenCV.js 로드 실패');
  }
}
```

### opencv/errors.ts (초안, F04~F06에서 확장)
```ts
export type AnalysisError =
  | { kind: 'opencv_load_fail'; cause: 'network' | 'cors' | 'timeout' }
  | { kind: 'aborted' }
  // 다음 feature 들에서 추가:
  // | { kind: 'no_coin' }
  // | { kind: 'multi_coin'; count: number }
  // | { kind: 'partial_coin' }
  // | { kind: 'low_brightness'; meanBrightness: number }
  // | { kind: 'blur'; laplacianVariance: number }
  // | { kind: 'no_particles' }
  // | { kind: 'low_particles'; count: number }
  // | { kind: 'memory_oom'; phase: string }
  ;

export function userMessage(e: AnalysisError): string {
  switch (e.kind) {
    case 'opencv_load_fail': return 'OpenCV 로드 실패. 와이파이 확인 후 재시도해주세요.';
    case 'aborted': return ''; // 사용자 의도적 취소, 메시지 없음
  }
}

export function telemetryReason(e: AnalysisError): string {
  return e.kind;
}
```

### lib/permissions.ts
```ts
export type CameraPermissionState = 'granted' | 'denied' | 'prompt';

export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if ('permissions' in navigator) {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as any });
      return result.state as CameraPermissionState;
    } catch (_) {
      return 'prompt';
    }
  }
  return 'prompt';
}

export async function requestCameraStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: 1920, height: 1080 },
    audio: false,
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach(track => track.stop());
}

export function openSettingsHint(): void {
  // iOS: 설정 > Toss > 카메라 권한
  // AOS: 설정 > Apps > Toss > 권한 > 카메라
  // 안내 화면 띄우기 (UI 책임)
}
```

### routes/camera.tsx
```tsx
export function CameraRoute() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>('prompt');
  const [, setLocation] = useLocation();
  const setCapturedFrame = useMeasurementStore(s => s.setFrame);

  useEffect(() => {
    (async () => {
      const state = await checkCameraPermission();
      setPermission(state);
      if (state !== 'denied') {
        try {
          const stream = await requestCameraStream();
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setPermission('granted');
        } catch (_) {
          setPermission('denied');
        }
      }
    })();
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  if (permission === 'denied') return <PermissionDeniedScreen />;

  return (
    <div className="camera-screen">
      <video ref={videoRef} autoPlay playsInline muted />
      <CoinOverlay />
      <CaptureButton onClick={() => {
        const frame = captureFrame(videoRef.current!); // canvas 변환
        setCapturedFrame(frame);
        setLocation('/analyzing');
      }} />
    </div>
  );
}
```

### routes/analyzing.tsx (이번 feature 는 placeholder)
```tsx
export function AnalyzingRoute() {
  const [progress, setProgress] = useState(0);

  // 실제 파이프라인 호출은 F06에서 구현
  // 이번 feature 는 OpenCV 다운로드 진행률만
  useEffect(() => {
    loadOpenCV({ onProgress: (loaded, total) => setProgress(loaded / total) })
      .then(() => {
        // F06에서 실제 분석 호출로 교체
      })
      .catch(e => {
        // OpenCVLoadError → 안내 + 재시도 화면
      });
  }, []);

  return (
    <div>
      <ProgressBar value={progress} />
      <CancelButton onClick={() => /* AbortController, F06 */} />
    </div>
  );
}
```

### eslint-rules/no-direct-mat.ts ★
```ts
// AST: NewExpression 의 callee 가 MemberExpression { object: 'cv', property: ['Mat', 'MatVector', 'RotatedRect', ...] }
// 단, mat-pool.ts 자체는 예외

const BLOCKED = new Set(['Mat', 'MatVector', 'RotatedRect', 'Size', 'Point']);
const ALLOWED_FILES = ['mat-pool.ts'];

export const rule: Rule.RuleModule = {
  meta: { type: 'problem', messages: { direct: '`new cv.{{name}}()` 직접 호출 금지. `scope.track(new cv.{{name}}(...))` 패턴 사용.' } },
  create(context) {
    if (ALLOWED_FILES.some(f => context.filename.endsWith(f))) return {};
    return {
      NewExpression(node) {
        if (node.callee.type === 'MemberExpression'
            && node.callee.object.type === 'Identifier' && node.callee.object.name === 'cv'
            && node.callee.property.type === 'Identifier' && BLOCKED.has(node.callee.property.name)) {
          context.report({ node, messageId: 'direct', data: { name: node.callee.property.name } });
        }
      },
    };
  },
};
```

---

## 수용 기준

- [ ] `loadOpenCV()` 호출 시 8MB 다운로드 + 진행률 콜백 동작
- [ ] CDN 실패 시 재시도 3회 + 최종 실패 시 `OpenCVLoadError` throw
- [ ] **MatScope** 패턴: `withMatScope(scope => ...)` 헬퍼 + 단위 테스트로 dispose 호출 검증
- [ ] **ESLint 룰**: `new cv.Mat()` 호출 코드가 `mat-pool.ts` 외부에 있으면 lint 에러
- [ ] 카메라 권한 요청 → 거부 시 PermissionDeniedScreen 표시 (설정 진입 안내)
- [ ] 카메라 화면에서 동전 가이드 박스 오버레이 표시
- [ ] 촬영 버튼 → frame 캡처 → store 에 저장 → /analyzing 이동
- [ ] /analyzing 에서 OpenCV 다운로드 진행률 표시 (실제 분석은 F06에서)

---

## 테스트

### 자동
- `tests/opencv/mat-pool.test.ts` — MatScope.track + dispose. mock cv.Mat
- `tests/opencv/loader.test.ts` — 재시도 동작 (fetch mock)
- `tests/eslint-rules/no-direct-mat.test.ts` — RuleTester 양성/음성

### 수동
- 실기기에서 8MB 다운로드 시간 측정 (4G/Wifi)
- 카메라 권한 거부 → 설정 진입 플로우

---

## 검수 영향

- **plain.md Section 4-6** (카메라 권한) — 거부 시 안내 화면 + 설정 진입 유도
- 외부 통신 (OpenCV CDN docs.opencv.org) — 검수 시 사유 필요할 수 있음 (이미지 처리 라이브러리). 콘솔에 명시.

---

## 위험 / 함정

- ⚠️ **Mat 누수 (P0)**: 이 feature 가 누수 방지의 기반. MatScope 패턴 전체 OpenCV 모듈 강제. ESLint 룰이 안전망.
- ⚠️ **OpenCV.js CORS 이슈**: docs.opencv.org 가 CORS 헤더 안 주는 경우 → CDN 미러 (cdnjs, jsdelivr) 또는 self-host
- ⚠️ **iOS Safari WASM 메모리 한계**: 대용량 이미지 시 OOM. F03 에서 다운샘플링 보장 필요 (실제 적용은 F04 lib/image-downsample.ts)
- ⚠️ **카메라 facingMode**: `'environment'` 후면 카메라. iOS Safari 일부 버전에서 무시 → fallback `'user'` 도 시도
- ⚠️ **getUserMedia HTTPS 강제**: Toss WebView 는 HTTPS 환경이라 OK, 로컬 dev 는 `localhost` 예외

---

## 참조

- [plain.md Section 6 (파이프라인)](../plain.md)
- [plain.md Section 11 (Mat 누수)](../plain.md)
- [OpenCV.js Memory Management](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
- [MDN: getUserMedia](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia)

---

## Handoff Notes

이 feature 의 **두 가지 핵심**:
1. **MatScope + ESLint 룰** — 이후 모든 OpenCV feature 의 안전망. 여기서 잘못 만들면 나머지가 다 위험.
2. **OpenCV loader 의 재시도/진행률** — 사용자 첫 인상 결정. 8MB 다운로드 중 화면 멈추면 이탈.

`AnalysisError` 는 초안만 (opencv_load_fail, aborted). F04~F06이 추가하면 `userMessage`/`telemetryReason` switch 도 같이 확장. **switch exhaustive** 체크가 컴파일 타임에 누락 잡아줌 (ts-config strict).

`/analyzing` 라우트는 이 feature 에서 OpenCV 로드 진행률만 표시. 실제 파이프라인 트리거는 F06 에서. 그때까지는 분석 단계 카드는 mock 또는 placeholder.

---

## 추가 (2026-05-02, Phase 1) — Vendored OpenCV.js + cv.Mat readiness

### 배경

원 spec 의 CDN 로딩 (`https://docs.opencv.org/4.10.0/opencv.js`) 이 토스 WebView 환경에서 CORS / 404 / 캐싱 이슈로 불안정 → 실측 사용자 사진에서 "OpenCV 다운로드 중 멈춤" 빈도 발생. 미러 (jsdelivr/cdnjs/gh) 도 모두 4xx 또는 CORS 거절.

### 변경 — npm vendoring

```diff
- // CDN 로드
- const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

+ // 자가 호스트 — public/opencv.js 에 @techstark/opencv-js 빌드 산물 복사
+ // (devDependency: @techstark/opencv-js — node 환경 호환 UMD)
+ const OPENCV_URL = '/opencv.js';
```

`package.json` 에 `@techstark/opencv-js` 추가 + `public/opencv.js` 로 복사 (vite static asset 으로 서빙). `tune-pipeline.ts` (Node 환경) 도 같은 파일 사용 — UMD bundle 이라 require polyfill 만 있으면 동작.

### `cv.Mat is not a constructor` 오류 픽스

원 spec 의 `onRuntimeInitialized` 콜백만 사용 시 race condition: `cv` 객체는 즉시 노출되지만 WASM init 미완료 상태에서 `cv.Mat` 사용 시 throw. **double-check pattern** 으로 구원:

```ts
function isCvReady(): boolean {
  return (
    typeof globalThis.cv === "object" &&
    globalThis.cv !== null &&
    typeof globalThis.cv.Mat === "function" // Mat 이 constructor 로 사용 가능해야 진짜 ready
  );
}

await new Promise<void>((resolve, reject) => {
  const start = Date.now();
  const check = setInterval(() => {
    if (isCvReady()) { clearInterval(check); resolve(); return; }
    if (Date.now() - start > 30_000) {
      clearInterval(check);
      reject(new OpenCVLoadError("timeout"));
    }
  }, 50);
  if (globalThis.cv) globalThis.cv.onRuntimeInitialized = () => {
    clearInterval(check);
    resolve();
  };
});
```

50ms polling + onRuntimeInitialized 콜백 이중 보장. WASM init 완료 후에만 resolve.

### React StrictMode AbortError race

원 spec 의 `loadOpenCV(opts)` 에 `signal` 전달 시 StrictMode 의 cleanup → mount-2 의 `ac.abort()` 가 캐시된 promise 를 poison → mount-2 가 무한 retry. 픽스:

```ts
// loader 자체에 signal 전달 X — 로드는 idempotent + fast (10MB 로컬)
await loadOpenCV({ onProgress: ... });

// 사용자 cancel 은 ac.signal.aborted 체크로 분리 처리
if (ac.signal.aborted) return;
```

cancel 시점은 loader 가 아니라 호출 측에서 검사. loader 는 항상 완주.

### 수용 기준 추가

- [ ] `public/opencv.js` vendored (외부 도메인 의존 0)
- [ ] `loadOpenCV()` 가 vendored URL 사용
- [ ] `cv.Mat is not a constructor` 회귀 방지 — `isCvReady()` 검사 통과 후에만 resolve
- [ ] StrictMode 환경에서 무한 retry 없음 (loader 에 signal 전달 X)
- [ ] Node 환경 (`scripts/tune-pipeline.ts`) 에서도 같은 vendored 파일 사용

### 검수 영향

- 외부 도메인 의존 0 — 검수 시 "외부 통신 사유" 항목 단순화
- 자가 호스트 → 저작권 표기: `@techstark/opencv-js` (Apache 2.0) 라이선스 NOTICE 노출 권장.
