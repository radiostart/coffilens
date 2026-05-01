import { describe, it } from "vitest";
import { RuleTester } from "eslint";
// @ts-expect-error — JS rule, no .d.ts
import rule from "../../eslint-rules/no-direct-mat.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("no-direct-mat", () => {
  it("RuleTester valid + invalid 케이스", () => {
    ruleTester.run("no-direct-mat", rule, {
      valid: [
        // mat-pool.ts 본인 — 허용
        {
          code: "const m = new cv.Mat();",
          filename: "/project/src/opencv/mat-pool.ts",
        },
        // scope.track(new cv.Mat()) — 권장 패턴, 허용
        {
          code: "function f(scope) { return scope.track(new cv.Mat()); }",
          filename: "/project/src/opencv/segment.ts",
        },
        {
          code: "function f(scope) { return scope.track(new cv.MatVector()); }",
          filename: "/project/src/opencv/segment.ts",
        },
        // cv 가 아닌 객체 — 통과
        {
          code: "const m = new other.Mat();",
          filename: "/project/src/opencv/segment.ts",
        },
        // 차단 목록 외 클래스 — 통과
        {
          code: "const m = new cv.Foo();",
          filename: "/project/src/opencv/segment.ts",
        },
      ],
      invalid: [
        {
          code: "const m = new cv.Mat();",
          filename: "/project/src/opencv/segment.ts",
          errors: [{ messageId: "direct", data: { name: "Mat" } }],
        },
        {
          code: "const v = new cv.MatVector();",
          filename: "/project/src/opencv/segment.ts",
          errors: [{ messageId: "direct", data: { name: "MatVector" } }],
        },
        {
          code: "const r = new cv.RotatedRect();",
          filename: "/project/src/foo.ts",
          errors: [{ messageId: "direct", data: { name: "RotatedRect" } }],
        },
        // 윈도우 백슬래시 경로 — fake-mat-pool 은 차단되어야 함
        {
          code: "const m = new cv.Mat();",
          filename: "C:\\project\\src\\fake-mat-pool.ts",
          errors: [{ messageId: "direct", data: { name: "Mat" } }],
        },
        // mat-pool.ts 처럼 보이지만 다른 파일 (sweep Issue 8 fix 검증)
        {
          code: "const m = new cv.Mat();",
          filename: "/project/src/tests/fake-mat-pool.ts",
          errors: [{ messageId: "direct", data: { name: "Mat" } }],
        },
      ],
    });
  });
});
