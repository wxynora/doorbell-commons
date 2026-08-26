import { rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  assertFarmAssetBuildOutput,
  assertFarmAssetCoverage,
} from "./src/farm/farm-asset-coverage";

function farmAssetCoveragePlugin(): Plugin {
  let outputDir = "";

  return {
    name: "farm-asset-coverage",
    apply: "build",
    configResolved(config) {
      outputDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      const report = assertFarmAssetCoverage();
      this.info(
        `farm asset coverage: ${report.declarations} declarations, ${report.sourceFiles} source files`,
      );
    },
    generateBundle(_options, bundle) {
      const emittedImages = assertFarmAssetBuildOutput(bundle);
      this.info(`farm asset build output: ${emittedImages} image files with content-hashed names`);
      const approvedSourceFiles = Object.keys(bundle).filter((fileName) =>
        fileName.startsWith("farm/cooking-tools/approved-source/"),
      );
      for (const fileName of approvedSourceFiles) {
        delete bundle[fileName];
      }
      if (approvedSourceFiles.length > 0) {
        this.info(
          `farm asset build output: excluded ${approvedSourceFiles.length} approved-source files`,
        );
      }
    },
    writeBundle() {
      const approvedSourceDir = resolve(outputDir, "farm", "cooking-tools", "approved-source");
      rmSync(approvedSourceDir, { force: true, recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [farmAssetCoveragePlugin(), react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
