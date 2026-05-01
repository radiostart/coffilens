/**
 * ESLint custom rule — `new cv.Mat()` 직접 호출 차단.
 *
 * OpenCV.js Mat 은 WASM 힙 할당이라 GC 대상 아님. `.delete()` 누락 시 영구 누수.
 * 모든 Mat 생성은 `scope.track(new cv.Mat(...))` 패턴 필수.
 *
 * 예외 파일:
 *  - mat-pool.ts (MatScope 자체 구현)
 *  - 명시적 인라인 disable (ex: F05 watershed contours/hierarchy 가 escape 시)
 */

const BLOCKED = new Set([
  "Mat",
  "MatVector",
  "RotatedRect",
  "Size",
  "Point",
]);

/**
 * 파일 경로 매칭 — 윈도우 백슬래시도 안전하게 처리.
 * sweep Issue 8: endsWith 단순 비교는 fake-mat-pool.ts 까지 매치 + 윈도우 호환 X.
 */
function isAllowedFile(filename) {
  if (!filename) return false;
  // path separator 정규화
  const normalized = filename.replace(/\\/g, "/");
  // /mat-pool.ts 정확히 끝나야 함 (fake-mat-pool 등은 매치 X)
  return /\/mat-pool\.ts$/.test(normalized);
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "OpenCV.js Mat 직접 생성 차단 — MatScope.track 패턴 강제. 메모리 누수 방지.",
    },
    messages: {
      direct:
        "`new cv.{{name}}(...)` 직접 호출 금지. `scope.track(new cv.{{name}}(...))` 패턴 사용. (mat-pool.ts 외부)",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (isAllowedFile(filename)) return {};

    return {
      NewExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.object.type !== "Identifier" ||
          callee.object.name !== "cv" ||
          callee.property.type !== "Identifier" ||
          !BLOCKED.has(callee.property.name)
        ) {
          return;
        }
        context.report({
          node,
          messageId: "direct",
          data: { name: callee.property.name },
        });
      },
    };
  },
};

export default rule;
