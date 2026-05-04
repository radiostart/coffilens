import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "coffilens",
  brand: {
    displayName: "커피렌즈",
    primaryColor: "#6B4423", // DESIGN.md --color-primary
    icon: "https://static.toss.im/appsintoss/39865/f137571b-ea5a-4d3b-bf60-d00904baca16.png",
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
