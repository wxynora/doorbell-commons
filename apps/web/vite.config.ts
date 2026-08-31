import { createHash } from "node:crypto";
import { globSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  assertFarmAssetBuildOutput,
  assertFarmAssetCoverage,
} from "./src/farm/farm-asset-coverage";
import { CANDIDATE_TWO_PUBLIC_ASSET_GLOBS } from "./src/preview/candidate-two-asset-inventory";

const CANDIDATE_TWO_ASSET_MODULE_ID = "virtual:candidate-two-asset-urls";
const RESOLVED_CANDIDATE_TWO_ASSET_MODULE_ID = `\0${CANDIDATE_TWO_ASSET_MODULE_ID}`;

function candidateTwoAssetUrlPlugin(): Plugin {
  return {
    name: "candidate-two-asset-urls",
    resolveId(id) {
      return id === CANDIDATE_TWO_ASSET_MODULE_ID ? RESOLVED_CANDIDATE_TWO_ASSET_MODULE_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_CANDIDATE_TWO_ASSET_MODULE_ID) return null;
      const webRoot = import.meta.dirname;
      const entries = CANDIDATE_TWO_PUBLIC_ASSET_GLOBS.flatMap((pattern) =>
        globSync(pattern, { cwd: webRoot }).map((sourcePath) => {
          const publicPath = `/${sourcePath.slice("public/".length)}`;
          const contentHash = createHash("sha256")
            .update(readFileSync(resolve(webRoot, sourcePath)))
            .digest("hex")
            .slice(0, 16);
          return [publicPath, `${publicPath}?v=${contentHash}`] as const;
        }),
      ).sort(([left], [right]) => left.localeCompare(right));
      return `
        const assetUrls = new Map(${JSON.stringify(entries)});
        export function rewriteCandidateTwoAssetUrls(html) {
          let rewritten = html;
          for (const [publicPath, assetUrl] of assetUrls) {
            rewritten = rewritten.replaceAll(publicPath, assetUrl);
          }
          return rewritten;
        }
      `;
    },
  };
}

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
  plugins: [candidateTwoAssetUrlPlugin(), farmAssetCoveragePlugin(), react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});
