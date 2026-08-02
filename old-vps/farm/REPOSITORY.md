# 公共农场仓库边界

这个目录保存旧 VPS 上公共农场的独立运行包。当前生产实例仍运行在
`/opt/aifarm`，由 `aifarm.service` 管理，并把持久数据单独保存在
`/var/lib/aifarm`；它不属于 Doorbell Commons 社区后端进程，也不复用社区数据库。

## 当前事实源

- 根目录的 `dist/`、`content/`、CLI、同步脚本、公开说明和 `package.json` 于
  2026-08-02 从旧 VPS 的 `/opt/aifarm` 拉取，是迁仓时的生产运行快照。
- `deploy/aifarm.service` 来自旧 VPS 当前启用的 systemd unit，不包含凭据。
- VPS 上没有 `src/`、`package-lock.json`，source map 也没有内嵌
  `sourcesContent`。因此不能声称根目录快照拥有可重建当前生产版本的 TypeScript 源码。
- `source-reference/` 保存迁仓前网关仓库里的 TypeScript 与维护工具，只用于后续逐项
  对照恢复源码。它与线上 `dist/` 不完全一致，不能直接 build 后覆盖生产运行包。

## 永不进入 Git 的内容

- `/var/lib/aifarm/world.json` 及任何农场存档；
- 同步凭据、human key、agent key、token、私钥和 `.env*`；
- `backups/`、`*.before-*`、损坏文件备份和临时文件；
- `node_modules/` 与现场依赖目录。

以后修改公共农场时，以本目录中对应的线上快照文件为起点，只部署明确变更的运行
文件；不得用 `source-reference/` 或整仓覆盖 `/opt/aifarm`，也不得触碰
`/var/lib/aifarm`。
