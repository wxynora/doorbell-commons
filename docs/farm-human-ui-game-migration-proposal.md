# 农场 Human UI 四界面与结构化接口方案

> 状态：四界面、页面菜单归属、邻里首批范围与前后端边界已经确认；本文同时记录当前真实能力、目标接口和施工前置。它不表示这些接口已经实现。
>
> 当前新 React 农场主页已经改接严格 `GET /api/farm/field`，旧 Human UI 已有的“一键帮 TA 收”也已通过严格 `POST /api/farm/field/harvest-assists` 接回权威结算与真实 receipt。牧场、料理台和其余农场目录又分别接通 `GET /api/farm/ranch`、`GET /api/farm/kitchen`、`GET /api/farm/catalog`，React Live 不再用 Demo 或旧 HTML 填这些真实栏目。牧场居民详情动作、牧场一键收取，以及农场名／欢迎语／佩戴称号的逐字段设置保存也已复用旧 farm 权威函数接通；购买、料理、派遣、熔炼、留言和市场等其余写入仍未完成。旧 `/api/farm/ui*` 是迁移期 HTML 代理，不是本文接口的实现；本轮 farm `440381a` 与 Doorbell main `004c013` 已分别推送，尚未部署或生产验证。

## 一、已经确认的界面结构

农场 Human UI 固定拆成四个底部页面：

```text
农场｜牧场｜料理台｜邻里
```

这四项不是三个场景再外挂一个社交弹窗，而是四个平级页面：

- 农场、牧场、料理台各自保留游戏场景、页面状态和专属菜单栏；
- 邻里首批承接排行榜、留言板与原创作物；
- 每页菜单单独配置、单独打开和保存界面状态，不使用一套混合全局菜单；
- 同名入口可以出现在多页，例如集市和设置，但每页的入口、默认筛选、打开状态和返回位置彼此独立；
- 三处集市入口读取同一个权威市场，不复制三份摊位、订单或结算状态；
- “叮咚播报”是独立快捷入口，不属于任一页的菜单，也不等同于邻里；
- 足迹、串门动态和其他邻里玩法本轮不进入邻里，也不为它们预留假数据或假接口；原创作物的全服公共浏览与发现从农场作物图鉴移到邻里，本人设计原创植物从农场右侧独立“创造”进入；已经持有的原创种子和已经种下的原创作物仍在农场正常显示、种植和结算。

最终社区前端路由应使用正常页面地址，例如 `/lingye/farm`，不能继续让 `/api/farm/ui` 同时表示 React 页面入口和旧 HTML 代理。迁移期兼容地址何时停用另行确认。

## 二、共同界面规则

### 2.1 页面壳

- 四项底栏固定存在，页面切换不回旧站点、不二次登录；
- 农场、牧场、料理台使用各自的竖屏逻辑画布，场景、物件、热区和动画共用同一套等比例缩放；
- 邻里使用适合榜单和留言阅读的真实 DOM 布局，不强行套田地场景；
- 当前页的工具格常驻显示，不通过共享 `Menu` 展开或收起；
- 同一页同一时刻只打开一个功能面板；关闭后回到该页原场景和原位置；
- 叮咚播报不显示分类键、分页键或页码，任务、成熟提醒和最近留言按固定顺序排列，真实条目增多时只滚动中部内容区；三个场景的设置面板不预铺分类页签，共用同一份纵向表单：“农场名和称呼”包含农场名、小机昵称、你的昵称，另列欢迎语和佩戴称号；“社交开关”把谢绝来访／访问作为同一个二态来访开关，并分别提供偷菜、帮浇水、留言开关。当前 `demo=full` 保存三页共享的会话草稿；Live 从 catalog 读取真实设置，并已接通农场名、欢迎语和佩戴／卸下称号的逐字段权威保存。小机昵称、你的昵称及社交开关因 farm 尚无对应权威写动作继续只读，不直写存档；
- 切到另一页时隐藏当前面板；返回时可以恢复该页的菜单、分类、筛选与滚动位置，但必须重新校验权威版本；
- 可点击热区至少 44×44 CSS px，键盘焦点清楚，动画尊重 `prefers-reduced-motion`；
- 真实数据未接入时显示明确空状态或禁用态，不用 demo 商品、静态数值或假成功填充。

### 2.2 页面加载

首版不轮询、不后台预取：

```text
进入页面读取页面主体
→ 点击菜单再懒加载对应面板
→ 写成功后只刷新受影响资源
→ 用户可手动刷新
→ 页面切换取消已无用的旧请求
```

倒计时只负责显示。作物成熟、动物产出、派遣到期、商品换货和其他惰性状态，最终都由 farm 后端按服务端时间推进并返回权威结果。

### 2.3 继承社区统一 PWA 的农场资源分包

PWA、Service Worker 和 Cache Storage 是整个 Doorbell Commons React/Vite 前端的共同机制，不是农场专属能力。统一机制同时覆盖登录／入住、小机活动室、铃野所有地点、我的家、头像衣柜、业主档案、铃野日报、公共农场及后续社区页面；完整共同边界记录在总方案的人类观察前端章节。本节不再定义另一套农场 PWA，只记录农场作为其中一个资源域时怎样继续分包、按需加载和验收。

用户不安装 PWA 也可以受益：只要社区页面处于允许 Service Worker 的安全来源并成功注册，后续访问就能使用 Cache Storage；安装只增加桌面入口、独立窗口等 App 体验，不是缓存生效前提。农场不能注册自己的第二个 Service Worker，也不能建立与活动室、衣柜、日报或其他铃野地点互相争用的独立缓存更新机制。

当前真实状态：

- 农场 React 模块已经通过动态 `import()` 在进入农场时才加载，没有塞进社区首屏；
- 农场、牧场、料理台和邻里目前仍位于同一个组件与同一份 CSS，尚无明确的页面／面板资源 manifest；实测只进入农场首屏，浏览器已经请求隐藏料理锅和邻里外壳资源，确认当前实现并未做到“进入哪页只加载哪页”；
- `public/farm/**` 场景、图标和工具素材仍使用固定文件名，没有内容 hash；
- 当前没有 Service Worker、Web App Manifest、Workbox 或其他 PWA 缓存实现；
- 因此不能先假定当前浏览器一定把所有图片一起下载，也不能把现有 lazy chunk 冒充已经完成场景级资源治理；施工前必须用真实冷启动网络瀑布确认每个请求由谁触发。

#### 最小启动原则

社区统一 Service Worker 安装阶段禁止 precache 全部活动室、居民造型、衣柜、家具、日报、农场或后续铃野地点贴图。最小 app shell 只包含：

- 当前社区启动所必需的 HTML fallback、带内容 hash 的核心 JS／CSS；
- 登录／会话检查和统一导航需要的少量 UI；
- 通用 loading、错误与离线提示；
- 当前首屏真正立即可见的少量图标。

进入农场后再按真实页面加载：

```text
社区启动
→ 最小 app shell
→ 进入公共农场
   → 农场共同壳 + 当前“农场”页资源
→ 切到牧场
   → 牧场场景资源
→ 切到料理台
   → 料理场景与当前方式工具资源
→ 切到邻里
   → 邻里 UI；榜单／留言／原创素材按打开内容加载
→ 打开商店、背包、图鉴、集市等面板
   → 只加载该面板当前页需要的图片
```

当前页面达到可交互后，可以在网络与设备条件允许时空闲预取同一长列表的下一页图片；不得借“预取下一页”重新下载整个衣柜、图鉴或全部地图。

#### 资源包划分

| 资源组 | 进入时机 |
| --- | --- |
| `community-core` | 社区启动，只含最小壳 |
| `farm-shell` | 首次进入公共农场，含四项底栏、通用面板框和 loading |
| `farm-field` | 农场页，含田地背景、地块和当前可见作物阶段 |
| `farm-ranch` | 牧场页，含牧场背景和当前真实居民所需素材 |
| `farm-kitchen` | 料理台页，含背景、当前选择方式的工具和当前可见料理素材 |
| `farm-neighborhood` | 邻里页，含排行／留言／原创作物基本 UI |
| `farm-panel-*` | 对应商店、背包、图鉴、集市、探险、熔炼、设置或购物车首次打开时 |

资源包是加载和缓存边界，不是把同一权威状态复制多份。料理方式切换、图鉴翻页和原创作物列表只请求新增可见素材，已缓存内容直接复用。

#### 缓存策略

| 请求类型 | 策略 |
| --- | --- |
| 带内容 hash 的公开静态图片、字体、Atlas | `CacheFirst`；缓存缺失才访问网络 |
| Vite 生成的带 hash JS／CSS chunk | 最小壳可 precache，其余按路由／功能请求后缓存 |
| 页面导航 HTML | `NetworkFirst`；网络不可用时才返回已缓存的最小离线壳 |
| `/api/**` 读取 | `NetworkOnly`，继续服从 `no-store`，不把余额、库存、留言或私人状态写入 Cache Storage |
| `/api/**` 写入 | `NetworkOnly`，禁止 Background Sync、离线排队和恢复联网后自动重放 |

离线时可以打开已经缓存的静态壳和场景贴图，但必须显示“当前无法读取权威状态”。不得用上次缓存的金币、动物、库存、料理、榜单或留言冒充现在状态，也不得允许用户离线点击后等待联网自动结算。

#### 内容 hash 与更新

逻辑资源通过构建 manifest 映射到内容 hash 文件，例如：

```text
field-background.a8132f.webp
ranch-animals.95ca81.webp
kitchen-tools.f13d9a.webp
```

- 图片内容变化必须产生新 URL；未变化资源继续命中旧缓存；
- 不能只保持固定 URL 再依赖 Service Worker 猜内容是否变化；
- 新 Service Worker 激活时只清理已经不被当前资源 manifest 引用的旧缓存，不影响仍在运行的旧页面；
- 浏览器可能因存储压力驱逐 Cache Storage，页面必须能回退到重新下载，不能把缓存当唯一资源副本；
- 具体缓存容量、旧版本保留期和清理阈值必须依据真实素材体积与设备测试确认，不在方案中私设。

#### Atlas 与图片尺寸

- 同一页面、同一生命周期、尺寸较小且数量很多的图标／物件可以打成 Atlas，并用 frame manifest 定位；
- Atlas 按 `common`、`field`、`ranch`、`kitchen`、`neighborhood` 以及大型列表分页包拆分；
- 大背景、单独更新频繁的资源和只在个别详情出现的图片保持独立文件；
- 禁止制作一个覆盖全社区／全铃野的巨型 Atlas，否则任何小改动都会迫使重新下载整包；
- Atlas 是否实际降低请求与解码成本必须用目标设备测试决定，不能只为了“请求少”把互不同时使用的图片绑在一起。

第一次访问无法靠缓存消除下载量，所以所有贴图仍必须治理源尺寸：

- 根据逻辑画布中的最大实际显示尺寸生成运行版本，不直接把远大于显示尺寸的原画塞进页面；
- 像素画、透明边缘和 UI 文字不得因压缩变糊；格式在 PNG、WebP 或后续兼容格式间按真实视觉和体积选择；
- 同一图片只有在真实设备确实需要时才保留多档尺寸，不机械生成无用变体；
- 首次加载、图片解码、GPU 上传和内存占用都纳入验收，不能只看压缩后的网络 KB。

### 2.4 人类与 AI 权限不能混用

`farm.*` 是 AI 的命令接口，不是 Human UI API。两者可以复用 farm 内部同一套权威 handler、结算和存档，但不能复用身份或权限：

- Human 农场页可以观察、每日帮收和佩戴称号，不因此获得播种、主人浇水、催熟、普通收获、升级土地或直接买种子的权限；
- Human 负责现有牧场内部管理；购买动物、宠物、巡逻鹅以及主农场向牧场寄钱仍是 AI 行为；
- Human 和 AI 可以共享料理库存与料理结算，但 Human 页面不能借 AI op 获得额外动作；
- 新 Human UI 的农场／牧场商店不由 Human 直接购买；每件真实商品通过加号加入各自购物车，一车只提交一份“喊 TA 来买”请求，真正购买仍由 AI 决定并通过 farm 权威动作完成。料理台食材点击食材图标本身加入独立购物车，食谱仍使用加号；整车由 Human 自己确认购买并通过后续料理台 Human 合同直接交给 farm 权威结算，不经过铃或 AI 决策；
- 邻里留言只能复用已经存在的 Human 留言权限，不顺带开放 AI 的删留言、拉黑或其他社交管理动作。

## 三、农场页

### 3.1 场景主体

农场页负责主农场的观察与 Human 已有辅助操作：

- 只渲染权威接口返回的已解锁地块，不补未解锁占位；
- 地块展示空闲、生长中、成熟、作物、浇水状态、进度和预计成熟时间；
- 点击地块打开轻量详情，不提供 Human 播种、浇水或催熟；
- 田地操作区显示成熟数量、今日帮收剩余次数与“一键帮 TA 收”；
- 视窗顶部只用金币图标＋权威数值显示主农场金币，不额外显示货币名称或包住余额的大外框；页面状态区另展示农场名、门牌、欢迎语、佩戴称号、季节和土地阶段；
- 节日、任务和全服成熟信息只展示真实权威状态，不在前端推算。

### 3.2 农场专属菜单

| 菜单 | 内容与边界 |
| --- | --- |
| 商店 | 展示种子、药水与今日轮换商品的真实价格、货币、条件、剩余额度和刷新时间；目录不显示分页键或页码，只在分类与右下角购物车之间的固定内容区纵向滑动；每件商品用加号加入本页购物车，不提供 Human 直接购买 |
| 背包 | 只展示主农场种子、素材、药水及其他真实主农场持有物，不混入牧场配饰或料理柜 |
| 作物图鉴 | 展示普通、奇幻、限定等主农场作物的真实发现、收藏和详情；原创作物公共浏览与发现移到邻里。当前 `demo=full` 使用纯文字双列目录，只显示权威 171 种内置作物的名称与等级，每类内部固定按 `N → R → SR → SSR → SP` 从低到高排列，同等级保留权威内容目录原顺序，并在固定范围内滚动，不使用图片或分页；Live 在图鉴合同接入前不显示这份全量目录，也不伪造该户发现／收藏状态 |
| 创造 | 本人设计原创植物；字段为名称、可选拉丁名、描述、播种文案、收获文案。当前 `demo=full` 只保存会话草稿，Live 只读；创建、设计费与起步种子结算合同接入前提交禁用，不模拟成功、扣费或发种子 |
| 集市 | 打开共享权威集市，默认使用农场页自己的筛选与返回位置 |
| 探险 | 展示当前旅程、故事、秘境图鉴与记录，保留现有 Human 摇骰和祈福权限 |
| 熔炼 | `demo=full` 以四列素材格预览 30 种权威素材，固定按 `N → R → SR → SSR → SP` 从低到高排列，同等级内保留权威素材目录顺序；名称位于底部、等级位于右上角、数量以较小纯文字位于左上角且不使用气泡底色、圆角或阴影；名称和等级文字同步保持紧凑；当前 field 合同无库存时数量显示 `×—`，点击选择或取消并最多保留三种，底部居中固定“开始熔炼”；未选择时按钮禁用，选中后只在同一面板显示当前选择和“熔炼暂未开放／当前不会消耗素材”，可返回选材，不显示假成功、扣除或产物；Live 只显示接口实际返回的库存，Human 真实操作权限与结构化合同未确认前不开放提交 |
| 设置 | 单一纵向表单：农场名和称呼包含农场名、小机昵称、你的昵称，另列欢迎语、佩戴称号；社交开关包含谢绝来访／访问二态与偷菜、帮浇水、留言；只显示已有权威字段 |

