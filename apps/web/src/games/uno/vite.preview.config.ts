import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  server: {
    port: 5190,
    strictPort: true,
  },
  build: {
    outDir: "dist-uno-preview",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("../../../uno-preview.html", import.meta.url)),
    },
  },
});
