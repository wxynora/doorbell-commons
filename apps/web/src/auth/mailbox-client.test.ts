/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  claimMailboxAttachment,
  getMailboxLetter,
  listMailbox,
  mailboxIssueMessage,
} from "./mailbox-client";

const LETTER = {
  attachment: { attachment_type: "farm_reward" as const, status: "available" as const },
  category: "farm" as const,
  created_at: "2026-08-30T04:00:00.000Z",
  is_new: true,
  letter_id: "11111111-1111-4111-8111-111111111111",
  title: "欢迎来到 Doorbell Commons",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("mailbox list, detail, and claim use the existing same-origin human routes", async () => {
  const requests: Array<{ body: string | null; method: string; url: string }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({
      body: init?.body ? String(init.body) : null,
      method: init?.method ?? "",
      url,
    });
    if (url.endsWith("/claim")) {
      return jsonResponse({
        letter: {
          ...LETTER,
          attachment: { ...LETTER.attachment, status: "claimed" },
          body: "欢迎礼物",
        },
      });
    }
    if (url.includes(LETTER.letter_id)) {
      return jsonResponse({ letter: { ...LETTER, body: "欢迎礼物", is_new: false } });
    }
    return jsonResponse({
      letters: [LETTER],
      pagination: { page: 2, page_size: 8, total_items: 9, total_pages: 2 },
    });
  };

  assert.equal((await listMailbox({ category: "farm", fetcher, page: 2 })).ok, true);
  assert.equal((await getMailboxLetter(LETTER.letter_id, { fetcher })).ok, true);
  assert.equal((await claimMailboxAttachment(LETTER.letter_id, { fetcher })).ok, true);
  assert.deepEqual(requests, [
    { body: null, method: "GET", url: "/api/mailbox?page=2&category=farm" },
    { body: null, method: "GET", url: `/api/mailbox/${LETTER.letter_id}` },
    { body: "{}", method: "POST", url: `/api/mailbox/${LETTER.letter_id}/claim` },
  ]);
});

test("mailbox client rejects malformed success data and keeps readable server failures", async () => {
  const malformed = await listMailbox({
    fetcher: async () => jsonResponse({ letters: [], pagination: { page: 1 } }),
    page: 1,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.issue.code, "unexpected_response");
  }

  const unavailable = await getMailboxLetter(LETTER.letter_id, {
    fetcher: async () =>
      jsonResponse({ error: { code: "onebot_unavailable", message: "OneBot unavailable" } }, 503),
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(mailboxIssueMessage(unavailable.issue), "暂时无法核验 QQ 群资格，请稍后再试。");
  }
});