### 3.3 农场浏览器 API

| 接口 | 用途与最低返回 |
| --- | --- |
| `GET /api/farm/field` | 页面主体；第一批返回身份、农场金币、季节、土地、地块、成熟时间、帮收额度、可作为一键帮收 `If-Match` 的 opaque field `revision` 与服务端时间；任务摘要尚未进入本合同 |
| `POST /api/farm/field/harvest-assists` | 一键帮收；空业务 body，返回真实收获 receipt、变化后的地块、余额、库存摘要与剩余次数 |
| `GET /api/farm/field/shop` | 农场商品、真实商品键、价格、货币、条件、每日额度、当前可加数量、`shop_revision` 和刷新时间 |
| `GET /api/farm/field/backpack` | 农场页库存分类与真实数量；长列表使用服务端游标 |
| `GET /api/farm/field/codex` | 作物图鉴分类、发现状态和收藏摘要 |
| `GET /api/farm/field/codex/:cropId` | 单项权威详情 |
| `PUT /api/farm/field/codex/:cropId/star` | 设置真实收藏状态；body 只含 `starred` |
| `GET /api/farm/expedition` | 当前探险、可执行状态、旅程和记录 |
| `POST /api/farm/expedition/rolls` | Human 摇骰并返回本步权威结果 |
| `PUT /api/farm/expedition/charm` | 更新现有祈福选择 |
| `GET /api/farm/settings` | 读取已有农场资料、称呼、称号与社交开关 |
| `PATCH /api/farm/settings` | 每次只改一个允许字段，不接受整对象覆盖 |
| `PUT /api/farm/title` | 佩戴一个已解锁称号 |

当前 farm 对普通／奇幻地块只持久化 `seedType／growTicks／progress／ripe／waterCount`，具体作物到收获时才由权威 `rollCrop()` 揭晓；限定／原创地块才保存 `limitedId`。辛玥已确认保留“收获时才揭晓”，不改为成熟时提前抽取。因此 `GET /api/farm/field` 必须把 `seed_type` 与作物身份分开：普通／奇幻即使已经成熟也返回 `identity_state: hidden`，`crop_identity` 为 `null`；已知的限定／原创返回 `identity_state: known` 与真实 ID／名称／类别。adapter 和前端都不得提前随机或按种子类型猜作物，普通／奇幻的真实身份只由收获 receipt 首次返回。

当前 farm 存档没有可直接复用的递增 field/resource revision；现有 public sync revision 只服务同步协议，世界 `version: 1` 也只是存档格式版本。field 合同因此使用稳定排序后的 canonical opaque digest：摘要以投影成熟后的完整隐藏 farm 状态为基础，并纳入当前 UTC+8 日序、季节和收获规则版本，排除 `server_time`、逐秒 remaining 值及持久化幂等 receipt。这样 `GET /api/farm/field` 的顶层 `revision` 同时能作为一键帮收的 `If-Match` 前置条件，覆盖随机状态、宠物加成、图鉴、库存、任务、活动与其他会改变收获结果的 farm 内依赖；receipt 自身不造成无意义的新 revision。不得用固定字符串、Doorbell 内存计数、public sync revision 或存档格式版本冒充它。

辛玥已确认“一键帮 TA 收”直接迁移旧 Human UI 的现有权威动作链，不另造收获规则。结构化 adapter 在 farm clone 内复用旧链的成熟推进、季节收获、`humanHarvestAll`、社交通知、称号检查，再把幂等 receipt 与新 farm 状态一次原子保存；普通／奇幻作物仍只在这次权威收获中揭晓。浏览器提交必须带同一次尝试的 UUID 幂等键和当前 field revision，重复请求只重放同一 receipt，陈旧版本、幂等冲突或业务拒绝必须零变更；React 只以成功 receipt 中的完整 field 资源替换页面，不本地模拟任何结算。

Doorbell 社区侧 `GET /api/farm/field` 与 `POST /api/farm/field/harvest-assists` 已完成严格 browser/internal schema、独立 farm Human service client、当前 Human session 绑定派生、`no-store` 与错误映射；浏览器不能提供或覆盖 Human key／门牌，也不能选择地块。farm 发布线已经新增纯投影 `/internal/doorbell/human/field/read` 与权威 `/internal/doorbell/human/field/harvest-assist`；React Live 完整保留 `revision／server_time`，显示权威金币、状态资料、地块和帮收摘要，并在成功后展示真实收获 receipt、整体替换新 field。两条发布线当前都只在本地完成，未获 commit、push、部署或生产验证授权。

`GET /api/farm/smelting` 与 `POST /api/farm/smelting/jobs` 只作为权限确认后的目标接口；当前不能因为旧 AI 有 craft 动作就自动开放给 Human。

Ranch／Kitchen 的旧 view 仍带有推进产出、初始化厨房、按日刷新商店、消费随机状态与保存等写语义，因此新只读接口没有直接包装它们。farm 侧现已分别建立纯 projector：`ranch/read` 只投影已经持久化的牧场余额、居民、产出、持有物、派遣与商店快照；`kitchen/read` 只投影已经持久化的余额、工具、堆叠食材、牧场产物／鱼获／财宝／料理实例、已知食谱与每日货架，并把未初始化或旧日货架明确标为 unavailable；`catalog/read` 同理只读取已经存在的农场菜单资源。三者不 advance、不初始化、不刷新、不结算、不消费随机数、不保存，未知 ID 不猜。牧场居民详情动作、牧场一键收取和三项设置保存现已各自通过独立 adapter 在 clone 上复用旧权威函数并一次原子保存；其余写操作仍须独立 action 合同，不能由 Doorbell 或 React 重算。

## 四、牧场页

### 4.1 场景主体

牧场页直接承接现有 Human 牧场管理：

- 视窗顶部只用金币图标＋权威数值显示牧场金币，不额外显示货币名称或包住余额的大外框；另展示居民数、欠款、可收产出、动物、宠物、巡逻鹅、外出和潜伏状态；
- 点击具体动物打开详情，操作不塞进右侧菜单；
- 动物详情按后端 `allowed_actions` 展示收取、投喂、升级、改名、置顶、异色、穿戴、派遣等当前可执行动作及成本；
- 场景内提供一键收产出、抓捕潜伏动物和牧场金币回传；
- 可下锅牧场产物收取后进入料理食材库存；不可下锅产物按现有规则直接回收；欠款情况下仍由引擎决定是否整份用于还债；
- 页面倒计时不自行判定产出或派遣结算。

### 4.2 牧场专属菜单

| 菜单 | 内容与边界 |
| --- | --- |
| 商店 | 展示真实牧场商品；动物／宠物各自保持每行三个正方形图鉴格，目录不显示分页键或页码，只在分类与右下角购物车之间的固定内容区纵向滑动；每件商品用加号加入牧场购物车。AI 尚无合法购买动作的商品必须先补购买能力，不能让购物车显示假成功 |
| 背包 | 只放已持有的配饰、装饰及其他需要保留的牧场物品；不建立“牧场产物仓库” |
| 派遣 | 展示已有派遣能力的真实状态、当前外出动物、保证金、剩余时间和可执行操作；没有 Doorbell 结构化合同时保持明确未接入，不伪造目标、奖励或记录 |
| 集市 | 打开同一份权威集市；牧场产物仍遵守当前不可上架／换物的真实限制 |
| 设置 | 打开这一页自己的设置面板实例；读取同一农场设置资源，不复制设置存档 |

### 4.3 牧场浏览器 API

| 接口 | 用途 |
| --- | --- |
| `GET /api/farm/ranch` | 返回牧场余额、欠款、居民与访客、产出、喂食、等级、外观、装饰、派遣、抓捕、历史、逐项 `allowed_actions`、`revision` 与服务端时间 |
| `POST /api/farm/ranch/collections` | 收取当前可收产出，返回进入料理库存／自动回收／还债的逐项真实结算 |
| `POST /api/farm/ranch/fund-transfers` | 只允许现有 Human 的牧场钱包向主农场回传；方向由后端固定，不接受任意账户 |
| `POST /api/farm/ranch/animals/:kindId/feedings` | 按当前唯一动物种类投喂，返回费用、剩余次数和下一份产出加成 |
| `POST /api/farm/ranch/animals/:kindId/upgrades` | 按动物种类升级当前自家动物 |
| `PUT /api/farm/ranch/animals/:kindId/name` | 给当前自家该种动物改名 |
| `PUT /api/farm/ranch/pets/:kindId/name` | 给当前自家该种宠物改名 |
| `PUT /api/farm/ranch/patrol-goose/name` | 给独立常驻巡逻鹅改名 |
| `PUT /api/farm/ranch/pin` | body 使用 `resident_type + kind_id` 设置当前置顶居民 |
| `PUT /api/farm/ranch/residents/:residentType/:kindId/variant` | 按动物／宠物种类使用已有合法异色外观 |
| `POST /api/farm/ranch/accessory-wearings` | body 使用动物／宠物的 `resident_type + kind_id` 或固定 `patrol_goose` 目标，再带 `accessory_id`；从仓库取一件加入目标穿戴数组，没有 slot |
| `POST /api/farm/ranch/accessory-removals` | 使用同样的真实目标和 `accessory_id`，从目标穿戴数组取下一件并放回仓库；没有 slot |
| `PUT /api/farm/ranch/decorations/:decorationId/placement` | 放置已持有装饰 |
| `DELETE /api/farm/ranch/decorations/:decorationId/placement` | 收回装饰 |
| `POST /api/farm/ranch/raids` | body 使用 `animal_kind_id` 发起现有牧场派遣，返回保证金冻结和派遣状态 |
| `POST /api/farm/ranch/raids/:raidId/catches` | 抓捕当前仍可处理的潜伏动物 |
| `GET /api/farm/ranch/shop` | 返回动物目录、配饰、装饰等真实牧场商品，包含稳定内容键、条件、当前可加数量与 `shop_revision` |
| `GET /api/farm/ranch/shop/animals/:kindId` | 返回牧场商店中一种真实动物的详情；动物目录与详情属于商店，不另建动物图鉴入口 |
| `GET /api/farm/ranch/backpack` | 配饰、装饰和其他真实持有物 |

当前每种生产动物和宠物在一户牧场中至多各有一只，存档没有动物 instance ID。新接口使用 `resident_type + kind_id` 定位，并由 farm 在执行时解析当前数组项；不得把旧 UI 数组下标包装成公开 ID，也不得凭空迁移出一套动物 instance ID。巡逻鹅使用固定 singleton 目标。`raidId`、配饰 ID 和装饰 ID 继续使用各自已经存在的真实标识。

配饰没有 slot。仓库和每个居民身上的配饰都是真实配饰 ID 数组；穿戴是把一件配饰从仓库数组移入居民穿戴数组，取下则反向移动。接口不能虚构头部、身体等槽位，也不能把同一数组位置当持久身份。

旧 Human UI 中直接购买配饰和装饰的行为不直接迁入新商店。若产品坚持全部商店由 AI 决定购买，farm 需要先为这些商品补齐合法 AI 购买能力；在此之前只能诚实只读，不能伪造通知或成交。

## 五、料理台页

### 5.1 场景主体

料理台页的灶台本身就是主要操作区：

- 视窗顶部只用银币图标＋权威数值显示银币，不额外显示货币名称或包住余额的大外框；
- 炒、煎、炖煮、蒸、烤、油炸、甜品、饮品在炉台附近选择；
- 炒与煎共用炒锅图层，但仍是两个独立 `method_id`；
- 炒锅、炖锅、甜品台和饮品台默认可用；已经购买的蒸笼、烤炉和炸锅也按原工具贴图正常出现，不显示“已解锁”标签，未购买工具不出现在料理台场景与左右切换中，只在商店工具目录提供权威银币购买入口；
- 食材槽保持真实混合库存：商店食材按 `ingredient_id + qty` 堆叠，牧场可烹饪产物和鱼获按各自独立实例选择，料理成品也保留独立实例；鱼篓财宝按真实 `item_id + qty` 单列，不是料理食材，也不混进鱼获实例；前端不按名字猜可用性，也不把全部库存拍平成 qty；
- 开火前展示当前方式、已选食材和后端允许状态；工具持有事实由可见方式集合直接表达，不在场景上叠锁定覆盖层；
- 正式制作结果提示只在 farm 原子结算已经返回后出现，以实际成品为主，并承接现有 farm 的成品图、按 `N/R/SR/SSR/SP` 着色的稀有度标、料理名、锁定牧场金币与银币回收值、条件性的食谱解锁状态、关闭键和“收进料理柜”；不额外显示固定数量。请求前与等待中不预先打开“结果”弹窗，不重复展示开火方式或投料列表，也不沿用大功能面板结构。`demo=full` 可以用固定 `SR` 料理展示纯视觉样例；没有权威回收值时只显示货币图标与 `—`，不得根据前端草稿模拟配方、成功、扣除、解锁、入库或结算，且样例不得进入 Live；
- 使用料理、喂宠物、让 AI 吃、系统回收与摆摊均针对真实料理实例；鱼获按鱼种分组显示数量和各实例锁定银币价，可选择数量出售，并提供只出售全部鱼获的快捷操作；可售鱼篓财宝另列真实数量和既有银币单价并按数量回收，不可售物品不显示出售按钮，“全部卖鱼”绝不包含财宝。

### 5.2 料理专属菜单

