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
