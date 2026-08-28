import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: "dist-doudizhu-preview",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("../../../doudizhu-preview.html", import.meta.url)),
    },
  },
});