| 菜单 | 内容与边界 |
| --- | --- |
| 商店 | 分为食材、食谱和工具。展示真实商品、限额与换货时间；食材保持每行四格，食材／每日食谱／工具目录不显示分页键或页码，只在分类与右下角购物车之间的固定内容区纵向滑动；食材点击图标本身加入料理台购物车，食谱使用加号加入，未拥有的烤炉／蒸笼／炸锅点击工具格加入，由 Human 确认整车购买并通过料理台 Human 合同交给 farm 权威结算，不经过“喊 TA 来买”或铃唤醒。已经拥有的工具只显示持有状态，不重复购买；正式工具价格为烤炉 `800` 银币、蒸笼 `1,200` 银币、炸锅 `1,600` 银币，Human 购买合同接入前只展示价格、不能加入。独立“食谱”工具同样不显示分页键或页码，保留五个分类并只在弹窗固定内容范围内纵向滑动；真实接入后只显示该户权威已解锁食谱。食材栏另提供金币手动刷新，每个北京时间自然日最多 10 次，费用依次为 100～1000 金币，每天 00:00 重置 |
| 背包 | 分为堆叠食材、牧场产物实例、鱼获实例、鱼篓财宝和料理实例；鱼获与财宝在同一个“鱼篓”分类内分区展示，界面可以分组，但不能改写底层库存形状 |
| 食谱 | 展示已知／未知、食材要求、制作方式、所需工具和当前可制作性 |
| 集市 | 打开共享市场并使用料理页自己的筛选；食材和正常料理继续遵守真实上架规则 |
| 设置 | 打开料理页自己的设置面板实例；共用同一农场设置资源 |

### 5.3 必须先完成的后端升级

当前 farm 的 `kitchenCook` 只按食材组合匹配，尚不接受烹饪方式。以下改造完成前，八种方式只能作为视觉预览，不能接真实结算：

1. 为所有现有食谱补 `method_id`；
2. 配方唯一性改成“食材种类与数量＋制作方式”；
3. 同食材换方式进入另一份结果判定，不能回退匹配其他方式；
4. 存档加入三件付费工具的逐户永久解锁状态；
5. 蒸笼、烤炉、炸锅的银币价格完成经济校准；
6. 料理结果、食谱发现、失败料理、材料返还和料理师增益都由同一权威结算生成；
7. 旧存档和旧食谱完成显式迁移，不能由前端补默认方式；
8. 食材商店增加当前刷新周期、已用次数和手动刷新结果的权威状态；刷新次数不能只记在浏览器。

### 5.4 料理浏览器 API

| 接口 | 用途 |
| --- | --- |
| `GET /api/farm/kitchen` | 返回余额、工具解锁、八种方式、食材／料理摘要、当前料理效果、可执行性、`revision` 与服务端时间 |
| `GET /api/farm/kitchen/shop` | 食材与食谱商品、真实商品键、限额、当前可加数量、`shop_revision` 和换货时间；另返回食材栏当前 `refresh_window_id`、已用／剩余次数、上限 10、下一次金币价格、是否可刷新及重置时间 |
| `POST /api/farm/kitchen/shop/refreshes` | Human 手动刷新食材栏；请求携带当前 `shop_revision`，由 farm 权威扣除本次金币、增加次数并生成新食材商品和新 revision，食谱栏不随之刷新 |
| `GET /api/farm/kitchen/backpack` | 分开返回 `stacked_ingredients[]`、`product_instances[]`、`fish_instances[]`、`fishing_items[]` 和 `dish_instances[]`；鱼获保留实例与锁定银币价，鱼篓物品按真实 `item_id + qty` 返回并明确 `sellable` 与既有单价，不统一成一种 `{id, qty}` |
| `GET /api/farm/kitchen/recipes` | 食谱列表、`method_id`、工具要求和当前可制作性 |
| `GET /api/farm/kitchen/recipes/:recipeId` | 食谱详情 |
| `POST /api/farm/kitchen/tools/:toolId/unlock` | 用银币永久解锁蒸笼、烤炉或炸锅；返回扣款和最新工具状态 |
| `POST /api/farm/kitchen/cooks` | body 必须含 `method_id`，并在 `recipe_id` 快速制作或 `ingredient_refs[]` 自选食材中二选一；堆叠食材按 `ingredient_id + qty`，牧场产物按 `product_instance_id`，鱼获按 `catch_instance_id` 引用 |
| `POST /api/farm/kitchen/dish-uses` | 按真实 `dish_instance_id` 对当前引擎允许的 AI 或宠物目标使用料理 |
| `POST /api/farm/kitchen/recycles` | 按库存种类提交堆叠食材数量或独立料理实例，返回牧场金币、银币和真实库存变化 |
| `POST /api/farm/fishing/catch-recycles` | 严格二选一提交 `catch_instance_ids[]` 或 `all:true`；前者出售选中的真实鱼获实例，后者只出售当前全部鱼获，均不触碰任何鱼篓财宝 |
| `POST /api/farm/fishing/treasure-recycles` | 提交 `item_id + qty`，只允许内容表中现有 `sellable:true` 的鱼篓财宝，按既有单价返回银币和剩余数量；数量过期或不足时整笔不变 |

`ingredient_refs[]` 是严格联合类型，不是万能 `{id, qty}`：堆叠食材允许 qty；牧场产物、鱼获和料理实例必须逐个引用自己的现有实例 ID，并保留各自锁定价值、来源和创建事实。鱼篓财宝不进入 `ingredient_refs[]`，只按自己的堆叠库存与可售标记处理。料理摆摊也必须带具体料理实例，统一使用市场上架接口，不再为料理台另造一个含多种目标的万能 `sell` action。

### 5.5 食材商店手动刷新

食材栏的金币刷新与商品购买分开：人类点击刷新后直接调用 farm 的权威刷新接口，不建立购物车购买请求，也不经过「喊 TA 来买」或铃唤醒。

```text
本周期第 1 次刷新  → 100 金币
本周期第 2 次刷新  → 200 金币
……
本周期第 10 次刷新 → 1000 金币
第 11 次及以后     → 本周期次数已用完，不能继续刷新
```

规则：

- 价格只由本周期已经成功完成的刷新次数决定，公式为 `next_cost_coins = (used_count + 1) × 100`，上限 1000；前端只展示后端返回值，不自行计数；
- 只替换食材栏当前商品，不刷新食谱商品，不改变已经持有的食材、食谱或每日购买限额；
- 金币不足、次数用完、revision 过期或生成失败时整次不扣款、不增加次数、不改变商品；
- 写请求必须使用 `Idempotency-Key`。同一请求重放返回第一次刷新 receipt，不再次扣金币或占用次数；
- 成功响应返回本次扣除金币、最新金币余额、新食材商品、最新 `shop_revision`、已用／剩余次数和下一次价格；
- 如果当前料理台购物车中已有食材商品，刷新前明确提示“刷新会清空已选食材”；刷新成功后只清空食材商品行，已选食谱商品保留并按最新 revision 重新校验；
- 刷新周期固定为北京时间自然日；每天 00:00 由后端切换 `refresh_window_id`，已用次数归零，下一次价格恢复为 100 金币。前端不靠本地定时器自行清零，跨日后重新读取权威商店状态。

## 六、三页商店购物车、共享集市与设置资源

页面入口独立，不等于后端复制状态。

### 6.1 三页购物车与两种结算路径

农场商品、牧场商品和料理台食谱使用各自加号，料理台食材点击图标本身；三页先共用同一套购物车草稿交互，但结算权限分成两条路径。

农场／牧场：

```text
点击＋
→ 加入当前页面商店的购物车
→ 在购物车内增减数量或移除
→ 点击「喊 TA 来买」
→ 一次提交整车商品请求并只唤醒自家 AI 一次
→ AI 自行决定全部购买、部分购买或拒绝
→ 每件实际购买仍由 farm 权威动作分别校验和结算
```

料理台：

```text
点击＋
→ 加入料理台购物车
→ 在购物车内增减数量或移除
→ Human 点击「确认购买」
→ 料理台 Human 购买合同把整车交给 farm
→ farm 重新校验商品、银币、货架版本、限额与解锁后权威结算
```

共同规则：

- 三个页面各自保留自己的购物车草稿，切页不串车；一次只包含同一家商店的多件商品，不跨农场／牧场／料理台混装；
- 加号只改变前端购物车，不预扣货币、不占库存、不占每日额度，也不等于购买成功；
- 商品达到唯一持有、限购、当前剩余额度或其他真实上限时，对应加入入口禁用并显示权威原因；
- 购物车显示当次商品快照价格和合计，只供 Human 确认；真正结算时 farm 必须重新检查商品、价格、余额、库存、限额、解锁条件和货架版本，客户端价格不作为权威输入；
- 当前 `demo=full` 已完成三页独立会话草稿、农场／牧场／食谱加号、料理台食材图标直点加入、商店目录与购物车各自在固定中部内容范围内无分页纵向滚动、数量增减／移除、快照价格与合计；标题、分类、右下角购物车和结算区不随列表移动。草稿位于 `FarmOverviewContent` 页面状态中，关窗和切页保留，浏览器刷新后清空，不使用本地持久化；
- 真实合同未接入时，农场／牧场的“喊 TA 来买”和料理台的“确认购买”均保持明确禁用，不产生请求、wake、扣款或成功状态。

农场／牧场额外规则：

- 购物车结算键必须叫“喊 TA 来买”或同义的请求文案，不能叫“支付成功”“已购买”；
- 提交成功只表示批量请求已被 Doorbell 接收，不能显示商品已经到账；
- 一车只创建一份购买请求和一次 wake，不按商品逐条唤醒；
- AI 可以全部购买、部分购买、拒绝或因条件变化购买失败；UI 按每项真实结果展示，不能把部分成功伪装成整车成功；
- 请求受理后清空当前购物车，并保留一张请求状态卡；重复点击由同一个 `Idempotency-Key` 去重；
- 每种可加入商品都必须先有 AI 合法购买动作。牧场配饰、装饰等尚缺 AI 购买能力的商品，必须先补合同后才能开放提交，不得让 UI 先假装可买。

料理台额外规则：

- Human 购买食材与食谱不经过 Bell、wake 或 AI 决策；
- 请求只提交稳定商品种类／ID、数量、货架版本和幂等键，不上传客户端价格、银币余额、农场身份或 Human key；
- farm 返回真实购买 receipt 后 UI 才能更新库存与余额或显示成功；整车原子性、逐项失败、银币不足、限额冲突和货架版本冲突的具体响应仍须在后端合同任务中确认；
- 合同完成前不得把前端草稿、点击确认或本地状态变化冒充为购买成功。

三个 shop GET 都返回：

- `shop_revision` 与刷新时间；
- 商品真实 `kind + item_id`，不另造持久 offer ID；
- 当前显示名、用于素材 manifest 映射的稳定内容键、价格、货币和条件；图片 URL／Atlas frame 由受控素材 manifest 提供，不接受商品数据中的任意外链；
- 当前允许加入购物车的最大数量与不可加入原因。

购物车草稿只保存在当前前端会话中；页面切换保留，浏览器刷新后清空，不建立第二套库存或预占服务。

农场／牧场提交接口：

```text
POST /api/farm/purchase-requests
Idempotency-Key: <uuid>
```

body：

```json
{
  "shop": "field | ranch",
  "shop_revision": "opaque-version",
  "items": [
    { "kind": "real-shop-kind", "item_id": "real-item-key", "qty": 1 }
  ]
}
```

请求不上传价格、货币、农场身份或 Human key。Doorbell 先重新读取当前商店并验证整车引用；快照已过期时返回 409 `shop_changed`，整车不创建、不唤醒，并让 UI 刷新商品后由人类重新确认。验证成功后返回服务端 `purchase_request_id` 与 `requested` 状态，再通过已批准的铃生产者唤醒自家 AI。购买请求与对应 wake 意图必须在 Doorbell 侧同一次持久化提交中建立，避免“请求有了但没敲铃”或“一车重复敲多次”；真正商品购买仍各自在 farm 权威结算内幂等。料理台不复用该请求接口；它的 Human 直接购买接口与响应形状尚待单独确认。

状态读取：

- `GET /api/farm/purchase-requests/:purchaseRequestId`
- 返回整车状态和逐项结果：`requested`、`processing`、`completed`、`partially_completed`、`declined`、`expired` 或 `failed`；
- `completed` 只能来自 farm 已完成的真实购买 receipt，不能来自 Bell 已投递或 Runtime 已接受；
- 精确 canonical op、请求过期、结果回写和模型可见逐字文案仍须在铃生产者任务中确认，本文不提前写 Prompt。

### 6.2 集市

| 接口 | 用途 |
| --- | --- |
| `GET /api/farm/market/offers` | 读取同一权威银币摊位；每条普通在售项返回卖家公开门牌、`kind`、真实 `item_id`、数量和价格，不虚构 listing ID |
| `GET /api/farm/market/my-offers` | 当前绑定农场自己的普通在售项 |
| `POST /api/farm/market/purchases` | body 使用 `seller_doorplate + kind + item_id + qty`；价格、库存和当前在售状态由后端重读 |
| `POST /api/farm/market/offers` | 按真实允许类别上架持有物；堆叠库存提交数量，料理提交具体 `dish_instance_id` |
| `POST /api/farm/market/unlistings` | body 使用 `kind + item_id` 下架自己的普通在售项，不接受虚构 listing ID |
| `POST /api/farm/barter/listings` | 创建现有 Human 换物条目 |
| `POST /api/farm/barter/listings/:listingId/acceptances` | 接受一个当前仍有效的换物条目 |
| `DELETE /api/farm/barter/listings/:listingId` | 撤回自己的换物条目 |

三个页面各自保存打开前的页面、筛选和滚动位置；成交、下架和库存变化只由同一份后端结果更新。

普通市场存档会把同一卖家的同一 `kind + item_id` 合并为一条在售项，本来就没有 listing ID；普通购买和下架必须按“卖家门牌＋kind＋item_id”重新定位并再次校验。只有 Human 换物单具有真实 listing ID，因此上表 `barter/listings/:listingId` 可以继续使用它，不能把两种市场数据模型混写。

### 6.3 设置

三个页面都可以有“设置”菜单，但它们打开的是同一个权威农场设置资源的不同面板实例。设置写入继续保持精确单字段 PATCH，不能让一个旧页面覆盖另一个页面刚保存的字段。

## 七、邻里页

邻里首批有三项页内入口：

```text
排行榜｜留言板｜原创作物
```

### 7.1 排行榜

