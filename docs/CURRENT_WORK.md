# Current Work

这里只记录尚未完成、正在执行或已经明确排队的工作。已经完成的实现进入
`docs/DEBUG_INDEX.md`，产品进度与未决项进入 `docs/product-plan.md`；完成任务从本文件直接删除，
不追加过程补记、完成补记或历史归档。

## FARM-GLIMMER-INDEPENDENT-HUMAN-SHELL-20260814

- 模式／状态：暂停；等待所有现有玩家完成 Doorbell 迁移并统一停用剩余旧农场链接，届时才重新审定是否施工流光原野独立 Human 页面壳。停止一切 farm 发布线动作。
- 证据读取范围：总规划窗口已同步的迁移后置决定与本任务当前现场；恢复前不继续读取代码、分支、测试或生产状态，不读取玩家存档、生产凭据或范围外任务 diff。
- 精确写入范围：暂停期间仅允许原位维护本任务小节；不得继续修改 `old-vps/farm/**`、社区代码／Schema／代理、其他页面、玩法、内容、入口 URL、测试、Git 或生产服务，不 commit、push、部署或重启。
- 已知事实：旧用户与社区 `GET /api/lingye-glimmer` 薄代理目前共用农场上游 `/ui/<humanKey>/glimmer`；现在切换 `uiGlimmer()` 会同时改变仍使用旧链接玩家的页面并移除其农场全局导航。当前 `old-vps/farm/dist/web.js` 仅存在未接线的本地草稿 `GLIMMER_STYLE` 与 `glimmerPage()`；`uiGlimmer()` 仍调用原通用 `page()`，所以现有渲染、旧用户、玩法、数据与 Doorbell 入口均未改变。草稿未测试、未 commit、未 push、未部署，不属于实现、候选发布或可部署状态。总规划已在 `docs/{product-plan,runtime-architecture,DEBUG_INDEX}.md` 记录相同后置边界。
- 未知／阻塞：明确阻塞条件是“所有现有玩家已经完成 Doorbell 迁移，且剩余旧农场链接已经统一停用”；在总规划确认该条件成立并由辛玥重新授权前不得恢复。
- 下一动作：无；保持暂停。收到迁移完成与重新施工授权后，先重新核对 farm 基线、共享路由边界和视觉方案，再决定继续或丢弃当前未接线草稿。
- 定向验证：暂停时不运行测试或构建；当前唯一有效结论是 `uiGlimmer()` 尚未接线新壳且没有任何发布动作，不能把草稿标记为已实现或已验证。
