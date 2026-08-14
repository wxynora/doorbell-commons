# Current Work

## RELEASE-DOORBELL-COMMUNITY-MAIN-AND-TEST-VPS-20260814

- 模式／状态：施工，辛玥已授权先 push 再部署 VPS，并明确农场改动只能交由农场维护窗口走独立 `farm` 分支；当前正在收束社区 `main` 发布候选。
- 证据读取范围：根 `AGENTS.md`、`README.md`、`.gitignore`、package/workspace 配置、`docs/{product-plan,runtime-architecture,DEBUG_INDEX,CURRENT_WORK}.md`，全部非农场社区源代码／测试／运行资产与 `deploy/**`，Git 当前分支／远端／历史，测试 VPS `/opt/doorbell-commons`、社区 systemd、环境键是否存在与公开健康状态；不读取生产秘密值、真实玩家数据内容或 8091 农场存档。
- 精确写入范围：必要的 `README.md` 当前事实修正、本任务小节；Git 的社区 `main` index／commit／push；测试 VPS `/opt/doorbell-commons` 社区运行候选、对应备份目录、经辛玥确认数值后的 `DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS` 环境项，以及 `doorbell-commons.service` 重启。明确不 stage／commit／push `old-vps/farm/**` 到 `main`，不修改／部署 8091，不替农场窗口整理 `farm` 分支；不把本地 UI 编辑器、未接入视觉候选、生成审阅图或根参考图带入社区发布。
- 已知事实：GitHub `origin/main` 当前为 `0d338b8` 且并非空仓库；本地 `main` 顶部尚有未推送纯农场提交 `c67e460`，必须先保留安全引用并从社区 main 发布线移出。远端测试 VPS 的 `/opt/doorbell-commons` 是非 Git 部署目录，社区与隔离 8092 服务当前 active；社区环境尚无新必填 `DOORBELL_UPSTREAM_REQUEST_TIMEOUT_MS`，因此在辛玥确认具体毫秒值前可以完成社区 commit／push，但不能重启新服务版本。
- 未知／阻塞：部署所需显式上游请求时限数值尚未确认；社区候选的精确 staging 清单、秘密扫描、构建和远端替换范围需在 push 前完成。农场提交和工作树已逐字移交「农场（铃野）维护专用」窗口，该窗口暂不并发施工。
- 下一动作：安全保留 `c67e460`，把本地 main 基线恢复到 `origin/main` 且保留全部工作树；只 stage 已完成社区源码、测试、文档、部署配置和实际引用运行资产，核对零农场路径／零本地候选／零秘密，完成必要构建验证后 commit 并 push `main`。随后取得 timeout 数值，使用刚推的 commit 构建干净部署包，备份并替换测试 VPS 社区服务，重启后验证服务、HTTP、数据库迁移和日志。
- 定向验证：社区 staged diff／秘密与路径边界检查；protocol/server/connector/web typecheck 与 build；必要的已登记定向测试；push 后核对 `origin/main` 精确 SHA。部署后核对 `doorbell-commons.service` active、`NRestarts=0`、`ExecMainStatus=0`、`/api/health` 200、Web 与地图 200、无 Bearer `/mcp` 401、SQLite `user_version=1`、新 bundle 与共享梗库 UI、启动日志无 warning-or-higher；不调用真实玩家迁移或写入农场。

这里只记录尚未完成、正在执行或已经明确排队的工作。已经完成的实现进入
`docs/DEBUG_INDEX.md`，产品进度与未决项进入 `docs/product-plan.md`；完成任务从本文件直接删除，
不追加过程补记、完成补记或历史归档。
