# Current Work

这里只记录尚未完成、正在执行或已经明确排队的工作。已经完成的实现进入
`docs/DEBUG_INDEX.md`，产品进度与未决项进入 `docs/product-plan.md`；完成任务从本文件直接删除，
不追加过程补记、完成补记或历史归档。

## IMPLEMENT-RANCH-LIMITED-SKINS-20260829

- 模式／状态：施工／辛玥已确认把首批四款限定皮肤接入真实牧场商店：布丁狗、小八、乌萨奇、甜心皮亚诺，每款 `100,000` 农场金币，北京时间 `2026-08-30 00:00` 上架、`2026-09-30 00:00` 下架。乌萨奇／甜心皮亚诺佩戴时产值 `+30%`；小八／布丁狗不加产值，只在原宠物 buff 概率上增加 `5` 个百分点。她已授权隔离施工、完成后分别合回并 push `farm`／`main`；两个干净 worktree 已建立。当前只被模型可见 `buy-skin` 文案逐字审阅门阻塞，尚未写代码。
- 证据读取范围：本小节；`docs/{product-plan,runtime-architecture,DEBUG_INDEX}.md` 中牧场商店、动物／宠物、金币、限时内容与 Farm 发布线边界；`docs/design-assets/ranch-limited-skins/batch-01-front-concept.png`；当前权威 farm 的动物／宠物目录、牧场商店读取与购买 authority、存档归一、商品展示、动物场景素材映射及直接测试；Main 只限现有 React 牧场商店投影与交互入口。不得读取生产配置、凭据、玩家存档、其他任务 diff 或外部服务。
- 精确写入范围：Farm worktree `/tmp/doorbell-ranch-skins-farm`（`origin/farm@2511611`）限 `content/ranch-items.json`、四款运行素材、`dist/{content,engine,glimmer,store,game,web}.js`、`dist/server/{ranch-structured,doorbell/ranch}.js` 与限定皮肤直接测试，只复用 `variantId` 持有／切换、新增已购皮肤集合与农场金币 `buy-skin` 权威结算。Main worktree `/tmp/doorbell-ranch-skins-main`（`origin/main@afd0161`）限 `packages/protocol/src/{farm-ranch,farm-purchase-request}.ts`，`apps/server/src/app.ts` 的牧场购物请求验证，`apps/web/src/farm/{farm-asset-manifest.ts,panels/ranch-animal-data.ts,panels/shop/{model,ranch-shop,shared}.tsx,page/ranch-resident-detail.tsx,scenes/ranch/ranch-scene.tsx}`、对应定向测试和四款运行素材，只增加 skin 商品投影、购物车、名称化外观、加成说明和皮肤素材选择；对应事实文档同步。不得修改农场／牧场既有动物价格、基础产出、货币规则、地图、其他商店、生产、部署或玩家数据。模型可见 `buy-skin` HELP／商店／结果文案必须先逐字确认；确认后可在两条隔离分支分别提交，并各自 fast-forward push 到 `farm`／`main`，不得混推。
- 已确认／证据／阻塞：四款使用已确认的正面静态透明图，不制作动画；对应 `dog／cat／rabbit／cloud_sheep`，每款 `100,000` 农场金币，北京时间 `2026-08-30 00:00`（含）至 `2026-09-30 00:00`（不含）可购买，下架后已购皮肤永久保留。佩戴乌萨奇或甜心皮亚诺时，对应兔子／云绵羊当前单位产值乘 `1.30`；小八把小猫既有 `luck 0.12` 提到 `0.17`、`dropMult 1.25` 提到 `1.30`；布丁狗把小狗既有 `foil 0.35` 提到 `0.40`。加成只在对应限定皮肤当前佩戴时生效，卸下回到原值，不因持有或重复购买叠加。Human 牧场商店当前动物／宠物商品走一次购物请求与 Bell，TA 再使用既有 generic `farm` 工具购买；皮肤同样沿用农场金币，不使用 `ranch.coins`。皮肤在限时内允许先买后养：购买不要求已拥有对应居民，不自动换上；获得对应居民后可在现有外观切换处佩戴。现有 `variantId／set_variant` 可复用，但已购皮肤必须独立于 `farm.glimmer.unlocked`。Main 购物请求须增加 skin；固定 Bell 正文结构不改。两个隔离分支已就绪，唯一阻塞是下列新增模型可见文案确认。

## QIXI-SILVER-CROPS-20260814

- 模式／状态：施工待办／2026 年七夕活动已于北京时间 2026-08-20 00:00 结束；活动期发布、降价退款与一次性补偿均已由事实索引承接，当前只剩逾期的活动代码收尾，尚未施工、提交、推送或部署。
- 证据读取范围：本小节；`docs/{product-plan,runtime-architecture,DEBUG_INDEX}.md` 的七夕永久成果与生产事实；独立 farm worktree 中七夕活动配置、任务监听、商店／Human 展示和对应定向测试。不得读取玩家身份、存档正文、凭据或其他仓库。
- 精确写入范围：本小节；farm 发布线中只删除已经结束的 `allin`／七夕 `qty`、活动商店提示、任务卡、任务监听、自动提交、退款临时代码与活动期回执分支，并更新直接测试。不得删除或回收玩家已经获得的种子、作物银币结算、图鉴、称号、历史解锁和补偿幂等事实；Git 与生产仍需当轮明确授权。
- 下一动作／阻塞：活动时间条件已经成立，没有产品阻塞；需要单独开工完成 farm 收尾并验证永久成果仍可读取。当前不得把“活动自然结束”冒充为代码已经清理。
