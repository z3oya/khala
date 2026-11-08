import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;
const apiTarget = `http://127.0.0.1:${process.env.KHALA_PORT ?? "14034"}`;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  clearScreen: false,
  server: {
    port: 14033,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 14035,
        }
      : undefined,
    proxy: {
      "/api": apiTarget,
    },
    watch: {
      ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**"],
    },
  },
}));
