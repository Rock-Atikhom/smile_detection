import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/service-worker",
      filename: "sw.ts",
      injectRegister: false,
      devOptions: {
        enabled: true,
        type: "module",
      },
      injectManifest: {
        globPatterns: ["**/*.{html,css,js,json,png,svg,ico}"],
        globIgnores: [
          "vision/**/*",
          "vision/**/*.js",
          "vision/**/*.wasm",
          "vision/**/*.task",
          "vision/**/*.pdf",
          "vision/**/*.txt",
        ],
      },
    }),
  ],
  worker: {
    format: "iife",
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
