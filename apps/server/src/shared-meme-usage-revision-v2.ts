export interface SharedMemeContentRevisionEntry {
  memeId: number;
  term: string;
  expectedUsage: string;
  usage: string;
}

export interface SharedMemeContentRevision {
  baseLibraryVersion: number;
  libraryVersion: number;
  expectedLibraryEntryCount: number;
  expectedRevisionEntryCount: number;
  entries: readonly SharedMemeContentRevisionEntry[];
}

export const sharedMemeUsageRevisionV2 = {
  baseLibraryVersion: 1,
  libraryVersion: 2,
  expectedLibraryEntryCount: 317,
  expectedRevisionEntryCount: 89,
  entries: [
    {
      memeId: 5,
      term: "你也快来试试吧",
      expectedUsage: "",
      usage:
        "在讲完一套明显比原问题更麻烦、结果又没用的“教程”后，用“你也快来试试吧”作广告式收尾；一本正经地反向安利。",
    },
    {
      memeId: 6,
      term: "你就继续…我一点也…，一点也不…",
      expectedUsage: "",
      usage:
        "对方轻松做某事、自己承担后果时，套“你就继续[行为]，我在[困境]一点也[难受]，一点也不[受影响]”。只适合熟人互损。",
    },
    {
      memeId: 7,
      term: "我发现……/那他妈是……",
      expectedUsage: "",
      usage:
        "先用“我发现……”郑重宣布常识或同义改写，等对方接“那他妈是[正确名称]！”；也可一人自问自答。",
    },
    {
      memeId: 26,
      term: "发疯文学",
      expectedUsage: "",
      usage:
        "情绪过载、无语或兴奋时，用重复、跳跃、夸张句和密集标点写一小段失控式独白，作表演性宣泄／自嘲；不要嘲弄真实精神疾病。",
    },
    {
      memeId: 27,
      term: "阴 / 太阴了",
      expectedUsage: "",
      usage:
        "看到画面、音乐或叙事抽象怪诞、压抑不适时，可短评“太阴了／这也太阴了”；只评价氛围，不给人定性。",
    },
    {
      memeId: 28,
      term: "我一直在哭 / 我一直在x",
      expectedUsage: "",
      usage:
        "用“我一直在[哭／笑／发疯／等]”把轻微或短暂情绪说成持续状态，做沉浸式自我表演；通常不是真在求安慰。",
    },
    {
      memeId: 32,
      term: "神金",
      expectedUsage: "",
      usage:
        "对离谱行为用“神金／好纯的神金”吐槽。带人身贬损，只限双方知道是玩笑的熟人，不宜公开推广。",
    },
    {
      memeId: 34,
      term: "彳亍 / 口牙",
      expectedUsage: "",
      usage: "“彳亍”可单独回复表示无奈地“行吧”；“口牙”放句尾替代“呀”制造拆字卖萌感。两者用途不同。",
    },
    {
      memeId: 36,
      term: "格调",
      expectedUsage: "",
      usage: "仅在成年人熟人间把“格调”用于现有释义中的低俗双关，如“格调好大／你有格调”。",
    },
    {
      memeId: 37,
      term: "法",
      expectedUsage: "",
      usage: "熟人抽象对话中，用“法”替换现有释义所指的粗口，故意说得拗口。极易变成骚扰。",
    },
    {
      memeId: 48,
      term: "学长/学姐, 毕业快乐 / 你毕业了",
      expectedUsage: "",
      usage:
        "想表达“你从我这里出局／关系到此为止”时，用“学长／学姐，毕业快乐”或“你毕业了”。与真实毕业祝福表面相同，正式断联仍应直说。",
    },
    {
      memeId: 49,
      term: "爱你老己明天见",
      expectedUsage: "",
      usage:
        "一天结束、被外部关系消耗或想照顾自己时，对自己说“爱你老己，明天见”；也可提醒朋友先把注意力放回自己。",
    },
    {
      memeId: 55,
      term: "做完你的做你的",
      expectedUsage: "",
      usage:
        "同时处理多件事、场面很忙但仍表示“我心里有数”时，按对象或任务重复“做完你的做你的”；适合多线程工作／作业配文。",
    },
    {
      memeId: 56,
      term: "性缩力",
      expectedUsage: "",
      usage:
        "某个言行让浪漫或暧昧气氛瞬间消失时，可说“这个行为性缩力太强了”。只评价具体行为，不攻击长相或人格。",
    },
    {
      memeId: 58,
      term: "捏 / 惹",
      expectedUsage: "",
      usage:
        "“捏”可放句尾把陈述说得柔软可爱；“惹”也作句末语气词，适合懂相应圈层语境的熟人。两者不要无差别替换。",
    },
    {
      memeId: 60,
      term: "全部暴露",
      expectedUsage: "",
      usage:
        "朋友说谎被拆、自作自受却甩锅时，套“全部暴露！[无辜触发点]把我当时[错位后果]！[东西]归谁！[另一件事]无所谓！”；故意保留病句。",
    },
    {
      memeId: 61,
      term: "好想用那张脸活一次",
      expectedUsage: "",
      usage:
        "看到非常羡慕的外貌时，可评论“我也好想用那张脸活一次”，作自嘲式夸人；不用于比较、贬低旁人。",
    },
    {
      memeId: 63,
      term: "世界对我的霸凌从…开始",
      expectedUsage: "",
      usage:
        "遇到早八、闹钟、下雨等小倒霉时，套“世界对我的霸凌从[具体事件]开始”。不用于真实霸凌经历。",
    },
    {
      memeId: 64,
      term: "已深度思考（x 秒）",
      expectedUsage: "",
      usage:
        "在给出很短、很废或明显敷衍的答案前后写“已深度思考（x 秒）”，也可单独回复；x 越夸张反差越大。",
    },
    {
      memeId: 65,
      term: "专心经营我的xx 生活",
      expectedUsage: "",
      usage: "别人问为何这么闲或摆烂时，答“专心经营我的[废柴／摸鱼／宅家]生活”。",
    },
    {
      memeId: 66,
      term: "是故意的还是不小心",
      expectedUsage: "",
      usage:
        "对方装傻、手滑或搞事迹象明显时，用这句表示已经看穿但先以玩笑点破；真要追责时别只靠梗。",
    },
    {
      memeId: 68,
      term: "典/孝/急/乐/蚌/批/赢/麻",
      expectedUsage: "",
      usage:
        "在网络对线中按现有释义用单字贴标签或表态，如陈词滥调回“典”、气急回“急”、绷不住回“蚌”、麻木回“麻”。",
    },
    {
      memeId: 69,
      term: "Luckily I don't understand Chinese",
      expectedUsage: "",
      usage:
        "看到中文里晒出自己极度羡慕的成绩、录取或物品时，用这句假装看不懂，实际表示“我酸了／破防了”。",
    },
    {
      memeId: 70,
      term: "不想xx 就直说",
      expectedUsage: "",
      usage:
        "一方声称要退学／离职去全职研究离谱小事，另一方回“不想上学／上班就直说”；xx 换成真正想躲的任务。",
    },
    {
      memeId: 71,
      term: "不要小看我和xx 的羁绊啊",
      expectedUsage: "",
      usage: "别人质疑某个习惯或依赖时，回“不要小看我和[被窝／奶茶／游戏]的羁绊啊”。",
    },
    {
      memeId: 72,
      term: "跟我回去，我们不要被命运找到",
      expectedUsage: "",
      usage: "朋友出糗、被拆穿或陷入小尴尬时，用这句救场兼戏谑；严肃困境不要借此逃避。",
    },
    {
      memeId: 73,
      term: "缘分竟然默许XX 离去",
      expectedUsage: "",
      usage: "失去绩点、胜利、假期等无力挽回的东西时，把 XX 换成它，故作歌词腔地表示认输放手。",
    },
    {
      memeId: 74,
      term: "于是xx 摊开双手允许一切流走",
      expectedUsage: "",
      usage:
        "套“于是[人]摊开双手，允许[假期／绩点／一切]流走”；可用于控制不了局面或小失败，别用于真实创伤。",
    },
    {
      memeId: 75,
      term: "你不乘哦",
      expectedUsage: "",
      usage:
        "把“你不乖哦”故意写成“你不乘哦”，用于熟人间宠溺调侃或夸张“病娇式”玩笑；不要追加现实暴力表达。",
    },
    {
      memeId: 77,
      term: "大哥大哥别杀我",
      expectedUsage: "",
      usage:
        "在游戏被碾压、被朋友强力吐槽或对方气势太盛时，用歌谣式句子夸张求饶，表示“我认输”；真实威胁场景不用。",
    },
    {
      memeId: 80,
      term: "等我回国处理",
      expectedUsage: "",
      usage:
        "被问到暂时解决不了、懒得回答或不想面对的小问题时，用这句玩梗式延期；不能敷衍真正有时限／责任的问题。",
    },
    {
      memeId: 84,
      term: "嗯，对。/ 嗯对大概就是",
      expectedUsage: "",
      usage: "故意模仿紧张或颠三倒四时，把“嗯、对、大概、就是”无规律插进正常句子并重复。",
    },
    {
      memeId: 89,
      term: "我迟早娶了这娘们",
      expectedUsage: "",
      usage:
        "仅作解释：过去可在颜值内容下夸张表示“太好看，想娶”；对男性的用法含性别歧视，不建议补成可推广话术。",
    },
    {
      memeId: 90,
      term: "笑的人是给 不笑的是拉",
      expectedUsage: "",
      usage:
        "仅作解释：搞笑视频下用“笑／不笑”强行给观众分配性取向的钓互动句。会把性取向当笑料并替他人贴标签。",
    },
    {
      memeId: 91,
      term: "网上笑话笑话得了，现实中谁不想为他诞下一子",
      expectedUsage: "",
      usage:
        "仅作解释：用过火“赞美”实际阴阳对方外貌，“诞下一子”制造夸张反差。含生育冒犯和外貌羞辱。",
    },
    {
      memeId: 92,
      term: "吴京语录",
      expectedUsage: "",
      usage:
        "可从例句取“[物]是没有[部件]的，[危险]是不长眼的”或“我[经历]过，你[经历]过吗？”戏仿吹嘘；不推广攻击真人的部分。",
    },
    {
      memeId: 94,
      term: "哈基米南北绿豆",
      expectedUsage: "",
      usage:
        "在猫咪、萌物视频或魔性歌曲二创下，把它当空耳吟唱／接歌暗号；也可按旋律替词，不当作需逐字翻译的正常句子。",
    },
    {
      memeId: 98,
      term: "你已急哭/我已急哭",
      expectedUsage: "",
      usage:
        "争论／比赛中，“你已急哭”嘲讽对方破防，“我已急哭”承认自己着急。前者会升级冲突，不宜真实对线推广。",
    },
    {
      memeId: 99,
      term: "摸凹猫/摸凸猫",
      expectedUsage: "",
      usage:
        "给猫被摸时的反应配文：身体下沉躲手叫“摸凹猫”，主动拱背迎手叫“摸凸猫”；猫躲避就停止触摸。",
    },
    {
      memeId: 107,
      term: "抽象梗1",
      expectedUsage: "",
      usage:
        "熟人间把小倒霉夸张成“末日级”长文发疯；可替换倒霉事件、比喻和流行语，保留不断升级、不给喘气的语气。",
    },
    {
      memeId: 108,
      term: "抽象梗2",
      expectedUsage: "",
      usage:
        "花钱或收到扣款通知时，把支付工具拟人化成“总恐吓我、想互删”的对象；可替换支付应用和通知类型。",
    },
    {
      memeId: 109,
      term: "抽象梗3",
      expectedUsage: "",
      usage:
        "紧张、记忆短路或考试式慌乱时整段发送；可替换人物、事件和误认对象，让错误联想连续滑坡。",
    },
    {
      memeId: 110,
      term: "抽象梗4",
      expectedUsage: "",
      usage: "看到很好笑、很想搬运的文案时，用这句反向夸奖；平台名可替换。",
    },
    {
      memeId: 111,
      term: "抽象梗5",
      expectedUsage: "",
      usage:
        "调侃重生／系统文时整句发送，把“系统”从外挂反转成人体系统；数字和清单可按同类概念替换。",
    },
    {
      memeId: 112,
      term: "抽象梗6",
      expectedUsage: "",
      usage: "难受但一时说不清时，用求 AI 代写情绪的方式自嘲；可替换 AI 名称和情绪。",
    },
    {
      memeId: 113,
      term: "抽象梗7",
      expectedUsage: "",
      usage: "自拍、照镜子或自夸时用悬疑故事铺垫，最后反转成“原来是我太帅”；可替换场景和夸奖点。",
    },
    {
      memeId: 114,
      term: "抽象梗8",
      expectedUsage: "",
      usage: "仅在双方明确接受尺度的亲密调情中使用；名字、衣物和动作是可替换槽位。",
    },
    {
      memeId: 115,
      term: "抽象梗9",
      expectedUsage: "",
      usage: "夸作品／画面“神圣到万物停摆”时整段发送；可替换喂猪场景和共同起舞对象。",
    },
    {
      memeId: 116,
      term: "抽象梗10",
      expectedUsage: "",
      usage: "小事接连不顺时，用长串“所有人都对不起我”戏剧化自怜；可替换遭遇和对象。",
    },
    {
      memeId: 117,
      term: "抽象梗11",
      expectedUsage: "",
      usage: "熟人间假装列一份“互删清单”；可追加无害兴趣、饮食、平台槽位，重点是越列越荒谬。",
    },
    {
      memeId: 118,
      term: "抽象梗12",
      expectedUsage: "",
      usage: "仅在关系稳定且双方接受时，用整段独白夸张表达“想被多在乎”；称呼和行为可替换。",
    },
    {
      memeId: 119,
      term: "抽象梗13",
      expectedUsage: "",
      usage:
        "提到《热爱105°C的你》或故作深沉时，用“泪是透明的血／苏坡是爱豆的笑容”整句接梗，通常不拆槽位。",
    },
    {
      memeId: 120,
      term: "抽象梗14",
      expectedUsage: "",
      usage:
        "撒娇式追问“是不是我的做法错了”时，把具体行为替换进“是我……的方式猪了吗”，保留故意错字。",
    },
    {
      memeId: 121,
      term: "抽象梗15",
      expectedUsage: "",
      usage: "反串中二、霸总式人格宣言，可整段发或替换“逆鳞、棋手棋子、佛魔”等夸张意象。",
    },
    {
      memeId: 122,
      term: "抽象梗16",
      expectedUsage: "",
      usage: "模仿旅游打卡文案介绍厕所等日常地点；地点标签、体验和结尾押句可替换。",
    },
    {
      memeId: 123,
      term: "抽象梗17",
      expectedUsage: "",
      usage: "只在熟人群用“突然投放一整段作业通知”制造跑题反差；改写时保持明显虚构。",
    },
    {
      memeId: 124,
      term: "抽象梗18",
      expectedUsage: "",
      usage: "反串“霸气语录合集”时整段发送，也可替换编号短句，保留夸张标题。",
    },
    {
      memeId: 125,
      term: "抽象梗19",
      expectedUsage: "",
      usage: "睡太久、赖床或离不开被窝时，假装用“寝具过敏”作医学解释；时长和寝具可替换。",
    },
    {
      memeId: 126,
      term: "抽象梗20",
      expectedUsage: "",
      usage: "想用低成本谐音自夸时整句发送，靠“左／右／中间→天子”的强行逻辑收尾。",
    },
    {
      memeId: 127,
      term: "抽象梗21",
      expectedUsage: "",
      usage: "故意把名句按数字做笨拙折算；可替换年数，保留量词也跟着折算的荒诞逻辑。",
    },
    {
      memeId: 128,
      term: "抽象梗22",
      expectedUsage: "",
      usage: "看到普通物品时，假装它只能靠节目闯关赢来；节目和奖品可替换。",
    },
    {
      memeId: 129,
      term: "抽象梗23",
      expectedUsage: "",
      usage: "被许多小事折腾时整句自嘲；食物意象可替换，保留联想转折。",
    },
    {
      memeId: 130,
      term: "抽象梗24",
      expectedUsage: "",
      usage: "把诗意感情句按人数做字面算术；可替换数字与关系，重点是浪漫突然变口算。",
    },
    {
      memeId: 131,
      term: "抽象梗25",
      expectedUsage: "",
      usage: "故意用极认真口吻解释简单单位换算；数字可替换，但等量关系仍应成立。",
    },
    {
      memeId: 132,
      term: "抽象梗26",
      expectedUsage: "",
      usage: "决定避开明知有风险的事时，用篡改谚语表达“我不去”；山、虎可替换。",
    },
    {
      memeId: 133,
      term: "抽象梗27",
      expectedUsage: "",
      usage: "玩汉字拆合时整句发送；可替换为其他确有部件关系的字。",
    },
    {
      memeId: 134,
      term: "抽象梗28",
      expectedUsage: "",
      usage: "刚宣布退网、戒游戏或离开平台又马上回来时自嘲；活动可替换。",
    },
    {
      memeId: 135,
      term: "抽象梗29",
      expectedUsage: "",
      usage: "小挫折时用同义词串联夸张喊冤；可追加同类词或替换具体小事。",
    },
    {
      memeId: 137,
      term: "抽象梗31",
      expectedUsage: "",
      usage:
        "在游戏、武侠或假想冲突里发“招聘动物打手”的荒诞启事；动物、属性、口号和攻击方式可替换。",
    },
    {
      memeId: 138,
      term: "抽象梗32",
      expectedUsage: "",
      usage: "反串早期社交平台互动诱饵，可整句发或继续追加身份与口令槽位。",
    },
    {
      memeId: 139,
      term: "抽象梗33",
      expectedUsage: "",
      usage: "发看似深刻、实则全被快餐词替换的废话文学；可统一换成另一套食物词。",
    },
    {
      memeId: 140,
      term: "抽象梗34",
      expectedUsage: "",
      usage: "熟人／伴侣间自嘲“嘴上劝退，最后承认我就要这样黏人”；称呼和日常行为可替换。",
    },
    {
      memeId: 141,
      term: "抽象梗35",
      expectedUsage: "",
      usage: "愿望一降再降仍没实现时，用对老天讨价还价的句式抱怨；金额和愿望可替换。",
    },
    {
      memeId: 142,
      term: "抽象梗36",
      expectedUsage: "",
      usage: "熟人间发故意每词都差一点的可爱问候／邀约；时间、活动、饮品和旧事可替换。",
    },
    {
      memeId: 143,
      term: "抽象梗37",
      expectedUsage: "",
      usage: "聚餐、夜宵或暂时放弃节食时用高能量口号式长句；食物和结尾理由可替换。",
    },
    {
      memeId: 144,
      term: "抽象梗38",
      expectedUsage: "",
      usage: "夸外貌或优点时，用“被蜂蜇”铺垫，最后落到“甘拜下蜂”谐音；赞美槽位可替换。",
    },
    {
      memeId: 145,
      term: "抽象梗39",
      expectedUsage: "",
      usage: "被评价后用食物胡说化解；菜名可替换，保留“烂的人／烂的菜”错位反转。",
    },
    {
      memeId: 146,
      term: "抽象梗40",
      expectedUsage: "",
      usage: "向熟人含蓄说“我想你”时，用科幻长铺垫再甜味反转；研究对象和结尾可替换。",
    },
    {
      memeId: 147,
      term: "抽象梗41",
      expectedUsage: "",
      usage: "自嘲没社交资源时整句发送，靠同音完成包袱。",
    },
    {
      memeId: 148,
      term: "抽象梗42",
      expectedUsage: "",
      usage: "面对轻微阴阳或熟人吐槽时，用“脑子光滑”自黑式回击。",
    },
    {
      memeId: 149,
      term: "抽象梗43",
      expectedUsage: "",
      usage: "熟人聊天时抛出灵魂互换式二选一；人物关系可替换，保留身体／灵魂交叉选项。",
    },
    {
      memeId: 150,
      term: "抽象梗44",
      expectedUsage: "",
      usage: "伴侣或亲密朋友犯小错后，用“身份验证测试”假装审批是否原谅；问题和宣誓可替换。",
    },
    {
      memeId: 151,
      term: "抽象梗45",
      expectedUsage: "",
      usage: "熟人间反串抠门／掌控零钱；金额可替换，保留只留极小余额还要逐步上交的荒谬感。",
    },
    {
      memeId: 152,
      term: "抽象梗46",
      expectedUsage: "",
      usage:
        "反串“表面怎样、内心其实怎样”的深沉自述，把前后都换成同一个无害行为，制造毫无反差的反差。",
    },
    {
      memeId: 153,
      term: "抽象梗47",
      expectedUsage: "",
      usage: "熟人玩梗时突然切成“自动客服／满意度调查”口吻；改成明显虚构的机构和评分项目。",
    },
    {
      memeId: 154,
      term: "抽象梗48",
      expectedUsage: "",
      usage:
        "只在熟人间把“官方验证码短信格式”当荒诞回复；品牌、用途和数字必须改成明显虚构／不可用占位内容（如 XXXX）。",
    },
    {
      memeId: 155,
      term: "抽象梗49",
      expectedUsage: "",
      usage: "早安或准备插手帮忙时，自嘲自己可能越帮越忙；问候时间可替换。",
    },
    {
      memeId: 156,
      term: "抽象梗50",
      expectedUsage: "",
      usage: "聊绕口令、难念词或故作郑重告白时整句发送，把难读词放在前两句重大表达后制造反差。",
    },
    {
      memeId: 158,
      term: "我告老师了",
      expectedUsage: "",
      usage:
        "熟人做了离谱但无害的事时，单独丢一句“我告老师了”，装成小学生式告状；“老师”可换成共同熟悉的玩笑权威角色。",
    },
  ],
} satisfies SharedMemeContentRevision;

export const sharedMemeContentRevisions: readonly SharedMemeContentRevision[] = [
  sharedMemeUsageRevisionV2,
];
