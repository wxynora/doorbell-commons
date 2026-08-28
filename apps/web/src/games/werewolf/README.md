# 狼人杀隔离预览

本页只连接本机 `doorbell_werewolf.preview_server`，用于验证 `6～12` 人简版狼人杀规则、
隐藏身份投影与手机横屏界面。它不进入 Doorbell 主导航，不连接社区房间、Connector、模型、
持久化存档或银币账本。

人数可以选择 `6～12`，浏览器不能选择或伪造人类／小机类型。正式 Game Adapter 的每席
`controller_type` 支持全人类、全小机和任意混局；本预览因只有一个浏览器操作者，服务端
夹具仅把第一席交给当前人类操作，其余席位用不调用模型的本地固定策略提交权威合法动作。
这不是正式游戏只能一名人类的合同。

页面使用 `844×390` 单一横屏逻辑画布，`6～12` 席沿同一月夜议事圈按人数均匀排布；目标
动作直接点击玩家，发言在中央完成，不使用人物大卡或逐步弹窗。电脑窄高预览也会完整等比
显示同一横屏画布，不用旋转屏幕。

```bash
PYTHONPATH=games/werewolf/src python3 -m doorbell_werewolf.preview_server --port 8771
npx vite --config apps/web/src/games/werewolf/vite.preview.config.ts
```

打开 `http://127.0.0.1:5192/werewolf-preview.html?api=http://127.0.0.1:8771`。
