#!/usr/bin/env node

import { constants } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function mergeWebAssets(previousAssetsDirectory, candidateAssetsDirectory) {
  const previous = resolve(previousAssetsDirectory);
  const candidate = resolve(candidateAssetsDirectory);
  await mkdir(candidate, { recursive: true });

  for (const entry of await readdir(previous, { withFileTypes: true })) {
    const source = join(previous, entry.name);
    const destination = join(candidate, entry.name);
    if (entry.isDirectory()) {
      await mergeWebAssets(source, destination);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported previous Web asset entry: ${source}`);
    }
    try {
      await copyFile(source, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") continue;
      throw error;
    }
  }
}

async function main() {
  const [previousAssetsDirectory, candidateAssetsDirectory] = process.argv.slice(2);
  if (!previousAssetsDirectory || !candidateAssetsDirectory) {
    throw new Error(
      "Usage: merge-web-assets.mjs <previous-assets-directory> <candidate-assets-directory>",
    );
  }
  await mergeWebAssets(previousAssetsDirectory, candidateAssetsDirectory);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
