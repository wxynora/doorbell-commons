/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import type { FrontendFetcher } from "./auth-client";
import {
  addSharedMeme,
  getSharedMeme,
  listSharedMemes,
  sharedMemeIssueMessage,
} from "./shared-meme-client";

const MEME = {
  aliases: ["俺不中嘞"],
  categories: ["方言梗"],
  category: "方言梗",
  examples: ["这活俺不中嘞"],
  keywords: ["拒绝"],
  meaning: "表示做不了",
  meme_id: 318,
  normalized_term: "俺不中嘞",
  notes: null,
  origin: null,
  term: "俺不中嘞",
  type: "短句",
  types: ["短句"],
  usage: "用于轻松拒绝",
};

const LIBRARY = {
  checksum_sha256: "a".repeat(64),
  entry_count: 318,
  library_version: 2,
  published_at: "2026-08-14T00:00:00.000Z",
  size_bytes: 1024,
  snapshot_schema_version: 1 as const,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("shared meme reads use same-origin Cookie routes and strict response schemas", async () => {
  const requests: Array<{ method: string; url: string }> = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    requests.push({ method: init?.method ?? "", url });
    return url.endsWith("/318")
      ? jsonResponse({ library_version: 2, meme: MEME })
      : jsonResponse({ library: LIBRARY, memes: [MEME] });
  };

  const list = await listSharedMemes(fetcher);
  const detail = await getSharedMeme(318, fetcher);

  assert.equal(list.ok, true);
  assert.equal(detail.ok, true);
  assert.deepEqual(requests, [
    { method: "GET", url: "/api/shared-memes" },
    { method: "GET", url: "/api/shared-memes/318" },
  ]);
});

test("shared meme creation sends only the approved request body", async () => {
  let submittedBody: unknown;
  const fetcher: FrontendFetcher = async (url, init) => {
    assert.equal(url, "/api/shared-memes");
    assert.equal(init?.method, "POST");
    submittedBody = JSON.parse(String(init?.body));
    return jsonResponse({ created: true, library: LIBRARY, meme: MEME });
  };

  const input = {
    aliases: ["俺不中嘞"],
    category: "方言梗",
    meaning: "表示做不了",
    term: "俺不中嘞",
    usage: "用于轻松拒绝",
  };
  const result = await addSharedMeme(input, fetcher);

  assert.equal(result.ok, true);
  assert.deepEqual(submittedBody, input);
});

test("shared meme failures keep server codes and render readable reasons", async () => {
  const duplicate = await addSharedMeme({ term: "重复梗" }, async () =>
    jsonResponse(
      {
        error: {
          code: "duplicate_shared_meme_term",
          message: "The normalized shared meme term already exists",
        },
      },
      409,
    ),
  );

  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.issue.code, "duplicate_shared_meme_term");
    assert.equal(sharedMemeIssueMessage(duplicate.issue), "这个梗已经在共享梗库里了。");
  }
});
