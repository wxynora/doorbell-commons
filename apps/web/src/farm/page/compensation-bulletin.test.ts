/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BoundBulletinRead } from "../../auth/bulletin-client";
import { bulletinHasUnreadEntries, compensationBulletinIdentity } from "./farm-field-content";

const fieldSource = readFileSync(new URL("./farm-field-content.tsx", import.meta.url), "utf8");
const chromeSource = readFileSync(new URL("./chrome.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../farm-page.css", import.meta.url), "utf8");

function bulletin(section: string | null): BoundBulletinRead {
  return {
    subject: { farm_doorplate: "ABC234" },
    data: {
      available: {
        tasks: [],
        mature_plots: [],
        messages: [],
        ranch_notifications: [
          {
            text: "近期问题补偿：已发放 100,000 金币和 1,000 银币。",
            at: "2026-08-30T00:00:00.000Z",
            section,
          },
        ],
      },
      unavailable: {},
    },
    revision: `farm-bulletin-v1:${"b".repeat(64)}`,
    server_time: "2026-08-30T00:00:00.000Z",
  };
}

test("only an unread compensation notice has an automatic bulletin identity", () => {
  assert.equal(compensationBulletinIdentity(null), null);
  assert.equal(compensationBulletinIdentity(bulletin("ranch")), null);
  assert.equal(
    compensationBulletinIdentity(bulletin("compensation")),
    `farm-bulletin-v1:${"b".repeat(64)}:2026-08-30T00:00:00.000Z:近期问题补偿：已发放 100,000 金币和 1,000 银币。`,
  );
});

test("any authority-backed unread entry drives the bulletin dot", () => {
  assert.equal(bulletinHasUnreadEntries(null), false);
  assert.equal(bulletinHasUnreadEntries(bulletin("compensation")), true);
  const empty = bulletin(null);
  empty.data.available.ranch_notifications = [];
  assert.equal(bulletinHasUnreadEntries(empty), false);
  assert.match(chromeSource, /bulletinUnread \? "打开叮咚播报，有新播报"/);
  assert.match(chromeSource, /className="farm-tool-menu__unread"/);
  assert.match(styles, /\.farm-tool-menu__unread\s*\{[^}]*background:\s*#d84738/);
  assert.match(fieldSource, /bulletinUnread=\{bulletinUnread\}/);
});

test("compensation is acknowledged only from the rendered bulletin close action", () => {
  assert.match(
    fieldSource,
    /onClose=\{\(\) => \{\s*acknowledgeDisplayedBulletinIfNeeded\(\{ allowCompensation: true \}\)/,
  );
  assert.match(
    fieldSource,
    /sceneId !== activeScene && activeSceneUiState\.bulletinOpen[\s\S]*?acknowledgeDisplayedBulletinIfNeeded\(\)/,
  );
  assert.match(
    fieldSource,
    /if \(activeSceneUiState\.bulletinOpen\) \{\s*acknowledgeDisplayedBulletinIfNeeded\(\)/,
  );
  assert.match(
    fieldSource,
    /allowCompensation \|\| compensationBulletinIdentity\(displayedBulletin\) === null/,
  );
});