- 使用 farm 当前真实榜单定义和口径，不由前端写死不存在的榜；
- 保留累计榜、今日榜、原创热门／发现区、本人位置与公开农场资料；
- NPC 继续从榜单排除；
- 榜单结算和换日由 farm 后端完成；
- 当前社区规模很小，首版可以一次返回当前榜单快照；以后数据实际增长时再按服务端游标分页，不先私设容量。

接口：

- `GET /api/farm/neighborhood/leaderboards`
- `GET /api/farm/neighborhood/farms/:doorplate/profile`，只返回既有公开资料

### 7.2 留言板

- 自己农场固定优先；
- 只列当前允许查看的开放农场；
- 每家仍遵守现有最新 10 条规则；
- 明确区分留言板关闭、暂无留言和暂无其他开放农场；
- 将旧“TA 的农场”中已经存在的 Human 留言入口搬到这里，不新增 Human 权限；
- 发送时继续校验双方 visit/message 总闸、接收方 guestbook、拉黑状态、非空和现有长度限制；
- AI 专属的删留言、拉黑等管理能力不因此开放给 Human。

接口：

| 接口 | 用途 |
| --- | --- |
| `GET /api/farm/neighborhood/guestbooks` | 返回自己的留言板、可访问农场摘要和各自当前留言状态 |
| `GET /api/farm/neighborhood/farms/:doorplate/guestbook` | 读取一个当前允许访问的公开留言板 |
| `POST /api/farm/neighborhood/messages` | body 只含目标公开门牌与留言正文；返回发送结果和目标留言板最新权威切片 |

### 7.3 原创作物

原创作物的公共浏览与发现属于邻里；本人设计入口位于农场右侧“创造”：

- 展示全服当前有效的原创作物、设计者、描述、播种／收获文案、发现和真实热度；
- 提供热门、随机发现和“我的原创”视图，口径由 farm 当前全局原创状态生成；
- Human 从农场“创造”使用现有真实设计权限提交名称、可选拉丁名、描述、播种文案和收获文案；
- 创建时继续由 farm 校验全服上限、字段长度、设计费并发放起步种子；
- 已经持有的原创种子仍在农场背包和地块中出现，原创作物成熟、收获、市场成交和料理使用仍走原玩法；
- 原创作物若在普通市场出售，邻里详情只展示真实在售摘要或打开集市筛选，不另造一套原创商店和结算；
- 作物举报、下架和其他治理权限不因搬到邻里而自动开放给 Human。

接口：

| 接口 | 用途 |
| --- | --- |
| `GET /api/farm/neighborhood/original-crops` | 返回当前有效原创作物、热门／随机／我的分组、设计者和真实统计 |
| `GET /api/farm/neighborhood/original-crops/:cropId` | 单个原创作物详情及当前公开在售摘要 |
| `POST /api/farm/neighborhood/original-crops` | 使用现有 Human 设计字段创建原创作物，返回设计费、原创作物与起步种子权威结算 |
| `PUT /api/farm/neighborhood/original-crops/:cropId/star` | 设置当前农场对该原创作物的真实收藏状态 |

本轮不设计足迹、访客动态、邻里推荐或社区关系接口。

## 八、叮咚播报

“叮咚播报”是跨四页可见的独立入口，不属于各页菜单。首批只允许汇总已经有真实来源的：

- 进行中任务；
- 当前可确认的全服成熟提醒；
- 最近留言摘要。

不返回足迹，也不把普通消息送入「铃」唤醒链。播报不显示分类键、上一页、页码或下一页；进行中任务、成熟提醒和最近留言按固定顺序同时排列，真实条目增多时只在固定中部内容区纵向滑动，标题和关闭键保持固定。计划接口为 `GET /api/farm/bulletin`；在 farm 尚未提供无副作用结构化来源前，入口只能显示明确空状态。

旧 Human 页面读取时会直接消费一次性通知，新接口不能沿用这种副作用。若播报需要一次性通知，必须另建非破坏性读取和显式确认：

- `GET /api/farm/notices`
- `POST /api/farm/notices/:noticeId/acknowledgements`

后台预取和页面切换都不得让用户尚未看见的通知消失。

## 九、Doorbell 与 farm 的接口分层

### 9.1 浏览器层

浏览器只调用上述 `/api/farm/**`，以及铃野两页各自的
`/api/lingye/glimmer`／`/api/lingye/together` 结构化读取：

- 只接受 Doorbell Commons 的 HttpOnly Human Cookie；
- 每次请求先实时核验 QQ 群资格；
- Doorbell 从当前账号派生唯一 resident、home 和绑定农场；
- 浏览器不得提交或接收 `humanKey`、agentKey、master token、MCP credential、service token；
- 除留言目标等明确社交资源外，浏览器不能用门牌切换受保护的调用者农场。

React 完整农场主页已经改接 `GET /api/farm/field`，不再把 `/api/farm/overview` 作为前端 fallback；旧 overview 服务端路由暂留给迁移期兼容调用，须在限定引用审计与真实能力验收后另批退役。`GET/POST /api/farm/ui*` 继续只属于旧 HTML 兼容期。

流光原野与铃野共行的 Candidate Two 页面已经在本地分别改接
`GET /api/lingye/glimmer` 与 `GET /api/lingye/together`。两页只在 Human 点击入口后读取，不预取、不轮询、不解析或回退旧 HTML，也不把 `demo=full` 数据漏进 Live。旧
`/api/lingye-glimmer`／`/api/lingye-together` 继续只承担迁移兼容。

### 9.2 Doorbell 到 farm 内部层

farm 发布线新增独立 Human 结构化 adapter，不扩展下面这个现有 AI 万能入口：

```text
POST /internal/doorbell/farm-actions/execute
```

目标内部接口按资源拆分，例如：

- `/internal/doorbell/human/field/read`
- `/internal/doorbell/human/field/harvest-assist`
- `/internal/doorbell/human/glimmer/read`
- `/internal/doorbell/human/together/read`
- `/internal/doorbell/human/ranch/read`
- `/internal/doorbell/human/ranch/collect`
- `/internal/doorbell/human/kitchen/read`
- `/internal/doorbell/human/kitchen/cook`
- `/internal/doorbell/human/market/offers/read`
- `/internal/doorbell/human/purchase-requests/create`
- `/internal/doorbell/human/neighborhood/leaderboards/read`
- `/internal/doorbell/human/neighborhood/message`
- `/internal/doorbell/human/neighborhood/original-crops/read`
- `/internal/doorbell/human/neighborhood/original-crop/create`

每个内部请求由 Doorbell 服务端附带：

```json
{
  "farm_human_key": "server-only",
  "expected_farm_doorplate": "server-only",
  "idempotency_key": "writes-only",
  "expected_revision": "writes-only",
  "payload": {}
}
```

路径决定资源和动作，不接受万能 `action` 字符串。farm 重新校验 Human key 与预期门牌，固定 actor 为 Human，再调用现有权威 handler。返回各资源的严格 Schema，不能返回旧 `{ok,text,farm?}`、303、HTML 或 `flash` 文案。

### 9.3 成功与错误

读取成功至少返回：

```json
{
  "data": {},
  "revision": "opaque-resource-version",
  "server_time": "ISO-8601"
}
```

写成功至少返回：

```json
{
  "data": {
    "result": {},
    "resource": {}
  },
  "revision": "new-resource-version",
  "server_time": "ISO-8601"
}
```

错误统一为：

```json
{
  "error": {
    "code": "stable_code",
    "message": "面向人类的简短说明",
    "current_revision": "optional"
  }
}
```

共同错误范围：

- 400 `invalid_request`；
- 401 `authentication_required`；
- 403 `qq_not_group_member`、`operation_not_allowed`；
- 404 `farm_not_found`、`resource_not_found`；
- 409 `registration_profile_required`、`farm_credential_invalid`、`state_conflict`、`idempotency_conflict`、`shop_changed`；
- 业务拒绝使用稳定代码，例如额度耗尽、冷却、余额不足、库存变化、留言板关闭，且必须零变更；
- 502 `upstream_contract_unavailable`；
- 503 `onebot_unavailable`、`farm_unavailable`；
- 浏览器本地继续区分 `network_unavailable` 与 `unexpected_response`。

退群必须先清会话并拒绝 farm 调用。前端文案不承担错误分类。

### 9.4 幂等、并发与结算

- 每个状态写请求强制携带 `Idempotency-Key`；
- 同 key、同请求返回原 receipt，不重复扣款、消耗、产出或发消息；
- 同 key、不同请求返回 409 `idempotency_conflict`；
- 幂等记录必须与 farm 权威状态变更在同一次原子提交中持久化，不能只记在 Doorbell 内存；
- 修改设置、装扮、上架、留言和其他会受并发影响的资源携带 `If-Match` 或 `expected_revision`；
- 版本过期返回 409 `state_conflict`，不发生部分写入；
- 写成功返回结算后的资源切片、余额／库存变化和剩余额度，前端不自己复算；
- 幂等合同完成前，网络结果不明时禁止自动重试，先重新读取权威状态。

## 十、素材分类、现有文件与缺口

这一章是后续出图、搬迁和前端接线的施工台账，不再只写 `farm-field`、`farm-ranch` 这种空资源包名。台账快照日期为 **2026-08-18**，同时核对了：

- 当前社区 React 农场的 `apps/web/public/farm/**` 与 `apps/web/src/farm/**`；
- 独立 farm 发布线中仍可迁移的 `assets/**`、内容目录和旧 Human UI 素材映射；
- 当前总方案已经确认的四页结构、页面菜单与尚未实现的自然引擎／料理方式。

本章中的状态词固定为：

| 状态 | 含义 |
| --- | --- |
| 已接线 | 正式社区农场入口当前确实会加载并显示 |
| 仅演示 | 只在 `previewData` demo 中出现，正式入口不能据此宣称已完成 |
| 仅编辑器 | 只在农场工具图标调位页出现，正常玩家页面不显示 |
| 可迁移 | 独立 farm 旧 Human UI 已有真实素材和映射，新 React 尚未接入 |
| 通用占位 | 只有类别通用图，不能冒充某个具体内容已经有专属素材 |
| 源文件 | 审核通过的原始／处理中间文件，不应进入浏览器运行包 |
| 待补画 | 当前两个仓库均没有满足目标 UI 的正式图片 |
| DOM／CSS | 应由真实文字、按钮、进度、角标、遮罩或 SVG 生成，不另画一张写死状态的位图 |

### 10.1 素材身份与 manifest 合同

后续不得再在组件里按显示名猜图片，也不得靠施工者临时翻代码寻找 sprite 坐标。正式素材必须有一份随前端构建生成的 `farm asset manifest`，最少记录：

```text
asset_key
domain                 // shell / field / ranch / kitchen / neighborhood / panel
entity_kind            // crop / animal / ingredient / recipe / material ...
entity_id
visual_state           // icon / growing / ripe / selected / locked ...
hashed_url 或 atlas_url + frame
pixel_width / pixel_height
aspect_ratio
status                 // production / fallback / missing
fallback_key（如确实允许）
```

规则：

- farm 后端继续返回稳定内容 ID 和权威状态；前端用 ID＋状态查 manifest，不用中文名拼路径；
- 官方静态素材由 Vite／构建步骤产出内容 hash URL，不能继续把固定 `/farm/xxx.png` 当最终合同；
- 原创作物等审核后动态产生的图片由接口返回不可变 `asset_revision` 与对应版本 URL，未审核或生成失败时不得进入公共列表；
- 任何新增作物、动物、食材、料理、鱼获、素材、配饰或装饰进入可见内容目录前，都必须同时新增 manifest 记录或显式登记为 `fallback`／`missing`；
- 构建检查必须比较后端可见内容 ID 与 manifest 覆盖率，不能等到玩家打开某张卡才发现破图；
- 背景、纯装饰纹理和粒子层使用空 `alt`；作物、动物、商品、料理等承载内容身份的图必须从后端名称生成可读替代文本；状态不能只靠颜色区别。

### 10.2 当前社区 React 已有的 54 张 PNG

#### 四页背景

| 文件 | 尺寸 | 当前状态 | 明确用途 |
| --- | ---: | --- | --- |
| `farm/scenes/field-background.png` | 864×1821 | 已接线 | 农场场景；当前也被加载／错误壳和图标编辑器复用 |
| `farm/scenes/ranch-background.png` | 863×1823 | 已接线 | 牧场空场景底图；没有动物、装饰或产出状态层 |
| `farm/scenes/cooking-background.png` | 862×1825 | 已接线 | 料理台空炉架底图，供可替换锅具按统一锚点覆盖 |
| `farm/scenes/neighborhood-background.png` | 862×1825 | 已接线 | 邻里村路底图，排行榜／留言／原创作物面板覆盖其上 |

四张背景的源尺寸并不完全一致，但当前 CSS 统一按 862×1825 的逻辑比例拉伸；正式导出时必须统一画布、裁切和锚点，不能继续靠轻微变形碰巧对齐。

#### 地块与作物通用图

| 文件 | 尺寸 | 当前状态 | 明确用途 |
| --- | ---: | --- | --- |
| `farm/ui/plot-tile.png` | 256×256 | 已接线 | 每块已解锁土地的空地底座 |
| `farm/crops/ordinary-growing.png` | 512×512 | 已接线＋仅演示 | 当前错误地代表所有生长期作物；demo 还把它当普通种子图 |
| `farm/crops/ordinary-ripe.png` | 512×512 | 已接线 | 当前错误地代表所有成熟作物 |
| `farm/crops/fantasy-growing.png` | 512×512 | 仅演示／通用占位 | demo 奇幻种子；正式地块没有消费它 |
| `farm/crops/fantasy-ripe.png` | 512×512 | 未使用／通用占位 | 常量已登记但没有真实渲染消费者 |
| `farm/crops/limited-growing.png` | 512×512 | 仅演示／通用占位 | demo 限定种子；正式地块没有消费它 |
| `farm/crops/limited-ripe.png` | 512×512 | 未使用／通用占位 | 常量已登记但没有真实渲染消费者 |

这六张只能作为迁移期类别 fallback，不能算作 177 种官方作物已经有独立图片。正式地块接口返回具体 `crop_id` 后，应优先使用该作物自己的阶段图；没有专图时 manifest 必须明确标成类别 fallback，而不是悄悄全部显示成胡萝卜。

#### 牧场动物图

