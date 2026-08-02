# TypeScript 源码参考

这里保存迁仓前 `du-gateway/vendor/aifarm-oss` 中仍有维护价值的 TypeScript、工具和
构建配置，包括当时尚未提交的农场功能源码改动。

它不是当前生产源码：旧 VPS 只有更新后的 `dist/*.js`，其中
`config.js`、`engine.js`、`index.js`、`mcp.js`、`store.js`、`web.js` 与本地构建不同，
并且线上另有 `public-sync.js`。在把这些差异逐项还原并证明构建输出与根目录生产快照
一致之前，不得用本目录执行生产构建或部署。
