/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateTwoRuntimeHtml,
  buildConnectorSetupInstructions,
  CandidateTwoPreview,
  parseCandidateTwoAction,
  resolveCandidateTwoDemoPreset,
  shouldHandleCandidateNavigationInParent,
} from "./candidate-two-preview";

test("candidate bridge accepts only exact known child actions", () => {
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "credentials-submit",
      qqNumber: "123456789",
      registrationCode: "DB-2345-6789",
    }),
    {
      type: "credentials-submit",
      qqNumber: "123456789",
      registrationCode: "DB-2345-6789",
    },
  );
  assert.deepEqual(parseCandidateTwoAction({ type: "navigate", path: "/api/farm/ui" }), {
    type: "navigate",
    path: "/api/farm/ui",
  });
  assert.deepEqual(parseCandidateTwoAction({ type: "shared-memes-open" }), {
    type: "shared-memes-open",
  });
  assert.deepEqual(parseCandidateTwoAction({ type: "shared-meme-open", memeId: 7 }), {
    type: "shared-meme-open",
    memeId: 7,
  });
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "shared-meme-create",
      input: { aliases: ["别称"], meaning: null, term: "新梗" },
    }),
    {
      type: "shared-meme-create",
      input: { aliases: ["别称"], meaning: null, term: "新梗" },
    },
  );
  assert.deepEqual(parseCandidateTwoAction({ type: "view-ready" }), { type: "view-ready" });
  assert.deepEqual(parseCandidateTwoAction({ type: "logout" }), { type: "logout" });
  assert.deepEqual(parseCandidateTwoAction({ type: "lingye-glimmer-open" }), {
    type: "lingye-glimmer-open",
  });
  assert.deepEqual(parseCandidateTwoAction({ type: "lingye-together-open" }), {
    type: "lingye-together-open",
  });
  assert.deepEqual(parseCandidateTwoAction({ type: "connector-credential-issue" }), {
    type: "connector-credential-issue",
  });
  assert.deepEqual(parseCandidateTwoAction({ type: "connector-credential-revoke" }), {
    type: "connector-credential-revoke",
  });
  const glimmerAnimalPositions = {
    duck_peach: { x: 48, y: -4 },
    mystery: { x: 0, y: 0 },
    silk_moth_mist: { x: 0, y: 48.5 },
    turkey_maple: { x: 180, y: -32 },
  };
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "glimmer-animal-layout-change",
      positions: glimmerAnimalPositions,
    }),
    {
      type: "glimmer-animal-layout-change",
      positions: glimmerAnimalPositions,
    },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "home-settings-save",
      field: "climateType",
      value: "oceanic",
    }),
    { type: "home-settings-save", field: "climateType", value: "oceanic" },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "notification-preference-save",
      field: "pauseAllWakeups",
      value: true,
    }),
    { type: "notification-preference-save", field: "pauseAllWakeups", value: true },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "community-connection-preference-save",
      field: "initialRecentActivityCount",
      value: null,
    }),
    {
      type: "community-connection-preference-save",
      field: "initialRecentActivityCount",
      value: null,
    },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "community-connection-preference-save",
      field: "chatMode",
      value: "proactive",
    }),
    {
      type: "community-connection-preference-save",
      field: "chatMode",
      value: "proactive",
    },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "community-connection-preference-save",
      field: "defaultConnectionDurationMinutes",
      value: 15,
    }),
    {
      type: "community-connection-preference-save",
      field: "defaultConnectionDurationMinutes",
      value: 15,
    },
  );
  assert.deepEqual(
    parseCandidateTwoAction({
      type: "community-connection-preference-save",
      field: "allowActivityRoomWarmup",
      value: false,
    }),
    {
      type: "community-connection-preference-save",
      field: "allowActivityRoomWarmup",
      value: false,
    },
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "home-settings-save",
      field: "notificationPreferences",
      value: "enabled",
    }),
    null,
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "community-connection-preference-save",
      field: "defaultConnectionDurationMinutes",
      value: 0,
    }),
    null,
  );
  assert.equal(parseCandidateTwoAction({ type: "navigate", path: "/farm/" }), null);
  assert.equal(parseCandidateTwoAction({ type: "shared-meme-open", memeId: 0 }), null);
  assert.equal(
    parseCandidateTwoAction({
      type: "shared-meme-create",
      input: { contributorQq: "123456789", term: "新梗" },
    }),
    null,
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "logout",
      farmHumanKey: "must-not-be-accepted",
    }),
    null,
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "glimmer-animal-layout-change",
      positions: {
        ...glimmerAnimalPositions,
        duck_peach: { x: Number.POSITIVE_INFINITY, y: 0 },
      },
    }),
    null,
  );
  assert.equal(
    parseCandidateTwoAction({
      type: "glimmer-animal-layout-change",
      captionPositions: {},
      positions: glimmerAnimalPositions,
    }),
    null,
  );
});

