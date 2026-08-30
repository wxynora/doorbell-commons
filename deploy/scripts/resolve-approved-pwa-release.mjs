#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const APPROVED_MARKER_RE = /^\/\/ approved-pwa-release:(auto|(\d{4}-\d{2}-\d{2})\.(\d+))$/gmu;
const WEB_ENTRY_RE = /(?:src|href)="\/(assets\/[^"?#]+\.(?:js|css))"/gu;

function markerMatches(worker) {
  return [...worker.matchAll(APPROVED_MARKER_RE)];
}

function currentRelease(worker) {
  const matches = markerMatches(worker);
  if (matches.length !== 1 || matches[0][1] === "auto" || !matches[0][2] || !matches[0][3]) {
    throw new Error("Current runtime Worker has no single numeric approved release");
  }
  return { prefix: matches[0][2], sequence: Number(matches[0][3]) };
}

function normalizedBuiltWorker(worker) {
  const matches = markerMatches(worker);
  if (matches.length !== 1 || matches[0][1] !== "auto") {
    throw new Error("Built Worker must contain one approved-pwa-release:auto marker");
  }
  return worker.replace(matches[0][0], "// approved-pwa-release:auto");
}

function normalizedCurrentWorker(worker) {
  const matches = markerMatches(worker);
  if (matches.length !== 1 || matches[0][1] === "auto") {
    throw new Error("Current runtime Worker marker is invalid");
  }
  return worker.replace(matches[0][0], "// approved-pwa-release:auto");
}

function webEntries(indexHtml) {
  const entries = [
    ...new Set([...indexHtml.matchAll(WEB_ENTRY_RE)].map((match) => match[1])),
  ].sort();
  if (
    !entries.some((entry) => entry.endsWith(".js")) ||
    !entries.some((entry) => entry.endsWith(".css"))
  ) {
    throw new Error("Web index has no complete content-hashed JS/CSS entry set");
  }
  return entries;
}

export function resolveApprovedPwaRelease(input) {
  const current = currentRelease(input.currentWorker);
  const currentEntries = webEntries(input.currentIndexHtml);
  const builtEntries = webEntries(input.builtIndexHtml);
  const normalizedCurrent = normalizedCurrentWorker(input.currentWorker);
  const normalizedBuilt = normalizedBuiltWorker(input.builtWorker);
  const webChanged =
    JSON.stringify(currentEntries) !== JSON.stringify(builtEntries) ||
    normalizedCurrent !== normalizedBuilt;
  const sequence = current.sequence + Number(webChanged);
  const release = `${current.prefix}.${String(sequence)}`;
  return {
    release,
    webChanged,
    worker: normalizedBuilt.replace(
      "// approved-pwa-release:auto",
      `// approved-pwa-release:${release}`,
    ),
  };
}

async function main() {
  const [currentIndexPath, currentWorkerPath, builtIndexPath, builtWorkerPath] =
    process.argv.slice(2);
  if (!currentIndexPath || !currentWorkerPath || !builtIndexPath || !builtWorkerPath) {
    throw new Error(
      "Usage: resolve-approved-pwa-release.mjs <current-index> <current-worker> <built-index> <built-worker>",
    );
  }
  const result = resolveApprovedPwaRelease({
    currentIndexHtml: await readFile(currentIndexPath, "utf8"),
    currentWorker: await readFile(currentWorkerPath, "utf8"),
    builtIndexHtml: await readFile(builtIndexPath, "utf8"),
    builtWorker: await readFile(builtWorkerPath, "utf8"),
  });
  await writeFile(builtWorkerPath, result.worker, "utf8");
  process.stdout.write(
    `${JSON.stringify({ release: result.release, webChanged: result.webChanged })}\n`,
  );
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
