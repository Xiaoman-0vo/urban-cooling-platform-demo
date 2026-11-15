import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({mode})=>({
  base: "./",
  ...(mode==="accounts"?{define:{"import.meta.env.VITE_URBANCOOL_ACCOUNTS":JSON.stringify("1")}}:{}),
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    proxy: {"/api/agent": {target: "http://127.0.0.1:5181", changeOrigin: true}},
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  preview: {proxy: {"/api/agent": {target: "http://127.0.0.1:5181", changeOrigin: true}}},
  plugins: [react()],
}));
