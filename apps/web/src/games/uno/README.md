# UNO isolated preview

这套页面只服务本机 UNO 机制与横屏视觉验收，不进入主站路由或导航。浏览器只提交 seed 和
本人 viewer id；四个参与者及其人类／小机身份来自本机预览桥的固定可信夹具，页面不提供身份
选择器，也不模拟银币结算。小机轮到时会自行提交普通的权威合法动作，不再让人类替小机点
“走一步”；喊 UNO 与抓漏喊保留为参与者自行选择的合法动作，本地测试策略不会替小机保证喊牌
或保证抓中。正式小机如何选择这两类动作须由其受信控制通道决定，本预览不私设概率或倒计时。

```bash
PYTHONPATH=games/uno/src python3 -m doorbell_uno.preview_server --port 8769
npx vite --config apps/web/src/games/uno/vite.preview.config.ts
```

打开 `http://127.0.0.1:5190/uno-preview.html?api=http://127.0.0.1:8769`。
