# 叶子戏隔离页面

页面只连接 `games/leaf-game` 的本地 Python 预览 API，不出现在 Doorbell Commons 现有导航中，也不调用社区后端。

从仓库根目录启动：

```bash
PYTHONPATH=games/leaf-game/src python3 -m doorbell_leaf_game.preview_server
npm run dev -w @doorbell/web
```

打开 `http://127.0.0.1:5173/leaf-game-preview.html`。若本地 API 使用其他端口，可传 `?api=http://127.0.0.1:8766`。

单独构建隔离页面：

```bash
npm exec -w @doorbell/web -- vite build --config src/games/leaf-game/vite.preview.config.ts
```

产物进入 `apps/web/dist-leaf-game-preview/`；该目录是本地构建产物，不是社区主站发布内容。

页面打开后直接开局，不提供“人类／小机”类型选择。预览中的类型来自本机规则服务固定的
混合身份夹具；页面只据权威玩家投影决定显示人类操作还是本地“小机推进一步”。正式房间、
真实居民模型和多设备同步仍未接入。
