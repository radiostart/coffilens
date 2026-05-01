import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/main.tsx",
        "src/vite-env.d.ts",
        // 라우트는 베타 (D13~17) 수동 검증 — 단위 커버리지 대상 X
        "src/routes/**",
        // SDK 의존 — 실 브라우저 베타에서 검증 (sweep Issue 29 결정)
        "src/opencv/loader.ts",
      ],
      thresholds: {
        // plain.md Section 13 커버리지 목표:
        // opencv/* ★★★ 80%+, recommendation/* ★★★ 100%, storage/* ★★ 80%+
        "src/opencv/**": { branches: 70, functions: 80, lines: 80, statements: 80 },
        "src/recommendation/**": {
          branches: 90,
          functions: 100,
          lines: 95,
          statements: 95,
        },
        // storage 의 IDB onerror 경로는 fake-indexeddb 로 트리거 어려워 약간 완화
        "src/storage/**": {
          branches: 60,
          functions: 75,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
