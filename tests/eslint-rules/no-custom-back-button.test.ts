import { describe, it } from "vitest";
import { RuleTester } from "eslint";
// @ts-expect-error — JS rule, no .d.ts
import rule from "../../eslint-rules/no-custom-back-button.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

describe("no-custom-back-button", () => {
  it("RuleTester valid + invalid 케이스", () => {
    ruleTester.run("no-custom-back-button", rule, {
      valid: [
        // 일반 onClick 핸들러
        { code: "function f() { onSubmit(); }" },
        // Wouter router.push (정상)
        { code: 'function f() { router.push("/home"); }' },
        // 정상 버튼 텍스트
        {
          code: "const x = <button onClick={f}>제출</button>;",
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        },
        // history.go(+1) — forward 는 허용
        { code: "history.go(1)" },
        // 비교 연산자 < — JSX text 가 아니므로 통과
        { code: "const a = 1 < 2;" },
      ],
      invalid: [
        {
          code: "history.back()",
          errors: [{ messageId: "historyBack" }],
        },
        {
          code: "window.history.back()",
          errors: [{ messageId: "historyBack" }],
        },
        {
          code: "history.go(-1)",
          errors: [{ messageId: "historyBack" }],
        },
        {
          code: "window.history.go(-1)",
          errors: [{ messageId: "historyBack" }],
        },
        {
          code: "const x = <button onClick={f}>뒤로</button>;",
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          errors: [{ messageId: "backText" }],
        },
        {
          code: "const x = <button onClick={f}>이전</button>;",
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          errors: [{ messageId: "backText" }],
        },
        {
          code: "const x = <button onClick={f}>←</button>;",
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          errors: [{ messageId: "backText" }],
        },
      ],
    });
  });
});