| 文件 | 尺寸 | 当前状态 | 明确用途 |
| --- | ---: | --- | --- |
| `farm/animals/animal-codex-atlas.png` | 1000×800 | 仅演示 | 5×4 静态精灵表，只在 demo 牧场商店卡使用；并非正式牧场动态场景 |
| `farm/animals/goat-codex.png` | 200×200 | 仅演示 | 山羊替换图，可复用到商店动物目录、详情和场景静态站位 |
| `farm/animals/alpaca-codex.png` | 200×200 | 仅演示 | 羊驼替换图，可复用到商店动物目录、详情和场景静态站位 |

当前 atlas 的 19 个格位依次包含：鸡、鸭子、鹌鹑、兔子、鹅、绵羊、山羊、奶牛、蜜蜂、火鸡、猪、羊驼、月光蚕、余烬母鸡、云绵羊、梦貘猫、小猫、小狗、巡逻鹅。正式 React 牧场尚未把任何一只动物渲染进场景，也没有产出、喂食、升级、派遣或装扮视觉层。

#### 料理方式工具

| 文件 | 尺寸 | 当前状态 | 明确用途 |
| --- | ---: | --- | --- |
| `farm/cooking-tools/stew-pot.png` | 1536×1024 | 已接线 | 炖煮；当前还被错误复用为底栏料理台图标，后续应补独立小图标 |
| `farm/cooking-tools/roast-oven.png` | 1536×1024 | 已接线 | 烤；目标为付费解锁工具 |
| `farm/cooking-tools/wok.png` | 1536×1024 | 已接线 | 炒与煎共用同一炒锅，符合已确认决定，不另补煎锅 |
| `farm/cooking-tools/deep-fryer.png` | 1536×1024 | 已接线 | 油炸；目标为付费解锁炸锅 |
| `farm/cooking-tools/steamer.png` | 1536×1024 | 已接线 | 蒸；目标为付费解锁蒸笼 |
| `farm/cooking-tools/dessert-mixing.png` | 1536×1024 | 已接线 | 甜品台 |
| `farm/cooking-tools/drink-mixer.png` | 1536×1024 | 已接线 | 饮品台 |

`farm/cooking-tools/approved-source/` 中另有同名七张 1536×1024 文件，均未被运行代码引用；其中甜品台与饮品台是未处理透明背景的 RGB 源图，其余五张与当前运行文件相同。它们统一标记为**源文件**，后续移出公开运行目录，但清理前仍须检查 Git 历史与外部直链，不能仅凭本次组件引用直接删除。

#### 菜单与内容图标

| 文件 | 尺寸 | 当前状态与归属 |
| --- | ---: | --- |
| `farm/ui-icons/field.png` | 192×192 | 已接线；底栏农场 |
| `farm/ui-icons/ranch.png` | 192×175 | 已接线；底栏牧场 |
| `farm/cooking-tools/stew-pot.png` | 1536×1024 | 已接线但不合适；底栏料理台暂用大锅具图，需补独立 192 级页签图标 |
| `farm/ui-icons/neighborhood.png` | 192×192 | 已接线；底栏邻里 |
| `farm/ui-icons/dingdong-bulletin.png` | 192×192 | 已接线；独立叮咚播报 |
| `farm/ui-icons/shop.png` | 192×192 | 已接线；三页商店，正式数据未接 |
| `farm/ui-icons/backpack.png` | 192×192 | 已接线；三页背包，正式数据未接 |
| `farm/ui-icons/codex.png` | 192×175 | 已接线于农场作物图鉴；邻里原创作物目前只登记未显示 |
| `farm/ui-icons/create-plant.png` | 192×192 | 已接线于农场“创造”；独立画架／植物设计图标，不复用作物图鉴 |
| `farm/ui-icons/market.png` | 192×175 | 已接线；三页共享集市入口，正式数据未接 |
| `farm/ui-icons/adventure.png` | 192×175 | 已接线；农场探险，面板为空 |
| `farm/ui-icons/smelting.png` | 192×173 | 已接线；农场熔炼，尚未开放 |
| `farm/ui-icons/settings.png` | 192×192 | 已接线；三页设置，正式数据未接 |
| `farm/ui-icons/dispatch.png` | 256×256 | 已接线；牧场派遣，正式数据未接 |
| `farm/ui-icons/recipes.png` | 192×178 | 已接线；料理台食谱，正式数据未接 |
| `farm/ui-icons/ranking.png` | 192×192 | 仅编辑器；邻里正式页目前只显示文字 tab |
| `farm/ui-icons/message-board.png` | 192×192 | 仅编辑器；邻里正式页目前只显示文字 tab |
| `farm/ui-icons/speed-potion.png` | 179×192 | 仅演示；加速药水 |
| `farm/ui-icons/potion-set.png` | 192×170 | 仅演示；药水套装 |
| `farm/ui-icons/seed-recipe.png` | 192×192 | 仅演示；隐藏配方 |

结构性的返回、刷新、关闭、加号、减号、数量、购物车、分页、展开、锁定、警告、成功、失败和重试图标应使用同一套 SVG／CSS 组件，并保证至少 44×44 的触控区域；不为每个按钮烤一张带文字 PNG，也不使用系统 emoji 充当正式导航图标。

#### UI 框架与纹理

| 文件 | 尺寸 | 当前状态与用途 |
| --- | ---: | --- |
| `farm/ui/panel-parchment.png` | 640×640 | 已接线；工具弹窗与邻里内容区纹理 |
| `farm/ui/scene-tabs-frame-v2.png` | 1075×177 | 已接线；四页底栏框 |
| `farm/ui/tool-cell-textured.png` | 192×192 | 已接线；右侧页面菜单格 |
| `farm/ui/scene-tabs-frame.png` | 1075×164 | 未使用；被 v2 替代的旧候选 |
| `farm/ui/tool-cell-light.png` | 192×192 | 未使用；可评估为选中态，但当前没有消费者 |
| `farm/ui/tool-cell.png` | 144×144 | 未使用；旧尺寸候选 |
| `farm/ui/tool-drawer-frame.png` | 390×1024 | 未使用；旧整列抽屉候选，当前设计不使用共享抽屉 |
| `farm/ui/tool-menu.png` | 144×144 | 未使用；旧 Menu 候选，当前已取消共享 Menu |

### 10.3 独立 farm 中可迁移但新 React 尚未接入的素材

| 文件 | 尺寸 | 覆盖内容 | 新 UI 归属 |
| --- | ---: | --- | --- |
| `assets/ranch-scene-background.png` | 1200×676 | 旧桌面牧场背景 | 仅作构图／历史对照；新竖屏背景已经重绘，不直接混用 |
| `assets/ranch-scene-background-mobile.png` | 800×800 | 旧手机牧场背景 | 同上 |
| `assets/animal-codex-atlas.png` | 1000×800 | 19 格动物、宠物、巡逻鹅基础外观 | 可迁移；与社区 atlas 同源 |
| `assets/alpaca-codex.png` | 200×200 | 羊驼替换图 | 可迁移；社区已有副本 |
| `assets/glimmer/variant-{1,2,3}.webp` | 各 1000×800 | 三套整表异色外观 | 牧场居民异色层；新 React 未接 |
| `assets/cooking/cooking-scene-bg.webp` | 1024×1024 | 旧俯视料理台背景 | 只迁移可复用细节；新竖屏料理背景已重绘 |
| `assets/cooking/cooking-pot.webp` | 900×563 | 旧通用铁锅 | 可保留给旧页面，不代替新八种方式工具 |
| `assets/cooking/pot-lid.webp` | 900×475 | 旧开火锅盖动画层 | 可评估用于炖煮动画，不强行覆盖其他方式 |
| `assets/cooking/ingredient-atlas.webp` | 1120×960 | 7×6 主食材／可烹饪产物图集 | 可迁移到食材柜、选材槽、商店与结果 |
| `assets/cooking/ingredient-atlas-2.webp` | 640×320 | 4×2 后补食材／产物图集 | 同上 |
| `assets/cooking/dish-atlas.webp` | 960×1600 | 6×10 主料理图集 | 可迁移；覆盖当前前 58 道非鱼料理 |
| `assets/cooking/fishing-cooking-atlas.png` | 960×960 | 通用鲜鱼食材格＋6 道鱼料理 | 可迁移到鱼获选材与鱼料理 |
| `assets/cooking/dish-atlas-2.webp` | 800×960 | 5×6 后补料理图集 | 可迁移；覆盖后补 26 道料理 |
| `assets/cooking/odd-dish.webp` | 160×160 | 微妙的料理 | 可迁移到失败结果、料理柜与回收提示 |
| `assets/glimmer/map-scene.webp` | 1200×1200 | 流光原野地图 | 归探险／流光原野面板，不进入农场首屏 |

三份料理成品图集加微妙料理图，已经覆盖当前 90 道正式食谱和失败料理；两份食材图集覆盖当前料理选材使用的商店食材与可烹饪牧场产物。**这批图是真实可复用素材，但当前社区 React 料理台完全没有接入，不能再写成“料理成品素材待从零制作”。** 非可烹饪牧场产物、55 种具体鱼获、6 种鱼篓物品仍没有各自正式图片。

### 10.4 每个页面实际需要的素材包

| 资源包 | 首次加载时机 | 必须包含 | 不能放进去 |
| --- | --- | --- | --- |
| `farm-shell` | 首次进入公共农场 | 四页底栏框与四个独立小图标、返回／刷新 SVG、通用 loading／错误／离线骨架、叮咚播报、当前页菜单格底板 | 四张场景背景、全部动物、全部作物、全部料理 |
| `farm-field` | 进入农场页 | 竖屏农场背景、地块底座、当前可见作物的阶段图、当前真实季节／天气／异常所需覆盖层 | 牧场动物、料理工具、邻里背景、未出现作物全集 |
| `farm-ranch` | 进入牧场页 | 竖屏牧场背景、当前持有动物／宠物／巡逻鹅及来访动物基础外观、实际穿戴配饰、已摆装饰、可收取提示 | 未拥有动物全集、全部商店卡、全部料理成品 |
| `farm-kitchen` | 进入料理台 | 竖屏料理背景、默认当前方式工具、炉火／槽位基础 UI、当前食材柜首屏所需图 | 另外七种工具、全部 90 道料理、完整食材全集 |
| `farm-neighborhood` | 进入邻里 | 邻里背景、排行榜／留言板／原创作物三个入口、通用农场牌与留言卡框 | 全服头像全集、全部原创作物图片、未打开榜单内容 |
| `farm-panel-shop-*` | 打开对应商店 | 当前页商品缩略图、货币 SVG、加减号和购物车 | 其他页面商店商品、未显示分页 |
| `farm-panel-backpack-*` | 打开对应背包 | 当前分类与当前页物品图、数量角标、锁价／不可售状态 | 其他分类全集 |
| `farm-panel-codex` | 打开作物图鉴 | 当前筛选和当前页作物图、已发现／未发现状态 | 177 种全量一次加载 |
| `farm-panel-recipes` | 打开食谱 | 当前分类和当前页料理图、配方食材小图、方式标识 | 90 道料理一次加载 |
| `farm-panel-market` | 打开集市 | 当前在售页真实物品图、卖家公开头像、货币与状态 SVG | 三份页面专属市场副本 |
| `farm-panel-expedition` | 打开探险／流光 | 当前地图封面、当前事件图、已获得装饰图 | 所有地图和全故事插图预载 |
| `farm-panel-smelting` | 打开熔炼 | 30 种素材的当前页图、九个已知配方输出作物图、槽位与结果框 | 未确认 Human 操作的假按钮或假结果 |
| `farm-panel-settings` | 打开设置 | 通用表单／开关／称号徽章样式 | 每个称号单独一张位图 |

### 10.5 页面状态层：哪些要画、哪些不能画死

| 页面 | 需要独立视觉素材 | 必须由 DOM／CSS／SVG 与权威数据生成 |
| --- | --- | --- |
| 农场 | 作物阶段图；后续虫害、积水、旱情等能够叠在地块上的透明状态层；季节／天气若确实改变场景则使用独立覆盖层 | 地块编号、名称、倒计时、浇水次数、成熟文字、选中／焦点、按钮权限、帮收次数、余额与错误 |
| 牧场 | 动物／宠物／巡逻鹅基础图与异色；配饰透明层；装饰物；产出物图；可收取的轻量提示层 | 动物名、等级、产出倒计时、投喂次数、升级价、派遣时间、欠款、允许动作、进度和抓捕结果 |
| 料理台 | 七套工具图；食材、鱼获、料理成品与微妙料理；必要的火焰／蒸汽／油花透明效果 | 已选 2–5 槽、数量、锁价、工具是否解锁、价格、开火进度、成功／失败文案、材料消耗／返还与结算 |
| 邻里 | 原创作物审核后的真实图片；可复用的农场牌和卡片装饰 | 名次、姓名、数值、本人位置、留言正文／时间、输入、删除／举报权限、分页、空态和审核状态 |
| 共享面板 | 真实物品缩略图、地图／事件插图、必要的稀有度纹理 | 商品价格、购物车数量、总价、限购原因、库存、筛选、页码、loading、失败、重试、禁用和确认 |

当前目录不存在缺水、枯萎、虫害、积水、肥力、可收取、锁定、天气或自然灾害的正式状态图。它们全部是待补画；但具体状态枚举必须先由自然天气引擎的权威合同确认，不能由画图任务擅自创造一套后端不存在的异常。

### 10.6 当前真实内容目录：出图不能漏掉什么

下面列的是独立 farm 在 2026-08-18 的真实可见内容快照。后续内容更新仍以构建时 manifest 覆盖检查为准；这里的用途是让当前出图和迁移不再临时翻运行代码。

#### 土地：5 级

- `tier:1` 荒地：6 块，最高 R；`tier:2` 熟地：9 块，最高 SR；`tier:3` 沃土：12 块，最高 SSR；`tier:4` 灵田：16 块，最高 SP；`tier:5` 丰壤：20 块，最高 SP。
- 新 UI 仍按权威存档只显示当前已解锁地块，不为下一等级补假地块；土地等级、块数、升级要求和按钮资格使用 DOM／CSS，不为五级各复制一张整页背景。

#### 作物：177 种

