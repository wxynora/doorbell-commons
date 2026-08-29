/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { buildCandidateTwoRuntimeHtml, parseCandidateTwoAction } from "./candidate-two-preview";

const LETTER_ID = "11111111-1111-4111-8111-111111111111";

test("Home mailbox uses only the existing human mailbox categories and strict bridge actions", () => {
  assert.deepEqual(
    parseCandidateTwoAction({ type: "home-mailbox-list", category: null, page: 1 }),
    { type: "home-mailbox-list", category: null, page: 1 },
  );
  assert.deepEqual(
    parseCandidateTwoAction({ type: "home-mailbox-detail-open", letterId: LETTER_ID }),
    { type: "home-mailbox-detail-open", letterId: LETTER_ID },
  );
  assert.deepEqual(parseCandidateTwoAction({ type: "home-mailbox-claim", letterId: LETTER_ID }), {
    type: "home-mailbox-claim",
    letterId: LETTER_ID,
  });
  assert.equal(
    parseCandidateTwoAction({ type: "home-mailbox-list", category: "visit", page: 1 }),
    null,
  );

  const html = buildCandidateTwoRuntimeHtml();
  assert.match(html, />全部<[\s\S]*>系统<[\s\S]*>农场<[\s\S]*>铃野</);
  assert.doesNotMatch(html, />串门<[\s\S]*>活动<[\s\S]*>通知</);
  assert.match(
    html,
    /function openHomeMailbox\(\)[\s\S]*home-mailbox-list'[\s\S]*category: homeMailboxCategory[\s\S]*page: homeMailboxPage/,
  );
  assert.match(
    html,
    /function applyHomeMailboxState\(mailbox\)[\s\S]*list\.data\.letters\.map[\s\S]*letterId: letter\.letter_id[\s\S]*unread: letter\.is_new/,
  );
  assert.match(
    html,
    /function openHomeMailboxDetail\(message\)[\s\S]*home-mailbox-detail-open'[\s\S]*letterId: message\.letterId/,
  );
  assert.match(
    html,
    /function claimHomeMailboxAttachment\(\)[\s\S]*home-mailbox-claim'[\s\S]*letterId: homeMailboxSelectedLetterId/,
  );
  assert.match(html, /门铃请求功能尚未开放/);
  assert.match(html, /串门开放后，这里会显示真实访客/);
  assert.match(html, /最近活动尚未接入真实数据/);
});
