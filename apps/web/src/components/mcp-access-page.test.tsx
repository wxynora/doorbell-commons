/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("MCP access follows the residence permit as a standalone page", () => {
  const appSource = readSource("../app.tsx");
  const pageSource = readSource("./mcp-access-panel.tsx");

  assert.match(pageSource, /export function McpAccessPage/);
  assert.match(pageSource, /<div className="mcp-access-page">[\s\S]*?<main/);
  assert.doesNotMatch(pageSource, /<aside|mcp-access__launcher|mcp-access__sheet|关闭领取面板/);
  assert.match(
    appSource,
    /appState\.stage === "issuing-permit"[\s\S]*?<ResidencePermitTransition/,
  );
  assert.match(
    appSource,
    /appState\.stage === "authenticated" && showMcpAfterPermit[\s\S]*?<McpAccessPage/,
  );
  assert.doesNotMatch(appSource, /McpAccessPanel|openInitially|mcp-access__launcher/);
  assert.ok(appSource.indexOf("<McpAccessPage") < appSource.indexOf("<CandidateTwoPreview"));
});

test("standalone MCP access removes popup geometry and nested delivery cards", () => {
  const styles = readSource("../styles.css");

  assert.match(styles, /\.mcp-access-page \{[\s\S]*?min-height: 100svh;/);
  assert.match(styles, /\.mcp-access-page__main \{[\s\S]*?background: #fffdf9;/);
  assert.doesNotMatch(styles, /\.mcp-access__sheet|\.mcp-access__launcher|\.mcp-access__close/);
  assert.match(
    styles,
    /\.mcp-access__delivery \{[\s\S]*?border-top: 1px dashed[\s\S]*?background: transparent;/,
  );
  assert.match(
    styles,
    /\.mcp-access__primary,[\s\S]*?border-radius: 2px;[\s\S]*?background: #73584b;/,
  );
});
