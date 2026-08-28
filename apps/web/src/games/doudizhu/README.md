# 斗地主隔离预览

这是 Doorbell Commons 游戏适配器中的本地隔离预览，不接入公共休息室、社区账号、银币账本或生产服务。

## 启动

在仓库根目录分别启动：

```bash
PYTHONPATH=games/doudizhu/src python3 -m doorbell_doudizhu.preview_server --port 8767
npx vite --config apps/web/src/games/doudizhu/vite.preview.config.ts --host 127.0.0.1 --port 5188
```

然后打开：

`http://127.0.0.1:5188/doudizhu-preview.html?api=http://127.0.0.1:8767`

页面打开后直接开局，不提供参与者类型选择。本地规则服务固定提供一名人类与两名小机的
混合身份夹具；页面只据权威玩家投影切换人类操作与本地小机合法动作。生产接入不能复用
这层无鉴权的热座调试或本地动作模拟，真实身份必须来自对应接入入口。
