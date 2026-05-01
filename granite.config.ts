import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "coffilens",
  brand: {
    displayName: "커피렌즈",
    primaryColor: "#6B4423", // DESIGN.md --color-primary
    icon: "", // TODO: 토스 콘솔 등록 시 아이콘 URL 입력
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