- 普通 60：`wheat` 小麦、`corn` 玉米、`carrot` 胡萝卜、`potato` 马铃薯、`cabbage` 卷心菜、`onion` 洋葱、`tomato` 番茄、`cucumber` 黄瓜、`bell_pepper` 甜椒、`eggplant` 茄子、`green_bean` 四季豆、`radish` 萝卜、`spinach` 菠菜、`lettuce` 生菜、`celery` 芹菜、`broccoli` 西蓝花、`strawberry` 草莓、`pea` 豌豆、`asparagus` 芦笋、`cauliflower` 花椰菜、`artichoke` 洋蓟、`spring_onion` 小葱、`watermelon` 西瓜、`sunflower` 向日葵、`chili` 辣椒、`okra` 秋葵、`summer_squash` 西葫芦、`basil` 罗勒、`pumpkin` 南瓜、`sweet_potato` 红薯、`beet` 甜菜、`kale` 羽衣甘蓝、`parsnip` 欧防风、`brussels_sprout` 抱子甘蓝、`turnip` 芜菁、`leek` 韭葱、`winter_wheat` 冬小麦、`endive` 苦苣、`daikon` 白萝卜、`broccoli_rabe` 芥兰、`broad_bean` 蚕豆、`spring_bamboo_shoot` 春笋、`cherry_radish` 樱桃萝卜、`loofah` 丝瓜、`bitter_melon` 苦瓜、`edamame` 毛豆、`water_spinach` 空心菜、`perilla` 紫苏、`chinese_yam` 山药、`water_caltrop` 菱角、`taro` 芋头、`kabocha` 栗南瓜、`napa_cabbage` 大白菜、`potherb_mustard` 雪里蕻、`tatsoi` 塌菜、`stem_mustard` 儿菜、`burdock` 牛蒡、`arrowhead` 慈姑、`winter_bamboo_shoot` 冬笋、`leaf_mustard` 芥菜。
- 奇幻 70：`glow_flower` 夜光花、`echo_bloom` 回声花、`weeping_lily` 垂泪百合、`lunar_rose` 月相玫瑰、`melody_petal` 旋律花瓣、`mirror_orchid` 镜面兰、`phantom_lotus` 幻影莲、`ember_tulip` 余烬郁金香、`whisper_crysanth` 低语菊、`void_lily` 虚空百合、`bubble_peony` 气泡牡丹、`time_daisy` 时光雏菊、`sunglow_iris` 日辉鸢尾、`screaming_mandrake` 尖叫曼陀罗、`pig_nose_grass` 猪鼻草、`tickle_fern` 怕痒蕨、`glass_cactus` 玻璃仙人掌、`umbrella_moss` 雨伞苔、`mirror_bamboo` 镜竹、`ink_weed` 墨草、`gravity_vine` 失重藤、`clock_thistle` 时钟蓟、`frost_moss` 霜衣苔、`fire_ivy` 火藤、`shadow_creeper` 影匍藤、`spiral_aloe` 螺旋芦荟、`bread_fruit` 面包果、`honey_melon` 蜜露瓜、`butter_bean` 黄油豆、`rainbow_corn` 彩虹玉米、`cheese_leaf` 奶酪叶、`soda_mushroom` 气泡菇、`candy_root` 糖果根、`spice_bush` 百味灌木、`chocolate_vine` 巧克力藤、`cloud_cotton` 云棉花、`pepper_lava` 熔岩椒、`vanilla_orchid` 香草兰、`walking_root` 行路根、`shy_tuber` 害羞薯、`juggling_vine` 杂耍藤、`guard_shrub` 护卫灌木、`dancing_grass` 跳舞草、`huff_puff_shroom` 气鼓菇、`migratory_bulb` 候鸟鳞茎、`fortune_root` 占卜根、`slumber_cabbage` 打盹卷心菜、`crab_weed` 螃蟹草、`gobble_melon` 贪吃瓜、`peekaboo_fern` 躲猫猫蕨、`rain_bell_bean` 雨铃豆、`swallowtail_sprout` 燕尾芽、`flower_tide_grass` 花信草、`kite_vine` 纸鸢藤、`spring_thunder_tree` 春雷木、`firefly_lantern_pepper` 萤灯椒、`cicada_bamboo` 蝉鸣竹、`thunderstripe_melon` 雷纹瓜、`tide_lotus` 潮汐莲、`midsummer_whale_melon` 盛夏鲸瓜、`amber_grain` 琥珀穗、`echo_chestnut` 回声栗、`maple_sugar_root` 枫糖根、`wild_goose_vine` 雁信藤、`moon_dust_taro` 月屑芋、`snowball_vegetable` 雪团菜、`frost_bell_grass` 霜铃草、`ice_candle_flower` 冰烛花、`aurora_moss` 极光苔、`winter_sleep_fruit` 眠冬果。
- 限定／成就／熔炼 47：`christmas_tree` 圣诞树、`pumpkin_lantern` 南瓜灯藤、`red_envelope_bamboo` 红包竹、`tangyuan_vine` 汤圆藤、`dragon_boat_reed` 龙舟芦苇、`mooncake_tree` 月饼树、`valentine_rose` 情人玫瑰、`easter_eggplant` 彩蛋茄、`thanks_gourd` 感恩葫芦、`new_year_bell_flower` 新年钟花、`magpie_bridge_vine` 鹊桥藤、`star_shuttle_wheat` 星梭麦、`qiaoguo_spike` 巧果穗、`moon_dew_balsam` 月露凤仙、`cloud_brocade_cotton` 云锦棉、`star_tether_bean` 牵星豆、`silver_river_lotus` 银汉莲、`childrens_dream_flower` 童梦花、`collector_wheat` 收集者之麦、`compendium_orchid` 百科兰、`archivist_tree` 档案树、`completion_bloom` 圆满之花、`hermit_moss` 隐士苔、`witness_root` 见证根、`night_owl_cactus` 夜猫子仙人掌、`max_land_bloom` 满田花、`botanist_rose` 植物学家玫瑰、`eternal_frost_bloom` 永恒霜花、`star_rebirth_orchid` 涅槃星兰、`clockwork_fern` 齿轮蕨、`coral_moon_cactus` 月珊瑚仙人掌、`mirage_thistle` 幻景蓟、`void_orchid` 虚空兰、`dragon_breath_bamboo` 龙息竹、`melody_vine` 旋律藤、`solar_ember_flower` 日烬花、`abyss_bloom` 深渊水母花、`origin_vine` 始源藤、`cosmos_apple_tree` 宇宙苹果树、`herbarium_page_sprout` 百草书芽、`four_season_compass_flower` 四季罗盘花、`myriad_leaf_chronicle_tree` 万叶纪年树、`new_world_seedpod` 新世界种荚、`star_tide_coral_grass` 星潮珊瑚草、`amber_pendulum_vine` 琥珀钟摆藤、`sky_prism_flower` 天穹棱镜花、`world_root_crown` 世界根冠。

当前没有上述 177 种作物逐种专属图片。首发出图若不能一次补齐，manifest 必须逐项标明哪些使用三类通用 fallback；作物图鉴不得用同一张图伪装成每个品种已经完成专属美术。

#### 牧场居民、配饰与装饰

- 生产动物 16：`chicken` 鸡、`duck` 鸭子、`quail` 鹌鹑、`rabbit` 兔子、`goose` 鹅、`sheep` 绵羊、`goat` 山羊、`cow` 奶牛、`bee` 蜜蜂、`turkey` 火鸡、`pig` 猪、`alpaca` 羊驼、`silk_moth` 月光蚕、`ember_hen` 余烬母鸡、`cloud_sheep` 云绵羊、`dream_cat` 梦貘猫；另有 `cat` 小猫、`dog` 小狗和固定巡逻鹅。基础静态图与三套异色整表可迁移。
- 配饰 14：`cap` 棒球帽、`scarf` 小围巾、`straw_hat` 草帽、`bow_knot` 蝴蝶结、`rain_boots` 小雨靴、`mini_cape` 小斗篷、`bell_collar` 铃铛项圈、`flower_crown` 小花冠、`backpack` 小书包、`ribbon_tail` 彩带尾饰、`glasses` 圆框眼镜、`sunglasses` 迷你墨镜、`knitted_vest` 针织背心、`sparkle_dust` 闪粉。当前只有文字定义，没有任何配饰透明图；而且真实存档没有 slot，出图与穿戴仍必须按配饰 ID 数组处理。
- 装饰 14：`flowerbed` 花圃、`scarecrow` 稻草人、`wind_chime` 风铃、`fairy_lights` 星星灯串、`welcome_sign` 欢迎木牌、`pond` 小池塘、`pumpkin_cart` 南瓜推车、`hammock` 吊床、`birdhouse` 鸟屋、`mushroom_lamp` 蘑菇灯、`weather_vane` 风向标、`tea_table` 茶歇桌、`stone_path` 石板小径、`rainbow_pinwheel` 彩虹风车。当前只有文字定义，没有物件图或已确认场景锚点。

#### 料理食材、牧场产物和料理

- 商店食材 25：`salt` 盐、`flour` 面粉、`sugar` 砂糖、`rice` 大米、`soy_sauce` 酱油、`ginger` 生姜、`scallion` 香葱、`onion` 洋葱、`potato` 马铃薯、`corn` 玉米、`carrot` 胡萝卜、`tomato` 番茄、`basil` 罗勒、`pumpkin` 南瓜、`strawberry` 草莓、`tea` 茶叶、`watermelon` 西瓜、`cocoa` 可可粉、`vanilla` 香草、`spice` 香料、`butter` 黄油、`yellow_wine` 黄酒、`tofu` 豆腐、`rainbow_corn` 彩虹玉米、`star_sugar` 星糖。两份旧食材 Atlas 已覆盖这批选材图。
- 牧场产物 25：`chicken_egg` 鸡蛋、`duck_egg` 鸭蛋、`rabbit_fur` 兔毛、`goose_egg` 鹅蛋、`sheep_wool` 羊毛、`fresh_milk` 鲜奶、`honey` 蜂蜜、`truffle` 松露、`moon_silk` 月光丝、`warm_egg` 暖火蛋、`cloud_wool` 浮云毛、`dream_fragment` 梦之残片、`chicken_meat` 鸡肉、`duck_meat` 鸭肉、`goose_meat` 鹅肉、`lamb` 羊肉、`beef` 牛肉、`pork` 猪肉、`quail_egg` 鹌鹑蛋、`quail_meat` 鹌鹑肉、`goat_milk` 山羊奶、`goat_meat` 山羊肉、`turkey_egg` 火鸡蛋、`turkey_meat` 火鸡肉、`alpaca_wool` 羊驼毛。旧 Atlas 覆盖可下锅产物；兔毛、羊毛、月光丝、浮云毛、梦之残片和羊驼毛当前仍只有 emoji／文字，需补回收／账目缩略图。
- 料理 90 道：主食小吃 12 道、汤羹 9 道、热菜 41 道、甜品点心 17 道、饮品 11 道；三份旧料理 Atlas 已有逐道图和精确 frame 映射，新 React 应迁移映射而不是重画一套。完整名称与 ID 如下：
  - 主食小吃：`potato_pancake` 土豆蛋饼、`duck_rice_ball` 鸭蛋饭团、`goose_pancake` 鹅蛋薄饼、`basil_chicken_roll` 罗勒鸡肉卷、`goose_rice` 鹅肉炖饭、`truffle_omelet_rice` 松露蛋包饭、`quail_meat_rice_ball` 鹌鹑肉饭团、`fish_rice_ball` 鱼肉饭团、`scallion_pancake` 葱油饼、`soy_fried_rice` 酱油炒饭、`goat_milk_bun` 羊奶馒头、`goat_meat_rice` 山羊肉焖饭。
  - 汤羹：`corn_custard` 玉米蛋羹、`pumpkin_duck_cup` 南瓜鸭蛋盅、`pumpkin_milk_soup` 南瓜奶汤、`milk_egg_custard` 奶香蛋羹、`pumpkin_lamb_soup` 南瓜羊肉汤、`potato_goat_stew` 土豆山羊煲、`pumpkin_turkey_egg_cup` 南瓜火鸡蛋盅、`tomato_fish_soup` 番茄鱼汤、`tofu_egg_soup` 豆腐蛋花汤。
  - 热菜：`fried_egg` 香煎蛋、`tomato_egg` 番茄炒蛋、`carrot_egg` 胡萝卜煎蛋、`onion_roast_duck` 洋葱烤鸭、`tomato_beef_stew` 番茄炖牛肉、`truffle_steak` 松露牛排、`honey_roast_duck` 蜂蜜烤鸭、`rainbow_corn_lamb` 彩虹玉米羊排、`warm_truffle_egg` 暖火松露烘蛋、`star_honey_goose` 星糖蜜汁烤鹅、`tea_quail_egg` 茶香鹌鹑蛋、`herb_quail_omelet` 香草鹌鹑蛋饼、`honey_quail_skewer` 蜂蜜鹌鹑串、`spiced_goat_chop` 香料山羊排、`turkey_egg_roll` 火鸡蛋卷、`roast_turkey` 香烤火鸡、`star_honey_turkey` 星糖蜜汁火鸡、`tea_egg` 茶叶蛋、`pan_fried_fish` 香煎鲜鱼、`herb_grilled_fish` 香草烤鱼、`honey_roast_fish` 蜂蜜烤鱼、`starlight_fish_feast` 星河鱼宴、`scallion_omelet` 葱花煎蛋、`butter_fried_egg` 黄油煎蛋、`home_style_tofu` 家常豆腐、`butter_corn` 黄油玉米、`plain_boiled_chicken` 白切鸡、`red_braised_tofu` 红烧豆腐、`soy_quail_eggs` 酱香鹌鹑蛋、`scallion_oil_chicken` 葱油鸡、`ginger_duck` 姜母鸭、`tea_smoked_duck` 茶香熏鸭、`red_braised_goose` 红烧鹅、`scallion_lamb` 葱爆羊肉、`potato_beef` 土豆烧牛肉、`yellow_wine_turkey` 黄酒焖火鸡、`yellow_wine_quail` 黄酒焖鹌鹑、`truffle_tofu` 松露豆腐煲、`red_braised_pork` 红烧肉、`dongpo_pork` 东坡肉、`truffle_butter_steak` 松露黄油牛排。
  - 甜品点心：`honey_strawberry_jelly` 蜂蜜草莓奶冻、`strawberry_cake` 草莓蛋糕、`vanilla_goose_roll` 香草鹅蛋卷、`honey_cocoa_cake` 蜂蜜可可蛋糕、`vanilla_goose_cake` 香草鹅蛋糕、`honey_pumpkin_pudding` 蜂蜜南瓜布丁、`warm_souffle` 暖火舒芙蕾、`warm_strawberry_tart` 暖火草莓挞、`strawberry_goat_pudding` 草莓羊奶布丁、`plain_egg_cake` 鸡蛋糕、`honey_egg_cake` 蜂蜜鸡蛋糕、`cocoa_egg_cake` 可可鸡蛋糕、`pumpkin_egg_cake` 南瓜鸡蛋糕、`rainbow_corn_egg_cake` 彩虹玉米鸡蛋糕、`star_sugar_egg_cake` 星糖鸡蛋糕、`butter_cookie` 黄油曲奇、`custard_bun` 奶黄包。
  - 饮品：`strawberry_milk` 草莓牛奶、`honey_tea` 蜂蜜茶、`watermelon_milkshake` 西瓜奶昔、`honey_goat_milk` 蜂蜜羊奶、`classic_milk_tea` 原味奶茶、`strawberry_milk_tea` 草莓奶茶、`watermelon_milk_tea` 西瓜奶茶、`honey_milk_tea` 蜂蜜奶茶、`cocoa_milk_tea` 可可奶茶、`vanilla_milk_tea` 香草奶茶、`star_sugar_milk_tea` 星糖奶茶。

