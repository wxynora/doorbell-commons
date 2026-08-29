/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { BoundBulletinRead } from "../../auth/bulletin-client";
import { compensationBulletinIdentity } from "./farm-field-content";

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
