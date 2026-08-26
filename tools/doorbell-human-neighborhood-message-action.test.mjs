import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";

const dataDirectory = mkdtempSync(join(tmpdir(), "aifarm-doorbell-neighborhood-message-action-"));
process.env.AIFARM_DATA_DIR = dataDirectory;

const NOW = Date.parse("2026-08-24T04:00:00.000Z");
const SENDER_ID = "ABC234";
const TARGET_ID = "BCDFGH";
const SENDER_KEY = "private-neighborhood-sender-key";
const PAIRS = [
  [SENDER_ID, TARGET_ID],
  ["DEF567", "GHJ789"],
  ["JKM234", "MNPQRS"],
  ["RST456", "WXYZ23"],
];
let pairIndex = 0;

const { makeFarm } = await import("../dist/game.js");
const { getFarm, insertFarm } = await import("../dist/store.js");
const {
  handleHumanNeighborhoodMessageAction,
  neighborhoodMessageActionRevision,
} = await import("../dist/server/neighborhood-message-action.js");

after(() => rmSync(dataDirectory, { recursive: true, force: true }));

function addFarm(id, name, humanKey) {
  const farm = makeFarm(name, 123456, { aiName: `${name}的小机`, humanName: "渡" });
  farm.id = id;
  farm.humanKey = humanKey;
  farm.social = { visit: true, message: true };
  farm.guestbook = true;
  insertFarm(farm);
  return getFarm(id);
}

function addPair() {
  const [senderId, targetId] = PAIRS[pairIndex++];
  const sender = addFarm(senderId, "发送方", `${SENDER_KEY}-${senderId}`);
  const target = addFarm(targetId, "接收方", `private-neighborhood-target-key-${targetId}`);
  return { sender, target };
}

function body(sender, target, revision, key, message = "  你好，邻居！  ") {
  return {
    farm_human_key: sender.humanKey,
    expected_farm_doorplate: sender.id,
    target_farm_doorplate: target.id,
    message,
    expected_neighborhood_revision: revision,
    idempotency_key: key,
  };
}

test("message action delegates the legacy message and notification behavior atomically", () => {
  const { sender, target } = addPair();
  const revision = neighborhoodMessageActionRevision(sender, NOW);
  assert.match(revision, /^farm-neighborhood-v1:[0-9a-f]{64}$/);

  const result = handleHumanNeighborhoodMessageAction(
    sender,
    body(sender, target, revision, "019ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );

  assert.equal(result.status, 200);
  assert.equal(result.json.data.result.receipt_id, "019ffb01-49cd-7020-84af-3d04fb1ed03d");
  assert.equal(result.json.data.result.target_farm_doorplate, TARGET_ID);
  assert.match(result.json.data.result.message_id, /^[0-9a-f]{6}$/);
  assert.equal(result.json.data.resource.status, "available");
  assert.equal(result.json.data.resource.messages[0].text, "你好，邻居！");
  assert.equal(result.json.data.resource.messages[0].author_farm_doorplate, SENDER_ID);
  assert.equal(result.json.data.resource.messages[0].author_name, "发送方");
  assert.equal(result.json.revision, neighborhoodMessageActionRevision(sender, NOW));

  const savedTarget = getFarm(TARGET_ID);
  assert.deepEqual(savedTarget.messages.at(-1), {
    id: result.json.data.result.message_id,
    by: SENDER_ID,
    name: "发送方",
    text: "你好，邻居！",
    at: NOW,
  });
  assert.match(savedTarget.inbox.at(-1).text, /发送方/);
  assert.match(savedTarget.inbox.at(-1).text, /你好，邻居！/);
  assert.equal(sender.visitedIds, undefined);
  assert.equal(target.trail, undefined);
});

test("same request replays its real receipt, but a different payload conflicts", () => {
  const { sender, target } = addPair();
  const revision = neighborhoodMessageActionRevision(sender, NOW);
  const request = body(sender, target, revision, "119ffb01-49cd-7020-84af-3d04fb1ed03d", "第一句");
  const first = handleHumanNeighborhoodMessageAction(sender, request, NOW);
  assert.equal(first.status, 200);
  const savedAfterFirst = structuredClone(getFarm(target.id));
  const replay = handleHumanNeighborhoodMessageAction(getFarm(sender.id), request, NOW + 60_000);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.json, first.json);
  assert.deepEqual(getFarm(target.id), savedAfterFirst);

  const conflict = handleHumanNeighborhoodMessageAction(
    getFarm(sender.id),
    body(getFarm(sender.id), getFarm(target.id), first.json.revision, request.idempotency_key, "第二句"),
    NOW,
  );
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, "idempotency_conflict");
  assert.deepEqual(getFarm(target.id), savedAfterFirst);
});

test("strict binding, revision, and social gates reject with zero change", () => {
  const { sender, target } = addPair();
  const revision = neighborhoodMessageActionRevision(sender, NOW);
  const beforeSender = structuredClone(sender);
  const beforeTarget = structuredClone(target);

  const extraField = handleHumanNeighborhoodMessageAction(
    sender,
    { ...body(sender, target, revision, "219ffb01-49cd-7020-84af-3d04fb1ed03d"), display_name: "不应接受" },
    NOW,
  );
  assert.equal(extraField.status, 400);
  assert.equal(extraField.json.error.code, "invalid_request");
  assert.deepEqual(getFarm(sender.id), beforeSender);
  assert.deepEqual(getFarm(target.id), beforeTarget);

  const stale = handleHumanNeighborhoodMessageAction(
    sender,
    body(sender, target, "farm-neighborhood-v1:stale", "319ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(stale.status, 400);
  assert.equal(stale.json.error.code, "invalid_request");

  const changedTarget = getFarm(target.id);
  changedTarget.messages.push({ id: "old-message", by: sender.id, name: "发送方", text: "已经变了", at: NOW });
  const staleRevision = handleHumanNeighborhoodMessageAction(
    sender,
    body(sender, changedTarget, revision, "419ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(staleRevision.status, 409);
  assert.equal(staleRevision.json.error.code, "state_conflict");

  changedTarget.messages = [];
  changedTarget.social.visit = false;
  const closed = handleHumanNeighborhoodMessageAction(
    sender,
    body(sender, changedTarget, neighborhoodMessageActionRevision(sender, NOW), "519ffb01-49cd-7020-84af-3d04fb1ed03d"),
    NOW,
  );
  assert.equal(closed.status, 409);
  assert.equal(closed.json.error.code, "access_closed");
  assert.deepEqual(getFarm(sender.id), beforeSender);
});

test("a failed two-farm save restores both clones and persists no half-message", () => {
  const { sender, target } = addPair();
  sender.doorbellHumanNeighborhoodMessageReceipts = {};
  sender.doorbellHumanNeighborhoodMessageReceipts.old = {};
  sender.doorbellHumanNeighborhoodMessageReceipts.old.self = sender.doorbellHumanNeighborhoodMessageReceipts.old;
  const revision = neighborhoodMessageActionRevision(sender, NOW);
  const beforeSender = structuredClone(sender);
  const beforeTarget = structuredClone(target);
  const result = handleHumanNeighborhoodMessageAction(
    sender,
    body(sender, target, revision, "619ffb01-49cd-7020-84af-3d04fb1ed03d", "不能半成功"),
    NOW,
  );

  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "farm_unavailable");
  assert.deepEqual(getFarm(sender.id), beforeSender);
  assert.deepEqual(getFarm(target.id), beforeTarget);
});
