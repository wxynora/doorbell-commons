import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./doorbellcommons.conf", import.meta.url), "utf8");

test("HTML and the service worker always revalidate while sandboxed fonts allow read-only CORS", () => {
  assert.match(
    source,
    /location = \/index\.html \{[\s\S]*?add_header Cache-Control "no-cache" always;[\s\S]*?try_files \$uri =404;[\s\S]*?\}/,
  );
  assert.match(
    source,
    /location = \/service-worker\.js \{[\s\S]*?add_header Cache-Control "no-cache" always;[\s\S]*?add_header Service-Worker-Allowed "\/" always;[\s\S]*?try_files \$uri =404;[\s\S]*?\}/,
  );
  assert.match(
    source,
    /location \^~ \/fonts\/ \{[\s\S]*?text\/css css;[\s\S]*?font\/ttf ttf;[\s\S]*?font\/woff2 woff2;[\s\S]*?add_header Access-Control-Allow-Origin "\*" always;[\s\S]*?try_files \$uri =404;[\s\S]*?\}/,
  );
  assert.match(source, /location \^~ \/assets\/ \{[\s\S]*?try_files \$uri =404;[\s\S]*?\}/);
  const assetsBlock = source.match(/location \^~ \/assets\/ \{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(assetsBlock, /\/index\.html/);
});

test("only explicitly versioned public assets receive immutable caching", () => {
  const cacheMap = source.match(
    /map "\$uri:\$arg_v" \$doorbell_versioned_public_cache_control \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(cacheMap);
  assert.match(cacheMap, /default "public, max-age=0";/);
  const cachePatterns = [
    ...cacheMap.matchAll(/\n\s*"~(\^.+\$)" "public, max-age=31536000, immutable";/g),
  ].map((match) => {
    const pattern = match[1];
    assert.ok(pattern);
    return new RegExp(pattern);
  });
  assert.equal(cachePatterns.length, 2);
  const hasImmutableCache = (path, version = "") =>
    cachePatterns.some((pattern) => pattern.test(`${path}:${version}`));

  for (const path of [
    "/fonts/doorbell-fonts.v2.css",
    "/fonts/noto-serif-sc-ui-400.v2.woff2",
    "/lingye/together/river-opening-v1.webp",
    "/candidate-two/settings-paperclip-silver-v1.png",
    "/community-icon.v2-192.png",
  ]) {
    assert.equal(hasImmutableCache(path), true, path);
  }
  for (const path of [
    "/lingye/map.png",
    "/lingye/labels/bank.png",
    "/lingye/memorial/qixi-archive/moqu-gufeng-ti.css",
    "/candidate-two/home-parlor-watercolor-background.webp",
  ]) {
    assert.equal(hasImmutableCache(path, "0123456789abcdef"), true, path);
  }
  for (const path of [
    "/index.html",
    "/service-worker.js",
    "/lingye/map.png",
    "/lingye/labels/bank.png",
    "/candidate-two/home-parlor-watercolor-background.webp",
    "/api/health",
  ]) {
    assert.equal(hasImmutableCache(path), false, path);
  }
  assert.equal(hasImmutableCache("/lingye/map.png", "not-a-content-hash"), false);

  assert.match(
    source,
    /location \^~ \/fonts\/ \{[\s\S]*?add_header Cache-Control \$doorbell_versioned_public_cache_control always;/,
  );
  assert.match(
    source,
    /location \/ \{[\s\S]*?add_header Cache-Control \$doorbell_versioned_public_cache_control always;/,
  );
});