test("only the farm entry stays inside the React community frontend", () => {
  assert.equal(shouldHandleCandidateNavigationInParent("/api/farm/ui"), true);

  const componentSource = CandidateTwoPreview.toString();
  assert.match(componentSource, /shouldHandleCandidateNavigationInParent/);
  assert.match(componentSource, /window\.location\.assign\(action\.path\)/);
  assert.doesNotMatch(componentSource, /\/api\/lingye-glimmer|\/api\/lingye-together/);
  assert.match(
    componentSource,
    /action\.type\s*===\s*"glimmer-animal-layout-change"[\s\S]*url\.searchParams\.set\(xParam[\s\S]*url\.searchParams\.set\(yParam[\s\S]*url\.searchParams\.set\("gaLayout",\s*"5"\)[\s\S]*window\.history\.replaceState/,
  );
});

test("first-registration action carries the Human URL only in the one child submission", () => {
  const action = parseCandidateTwoAction({
    type: "registration-submit",
    confirmedFarmName: "西红柿农场",
    farmDoorplate: "3ET3FE",
    farmHumanUrl: "https://farm.example/farm/ui/one-use-secret",
    homeName: "渡的小屋",
    residentName: "小渡",
  });

  assert.deepEqual(action, {
    type: "registration-submit",
    confirmedFarmName: "西红柿农场",
    farmDoorplate: "3ET3FE",
    farmHumanUrl: "https://farm.example/farm/ui/one-use-secret",
    homeName: "渡的小屋",
    residentName: "小渡",
  });
});

test("runtime HTML keeps candidate two and replaces every confirmed fake datum", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /id="credentials-form"/);
  assert.match(html, /id="profile-form"/);
  assert.match(html, /id="farm-human-url"[^>]+name="farm_human_url"[^>]+type="url"/);
  assert.match(html, /HUMAN URL \/ 农场访问链接/);
  assert.ok(html.indexOf('id="farm-human-url"') < html.indexOf('id="farm-lookup-button"'));
  assert.doesNotMatch(html, /placeholder="粘贴农场 Human URL"/);
  assert.match(
    html,
    /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.candidate2-auth-step input \{[\s\S]*?font-size: 16px;/,
  );
  assert.match(
    html,
    /\.candidate2-auth-step \.input-group \{[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    html,
    /\.candidate2-auth-step \.input-group input \{[\s\S]*?border: 1\.5px solid var\(--border-color\);[\s\S]*?background: white;/,
  );
  assert.match(
    html,
    /function updateProfileSubmitState\(\) \{\s*profileSubmitButton\.disabled = profileForm\.dataset\.pending === 'true';/,
  );
  assert.match(
    html,
    /applyFarmLookup\(state\.farmLookup\);\s*if \(state\.issueMessage\) setStatus\(profileStatus, state\.issueMessage\);/,
  );
  assert.doesNotMatch(html, /farm-human-key|farmHumanKey|农场访问密钥/);
  assert.match(html, /id="farm-confirmation"/);
  assert.doesNotMatch(html, /id="logout-button"|candidate2-logout-button/);
  assert.doesNotMatch(html, /getElementById\('logout-button'\)/);
  assert.doesNotMatch(html, /candidate2-resident-stamp|>RESIDENT</);
  assert.doesNotMatch(html, /<p class="handwritten profile-qq-number">/);
  assert.match(html, /media="print" onload="this\.media='all'"/);
  assert.match(html, /family=Noto\+Serif\+SC:wght@400;500;600/);
  assert.doesNotMatch(html, /family=Noto\+Sans\+SC|family=Nunito/);
  assert.match(html, /--ui-regular-font: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;/);
  assert.match(html, /\.handwritten,[\s\S]*?'Gaegu', 'ZCOOL KuaiLe'/);
  assert.match(html, /QQ Account \/ QQ账号/);
  assert.match(html, /24H Passcode \/ 注册码/);
  assert.match(html, /RESIDENT NAME \/ 居民姓名/);
  assert.match(html, /HOUSE NAME \/ 家园名称/);
  assert.match(html, />DOORBELLS</);
  assert.match(html, />VISITORS</);
  assert.match(html, />GUEST ROOM</);
  assert.match(html, />Relationship graph</);
  assert.match(html, />Recent Activity</);
  assert.match(html, />The lounge is quiet today\.\.\.</);
  assert.doesNotMatch(html, /今天的小机活动室很安静/);
  assert.doesNotMatch(
    html,
    /candidate2-section-label">(?:门铃请求|访客|环境描述|来往图|最近活动)</,
  );
  assert.doesNotMatch(
    html,
    /Little Fox|Sunshine Meadow|0824-A|Breezy Valley|24°C|12 neighbors|Watered the tulips/,
  );
  assert.equal((html.match(/class="nav-item/g) ?? []).length, 5);
  assert.match(html, /aria-label="设置"[^>]+showScreen\('screen-settings'\)/);
  assert.match(
    html,
    /aria-label="设置"[\s\S]*?<path d="M4 6h6m4 0h6M4 12h2m4 0h10M4 18h10m4 0h2"><\/path><circle cx="12" cy="6" r="2"><\/circle>/,
  );
  assert.doesNotMatch(html, /M19\.4 15a1\.7/);
  assert.match(html, /id="screen-settings" class="screen"/);
  assert.match(
    html,
    /\.candidate2-settings-paperclip \{[\s\S]*transform: rotate\(30deg\) scale\(0\.86\);/,
  );
  assert.match(html, /--candidate2-nav-share: 20%/);
  assert.match(
    html,
    /\.bottom-nav\s*\{[^}]*height: 48px;[^}]*padding: 4px;[^}]*border: 0\.5px solid #d7cec3;[^}]*border-radius: 24px;[^}]*background: rgba\(233, 228, 220, 0\.7\);[^}]*backdrop-filter: blur\(14px\) saturate\(112%\);[^}]*-webkit-backdrop-filter: blur\(14px\) saturate\(112%\);/s,
  );
  assert.match(
    html,
    /\.bottom-nav \.nav-item\.active\s*\{[^}]*color: #6d5d55;[^}]*background: transparent;/s,
  );
  assert.match(html, /\.bottom-nav \.nav-item\s*\{[^}]*height: 100%;[^}]*border-radius: 999px;/s);
  assert.match(
    html,
    /\.bottom-nav \.nav-item::before\s*\{[^}]*inset: 0;[^}]*border: 0\.5px solid #d9d1c8;[^}]*border-radius: 999px;[^}]*background: #fffdf9;[^}]*opacity: 0;[^}]*transform: scale\(0\.9\);[^}]*transition: opacity 180ms ease, transform 220ms cubic-bezier\(0\.2, 0\.75, 0\.25, 1\);/s,
  );
  assert.match(
    html,
    /\.bottom-nav \.nav-item\.active::before\s*\{[^}]*opacity: 1;[^}]*transform: scale\(1\);/s,
  );
  assert.doesNotMatch(html, /\.bottom-nav \.nav-item svg\s*\{[^}]*translateY/s);
  assert.doesNotMatch(html, /\.bottom-nav \.nav-item\.active::after\s*\{/);
  assert.doesNotMatch(html, /content: '♥'/);
  assert.match(html, /class="candidate2-notice-modal" hidden/);
  assert.match(html, /class="candidate2-notice-confirm" type="button"/);
  assert.doesNotMatch(html, /candidate2-notice-confirm handwritten/);
  assert.match(
    html,
    /role="alertdialog" aria-modal="true" aria-labelledby="candidate2-notice-title" aria-describedby="candidate2-notice-message"/,
  );
  assert.match(
    html,
    /\.candidate2-notice-card h2\s*\{[^}]*font-family: var\(--ui-regular-font\);/s,
  );
  assert.match(html, /#candidate2-notice-message\s*\{[^}]*font-family: var\(--ui-regular-font\);/s);
  assert.match(
    html,
    /\.candidate2-notice-confirm\s*\{[^}]*font-family: var\(--ui-regular-font\);/s,
  );
  assert.match(
    html,
    /\.candidate2-notice-design-canvas\s*\{[^}]*width: 430px;[^}]*zoom: var\(--candidate2-notice-scale, 1\);/s,
  );
  assert.match(
    html,
    /\.candidate2-notice-card\s*\{[^}]*width: 334px;[^}]*border-radius: 0;[^}]*background: #fffdf9;/s,
  );
  assert.match(
    html,
    /const candidateNoticeDesignWidth = 430;[\s\S]*availableWidth \/ candidateNoticeDesignWidth[\s\S]*--candidate2-notice-scale/s,
  );
  assert.match(html, /onclick="closeCandidateNotice\(\)"/);
  assert.match(html, /event\.key === 'Escape'.*closeCandidateNotice\(\)/);
  assert.doesNotMatch(
    html,
    /class="(?:home-runtime-status|candidate2-profile-action-status|candidate2-lingye-notice|home-mailbox-detail-feedback)"/,
  );
  assert.match(html, />连接状态</);
  assert.match(
    html,
    /class="settings-wake-dot"><\/i><span>唤醒桥「铃」<\/span><strong class="settings-wake-state">正在读取<\/strong><small>与普通消息连接分开<\/small>/,
  );
  assert.doesNotMatch(html, /class="settings-wake-dot"><\/i><span>铃<\/span>/);
  assert.match(html, /id="connector-issue-button"[^>]*disabled>生成 Connector 凭据</);
  assert.match(html, /id="connector-revoke-button"[^>]*hidden disabled>停用 Connector</);
  assert.doesNotMatch(
    html,
    /id="connector-(?:issue|revoke|confirm|cancel|copy(?:-setup)?)-button"[^>]*handwritten/,
  );
  assert.match(
    html,
    /id="settings-shared-memes-open" class="candidate2-settings-text-action handwritten"[^>]*>View/,
  );
  assert.match(
    html,
    /\.candidate2-connector-actions \.candidate2-settings-text-action,[\s\S]*\.candidate2-connector-credential \.candidate2-settings-text-action \{[\s\S]*font-family: var\(--ui-regular-font\);[\s\S]*font-size: 9px;[\s\S]*font-weight: 500;[\s\S]*text-decoration: none;/,
  );
  assert.match(html, /重新生成连接码/);
  assert.match(html, /生成后，连接码只显示这一次，请及时保存。/);
  assert.match(html, /重新生成后，旧连接码会立即失效。/);
  assert.match(html, /停用后，当前 Connector 会断开，原连接码不能再用。/);
  assert.match(html, /确认重新生成/);
  assert.match(html, /确认停用/);
  assert.match(html, /会连同凭据复制完整配置说明/);
  assert.match(html, /它不是登录密码或 MCP 连接码/);
  assert.match(html, /DOORBELL_CONNECTOR_CREDENTIAL/);
  assert.match(html, />复制给自己的机</);
  assert.doesNotMatch(html, /id="connector-copy-button"|>只复制凭据<|>复制完整配置说明</);
  assert.match(html, />家园与天气</);
  assert.match(html, />通知与唤醒</);
  assert.match(html, />社区连接偏好</);
  assert.match(html, />共享梗库</);
  assert.doesNotMatch(html, /<h2>账号<\/h2>/);
  assert.match(html, /id="settings-logout-button"[^>]*>Log out<\/button>/);
  assert.doesNotMatch(html, /Log out \/ 退出登录/);
  assert.match(
    html,
    /class="candidate2-settings-delete-account"[^>]*data-demo-action="注销账号"[^>]*disabled>注销账号</,
  );
  assert.match(
    html,
    /\.candidate2-settings-row select \{[\s\S]*?appearance: none;[\s\S]*?border-radius: 999px;/,
  );
  assert.match(
    html,
    /class="settings-climate"><option value="">尚未设置<\/option><option value="tropical_rainforest">热带雨林气候<\/option>/,
  );
  assert.match(html, /<option value="temperate_monsoon">温带季风气候<\/option>/);
  assert.match(html, /<option value="highland">高原山地气候<\/option>/);
  assert.match(html, /class="settings-environment"/);
  assert.match(html, /\.candidate2-settings-row textarea \{[\s\S]*?text-align: left;/);
  assert.match(html, /class="settings-lounge-duration" type="number" min="1" inputmode="numeric"/);
  assert.match(
    html,
    /class="settings-initial-message-count" type="number" min="0" inputmode="numeric"/,
  );
  assert.match(
    html,
    /\.candidate2-settings-page::before \{[\s\S]*?top: -1px;[\s\S]*?radial-gradient\(circle at 14px 0, #f8f1e9 0 7px, transparent 7\.35px\)/,
  );
  assert.match(
    html,
    /class="candidate2-settings-paperclip" src="\/candidate-two\/settings-paperclip-silver-v1\.png"/,
  );
  assert.match(
    html,
    /\.candidate2-settings-paperclip \{[\s\S]*?right: 19px;[\s\S]*?width: auto;[\s\S]*?height: 64px;[\s\S]*?object-fit: contain;[\s\S]*?transform: rotate\(30deg\) scale\(0\.86\);/,
  );
  assert.doesNotMatch(html, />农场设置<|>当前居民身份</);
  const settingsMarkup = html.slice(
    html.indexOf('id="screen-settings"'),
    html.indexOf('<nav class="bottom-nav"'),
  );
  assert.doesNotMatch(settingsMarkup, /家园门牌|农场门牌|农场设置|当前居民身份/);
  assert.equal((html.match(/data-place-id=/g) ?? []).length, 10);
  assert.doesNotMatch(html, /data-place-id="moonlight-pond"/);
  assert.match(html, /src="\/lingye\/lingye-together-game-icon-v4\.png"/);
});

test("lingye demo opens distinct Together and Glimmer Human UI previews", () => {
  const html = buildCandidateTwoRuntimeHtml();
  const demo = resolveCandidateTwoDemoPreset("127.0.0.1", "?demo=full&screen=lingye");
  const editorDemo = resolveCandidateTwoDemoPreset(
    "127.0.0.1",
    "?demo=full&screen=glimmer&editor=glimmer-animals&gaDuckX=-10.2&gaDuckY=-1&gaMysteryX=-3.1&gaMysteryY=0&gaMothX=-8.9&gaMothY=-0.8&gaTurkeyX=-9.6&gaTurkeyY=-0.3&gaLayout=4",
  );
  const fourColumnEditorDemo = resolveCandidateTwoDemoPreset(
    "127.0.0.1",
    "?demo=full&screen=glimmer&editor=glimmer-animals&gaLayout=5&gaDuckX=2&gaDuckY=3&gaTurkeyX=4&gaTurkeyY=5&gaMothX=6&gaMothY=7&gaMysteryX=8&gaMysteryY=9",
  );
  const togetherMarkup = html.slice(
    html.indexOf('id="screen-lingye-together"'),
    html.indexOf('id="screen-lingye-glimmer"'),
  );
  const glimmerLibraryMarkup = html.slice(
    html.indexOf('<details class="candidate2-glimmer-library">'),
    html.indexOf('<section class="candidate2-glimmer-status-overlay"'),
  );

  assert.match(html, /id="screen-lingye-together"/);
  assert.match(html, /id="screen-lingye-memorial"/);
  assert.match(html, /id="screen-lingye-glimmer"/);
  assert.doesNotMatch(
    togetherMarkup,
    /<img[^>]+src="\/lingye\/together\/same-kitchen-opening\.jpg"/,
  );
  assert.match(
    html,
    /const togetherCoverAssets = \{\s*'together\.same-kitchen-opening': '\/lingye\/together\/same-kitchen-opening\.jpg',[\s\S]*'together\.same-kitchen-old-recipe': '\/lingye\/together\/same-kitchen-old-recipe\.jpg',[\s\S]*'together\.same-kitchen-undelivered-letters': '\/lingye\/together\/same-kitchen-undelivered-letters\.jpg',[\s\S]*'together\.same-kitchen-service': '\/lingye\/together\/same-kitchen-service\.jpg',[\s\S]*'together\.same-kitchen-final-arrangement': '\/lingye\/together\/same-kitchen-final-arrangement\.jpg',[\s\S]*'together\.same-kitchen-ending-one-sign': '\/lingye\/together\/same-kitchen-ending-one-sign\.jpg',[\s\S]*'together\.same-kitchen-ending-next-door': '\/lingye\/together\/same-kitchen-ending-next-door\.jpg',[\s\S]*'together\.same-kitchen-ending-public-kitchen': '\/lingye\/together\/same-kitchen-ending-public-kitchen\.jpg',/,
  );
  assert.doesNotMatch(
    html,
    /'same-kitchen-opening': '\/lingye\/together\/same-kitchen-opening\.jpg'/,
  );
  assert.match(
    html,
    /const coverAsset = data && togetherCoverAssets\[data\.artFile\];[\s\S]*cover\.hidden = !coverAsset;[\s\S]*if \(coverAsset\)/,
  );
  assert.match(
    html,
    /let currentSummary = currentTask \? currentTask\.opening : null;[\s\S]*data\.ending\.text;[\s\S]*data\.cooldown\.text, data\.cooldown\.ready_text/,
  );
  assert.match(
    html,
    /data\.currentSummary[\s\S]*data\.currentTask \? data\.currentTask\.opening : '当前没有可读取的阶段任务。'/,
  );
  assert.match(
    html,
    /data\.currentChoice\.counts[\s\S]*这里只读展示全服实际选项与票数；Human 不替小机提交行动。[\s\S]*这里只读展示全服实际选项；Human 不替小机提交行动。/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-backdrop\s*\{[\s\S]*url\('\/lingye\/glimmer\/glimmer-night-hero\.jpg'\)/,
  );
  assert.doesNotMatch(html, /第二期 · 同一间厨房|尚未开放/);
  assert.doesNotMatch(html, /candidate2-together-header/);
  assert.doesNotMatch(html, /candidate2-together-title-block/);
  assert.doesNotMatch(html, /aria-label="查看共行说明"|aria-label="查看往期故事"/);
  assert.match(html, /\.candidate2-together-paper \{[\s\S]*padding: 0 18px 20px;/);
  assert.match(
    html,
    /\.candidate2-together-page \{[\s\S]*--candidate2-together-page-bg: #f6f1df;[\s\S]*background: var\(--candidate2-together-page-bg\);/,
  );
  assert.match(
    html,
    /\.candidate2-together-paper \{[\s\S]*radial-gradient[\s\S]*var\(--candidate2-together-page-bg\);/,
  );
  assert.match(
    html,
    /\.candidate2-together-cover \{[\s\S]*margin: 0 -18px;[\s\S]*background: var\(--candidate2-together-page-bg\);/,
  );
  assert.match(
    html,
    /\.candidate2-together-cover::after \{[\s\S]*transparent 58%[\s\S]*var\(--candidate2-together-page-bg\) 100%/,
  );
  assert.match(
    html,
    /\.candidate2-together-cover \+ \.candidate2-together-section \{[\s\S]*padding-top: 37px;/,
  );
  assert.doesNotMatch(togetherMarkup, /candidate2-together-cover-title|<figcaption|本期封面/);
  assert.doesNotMatch(togetherMarkup, />铃野共行</);
  assert.doesNotMatch(togetherMarkup, /candidate2-place-card|candidate2-together-history-title/);
  assert.match(
    html,
    /class="candidate2-lingye-memories" type="button" aria-label="打开纪念册" onclick="openLingyeMemorial\(\)">[\s\S]*src="\/lingye\/ui\/memorial-album\.png"[^>]*width="256" height="256"/,
  );
  assert.doesNotMatch(html, /candidate2-lingye-memories[^>]*disabled/);
  assert.match(
    html,
    /function openLingyeMemorial\(\)[\s\S]*window\.__doorbellCandidateDemo[\s\S]*showScreen\('screen-lingye-memorial'\)[\s\S]*纪念册还没有可查看的活动档案/,
  );
  assert.match(
    html,
    /class="candidate2-memorial-demo"[^>]*hidden>[\s\S]*2026[\s\S]*七夕[\s\S]*灯河有信[\s\S]*愿今夜所有思念，都能顺水抵达归处。/,
  );
  assert.doesNotMatch(
    html,
    /candidate2-memorial-demo[\s\S]*参与者|私人灯笺|领取记录|完成度|结算|查看详情/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-memorial-empty', '\.candidate2-memorial-demo', enabled\)/,
  );
  assert.doesNotMatch(html, /candidate2-lingye-memories[\s\S]*?<span>纪念册<\/span>/);
  assert.match(
    html,
    /\.candidate2-lingye-memories \{[\s\S]*width: clamp\(52px, 14vw, 60px\);[\s\S]*aspect-ratio: 1;[\s\S]*\.candidate2-lingye-memories img \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*object-fit: contain;/,
  );
  assert.match(
    togetherMarkup,
    /class="candidate2-together-history-button" type="button" aria-label="往期故事" disabled>[\s\S]*<svg viewBox="0 0 32 32"/,
  );
  assert.match(html, /\.candidate2-together-section \{[\s\S]*border-bottom:/);
  assert.match(html, /class="candidate2-place-visually-hidden">流光原野<\/h1>/);
  assert.doesNotMatch(html, /candidate2-glimmer-hero-copy/);
  assert.doesNotMatch(html, /candidate2-glimmer-header/);
  assert.doesNotMatch(html, /candidate2-glimmer-card-stack/);
  assert.match(html, /class="candidate2-glimmer-status-overlay"/);
  assert.match(html, /class="candidate2-glimmer-journal"/);
  assert.match(
    html,
    /\.candidate2-glimmer-journal-stream section \{[\s\S]*display: block;[\s\S]*border-top:/,
  );
  assert.doesNotMatch(
    html,
    /\.candidate2-glimmer-journal-stream section \{[^}]*grid-template-columns/,
  );
  assert.doesNotMatch(html, /全服共同完成|今晚留下踪迹|探索与发现|来自原野的回声/);
  assert.match(html, /\.candidate2-glimmer-feature-demo \{[\s\S]*display: block;/);
  assert.doesNotMatch(html, /\.candidate2-glimmer-feature-demo \{[^}]*grid-template-columns/);
  assert.match(
    html,
    /\.candidate2-glimmer-tracks-demo \{[\s\S]*container-type: inline-size;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-page\.is-animal-editor \.candidate2-glimmer-tracks-demo \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*column-gap: 3\.424658cqw;/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-variants-demo \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-page \{[\s\S]*--glimmer-animal-caption-gap: -2px;[\s\S]*--glimmer-animal-size: 64px;/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-events-demo::before \{[\s\S]*\.candidate2-glimmer-events-demo li \{[\s\S]*grid-template-columns: 38px minmax\(0, 1fr\);/,
  );
  assert.match(
    html,
    /class="candidate2-glimmer-back-button"[^>]*aria-label="返回铃野地图"[^>]*>[\s\S]*<span aria-hidden="true">‹<\/span>/,
  );
  assert.match(
    togetherMarkup,
    /class="candidate2-place-back-link"[^>]*aria-label="返回铃野地图"[^>]*>[\s\S]*<span aria-hidden="true">‹<\/span>/,
  );
  assert.match(
    html,
    /class="candidate2-memorial-back"[^>]*aria-label="返回铃野地图"[^>]*>[\s\S]*<span aria-hidden="true">‹<\/span>/,
  );
  assert.doesNotMatch(html, /<span aria-hidden="true">‹<\/span>\s*返回铃野/);
  assert.match(
    html,
    /\.candidate2-glimmer-back-button \{[\s\S]*top: 15px;[\s\S]*min-height: 34px;[\s\S]*font-size: 11px;/,
  );
  assert.match(html, /\.candidate2-glimmer-back-button::before \{[\s\S]*inset: -5px;/);
  assert.match(
    html,
    /class="candidate2-glimmer-library">[\s\S]*<summary aria-label="打开原野资料">[\s\S]*<svg viewBox="0 0 24 24"[\s\S]*class="candidate2-place-visually-hidden">原野资料<\/span>[\s\S]*<summary>异色动物图鉴<\/summary>[\s\S]*<summary>奇遇图鉴<\/summary>[\s\S]*<summary>流光原野成就<\/summary>/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-library > summary \{[\s\S]*width: 28px;[\s\S]*height: 28px;[\s\S]*background: transparent;/,
  );
  assert.match(html, /\.candidate2-glimmer-library > summary::before \{[\s\S]*inset: -8px;/);
  assert.match(
    html,
    /\.candidate2-glimmer-library-panel \{[\s\S]*z-index: 1;[\s\S]*isolation: isolate;[\s\S]*width: min\(240px, calc\(100vw - 54px\)\);[\s\S]*border: 0;[\s\S]*background: #07172b;/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-hero:has\(\.candidate2-glimmer-library\[open\]\) \{[\s\S]*z-index: 4;/,
  );
  assert.equal((glimmerLibraryMarkup.match(/<details(?: open)?>/g) ?? []).length, 3);
  assert.doesNotMatch(glimmerLibraryMarkup, /<details[^>]*\sname=/);
  assert.doesNotMatch(
    html,
    /\.candidate2-glimmer-library-panel > details \+ details|\.candidate2-glimmer-encounters-demo li \+ li|\.candidate2-glimmer-achievements-demo article \+ article/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-library-panel > details > summary \{[\s\S]*font-size: 12px;[\s\S]*\.candidate2-glimmer-encounters-demo strong,[\s\S]*font-size: 9px;/,
  );
  assert.doesNotMatch(html, /candidate2-glimmer-library > summary::after/);
  assert.doesNotMatch(html, /candidate2-place-round-action candidate2-glimmer-back-button/);
  assert.match(html, /进入后读取当前铃野共行状态/);
  assert.match(
    html,
    /placeId === 'glimmer-meadow'[\s\S]*window\.__doorbellCandidateDemo[\s\S]*showScreen\('screen-lingye-glimmer'\)[\s\S]*sendAction\(\{ type: 'lingye-glimmer-open' \}\)/,
  );
  assert.match(
    html,
    /function openLingyeTogether\(\)[\s\S]*window\.__doorbellCandidateDemo[\s\S]*showScreen\('screen-lingye-together'\)[\s\S]*sendAction\(\{ type: 'lingye-together-open' \}\)/,
  );
  assert.match(html, /状态<\/span><strong class="candidate2-glimmer-status-value">—<\/strong>/);
  assert.match(html, />公共事件<\/h2>/);
  assert.doesNotMatch(html, /今日发现|原野日志/);
  assert.match(html, />我家的原野概况<\/h2>/);
  assert.doesNotMatch(html, /湖边遇见一只白尾小鹿|三家合力的料理食材/);
  assert.equal(demo?.demo.content.glimmer.task.title, "三家合力的料理食材");
  assert.equal(demo?.demo.content.glimmer.events[0]?.title, "一家农场遇见了〔流光泉〕");
  assert.deepEqual(
    demo?.demo.content.glimmer.encounters.map((encounter) => [
      encounter.id,
      encounter.name,
      encounter.status,
    ]),
    [
      ["lost_backpack", "跑丢的背包", "未遇见"],
      ["glimmer_spring", "流光泉", "已遇见"],
      ["stardust_rain", "星屑雨", "未遇见"],
      ["empty_hollow", "空树洞", "未遇见"],
      ["picnic_blanket", "旧野餐布", "未遇见"],
      ["sleeping_herd", "沉睡兽群", "未遇见"],
      ["windy_feeding_guide", "被风翻开的饲养手册", "未遇见"],
      ["rolling_empty_plate", "会指路的空餐盘", "未遇见"],
      ["lost_vendor", "迷路小贩", "未遇见"],
      ["tiny_tornado", "一米宽的龙卷风", "未遇见"],
      ["crow_conductor", "自称售票员的乌鸦", "未遇见"],
      ["upside_sign", "倒着长的路标", "未遇见"],
      ["compliment_flower", "只收夸奖的花", "未遇见"],
      ["returning_chest", "会退货的宝箱", "未遇见"],
      ["shadow_puddle", "偷走影子的水坑", "未遇见"],
      ["lying_scarecrow", "躺平的稻草人", "未遇见"],
      ["stone_sheep", "冒充石头的羊", "未遇见"],
      ["dusk_tea_stall", "黄昏茶摊", "未遇见"],
      ["animal_post_wrong_letter", "动物邮局的错件", "未遇见"],
      ["chicken_meeting", "正在开会的鸡", "未遇见"],
    ],
  );
  assert.deepEqual(demo?.demo.content.glimmer.stats, {
    coops: 0,
    encounters: 1,
    variants: 3,
  });
  assert.deepEqual(
    demo?.demo.content.glimmer.achievements.map((achievement) => [
      achievement.id,
      achievement.name,
      achievement.progress,
      achievement.reward,
      achievement.status,
    ]),
    [
      ["glimmer_encounter_1", "门票不能白买", "1 / 1", "200 金 + 20 银", "已达成"],
      ["glimmer_encounter_2", "走哪哪有剧情", "1 / 10", "500 金 + 60 银", "未达成"],
      ["glimmer_encounter_3", "随机事件钉子户", "1 / 30", "1000 金 + 150 银", "未达成"],
      ["glimmer_encounter_4", "主线绕着我长", "1 / 80", "2000 金 + 300 银", "未达成"],
      ["glimmer_variant_1", "这只颜色不对", "3 / 1", "200 金 + 20 银", "已达成"],
      ["glimmer_variant_2", "色差不是 Bug", "3 / 4", "500 金 + 60 银", "未达成"],
      ["glimmer_variant_3", "原野调色师", "3 / 8", "1000 金 + 150 银", "未达成"],
      ["glimmer_variant_4", "全牧场高光", "3 / 16", "2000 金 + 300 银", "未达成"],
      ["glimmer_coop_1", "临时群聊已建立", "0 / 1", "200 金 + 20 银", "未达成"],
      ["glimmer_coop_2", "人多力量大概大", "0 / 5", "500 金 + 60 银", "未达成"],
      ["glimmer_coop_3", "公共项目包工头", "0 / 15", "1000 金 + 150 银", "未达成"],
      ["glimmer_coop_4", "全服都欠我个人情", "0 / 30", "2000 金 + 300 银", "未达成"],
    ],
  );
  assert.deepEqual(
    demo?.demo.content.glimmer.tracks.map((track) =>
      track.revealed ? [track.id, track.name] : [track.layoutId, "?"],
    ),
    [
      ["duck_peach", "蜜桃鸭"],
      ["turkey_maple", "枫糖火鸡"],
      ["silk_moth_mist", "晨雾月光蚕"],
      ["mystery", "?"],
    ],
  );
  assert.equal(demo?.demo.content.glimmer.variants.length, 57);
  assert.deepEqual(demo?.demo.content.glimmer.variants.at(-1), {
    id: "patrol_goose_detective",
    name: "巡逻鹅·小侦探",
    set: 3,
    spriteIndex: 18,
  });
  assert.deepEqual(editorDemo?.demo.glimmerAnimalEditor, {
    enabled: true,
    positions: {
      duck_peach: { x: -9.6, y: -0.5 },
      mystery: { x: -3.1, y: -0.5 },
      silk_moth_mist: { x: -9.6, y: -0.5 },
      turkey_maple: { x: -9.6, y: -0.5 },
    },
  });
  assert.deepEqual(fourColumnEditorDemo?.demo.glimmerAnimalEditor, {
    enabled: true,
    positions: {
      duck_peach: { x: 2, y: 3 },
      mystery: { x: 8, y: 9 },
      silk_moth_mist: { x: 6, y: 7 },
      turkey_maple: { x: 4, y: 5 },
    },
  });
  assert.equal(editorDemo?.demo.initialScreen, "lingye-glimmer");
  assert.doesNotMatch(html, /candidate2-glimmer-animal-editor|data-glimmer-layout/);
  assert.match(
    html,
    /figure\.dataset\.glimmerDragTarget = 'group'[\s\S]*glimmerTrackList\.addEventListener\('pointerdown'[\s\S]*figure\.setPointerCapture\(event\.pointerId\)[\s\S]*glimmerTrackList\.addEventListener\('pointermove'/,
  );
  assert.match(
    html,
    /positions: glimmerAnimalPositions[\s\S]*applyGlimmerAnimalPositions[\s\S]*glimmerPage\.classList\.toggle\('is-animal-editor', glimmerAnimalEditorEnabled\)/,
  );
  assert.match(
    html,
    /\.candidate2-glimmer-page\.is-animal-editor \.candidate2-glimmer-tracks-demo figure \{[\s\S]*cursor: grab;[\s\S]*touch-action: none;[\s\S]*--glimmer-group-x[\s\S]*--glimmer-group-y/,
  );
  assert.doesNotMatch(
    html,
    /glimmerAnimalCaptionPositions|applyGlimmerAnimalCaptionPositions|--glimmer-caption-x|targetType === 'caption'/,
  );
  assert.equal(demo?.demo.content.glimmer.tracks[2]?.revealed, true);
  assert.equal(demo?.demo.content.glimmer.tracks[3]?.revealed, false);
  assert.match(
    html,
    /animal\.revealed === false[\s\S]*visual\.textContent = '\?'[\s\S]*figure\.append\(visual\);[\s\S]*if \(animal\.revealed\) \{/,
  );
  assert.doesNotMatch(
    html,
    /name\.textContent = animal\.revealed === false \? '\?' : animal\.name/,
  );
  assert.match(
    html,
    /function buildGlimmerVariantFigure\(variant\)[\s\S]*variant-" \+ variant\.set \+ "\.webp'[\s\S]*column \* 25[\s\S]*row \* 100 \/ 3/,
  );
  assert.match(
    html,
    /variants: data\.variants\.map\(\(variant\) => \(\{[\s\S]*spriteIndex: variant\.sprite_index,[\s\S]*unlocked: variant\.unlocked,/,
  );
  assert.doesNotMatch(html, /data\.variants\.filter\(\(variant\) => variant\.unlocked\)/);
  assert.match(
    html,
    /const unlocked = variant\.unlocked !== false;[\s\S]*figure\.dataset\.glimmerUnlocked = String\(unlocked\);[\s\S]*（未解锁）/,
  );
  assert.doesNotMatch(html, /status\.textContent = animal\.status/);
  assert.match(html, /class="candidate2-glimmer-tracks-demo" hidden/);
  assert.match(
    html,
    /'duck_peach': '\/lingye\/glimmer\/tracks\/duck-peach\.png'[\s\S]*'turkey_maple': '\/lingye\/glimmer\/tracks\/turkey-maple\.png'[\s\S]*'silk_moth_mist': '\/lingye\/glimmer\/tracks\/silk-moth-mist\.png'/,
  );
  assert.match(html, /function renderGlimmerData\(glimmer\)/);
  assert.match(
    html,
    /\.candidate2-glimmer-feature-empty\[hidden\][\s\S]*display: none !important;/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-tracks-empty', '\.candidate2-glimmer-tracks-demo', tracks\.length > 0\)/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-events-empty', '\.candidate2-glimmer-events-demo', events\.length > 0\)/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-variants-empty', '\.candidate2-glimmer-variants-demo', variants\.length > 0\)/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-encounters-empty', '\.candidate2-glimmer-encounters-demo', encounters\.length > 0\)/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-summary-empty', '\.candidate2-glimmer-summary-demo', Boolean\(glimmer\)\)/,
  );
  assert.match(
    html,
    /setDemoVisibility\('\.candidate2-glimmer-achievements-empty', '\.candidate2-glimmer-achievements-demo', achievements\.length > 0\)/,
  );
  assert.match(
    html,
    /glimmerTrackList\.replaceChildren\(\.\.\.tracks\.map\(buildGlimmerTrackFigure\)\)/,
  );
  assert.match(html, /glimmerEventList\.replaceChildren\(\.\.\.events\.map/);
  assert.match(
    html,
    /glimmerVariantList\.replaceChildren\(\.\.\.variants\.map\(buildGlimmerVariantFigure\)\)/,
  );
  assert.match(
    html,
    /const glimmerAnimalLayoutWidth = 292;[\s\S]*position\.x \/ glimmerAnimalLayoutWidth \* 100 \+ 'cqw'[\s\S]*glimmerTrackList\.clientWidth \/ glimmerAnimalLayoutWidth/,
  );
  assert.match(html, /glimmerEncounterList\.replaceChildren\(\.\.\.encounters\.map/);
  assert.match(html, /glimmerAchievementList\.replaceChildren\(\.\.\.achievements\.map/);
  assert.match(
    html,
    /const glimmerPageOpen = screenId === 'screen-lingye-glimmer';[\s\S]*mainNav\.style\.display = glimmerPageOpen \? 'none' : 'flex';/,
  );
  assert.match(html, /\.candidate2-glimmer-page \{[\s\S]*padding-bottom: 0 !important;/);
  assert.doesNotMatch(html, /接入结构化状态后/);
});

test("runtime routes are click-only, no-key, and community returns inside the iframe", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /openLingyeRoute\('\/api\/farm\/ui', label\)/);
  assert.match(html, /sendAction\(\{ type: 'lingye-glimmer-open' \}\)/);
  assert.match(html, /sendAction\(\{ type: 'lingye-together-open' \}\)/);
  assert.match(html, /sendAction\(\{ type: 'navigate', path \}\)/);
  assert.doesNotMatch(html, /doorbell-candidate2:navigate/);
  assert.match(html, /window\.__doorbellCandidateDemo && path !== '\/api\/farm\/ui'/);
  assert.match(html, /演示模式：.*未连接真实服务/);
  assert.match(html, /showLingyeNotice\(label \+ '暂未开放'\)/);
  assert.match(html, /function showLingyeNotice\(message\)\s*\{\s*showCandidateNotice\(message\);/);
  assert.match(html, /placeId === 'doorbell-community'[\s\S]+showScreen\('screen-lounge'\)/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.match(html, /event\.source !== window\.parent/);
  assert.match(html, /doorbell-candidate2:connector-credential/);
  assert.match(html, /clearOneTimeConnectorCredential\(\)/);
  assert.match(html, /screenId !== 'screen-settings'/);
  assert.doesNotMatch(html, /\b(?:alert|confirm)\s*\(/);
  assert.match(html, /sendAction\(\{ type: 'view-ready' \}\)/);
});

test("Live Lingye entries use parent-owned structured reads and keep template data out", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /sendAction\(\{ type: 'lingye-glimmer-open' \}\)/);
  assert.match(html, /sendAction\(\{ type: 'lingye-together-open' \}\)/);
  assert.doesNotMatch(html, /\/api\/lingye-glimmer|\/api\/lingye-together/);
  assert.match(html, /candidate2-together-live-empty/);
  assert.match(html, /candidate2-glimmer-live-empty/);
  assert.doesNotMatch(html, /第二期 · 同一间厨房/);
  assert.doesNotMatch(html, /20:00—22:00/);
  assert.doesNotMatch(html, /任务链样张|公共选择样张/);
  assert.doesNotMatch(html, /<img[^>]+src="\/lingye\/together\/same-kitchen-opening\.jpg"/);
  assert.match(html, /applyLiveLingyeState\(state\.lingye\)/);
  assert.match(html, /doorbell-candidate2:state/);
});

test("the sandboxed candidate iframe explicitly permits its user-triggered copy buttons", () => {
  const componentSource = CandidateTwoPreview.toString();

  assert.match(componentSource, /clipboard-write/);
});

test("shared meme settings open a real standalone list, detail, and strict add flow", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /id="screen-shared-memes" class="screen"/);
  assert.match(html, /id="settings-shared-memes-open"[^>]*>View<\/button>/);
  assert.match(html, /id="settings-shared-meme-add"[^>]*>＋ 添加新梗<\/button>/);
  const settingsMemeSection = html.slice(
    html.indexOf('class="candidate2-settings-section candidate2-settings-memes"'),
    html.indexOf('class="candidate2-settings-section candidate2-settings-account"'),
  );
  assert.doesNotMatch(settingsMemeSection, /尚未接入/);
  assert.doesNotMatch(
    html,
    /id="settings-(?:shared-memes-open|shared-meme-add)"[^>]*(?:disabled|data-demo-action)/,
  );
  assert.match(html, /sendAction\(\{ type: 'shared-memes-open' \}\)/);
  assert.match(html, /type: 'shared-meme-open', memeId: meme\.meme_id/);
  assert.match(html, /type: 'shared-meme-create'/);
  assert.match(html, /name="term" type="text" required/);
  assert.match(html, /name="aliases" rows="2"/);
  assert.match(html, /name="examples" rows="2"/);
  assert.match(html, /name="keywords" rows="2"/);
  assert.doesNotMatch(html, /screen-shared-memes[\s\S]*?placeholder=/);
});

test("notification and community preferences restore, edit, save, and report status", () => {
  const html = buildCandidateTwoRuntimeHtml();
  const preferenceMarkup = html.slice(
    html.indexOf("<span>03</span>"),
    html.indexOf("<span>05</span>"),
  );

  assert.doesNotMatch(preferenceMarkup, /\bdisabled\b|data-demo-(?:setting|control)/);
  assert.match(preferenceMarkup, /class="settings-pause-all-wakeups" type="checkbox"/);
  assert.match(preferenceMarkup, /class="settings-visit-notifications" type="checkbox" checked/);
  assert.match(preferenceMarkup, /class="settings-activity-notifications" type="checkbox" checked/);
  assert.match(preferenceMarkup, /class="settings-system-notifications" type="checkbox" checked/);
  assert.match(
    preferenceMarkup,
    /class="settings-lounge-duration" type="number" min="1" inputmode="numeric" value="" required/,
  );
  assert.match(
    preferenceMarkup,
    /class="settings-initial-message-count" type="number" min="0" inputmode="numeric" value=""/,
  );
  assert.match(
    preferenceMarkup,
    /class="settings-chat-mode"><option value="natural">自然<\/option><option value="proactive">主动<\/option><option value="listening">倾听<\/option>/,
  );
  assert.match(preferenceMarkup, /class="settings-activity-room-warmup" type="checkbox" checked/);
  assert.match(html, /settingsPauseAllWakeups\.checked = homeSettings\.pauseAllWakeups/);
  assert.match(
    html,
    /settingsLoungeDuration\.value = String\(homeSettings\.defaultConnectionDurationMinutes\)/,
  );
  assert.match(html, /settingsChatMode\.value = homeSettings\.chatMode/);
  assert.match(html, /setHomeSettingsDisabled\(pending\)/);
  assert.match(html, /type: 'notification-preference-save'/);
  assert.match(html, /type: 'community-connection-preference-save'/);
  assert.match(html, /saveNotificationPreference\('pauseAllWakeups'/);
  assert.match(html, /saveNotificationPreference\('visitRequestsAndInvitationsEnabled'/);
  assert.match(html, /saveNotificationPreference\('activityInvitationsEnabled'/);
  assert.match(html, /saveNotificationPreference\('importantSystemNotificationsEnabled'/);
  assert.match(html, /saveCommunityNumberPreference\('defaultConnectionDurationMinutes'/);
  assert.match(html, /saveCommunityNumberPreference\('initialRecentActivityCount'/);
  assert.match(html, /saveCommunityChatMode\(settingsChatMode\)/);
  assert.match(html, /saveCommunityBooleanPreference\('allowActivityRoomWarmup'/);
  assert.match(html, /正在保存偏好设置……/);
  assert.match(html, /偏好设置已保存/);
});

test("Connector settings map all real states and null or real last-online timestamps", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /not_configured: '尚未配置'/);
  assert.match(html, /offline: '已离线'/);
  assert.match(html, /online: '连接正常'/);
  assert.match(html, /if \(lastOnlineAt === null\) return '暂无连接记录'/);
  assert.match(html, /date\.toLocaleString\('zh-CN'/);
  assert.match(html, /state\.connectorSettings/);
  assert.match(html, /state\.connectorControlIssueMessage/);
});

test("copy-for-own-agent instructions use the official required env and workspace start", () => {
  const credential = `dbc_${"B".repeat(43)}`;
  const instructions = buildConnectorSetupInstructions(credential);

  assert.match(
    instructions,
    /DOORBELL_SERVER_WS_URL="wss:\/\/<替换为实际 Doorbell 域名>\/api\/connector\/ws"/,
  );
  assert.match(instructions, new RegExp(`DOORBELL_CONNECTOR_CREDENTIAL="${credential}"`));
  assert.match(
    instructions,
    /DOORBELL_CONNECTOR_DATABASE_PATH="\/替换为本机绝对路径\/doorbell-connector\.sqlite"/,
  );
  assert.match(instructions, /DOORBELL_CONNECTOR_HTTP_TIMEOUT_MS="300000"/);
  assert.match(instructions, /npm run build -w @doorbell\/connector/);
  assert.match(instructions, /npm run start -w @doorbell\/connector/);
  assert.match(instructions, /不会自动注册 AI/);
});

test("full demo data is explicit, local-only, and exposes every preview state", () => {
  assert.equal(resolveCandidateTwoDemoPreset("doorbell.example", "?demo=full"), null);
  assert.equal(resolveCandidateTwoDemoPreset("127.0.0.1", ""), null);

  const home = resolveCandidateTwoDemoPreset("127.0.0.1", "?demo=full");
  assert.equal(home?.state.stage, "authenticated");
  assert.equal(home?.demo.initialScreen, "home");
  assert.equal(home?.demo.content.doorbellRequests.length, 2);
  assert.equal(home?.demo.content.relationships.length, 3);
  assert.equal(home?.demo.content.activities.length, 8);

  const registration = resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=registration");
  assert.equal(registration?.state.stage, "registration-profile");
  assert.equal(registration?.demo.registrationPrefill?.farmDoorplate, "3ET3FE");

  assert.equal(
    resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=permit")?.state.stage,
    "issuing-permit",
  );
  assert.equal(
    resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=login")?.state.stage,
    "anonymous",
  );
  assert.equal(
    resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=lingye")?.demo.initialScreen,
    "lingye",
  );
  assert.equal(
    resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=glimmer")?.demo.initialScreen,
    "lingye-glimmer",
  );
  assert.equal(
    resolveCandidateTwoDemoPreset("localhost", "?demo=full&screen=settings")?.demo.initialScreen,
    "settings",
  );
  assert.equal(home?.demo.content.settings.initialMessageCount, 20);
  assert.equal(home?.demo.content.mailboxUnreadCount, 3);
  assert.equal(home?.demo.content.mailboxMessages.length, 10);
});

test("runtime contains populated-demo slots without changing production empty states", () => {
  const html = buildCandidateTwoRuntimeHtml();

  assert.match(html, /home-doorbell-demo/);
  assert.match(html, /candidate2-demo-visitors/);
  assert.match(html, /candidate2-demo-relationship/);
  assert.match(html, /candidate2-demo-relationship-summary/);
  assert.match(html, /认识 ' \+ content\.relationships\.length \+ ' 位邻居/);
  assert.match(html, /candidate2-demo-activity-list/);
  assert.match(html, /id="profile-design-button"[^>]*>Design</);
  assert.match(html, /id="profile-edit-button"[^>]*>Edit Profile</);
  assert.match(html, /class="candidate2-notebook-holes"/);
  assert.match(html, /class="candidate2-profile-page"/);
  assert.match(
    html,
    /class="candidate2-profile-scale-shell">[\s\S]*class="candidate2-profile-design-canvas">[\s\S]*class="candidate2-profile-page">/,
  );
  assert.match(html, /class="profile-relation-core-name">—</);
  assert.match(html, /id="profile-activity-more"[^>]*hidden>More</);
  assert.match(html, /content\.activities\.slice\(0, 20\)/);
  assert.match(html, /applyDemoContent\(demo\)/);
  assert.match(
    html,
    /class="candidate2-profile-note">[\s\S]*class="candidate2-profile-paperclip" src="\/candidate-two\/settings-paperclip-silver-v1\.png"[\s\S]*>RESIDENCE INFO<[\s\S]*class="candidate2-profile-note-body"[\s\S]*class="chibi-avatar"[\s\S]*居民姓名[\s\S]*class="profile-resident-name"/,
  );
  assert.doesNotMatch(
    html,
    /class="candidate2-profile-note">[\s\S]*class="profile-header"[\s\S]*class="profile-resident-name"/,
  );
  assert.match(html, /class="candidate2-identity-summary"/);
  assert.doesNotMatch(html, /class="relationship-graph candidate2-identity-summary"/);
  assert.match(html, /class="home-page-kicker handwritten">MY HOME</);
  assert.match(html, /class="home-name">—<\/h1>/);
  assert.match(
    html,
    /class="candidate2-home-scale-shell">[\s\S]*class="candidate2-home-design-canvas">[\s\S]*class="home-overview-header"[\s\S]*class="home-mailbox-dialog" hidden/,
  );
  assert.doesNotMatch(
    html,
    /hanging-home-sign|home-sign-cord|home-sign-rivet|HEMP_ROPE_URL|hemp-rope-tile/,
  );
  assert.match(html, /#screen-home\s*\{[^}]*background: #f7f1ea;/s);
  assert.match(html, /#screen-home\s*\{[^}]*padding: 0;/s);
  assert.match(
    html,
    /\.candidate2-home-scale-shell\s*\{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*flex: 0 0 auto;/s,
  );
  assert.match(
    html,
    /\.candidate2-home-design-canvas\s*\{[^}]*width: 430px;[^}]*padding: 24px 22px 116px;[^}]*zoom: var\(--candidate2-home-scale, 1\);/s,
  );
  assert.match(html, /\.home-name\s*\{[^}]*font-size: 36\.12px;/s);
  assert.doesNotMatch(html, /\.home-name\s*\{[^}]*font-size:[^;}]*vw/s);
  assert.match(
    html,
    /const homeDesignWidth = 430;[\s\S]*const scale = Math\.min\(1, availableWidth \/ homeDesignWidth\);[\s\S]*homeDesignCanvas\.style\.setProperty\('--candidate2-home-scale', String\(scale\)\);/s,
  );
  assert.match(
    html,
    /const homeScaleObserver = new ResizeObserver\(syncHomeScale\);[\s\S]*homeScaleObserver\.observe\(homeScaleShell\);[\s\S]*window\.addEventListener\('resize', syncHomeScale\);/s,
  );
  assert.match(
    html,
    /originalShowScreen\(screenId\);[\s\S]*if \(screenId === 'screen-home'\) syncHomeScale\(\);/s,
  );
  assert.match(html, /class="home-parlor-entry"[^>]*onclick="openHomeParlor\(\)"/);
  assert.match(
    html,
    /\.home-parlor-entry\s*\{[^}]*background: #fffdf9 url\('\/candidate-two\/home-parlor-watercolor-background\.webp'\) center \/ cover no-repeat;[^}]*box-shadow: 0 5px 8px -6px rgba\(96, 72, 63, 0\.35\);/s,
  );
  assert.doesNotMatch(html, /class="home-parlor-art"/);
  assert.match(html, /\.home-parlor-copy\s*\{[^}]*width: 48%;[^}]*height: 143px;/s);
  assert.doesNotMatch(html, /home-parlor-(?:door|vine|handle)/);
  assert.match(html, />GUEST ROOM<[\s\S]*>会客厅<[\s\S]*查看来访、会话与剩余时间/);
  assert.match(html, /function openHomeParlor\(\)[\s\S]*会客厅暂未开放/);
  assert.match(html, /function openHomeParlor\(\)\s*\{\s*showCandidateNotice\('会客厅暂未开放'\);/);
  assert.match(html, /class="home-doorstep-list"[^>]*门口近况/);
  assert.match(html, />门口近况<[\s\S]*>AT THE DOOR</);
  assert.match(html, /class="home-doorstep-label"><strong>门铃<\/strong><small>DOORBELLS<\/small>/);
  assert.match(html, /class="home-doorstep-label"><strong>访客<\/strong><small>VISITORS<\/small>/);
  assert.match(
    html,
    /\.home-doorstep-header strong\s*\{[^}]*font-size: 15px;[^}]*font-weight: 600;/s,
  );
  assert.match(
    html,
    /\.home-doorstep-label strong\s*\{[^}]*font-size: 15px;[^}]*font-weight: 600;/s,
  );
  assert.match(html, /\.home-doorstep-header small\s*\{[^}]*font-family: 'Gaegu'/s);
  assert.match(html, /\.home-doorstep-label small\s*\{[^}]*font-family: 'Gaegu'/s);
  assert.match(html, /class="home-mailbox-icon"[^>]*aria-label="信箱"[^>]*openHomeMailbox\(\)/);
  assert.match(html, /class="home-mailbox-badge" hidden>0<\/span>/);
  assert.match(html, /class="home-mailbox-dialog" hidden/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="home-mailbox-title"/);
  assert.match(html, />COMMUNITY MAILBOX<[\s\S]*id="home-mailbox-title">信箱</);
  assert.match(
    html,
    /function openHomeMailbox\(\)[\s\S]*home-mailbox-dialog'[\s\S]*hidden = false/,
  );
  assert.match(
    html,
    /function closeHomeMailbox\(\)[\s\S]*home-mailbox-dialog'[\s\S]*hidden = true/,
  );
  assert.match(html, /const homeMailboxPageSize = 8/);
  assert.match(html, />全部<[\s\S]*>串门<[\s\S]*>活动<[\s\S]*>通知</);
  assert.match(html, /filteredMessages\.slice\(pageStart, pageStart \+ homeMailboxPageSize\)/);
  assert.match(html, /homeMailboxPage \+ ' \/ ' \+ totalPages/);
  assert.match(html, /title\.textContent = message\.title/);
  assert.match(html, /title\.onclick = \(\) => openHomeMailboxDetail\(message\)/);
  assert.match(
    html,
    /function openHomeMailboxDetail\(message\)[\s\S]*if \(message\.unread\)[\s\S]*message\.unread = false;[\s\S]*homeMailboxUnreadCount = Math\.max\(0, homeMailboxUnreadCount - 1\);[\s\S]*syncHomeMailboxUnreadBadge\(\);[\s\S]*renderHomeMailbox\(\);/s,
  );
  assert.match(
    html,
    /function syncHomeMailboxUnreadBadge\(\)[\s\S]*mailboxBadge\.textContent = String\(homeMailboxUnreadCount\);[\s\S]*mailboxBadge\.hidden = homeMailboxUnreadCount < 1;/s,
  );
  assert.match(
    html,
    /homeMailboxMessages = mailboxMessages\.map\(\(message\) => \(\{ \.\.\.message \}\)\);/,
  );
  assert.match(html, /class="home-mailbox-detail" hidden/);
  assert.match(
    html,
    /function openHomeMailboxDetail\(message\)[\s\S]*message\.detail[\s\S]*!message\.actionable/,
  );
  assert.match(
    html,
    /function openHomeMailboxDetail\(message\)[\s\S]*classList\.add\('is-detail'\)/,
  );
  assert.match(html, /\.home-mailbox-sheet\.is-detail\s*\{[^}]*height: auto;/s);
  assert.doesNotMatch(html, /\.home-mailbox-detail-body\s*\{[^}]*min-height:/s);
  assert.match(html, /class="home-mailbox-detail-back"[^>]*showHomeMailboxList\(\)/);
  assert.match(html, /接受[\s\S]*拒绝[\s\S]*演示操作，不会保存/);
  assert.match(
    html,
    /function showHomeMailboxDetailFeedback\(action\)\s*\{\s*showCandidateNotice\(action \+ '为演示操作，不会保存'\);/,
  );
  assert.match(
    html,
    /\.home-mailbox-sheet-header \.candidate2-section-label\s*\{[^}]*font-family: 'Gaegu'/s,
  );
  assert.match(
    html,
    /\.home-parlor-copy > \.candidate2-section-label\s*\{[^}]*font-family: 'Gaegu'/s,
  );
  assert.doesNotMatch(
    html,
    /home-mailbox-message-meta|home-mailbox-message-footer|home-mailbox-actions/,
  );
  assert.match(
    html,
    /Number\.isFinite\(content && content\.mailboxUnreadCount\)[\s\S]*: 0;[\s\S]*homeMailboxUnreadCount = mailboxUnreadCount;[\s\S]*syncHomeMailboxUnreadBadge\(\);/,
  );
  assert.doesNotMatch(html, /class="[^"]*home-mailbox-entry[^"]*"|class="home-mailbox-action"/);
  assert.match(html, /\.home-doorstep-row\s*\{[^}]*grid-template-columns: 72px minmax\(0, 1fr\);/s);
  assert.doesNotMatch(html, /home-status-board|grid-template-columns: minmax\(0, 0\.9fr\)/);
  assert.doesNotMatch(html, /HOME SETTINGS|>家庭设置</);
  assert.doesNotMatch(html, /BACKGROUND STORY|home-environment-(?:empty|demo)/);
  assert.doesNotMatch(html, /home-mailbox-candidate2\.png/);
  assert.match(html, /\.candidate2-identity-summary\s*\{[^}]*flex: 0 0 auto;/s);
  assert.doesNotMatch(
    html,
    /\.candidate2-identity-summary\s*\{[^}]*transform:\s*rotate\(-1\.2deg\)/s,
  );
  assert.doesNotMatch(
    html,
    /\.candidate2-identity-summary\s*\{[^}]*(?:border:|border-radius:|background: white)/s,
  );
  assert.match(
    html,
    /\.profile-resident-name\s*\{[^}]*font-family: var\(--ui-regular-font\);[^}]*font-style: normal;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-note\s*\{[^}]*padding: 20px 16px 8px;[^}]*border: 0\.5px solid #e1d5c9;[^}]*background: #fffaf0;[^}]*box-shadow: 2px 3px 4px rgba\(83, 63, 53, 0\.08\);/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-paperclip\s*\{[^}]*top: -17px;[^}]*right: 19px;[^}]*width: auto;[^}]*height: 64px;[^}]*object-fit: contain;[^}]*transform: rotate\(30deg\) scale\(0\.86\);/s,
  );
  assert.doesNotMatch(html, /\.candidate2-profile-note::(?:before|after)/);
  assert.match(
    html,
    /\.candidate2-profile-note \.chibi-avatar\s*\{[^}]*width: 58px;[^}]*height: 76px;[^}]*border-radius: 2px;[^}]*background: #fffdf7;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-note-title\s*\{[^}]*font-family: 'Gaegu', cursive;[^}]*font-size: 18px;[^}]*text-align: center;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-note-body\s*\{[^}]*grid-template-columns: 58px minmax\(0, 1fr\);[^}]*align-items: start;/s,
  );
  assert.match(html, /\.candidate2-identity-summary p\s*\{[^}]*font-size: 8px;/s);
  assert.match(html, /\.candidate2-identity-summary\s*\{[^}]*gap: 6px;/s);
  assert.match(
    html,
    /\.candidate2-identity-summary strong\s*\{[^}]*font-size: 8px;[^}]*font-weight: 500;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-page\s*\{[^}]*min-height: 100%;[^}]*padding: 24px 16px 34px;[^}]*border: 0\.5px solid #e1d5c9;[^}]*border-bottom: 0;[^}]*border-radius: 0;[^}]*color: #60483f;[^}]*background: #fffdf9;[^}]*box-shadow: 2px 3px 4px rgba\(83, 63, 53, 0\.08\);/s,
  );
  assert.match(
    html,
    /#screen-profile\s*\{[^}]*padding: 22px 18px 116px;[^}]*background: #f8f1e9;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-scale-shell\s*\{[^}]*width: 100%;[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*flex: 0 0 auto;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-design-canvas\s*\{[^}]*width: 402px;[^}]*margin-inline: auto;[^}]*zoom: var\(--candidate2-profile-scale, 1\);/s,
  );
  assert.match(
    html,
    /const profileDesignWidth = 402;[\s\S]*const scale = Math\.min\(1, availableWidth \/ profileDesignWidth\);[\s\S]*profileDesignCanvas\.style\.setProperty\('--candidate2-profile-scale', String\(scale\)\);/s,
  );
  assert.match(
    html,
    /const profileScaleObserver = new ResizeObserver\(syncProfileScale\);[\s\S]*profileScaleObserver\.observe\(profileScaleShell\);[\s\S]*window\.addEventListener\('resize', syncProfileScale\);/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-page::before\s*\{[^}]*top: -1px;[^}]*radial-gradient\(circle at 14px 0, #f8f1e9 0 7px, transparent 7\.35px\)/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-page::after\s*\{[^}]*bottom: -116px;[^}]*height: 116px;[^}]*background: #fffdf9;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-header-stack\s*\{[^}]*z-index: 3;[^}]*min-height: 176px;[^}]*margin: -30px 0 8px;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-action-sheet\s*\{[^}]*left: -14px;[^}]*width: 34%;[^}]*min-height: 112px;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-action\s*\{[^}]*position: relative;[^}]*font-size: 17px;[^}]*text-decoration: none;/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-action::after\s*\{[^}]*height: 3px;[^}]*data:image\/svg\+xml,[^}]*stroke='%239e776c'[^}]*content: '';/s,
  );
  assert.match(
    html,
    /\.candidate2-profile-note\s*\{[^}]*position: absolute;[^}]*right: -8px;[^}]*width: 72%;[^}]*transform: rotate\(1\.2deg\) scale\(1\.08\);[^}]*transform-origin: top right;/s,
  );
  assert.match(html, /\.candidate2-notebook-stack\s*\{[^}]*height: 244px;/s);
  assert.doesNotMatch(html, /\.candidate2-demo-relationship-panel\s*\{[^}]*background-image:/s);
  assert.match(
    html,
    /\.candidate2-profile-action-sheet\s*\{[^}]*border: 0;[^}]*background: #f1e7dd;[^}]*clip-path: polygon\([^}]*0\.6% 1%,[^}]*99\.5% 99%,[^}]*0\.9% 25%[^}]*\);[^}]*filter:[^}]*drop-shadow\(0 0 0\.4px #d6c8bc\)[^}]*drop-shadow\(2px 3px 2px rgba\(83, 63, 53, 0\.08\)\);/s,
  );
  assert.match(
    html,
    /\.candidate2-notebook-underlay\s*\{[^}]*border: 0\.5px solid #d8cbbf;[^}]*background: #eadfd4;[^}]*box-shadow: 2px 3px 3px rgba\(83, 63, 53, 0\.08\);/s,
  );
  assert.match(
    html,
    /\.candidate2-demo-relationship-panel\s*\{[^}]*border: 0\.5px solid #e1d5c9;[^}]*background-color: #fffaf0;[^}]*box-shadow: 2px 3px 4px rgba\(83, 63, 53, 0\.08\);/s,
  );
  assert.match(
    html,
    /\.candidate2-notebook-holes i\s*\{[^}]*border: 1px solid #d8cbbf;[^}]*background: #f8f1e9;/s,
  );
  assert.match(html, /\.candidate2-activity-section\s*\{[^}]*margin-top: 24px;/s);
  assert.match(
    html,
    /\.candidate2-activity-section \.candidate2-profile-section-title\s*\{[^}]*margin-bottom: 10px;/s,
  );
  assert.match(
    html,
    /class="candidate2-demo-relation-lines"[\s\S]*x1="50" y1="46\.4" x2="12" y2="25"[\s\S]*x2="67" y2="27"[\s\S]*x2="21" y2="75"/s,
  );
  assert.match(
    html,
    /\.candidate2-demo-relation-lines line\s*\{[^}]*vector-effect: non-scaling-stroke;/s,
  );
  assert.match(
    html,
    /\.candidate2-demo-relation-node\s*\{[^}]*transform: translate\(-11\.5px, -50%\);/s,
  );
  assert.match(html, /\.candidate2-demo-relation-core\s*\{[^}]*top: 50%;[^}]*left: 50%;/s);
  assert.match(
    html,
    /\.candidate2-demo-relation-core::before\s*\{[^}]*width: 28px;[^}]*height: 28px;[^}]*border: 0;[^}]*box-shadow: none;/s,
  );
  assert.match(
    html,
    /\.candidate2-demo-relation-node::before\s*\{[^}]*width: 17px;[^}]*height: 17px;[^}]*border: 0;[^}]*box-shadow: none;/s,
  );
  assert.doesNotMatch(html, /\.candidate2-notebook-underlay::(?:before|after)/);
  assert.match(
    html,
    /id="profile-relationship-edit" class="candidate2-relationship-edit handwritten"[^>]*>Edit</,
  );
  assert.match(
    html,
    /\.candidate2-relationship-edit\s*\{[^}]*top: -1px;[^}]*right: 35px;[^}]*background: #ead8c7;[^}]*clip-path: polygon[^}]*transform: rotate\(2deg\) scale\(1\.08\);[^}]*transform-origin: center;/s,
  );
  assert.match(html, /id="profile-relationship-editor"[^>]*hidden/);
  assert.match(
    html,
    /value="不熟">不熟<\/option><option value="还行">还行<\/option><option value="朋友">朋友<\/option><option value="自定义">自定义</,
  );
  assert.match(html, /relationshipEditButton\.addEventListener\('click'/);
  assert.match(html, /演示关系已更新（不会保存）/);
  assert.match(html, /showCandidateNotice\('Q版形象设计暂未开放'\)/);
  assert.match(html, /showCandidateNotice\('资料编辑暂未开放'\)/);
  assert.match(html, /showCandidateNotice\('演示关系已更新（不会保存）'\)/);
  assert.match(
    html,
    /\[data-demo-action\][\s\S]*showCandidateNotice\(window\.__doorbellCandidateDemo/s,
  );
  assert.match(
    html,
    /\[data-demo-setting\], \[data-demo-control\][\s\S]*showCandidateNotice\('演示设置已更新（不会保存）'\)/s,
  );
  assert.match(
    html,
    /const settingsFeedback = document\.querySelector\('\.candidate2-settings-feedback'\)/,
  );
  assert.match(html, /setStatus\(settingsFeedback, '新凭据只显示这一次/);
  assert.match(html, /\.candidate2-demo-relation-node small \{ color: #a8958b; font-size: 8px;/);
  assert.match(html, /\.candidate2-demo-activity > span:nth-child\(2\)\s*\{[^}]*color: #60483f;/s);
  assert.match(html, /\.candidate2-demo-activity time\s*\{[^}]*color: #a8958b;/s);
  assert.match(
    html,
    /\.candidate2-settings-number input\s*\{[^}]*width: min\(58px, 72%\);[^}]*font-size: 14px;[^}]*font-weight: 500;/s,
  );
  assert.match(html, /\.candidate2-demo-activity-list::before\s*\{/s);
  assert.match(
    html,
    /\.candidate2-demo-activity > span:first-child\s*\{[^}]*left: -18px;[^}]*width: 8px;[^}]*height: 8px;[^}]*border: 1px solid var\(--bg-cream\);/s,
  );
  assert.match(html, /\.candidate2-demo-activity\.is-collapsed:nth-child\(n \+ 5\)/);
  assert.match(html, /暂无可读取的门铃请求/);
  assert.match(html, /来往数据尚未接入/);
});
