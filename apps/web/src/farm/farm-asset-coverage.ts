import { statSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { FARM_ASSET_MANIFEST } from "./farm-asset-manifest";
import { FARM_ASSET_SOURCE_URLS, type FarmAssetSourcePath } from "./farm-asset-source-map";

export interface FarmAssetCoverageReport {
  declarations: number;
  sourceFiles: number;
  statusCounts: Record<"production" | "fallback" | "missing", number>;
}

function identityKey(entry: (typeof FARM_ASSET_MANIFEST)[keyof typeof FARM_ASSET_MANIFEST]) {
  return [entry.domain, entry.entityKind, entry.entityId, entry.visualState].join("\u0000");
}

function sourceFileFor(sourceUrl: string): string {
  const mapped = FARM_ASSET_SOURCE_URLS[sourceUrl as FarmAssetSourcePath];
  if (!mapped) {
    throw new Error(`missing farm asset source mapping: ${sourceUrl}`);
  }
  if (!mapped.startsWith("file:")) {
    throw new Error(`farm asset source is not a local build input: ${sourceUrl} -> ${mapped}`);
  }
  const filePath = fileURLToPath(mapped);
  const stat = statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new Error(`farm asset source file is missing: ${sourceUrl} -> ${filePath}`);
  }
  if (stat.size <= 0) {
    throw new Error(`farm asset source file is empty: ${sourceUrl} -> ${filePath}`);
  }
  return filePath;
}

export function getFarmAssetSourceFiles(): string[] {
  return [
    ...new Set(
      Object.values(FARM_ASSET_MANIFEST)
        .filter((entry) => entry.status !== "missing")
        .map((entry) => sourceFileFor(entry.url)),
    ),
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertFarmAssetBuildOutput(bundle: Readonly<Record<string, unknown>>): number {
  const emittedImages = Object.keys(bundle).filter((fileName) => /\.(?:png|webp)$/.test(fileName));
  const missing = getFarmAssetSourceFiles().filter((sourceFile) => {
    const fileName = basename(sourceFile);
    const extension = fileName.slice(fileName.lastIndexOf("."));
    const stem = fileName.slice(0, -extension.length);
    const pattern = new RegExp(`(?:^|/)${escapeRegExp(stem)}-[^/]+${escapeRegExp(extension)}$`);
    return !emittedImages.some((emittedImage) => pattern.test(emittedImage));
  });

  if (missing.length > 0) {
    throw new Error(
      `farm asset build output missing content-hashed files:\n- ${missing.join("\n- ")}`,
    );
  }
  return emittedImages.length;
}

export function inspectFarmAssetCoverage(): FarmAssetCoverageReport {
  const entries = Object.entries(FARM_ASSET_MANIFEST);
  const errors: string[] = [];
  const keys = new Set<string>();
  const identities = new Set<string>();
  const sourceFiles = new Set<string>();
  const statusCounts = { production: 0, fallback: 0, missing: 0 } as const;
  const mutableStatusCounts = { ...statusCounts };

  for (const [assetKey, entry] of entries) {
    if (keys.has(assetKey)) {
      errors.push(`duplicate manifest key: ${assetKey}`);
    }
    keys.add(assetKey);

    const identity = identityKey(entry);
    if (identities.has(identity)) {
      errors.push(`duplicate manifest identity: ${identity.replaceAll("\u0000", "/")}`);
    }
    identities.add(identity);

    mutableStatusCounts[entry.status] += 1;
    if (entry.status === "missing") {
      continue;
    }

    try {
      sourceFiles.add(sourceFileFor(entry.url));
    } catch (error) {
      errors.push(`${assetKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sourceKeys = Object.keys(FARM_ASSET_SOURCE_URLS);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    errors.push("duplicate farm asset source mapping key");
  }

  if (errors.length > 0) {
    throw new Error(`farm asset coverage failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    declarations: entries.length,
    sourceFiles: sourceFiles.size,
    statusCounts: mutableStatusCounts,
  };
}

export function assertFarmAssetCoverage(): FarmAssetCoverageReport {
  return inspectFarmAssetCoverage();
}