当前 90 道食谱还没有 `method_id`；上述图片只证明“料理外观已有”，不证明八种料理方式已经接入后端。同一料理以后因方式不同成为不同结果时，必须由升级后的食谱合同决定是复用现有成品图还是新增变体，前端不能自行猜。

#### 鱼获、鱼篓财宝、熔炼素材与探险物

- 鱼获 55：`mud_carp` 泥鲤、`ghost_shrimp` 幽灵虾、`flicker_minnow` 荧鳞鲦、`angler_fry` 灯鮟鱇、`sky_skipper` 跃空鱼、`frost_drifter` 霜漂鱼、`scorched_tetra` 焦鳞灯鱼、`shard_fish` 晶片鱼、`jelly_phantom` 幻水母、`winter_cinder` 冬烬鱼、`silver_pike` 银梭鱼、`dusk_eel` 暮色鳗、`copper_bream` 铜鲂、`cinder_loach` 余烬泥鳅、`deep_sculpin` 深岩杜父鱼、`mangrove_snapper` 红树鲷、`winter_betta` 雪华斗鱼、`zephyr_dancer` 流风舞者、`geyser_wyrm` 间歇泉龙、`crystal_angler` 晶刺鮟鱇、`stormray` 风暴鳐、`magma_salamander` 岩浆蝾螈、`void_jellyfish` 虚空水母、`cloud_serpent` 云鳞蛟、`ember_barb` 烬棘鱼、`moon_phoenix_fish` 月凰鱼、`starwhale` 星鲸、`time_eater` 时噬鱼、`bog_creeper` 沼行鱼、`bloat_toadfish` 鼓蟾鱼、`wraithwood_fish` 朽木灵鱼、`star_sand_darter` 星沙镖鲈、`tidal_trout` 潮信鳟、`star_barge_whisker` 星舟巨鲶、`urn_hermit` 瓮居蟹、`rune_cod` 铭文鳕、`sunken_wraith` 沉城幽魂鱼、`sulfur_killie` 硫华鳉、`steam_ray` 蒸汽鳐、`magma_peacock_bass` 熔岩孔雀鲷、`mudskipper_perch` 泥蟹攀鲈、`root_dragon` 气根龙、`prism_lanternfish` 棱镜灯鱼、`shard_shrimp` 碎晶虾、`crystal_leviathan` 洞天晶龙、`crucian` 鲫鱼、`silver_dace` 银鲦、`reed_perch` 芦苇鲈、`glow_jelly` 光水母、`moonscale_carp` 月鳞鲤、`ember_carp` 熔岩鲤、`windveil_ray` 风纱鳐、`frostfin_eel` 霜鳍鳗、`clockwork_koi` 发条锦鲤、`the_first_drop` 「第一滴水」。当前只有通用鲜鱼选材图，没有逐鱼种图片。
- 鱼篓物品 6：`coral_pearl` 珊瑚珍珠、`gem_sapphire` 蓝宝石、`moonstone` 月光石、`ambergris` 龙涎香、`shipwreck_coin` 沉船金币、`ancient_key` 古老的钥匙。当前无图片；前五种可售，古老的钥匙不可售，UI 必须从权威字段区分。
- 鱼饵 3：`basic_worm` 普通蚯蚓、`glow_bait` 夜光饵、`golden_lure` 黄金亮片；宝箱 3：`rusty_chest` 锈迹宝箱、`barnacle_chest` 藤壶密箱、`ancient_captain_chest` 船长遗箱。当前都只有文字／emoji，没有正式物品图；宝箱实例仍使用现有真实 `chest_id`，素材只按事件种类键映射。
- 熔炼／探险素材 30：`ordinary_stone` 普通石头、`dry_branch` 枯树枝、`clay_lump` 黏土块、`broken_tile` 碎瓦片、`fluorite` 萤石、`beast_bone` 兽骨、`rusted_iron` 锈铁片、`spider_silk` 蛛丝团、`thunderstruck_wood` 雷击木、`deepsea_nacre` 深海珍珠母、`ancient_resin` 古树脂、`dragon_claw` 龙的指甲、`sea_god_scale` 海神的鳞片、`phoenix_ember` 凤凰的余烬、`world_tree_seed` 世界树的籽、`crystal_shard` 碎晶片、`old_vine` 枯藤、`rusted_gear` 锈齿轮、`sea_glass` 海玻璃、`phoenix_feather` 凤羽、`shadow_thread` 影线、`echo_stone` 回音石、`stardust_sand` 星沙、`ever_frost` 不融冰、`dream_cocoon` 梦茧、`ambergris_fragment` 龙涎香、`tarnished_lunar_bronze` 锈月铜、`void_fabric` 虚空布片、`time_amber` 时光琥珀、`creation_echo` 创世余音。当前 30 项已按上述顺序进入透明 `farm/smelting/materials-atlas.png`。该图集虽然按五列六行排布，但各行真实占用高度不相等，前端不得按 5×6 等分背景帧裁切；现在由稳定素材 ID 解析独立像素视窗，每个视窗完整包含对应素材并保留透明安全边。实页取图使用等比例 CSS background 精确定位，不把整张 atlas 放进根 SVG 后仅依赖 `viewBox` 裁片，避免视窗外别行像素在格内串出碎片。React `demo=full` 已接线，Live 仍等待真实库存合同。
- 已知熔炼配方 9：`dragon_claw + sea_god_scale + world_tree_seed → completion_bloom` 圆满之花；`ever_frost + time_amber + void_fabric → eternal_frost_bloom` 永恒霜花；`phoenix_feather + stardust_sand + tarnished_lunar_bronze → star_rebirth_orchid` 涅槃星兰；`sea_glass + rusted_gear + ambergris_fragment → archivist_tree` 档案树；`crystal_shard + old_vine + creation_echo → origin_vine` 始源藤；`sea_glass + deepsea_nacre + stardust_sand → star_tide_coral_grass` 星潮珊瑚草；`ambergris_fragment + rusted_gear + old_vine → amber_pendulum_vine` 琥珀钟摆藤；`crystal_shard + fluorite + sea_god_scale → sky_prism_flower` 天穹棱镜花；`world_tree_seed + ancient_resin + creation_echo → world_root_crown` 世界根冠。输入素材图和输出作物图都通过稳定 ID 映射，不把配方文字烤进图片。
- 探险地图 5：`mushroom_forest` 幻菇林、`rusty_clocktown` 锈钟古镇、`stardust_theater` 星沙剧场、`tidal_corridor` 潮汐回廊、`whale_market` 云鲸背上的集市。当前没有各自地图封面。
- 探险装饰 24：`exp_star_candy` 星球糖、`exp_mushroom_lantern` 菌灯、`exp_flowering_chair` 会开花的藤椅、`exp_golden_spore` 金孢茸、`exp_rusty_clocktown_1` 铜茶匙风铃、`exp_rusty_clocktown_2` 齿轮小风车、`exp_rusty_clocktown_3` 钟楼怀表、`exp_rusty_clocktown_4` 时间沙漏、`exp_stardust_theater_1` 星沙人形瓶、`exp_stardust_theater_2` 月亮面具、`exp_stardust_theater_3` 铜哨摆件、`exp_stardust_theater_4` 铜星摆件、`exp_stardust_theater_5` 星图纸灯、`exp_tidal_corridor_1` 蟹壳茶盏、`exp_tidal_corridor_2` 潮蚀银链、`exp_tidal_corridor_3` 逆潮铜铃、`exp_tidal_corridor_4` 潮音螺号、`exp_tidal_corridor_5` 盐渍记忆茶砖、`exp_whale_market_1` 忆光风铃、`exp_whale_market_2` 雾泪捕梦网、`exp_whale_market_3` 问星花盏、`exp_whale_market_4` 笼中星、`exp_whale_market_5` 笑剑风铃、`exp_whale_market_6` 空盒的盖子。当前没有物件图。

#### 季节、节日和状态事件

- 季节 4：春、夏、秋、冬；节日 12：圣诞节、万圣节、春节、元宵节、端午节、中秋节、情人节、复活节、感恩节、元旦、七夕、儿童节。当前均有内容规则，但没有独立场景覆盖层或节日入口美术。
- 当前运行时实际加载 20 个 `season-events`；另一个 `events.json` 中的 16 条旧内容没有被当前内容加载层导出，不能列入新 UI 的可见目录或按它出图。
- 现有季节事件不等于未来完整自然天气引擎。虫害、积水、旱情、洪水、传播等持续世界状态的枚举、层级、范围和恢复方式仍由后续自然引擎合同确认；确认前只登记缺图，不抢先画成固定状态机。

### 10.7 已确认的首发缺图清单

以下不是“以后也许要画”，而是按当前四页和已有真实内容接线时会直接遇到的缺口：

- `farm-shell`：独立料理台底栏小图标；统一货币、购物车、锁定、失败、重试等 SVG 组件；
- 农场：具体作物图策略尚未完成，当前 177 种都没有专属图；种子袋、普通单瓶药水、地块缺水／虫害／积水等经自然引擎确认后的透明层；
- 牧场：14 件配饰透明层、14 件牧场装饰物、正式场景动物站位／轻动效规范、产出物缩略图、喂食／升级／可收取／派遣状态；
- 料理台：把旧食材与 90 道料理 Atlas 搬入新 React 的 manifest 和 frame 映射；三件付费工具沿用现有工具贴图，另需在商店工具目录承接持有状态与权威银币价，不再制作场景锁定覆盖层；55 种鱼获、3 种鱼饵、3 种宝箱、6 种鱼篓物品、6 种不可烹饪牧场产物的独立缩略图仍缺；
- 邻里：排行榜名次标识、农场牌／居民头像容器、留言卡和原创作物审核中／失败／已发布状态；原创作物正式图来自审核通过的生成结果，不预制假图；
- 探险与熔炼：5 张地图封面、30 种素材图、24 件探险装饰图；熔炼未确认 Human 写权限前只补读取所需物图，不画假操作结果；
- 状态与适配：所有内容图必须有稳定尺寸／aspect-ratio 以避免加载跳动；交互状态、数量、价格、倒计时和错误由 DOM／CSS／SVG 生成，并保留键盘焦点、可读标签和 reduced-motion 降级。

### 10.8 素材接入完成的判定

某个页面或面板只有同时满足以下条件，才可以从“视觉预览／空态”改成“素材完成”：

1. 台账中该页面首屏必需项均为已接线或明确允许的 fallback；
2. 后端返回的每个当前可见内容 ID 都能在 manifest 中找到准确图片或显式 fallback，且没有按中文名猜路径；
3. Atlas 的 frame 数、顺序和 ID 映射由数据／测试固定，不靠组件数组位置碰巧一致；
4. 正式入口真实加载验证通过，不能只截图 demo 或图标编辑器；
5. 只进入当前页时不会下载另外三页的大背景和全集；打开面板只加载当前分类／当前页；
6. 图片有宽高占位、内容图有可读替代文本、状态不只靠颜色、按钮触控区不小于 44×44；
7. 375px 窄屏、宽屏和高屏均使用同一逻辑画布比例，背景、地块、动物、工具、浮层与点击区没有各自漂移；
8. 源文件、未使用旧候选和运行文件分开，公开包不携带 `approved-source`；
9. 冷启动、二次启动、图片解码与内存检查通过，没有为了 Atlas 再造一个全农场巨型图包。

## 十一、当前实现与目标差距

