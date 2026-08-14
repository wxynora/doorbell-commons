/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("live registration renders as a standalone page without the community or MCP overlay", () => {
  const appSource = readSource("../app.tsx");
  const authScreenSource = readSource("./auth-screen.tsx");
  const registrationEntrySource = readSource("./registration-entry.tsx");
  const styles = readSource("../styles.css");

  assert.match(authScreenSource, /className="registration-page"/);
  assert.match(authScreenSource, /className="registration-page registration-page--checking"/);
  assert.match(appSource, /appState\.stage === "checking-session"[\s\S]*?<SessionCheckingScreen/);
  assert.match(appSource, /appState\.stage === "anonymous"[\s\S]*?<AuthScreen/);
  assert.doesNotMatch(authScreenSource, /CandidateTwoPreview|McpAccessPanel|领取小机连接/);
  assert.doesNotMatch(authScreenSource, /registration-page__eyebrow|<title>Doorbell<\/title>/);
  assert.match(
    authScreenSource,
    /<h1>Doorbell Commons<\/h1>[\s\S]*?className="handwritten registration-page__tagline">Welcome home, neighbor\./,
  );
  assert.doesNotMatch(registrationEntrySource, /placeholder=/);
  assert.match(registrationEntrySource, /PASSWORD \/ 登录密码/);
  assert.match(registrationEntrySource, /24H Passcode \/ 注册码/);
  assert.match(registrationEntrySource, /First time here\?/);
  assert.match(registrationEntrySource, /registration-mode-action--first/);
  assert.match(registrationEntrySource, /mode === "login"[\s\S]*?password[\s\S]*?registrationCode/);
  assert.match(
    registrationEntrySource,
    /className="registration-login-action" disabled=\{pending\} type="submit"[\s\S]*?Log in/,
  );
  assert.doesNotMatch(registrationEntrySource, /handwritten registration-login-action/);
  assert.doesNotMatch(registrationEntrySource, /入住社区|className="primary-action"/);
  assert.match(styles, /\.registration-page__header\s*\{[^}]*border-bottom: 0;/s);
});

test("profile form keeps Human URL before lookup and the active confirmation action clickable", () => {
  const profileSource = readSource("./registration-profile-form.tsx");

  assert.ok(profileSource.indexOf('id="farm-human-url"') < profileSource.indexOf("查询真实农场"));
  assert.doesNotMatch(profileSource, /placeholder=/);
  assert.doesNotMatch(profileSource, /<fieldset|<legend|COMMONS RESIDENCY|Farm Search/);
  assert.ok(
    profileSource.indexOf("RESIDENT NAME / 居民名字") <
      profileSource.indexOf("HOUSE NAME / 家园名字"),
  );
  assert.ok(
    profileSource.indexOf("HOUSE NAME / 家园名字") < profileSource.indexOf("FARM NO. / 农场门牌号"),
  );
  assert.ok(
    profileSource.indexOf("HUMAN URL / 农场访问链接") <
      profileSource.indexOf("PASSWORD / 设置登录密码"),
  );
  assert.match(profileSource, /CONFIRM PASSWORD \/ 再输入一次/);
  assert.match(profileSource, /password\.length < 8 \|\| password\.length > 128/);
  assert.match(profileSource, /password !== passwordConfirmation/);
  assert.match(profileSource, /registration_code: credentials\.registrationCode,[\s\S]*?password,/);
  assert.match(
    profileSource,
    /className="primary-action" disabled=\{submitting\} type="submit"[\s\S]*?确认入住/,
  );
});

test("permit keeps the original card layout and waits for human confirmation", () => {
  const componentSource = readSource("./residence-permit-transition.tsx");
  const styles = readSource("../styles.css");

  assert.match(componentSource, /className="permit-confirm" onClick=\{onComplete\} type="button"/);
  assert.match(componentSource, />\s*确认入住\s*<\/button>/);
  assert.match(componentSource, /className="permit-card" role="status"/);
  assert.doesNotMatch(componentSource, /permit-sheet/);
  assert.doesNotMatch(componentSource, /onAnimationEnd|requestAnimationFrame|matchMedia|useEffect/);
  assert.match(
    styles,
    /\.registration-page \.primary-action,[\s\S]*?\.registration-page \.permit-confirm[\s\S]*?background: #73584b;/,
  );
  assert.match(styles, /\.registration-page\.permit-transition[\s\S]*?animation: none;/);
  assert.match(
    styles,
    /\.registration-page \.permit-stamp-box[\s\S]*?right: 20px;[\s\S]*?bottom: 20px;[\s\S]*?width: 80px;[\s\S]*?height: 80px;[\s\S]*?animation: original-permit-stamp-drop 0\.4s 0\.8s cubic-bezier\(0\.175, 0\.885, 0\.32, 1\.275\)/,
  );
  assert.match(
    styles,
    /\.registration-page \.permit-stamp[\s\S]*?width: 70px;[\s\S]*?height: 70px;[\s\S]*?border: 2px solid var\(--soft-pink\);[\s\S]*?transform: rotate\(15deg\);/,
  );
  assert.match(
    styles,
    /@keyframes original-permit-stamp-drop[\s\S]*?scale\(3\) rotate\(45deg\)[\s\S]*?scale\(1\) rotate\(15deg\)/,
  );
  assert.match(styles, /\.registration-page \.permit-stamp::after\s*\{\s*content: none;/);
  assert.match(
    styles,
    /\.registration-page \.permit-confirm[\s\S]*?animation: permit-confirm-arrive 0\.24s 1\.2s both;/,
  );
  assert.match(
    styles,
    /\.registration-page \.permit-confirm\s*\{[^}]*width: 148px;[^}]*min-height: 44px;[^}]*margin: 22px auto 0;[^}]*box-shadow: 0 4px 10px rgba\(73, 49, 39, 0\.12\);/,
  );
  assert.match(styles, /\.permit-field[\s\S]*?grid-template-columns: 1fr;[\s\S]*?border: 0;/);
  assert.doesNotMatch(
    styles,
    /\.registration-page \.permit-confirm\s*\{[^}]*border-radius:\s*999px/,
  );
  assert.match(
    styles,
    /\.permit-card\s*\{[^}]*background-image: radial-gradient\(var\(--border-color\) 0\.5px, transparent 0\.5px\);[^}]*background-size: 10px 10px;[^}]*transform: rotate\(-1deg\);/,
  );
  assert.match(
    styles,
    /\.registration-page \.registration-login-action[\s\S]*?font-family: "Gaegu", "ZCOOL KuaiLe", cursive;/,
  );
  assert.match(
    styles,
    /\.registration-page \.registration-mode-action--first[\s\S]*?font-family: "Gaegu", "ZCOOL KuaiLe", cursive;/,
  );
});
