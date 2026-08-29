/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./neighborhood-scene.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./neighborhood-scene.css", import.meta.url), "utf8");

test("each farm card keeps its own ten-entry message region fixed and scrollable", () => {
  assert.match(source, /activeSection\.id === "message-board" \? " is-message-board"/);
  assert.match(
    styles,
    /\.farm-neighborhood__body\.is-message-board\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__message-area\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto[^}]*height:\s*100%[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__message-boards\s*\{[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*thin/s,
  );
  assert.match(
    styles,
    /\.farm-neighborhood__message-board-card ul\s*\{[^}]*height:\s*clamp\(168px, 24vh, 220px\)[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*thin/s,
  );
  assert.match(styles, /message-board-card:nth-child\(3n \+ 2\) > header/);
  assert.match(styles, /message-board-card:nth-child\(3n \+ 3\) > header/);
  assert.match(
    styles,
    /message-board-card > header\s*\{[^}]*border-bottom:\s*0\.55cqw solid #91a764[^}]*background:\s*#dce9ca/s,
  );
  assert.match(styles, /message-board-card\[data-own="true"\] > header\s*\{[^}]*background:\s*#efe0a8/s);
});
