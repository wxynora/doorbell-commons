import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5192,
    strictPort: true,
  },
  build: {
    outDir: "dist-werewolf-preview",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("../../../werewolf-preview.html", import.meta.url)),
    },
  },
});
