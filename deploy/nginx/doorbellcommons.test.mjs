import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public Connector WebSocket forwards the HTTP upgrade handshake", () => {
  const source = readFileSync(new URL("./doorbellcommons.conf", import.meta.url), "utf8");
  const location = /location = \/api\/connector\/ws \{([\s\S]*?)\n    \}/u.exec(source)?.[1];
  assert.ok(location, "Connector WebSocket needs a dedicated nginx location");
  assert.match(location, /proxy_http_version 1\.1;/u);
  assert.match(location, /proxy_set_header Upgrade \$http_upgrade;/u);
  assert.match(location, /proxy_set_header Connection "upgrade";/u);
  assert.match(location, /proxy_pass http:\/\/127\.0\.0\.1:3000;/u);
});