| 能力 | 当前状态 | 到达目标所需 |
| --- | --- | --- |
| 农场地块 | `GET /api/farm/field` 的 farm 纯投影 adapter、Doorbell 严格结构化路由与 React Live 接线均已完成。React 只按接口实际 `plots[]` 渲染，并显示真实农场金币、季节、土地阶段、地块进度／预计成熟时间和权威帮收摘要；木牌继续展示真实农场名／门牌，并仅在字段非空时增加佩戴称号与欢迎语。普通／奇幻即使成熟也保持身份隐藏，限定／原创只显示接口已知身份。`POST /api/farm/field/harvest-assists` 已接回旧 Human 一键帮收权威链，以 UUID 幂等键和 action-safe field revision 防重复／陈旧提交，成功返回真实 receipt 与完整新 field；React 不本地结算，并在帮收成功后重新读取此前已加载的 catalog／kitchen／ranch，手动刷新也重新读取 field 与全部已加载附属资源，避免余额、库存或设置继续显示旧快照 | 等待两条发布线部署与真实迁移验收；其他 field 面板仍按各自结构化合同逐项接入 |
| 农场菜单 | `GET /api/farm/catalog` 已在本地为商店、背包、作物图鉴、集市、探险、熔炼、设置、播报与邻里提供无副作用结构化读取，React Live 只消费接口真实已知条目；未初始化／损坏来源保持 unavailable。设置已接通农场名、欢迎语和佩戴／卸下称号的逐字段权威 action，成功整体替换 catalog resource；没有现成权威动作的小机昵称、你的昵称和社交开关继续只读。`demo=full` 的“创造”仍只承接五字段会话草稿，Live 提交禁用 | 补原创植物创建、其余设置字段的权威动作、熔炼、探险操作、留言和市场等独立合同；不得因部分设置已接通就直接写存档或模拟其他动作成功 |
| 牧场 | `GET /api/farm/ranch` 的 farm 纯 projector、Doorbell session 路由与 React Live 接线已在本地完成。Live 只渲染接口实际返回且身份已知的动物／宠物／巡逻鹅，使用二维巡游和统一详情弹窗；具体居民详情已接通投喂、升级、改名、置顶／取消置顶、穿戴／取下配饰和切换已解锁异色，成功显示 farm 返回的真实结果并整体替换 ranch resource。`POST /api/farm/ranch/collect` 又从当前 revision 与 UUID 幂等键复用旧收取、还债、料理柜和自动回收链，场景只显示紧凑收取入口与真实 receipt，不恢复全局管理条，也不展示不可视欠款、全局抓捕或金币回传。未知／损坏／重复居民不会进入权威动作 | 补装饰摆放、派遣／抓捕、金币回传、购物车喊 AI 等其余独立 action；具体动物动作继续留在居民详情，不新增全局管理条 |
| 料理台 | `GET /api/farm/kitchen` 的 farm 纯 projector、Doorbell session 路由与 React Live 接线已在本地完成。Live 显示真实银币和实际已拥有工具；备料与背包分开消费堆叠食材、牧场产物实例、鱼获实例、鱼篓财宝和料理实例，选择层保留 `product_instance_id／catch_instance_id`。已解锁食谱只取真实 known 集合；每日商店只显示权威当日货架与真实刷新时间，旧日货架不展示，食谱仍固定最多两道。三件付费工具缺价格／购买合同的状态保持不可购买，不生成 Demo 持有或成功 | 补带方式／工具要求的权威料理、扣料与结果，食材栏手动刷新、工具购买、三类库存后续使用／回收／出售及购物车幂等结算；当前 read 不等于这些写操作已开放 |
| 四页本地状态 | 第一批场景拆分已把农场／牧场／料理台／邻里变成四个 lazy 场景模块：首屏只挂载农场，其他页首次访问才加载；访问后继续隐藏挂载，因此该页已打开的分类、面板与滚动位置仍保留在当前 React 会话，不写浏览器持久化或权威状态。第二批已把叮咚播报、通用工具面板和商店拆成独立 lazy chunk，商店仅在实际打开时继续加载；图鉴、熔炼、设置、创造等仍共用通用工具 chunk | 继续把通用工具 chunk 按大型面板细分并迁移直接依赖资源；接真实读取时把业务数据留给权威接口，只在产品另行确认后决定是否需要跨刷新恢复，不能把当前会话状态冒充存档 |
| 邻里 | React 已有排行榜、留言板、原创作物三个平级栏目，只显示当前选中栏目且没有足迹入口；Live 已从 `/api/farm/catalog` 的 neighborhood 安全投影读取当前真实条目，栏目 unavailable 或无条目时保持诚实空状态，不生成排行、留言或原创作物 | 补榜单细分、本人位置、公开农场资料、留言发送、原创作物详情／收藏等后端尚未提供的读取与写合同；不扩展为假数据 |
| 流光原野／铃野共行 | Candidate Two 两页的严格结构化 Live 读取已接通。流光原野 adapter 在 farm／world clone 上投影真实开放状态、今日踪迹、协作、公共事件、57 项异色图鉴及解锁状态、20 项奇遇、概况和 12 项成就，不保存、不结算、不消费；铃野共行 adapter 保留旧 Human 读取已有的 farm 权威到期推进和一次保存，再只返回当前故事、轮次、阶段、状态、受控插图 key、历史、任务、选择、冷却、结局与线索。两个成功响应都携带权威 `subject.farm_doorplate`，Doorbell 必须与当前绑定门牌严格比对，不能只验证数据形状。前端只认识受控 Atlas／阶段图 key，八张当前正式阶段图已等比例压入社区运行目录；未知 key 不猜 URL。两页都按点击懒加载，Demo 与 Live 隔离，旧 HTML 只留迁移兼容 | 等待两条发布线部署、真实账号读取验收与辛玥视觉验收；本批不增加流光原野或铃野共行 Human 写操作，也不提前移除旧 HTML 入口 |
| 商店／购物车 | 三页商店 Live 已分别读取 farm catalog、ranch 与 kitchen 的真实持久化货架，使用权威名称、价格、限额与数量，不把未知身份、旧日料理货架或未知拥有／库存状态加入购物车；三页互不串车的会话草稿、固定范围滚动、数量增减和合计保留。农场／牧场“喊 TA 来买”和料理台“确认购买”仍禁用，不产生请求、扣款或成功状态 | 农场／牧场补每种商品的 AI 合法购买动作和一车一次 wake 请求合同；料理台补 Human 直接购买、银币扣款、版本冲突、限额和幂等结算，并另接食材手动刷新写合同 |
| 集市 | `/api/farm/catalog` 已只读返回同一份权威普通在售项和换物单，React 三页入口按当前页保留筛选／返回位置并显示真实已知条目；普通项仍以卖家门牌＋kind＋item_id 定位，换物单保留真实 listing ID | 补浏览详情、上架、购买、下架，以及创建／接受／撤回换物单的独立写合同；当前 UI 不提供假操作 |
| 熔炼 | React `demo=full` 已接线 30 种权威素材图集；Live 又从 `/api/farm/catalog` 只显示接口实际返回的素材 ID、名称、等级和数量，未知素材使用显式空视觉，不猜贴图。目录仍按 `N → R → SR → SSR → SP`、每行四格、最多选三种；“开始熔炼”继续只显示未开放提示，不消耗素材或生成产物 | 补 Human craft 权限决定和权威写合同，由 farm 重新校验三份素材、配方、幂等、扣除与产出；只读库存不等于可熔炼 |
| 叮咚播报 | React 仍将任务／成熟／留言按固定顺序放在同一可滚动列表，无分类键、分页或足迹；Live 已从 `/api/farm/catalog` 读取当前有真实来源的留言和牧场通知，并对尚不可用的任务／成熟来源显示诚实状态，不生成假活动 | 补 farm 尚未提供的任务与成熟结构化来源；不含足迹、不唤醒普通消息 |
| 设置／探险／图鉴 | `/api/farm/catalog` 已为设置、探险和作物图鉴提供真实投影；设置显示现有存档中的农场名、昵称、欢迎语、已解锁／佩戴称号与社交开关，并已为农场名、欢迎语和佩戴称号接入逐字段权威保存；其余设置字段保持只读。探险和图鉴只显示接口已知条目。料理背包已按“食材／牧场产物／鱼篓／料理”分别消费堆叠食材、产物／鱼获／财宝／料理实例，不拍平底层身份 | 补其余设置字段的 farm 权威动作、探险操作、图鉴详情／收藏等尚缺合同；只按实际返回字段写入，不转发旧表单、解析 HTML 或直写存档 |
| 素材台账 | 社区 React 已有类型化素材 manifest，并以稳定语义 key／动物 ID／料理内容 ID／熔炼素材 ID 接线场景、工具、作物族、18 种动物／宠物、44 类食材／可烹饪产物、90 道料理与 30 种熔炼素材；运行状态不保存 URL、sprite index 或文件序号。当前仍使用 `public/farm/**` 固定文件名，177 种作物、55 种鱼等专项清单中的正式逐项图片仍缺 | 继续按台账补齐明确 `missing` 项、建立内容目录覆盖检查和内容 hash，并在社区统一资源机制中按页面／面板拆包；不得把类别 fallback 或 demo 素材冒充逐项完成 |
| PWA／静态资源 | 社区尚无统一 Service Worker／manifest；第一批已生成四场景各自的 lazy JS／CSS chunk，农场首屏不再加载牧场／料理／邻里背景与邻里外壳；第二批又生成独立 bulletin／tool／shop JS／CSS chunk，首屏不预载，商店仅在实际打开时加载。底部料理页签仍复用大锅具图，非商店大型工具仍共用一个 tool chunk，公开图片仍为固定路径且无内容 hash，`approved-source` 仍在公开目录 | 继续补独立底栏小图标并按工具细分面板资源，建立 manifest 覆盖检查与显式 `missing／fallback`，清理公开源文件并生成内容 hash；只在社区统一 PWA 中登记 CacheFirst 静态资源并做真实冷／热启动验证，不新建农场 Service Worker |

## 十二、实施顺序

1. 冻结四页路由、每页菜单数组与邻里三项范围，先删除新 React 中的足迹首批入口并加入原创作物；
2. 冻结本章素材台账并建立稳定内容键 manifest：先分离正式运行图、demo／编辑器候选和公开目录内源文件，再迁移动物、44 类食材／可烹饪产物与 90 道料理的既有 Atlas frame 映射；所有缺图先登记 `missing` 或经确认的类别 fallback，再把四页与大型面板拆成真实组件／资源包并生成内容 hash；
3. 在 farm 侧建立独立 Human 结构化 adapter、统一资源版本和幂等存储；
4. 接 `field` 页面主体、帮收、农场商店、背包和非原创作物图鉴；三页购物车草稿 UI 已先在 `demo=full` 完成，Live 商品仍等待合同；
5. 接 `ranch` 页面主体和现有 Human 动作，再接牧场菜单；
6. 先完成料理方式、工具解锁、旧食谱迁移和食材商店十次金币刷新状态，再接 `kitchen` 页面和料理动作；
7. 按普通市场真实复合定位接一份共享市场，再接探险、设置及已经批准的熔炼读取／动作；
8. 接邻里排行榜、留言板和原创作物，不等待足迹；
9. 完成购买请求持久化、逐项结果和一次 wake 链路后，再启用农场／牧场购物车的“喊 TA 来买”；料理台另在 Human 直接购买合同、货架版本校验、幂等与权威银币结算完成后启用“确认购买”；
10. 在整个社区前端只建立一套 PWA、Service Worker、最小 app shell、导航 HTML NetworkFirst、静态图片 CacheFirst 和 API NetworkOnly；农场只把自己的页面／面板资源登记进共同机制，不另建 Service Worker，也不得 precache 全部贴图；
11. 只有真实来源和无副作用通知读取完成后才接叮咚播报；
12. 使用隔离假农场逐项验证读取、权限、幂等、结算、冷／热缓存和刷新，不读取生产玩家存档；
13. 四页真实能力验收后，再审新路由默认切换、旧 `/ui/<humanKey>` 与 `/api/farm/ui*` 停用。

## 十三、验收标准

- 四个底部入口分别进入农场、牧场、料理台和邻里；
- 三个场景页各自显示自己的菜单，不出现混合全局菜单；
- 邻里首批只有排行榜、留言板和原创作物，没有足迹或假动态；
- 同名集市／设置入口可复用后端资源，但页面状态、默认筛选和返回位置独立；
- 切页、返回、关闭面板后不会串页或丢失无关页面状态；
- 农场 Human 不能执行 AI 的播种、浇水、催熟、主收获、土地升级或直接商店购买；
- 牧场 Human 动作仍按现有 handler 权限与结算执行；
- 牧场接口不出现虚构动物 instance ID 或配饰 slot，普通市场不出现虚构 listing ID；
- 料理必须把 `method_id` 和工具解锁纳入后端权威判定，同食材换方式可以得到不同结果；
- 料理背包保持堆叠食材、牧场产物实例、鱼获实例、鱼篓财宝和料理实例的真实混合结构；鱼获出售按真实实例结算，鱼篓财宝按真实堆叠与既有单价结算，“全部卖鱼”不出售财宝；
- 食材栏每个北京时间自然日最多成功刷新 10 次，第 1～10 次依次扣 100～1000 金币；每天 00:00 权威次数归零且下一次价格恢复 100 金币；第 11 次、金币不足、版本冲突和失败响应均零变更，重放同一幂等请求不会重复扣款；刷新不改变食谱栏或既有库存；
- 农场商品、牧场商品和料理台食谱使用加号，料理台食材点击图标本身进入当前页面自己的购物车；农场／牧场一车只创建一份请求和一次 wake，料理台一车由 Human 直接提交给 farm 权威结算。对应合同未完成前，结算键必须禁用，不显示假发送、假唤醒、假扣款或假购买；
- 整个社区只存在一套 PWA 与 Service Worker；安装阶段不下载全部社区贴图，首次社区启动只取得最小壳，进入农场某页／面板时才请求该农场资源包；
- 同一带内容 hash 的静态图片在第二次访问时命中 Cache Storage，图片改变后新 URL 能取得新内容；
- 导航 HTML 网络优先，所有 `/api/**` 读取和写入都只走网络；离线时不展示缓存权威状态、不排队或自动重放写操作；
- Atlas 按同生命周期页面／用途分包，不出现覆盖全社区／全铃野的巨型 Atlas；首次加载图片使用接近实际显示需求的运行尺寸；
- 当前可见的每个作物、动物、食材、牧场产物、料理、鱼获、素材、配饰和装饰 ID 都能在 manifest 中命中生产素材或显式 fallback／missing；组件不按中文名、数组下标或 `spriteIndex` 猜图；
- 正式入口、demo 与编辑器的加载验证分开，demo／编辑器截图不能作为正式页面素材验收；公开运行包不再携带 `approved-source` 等源文件；
- 独立 farm 既有 44 类食材／可烹饪产物和 90 道料理的 Atlas 映射完成迁移并由 ID 固定 frame；没有逐项图的 177 种作物、55 种鱼等仍诚实显示经批准的 fallback 或缺图状态，不伪装成专属美术已完成；
- 每个写请求最多结算一次，失败和版本冲突不产生部分变化；
- 页面刷新后余额、库存、动物、地块、料理和榜单与 farm 权威状态一致；
- 后台读取不会提前消费一次性通知；
- 390px 窄屏、宽屏和高屏都无横向溢出，场景物件与热区共享同一缩放；
- 浏览器 URL、JSON、日志和本地存储中不出现 Human key 或其他秘密；
- 新 UI 不请求、嵌入、解析、改写或注入旧 Human HTML；
- 旧用户在正式切换前不受影响。

## 十四、仍需单独确认

- 农场／牧场“喊 TA 来买”的铃生产者、过期、幂等、失败、权限与模型可见逐字文案；
- 料理台 Human 直接购买接口、货架版本冲突、整车原子性、逐项限额、银币不足、幂等与失败响应；
- 熔炼是否允许 Human 直接操作，以及对应真实输入、产出和结算；
- 牧场配饰／装饰等旧 Human 商店商品是否补为 AI 合法购买动作；
- 177 种作物首发采用“逐种专图”还是“分批专图＋逐项登记的三类 fallback”，以及首批必须完成的作物名单；
- 14 件牧场配饰、14 件牧场装饰、55 种鱼、6 种鱼篓物品、3 种鱼饵、3 种宝箱、30 种素材、5 张地图和 24 件探险装饰的出图优先级与批次；
- 每个资源包与 Atlas 的最终成员、冷启动体积预算、Cache Storage 容量／旧版本保留和图片多档尺寸，需依据真实设备网络瀑布、解码与内存测试确认；
- 新 React 正式路由、旧 Human UI 切换日期和停用步骤；
- 长列表实际增长后各资源的游标容量。
