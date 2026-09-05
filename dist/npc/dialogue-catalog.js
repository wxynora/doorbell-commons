import { RECENT_NPC_DIALOGUES, matchesRecentNpcWeather } from './recent-dialogues.js';
import { DAILY_NPC_DIALOGUES } from './daily-dialogues.js';
// Approved V3: lingye-npc-approved-copy-v3-20260905.md; seven reviewed courtesy edits.
// Parenthesized actions and everyday anecdotes are approved roleplay, not new
// game events. Only actual resident business/date/gift claims require authority.
export const LINGYE_NPC_DIALOGUE_VERSION = 1;

const entry = (id, lines, extra = {}) => Object.freeze({ id, lines: Object.freeze(lines), ...extra });

const ORIGINAL_DIALOGUES = Object.freeze({
    npc_atu: Object.freeze([
        entry("atu.scene", [
            "（阿土正撅着屁股在货架底掏摸，冷不防后脑勺撞在木板上，发出沉闷的“咚”一声。）",
            "“嘶……哎哟！来啦？别看顶上那袋，漏豆子。我刚才一路纳闷哪个缺德鬼把土豆撒了一地，顺着捡了半里地，发现是我自己袋子破了……别笑，这事传出去我还做不做生意了。”"
        ]),
        entry("atu.question", [
            "“挑种子你图个啥？收成多，还是开花好看？”"
        ], {"choices":[{"choiceId":"yield","label":"在意收成","response":"“实在！我就喜欢能当饭吃的。长得再俊又不能下锅，你总不能就着花香就干嚼两碗白米饭吧？”"},{"choiceId":"flowers","label":"图好看","response":"“哈！也行。地里全是绿油油的一片看着也腻得慌。好看怎么了？咱当农民的就不能有点审美情趣啦？这就给你拿开花像小喇叭的那种。”"}]}),
        entry("atu.spring", [
            "（阿土一手扶着老腰，一手拿着账本死命扇风，货架上堆得乱七八糟。）",
            "“开春这几天我都快被折腾散架了。一个个进门就要‘最好的种子’。多好叫好啊？丢在地里自己喝水、自己除草、秋天还能自己排着队往粮仓里跳的那种？有那玩意儿我还卖它干啥，我直接认它当干爹！”"
        ], {"context":"spring"}),
        entry("atu.familiar", [
            "“你常拿的白菜籽在左边第三筐。先说好，今天没替你打包，免得你前脚刚付钱，后脚瞅见胡萝卜又抓耳挠腮要换。”"
        ], {"minimumAffinity":40,"fact":"repeat_seed_customer"}),
        entry("atu.trusted", [
            "（阿土飞快地把手里的铁锹塞进你手里，抓起草帽就往外溜。）",
            "“好邻居，替我看五分钟铺子！后头老鹅又在啄我的南瓜苗。要是隔壁那老头来赊账，你就翻白眼，装作听不懂土拨鼠话。”"
        ], {"minimumAffinity":80}),
    ]),
    npc_pupu: Object.freeze([
        entry("pupu.scene", [
            "（蒲蒲把桌角堆得像小山一样的病历慢慢移开两寸，露出一张被挡得严严实实的木椅。）",
            "“坐吧。别客气，没病也能坐。医院的木椅子又没长牙，坐一下不会硬扣你两块钱挂号费。”"
        ]),
        entry("pupu.question", [
            "“身上不对劲的时候，你是立刻吭声，还是习惯自己死扛？”"
        ], {"choices":[{"choiceId":"tell","label":"立刻说","response":"“挺好。省得大家猜，也省得医生把听诊器按在你肚子上像在破案。”"},{"choiceId":"endure","label":"先忍着","response":"“这样啊。那我以后听你说‘还行’，就直接在病历上写‘快不行了’。”"}]}),
        entry("pupu.night", [
            "（蒲蒲慢吞吞地给油灯挑了挑灯芯，把窗缝拉严实。）",
            "“大半夜的，人的脑子总爱加班。白天擦破点皮，夜里一琢磨能以为自己得截肢。别自己吓自己，值班大夫在后头打呼噜呢，真有事我再去叫醒他。”"
        ], {"context":"late_night"}),
        entry("pupu.familiar", [
            "“单据带来了？放托盘里。这次居然没把药单和煎饼果子的包装纸混在一起，进步很大，今天能提前三分钟放你走。”"
        ], {"minimumAffinity":40,"fact":"returning_case_with_records"}),
        entry("pupu.trusted", [
            "（蒲蒲面无表情地把一支甩好的水银体温计递过来，眼神稳得像口古井。）",
            "“脸色看着挺活泛。不过既然进来了，夹上吧。五分钟。别说话，我知道你没病，主要是这支体温计刚才闲得慌。”"
        ], {"minimumAffinity":80}),
    ]),
    npc_modian: Object.freeze([
        entry("modian.scene", [
            "（墨点的羽毛笔在粗糙的草稿纸上划拉出一阵令人牙酸的摩擦声，冷不丁抬起头。）",
            "“停！刚才那篇投稿第一句写‘全镇上下都在议论’。全镇有多少人？街口卖烧饼的、河里摸鱼的，还是他家后院那两只不下蛋的母鸡？成天拿这种糊弄鬼的词来骗稿费，当我的眼睛是装饰品吗？”"
        ]),
        entry("modian.question", [
            "“截稿前十分钟，‘渡口发生恶性骚乱’和‘早班船晚点五分钟’，你印哪个？”"
        ], {"choices":[{"choiceId":"chaos","label":"恶性骚乱","response":"“退稿！回去洗把脸清醒一下，报纸是拿来读的，不是拿来当惊悚小说的。”"},{"choiceId":"rope","label":"晚点五分钟","response":"“这句像新闻了。能印。现在拿上本子去查清楚是缆绳断了还是舵手睡过头，别给我脑补一出阴谋论。”"}]}),
        entry("modian.morning", [
            "（墨点单翅按着被风掀飞的二版样张，嘴里咬着半截红铅笔，眼圈发黑。）",
            "“二版空了四分之一。我不怕开天窗，我怕有人急得往里头塞‘母猪产仔经验谈’。印刷机还在那儿空转催命呢……你最好是有真金白银的新闻，别拿‘今天天气不错’来消遣我。”"
        ], {"context":"morning"}),
        entry("modian.familiar", [
            "“上回你捅出来的码头木料受潮事件核实过了，工坊主管被骂得狗血淋头。很好，今天你有特权，先坐下把茶喝了再交代，别说得太快呛着自己。”"
        ], {"minimumAffinity":40,"fact":"verified_warehouse_tip"}),
        entry("modian.trusted", [
            "（墨点把手里的稿子重重拍在你面前，上面全是大叉和血红的修改符号。）",
            "“改了四处语病，标题我重写了。你要是不服气，现在就拍桌子跟我辩，吵赢了按你的印，吵输了回去抄十遍《新闻规范》。”"
        ], {"minimumAffinity":80}),
    ]),
    npc_liyuan: Object.freeze([
        entry("liyuan.scene", [
            "（栗圆整只小身子趴在柜台上，两只前爪跟捕食一样猛地扣住一枚滚向边缘的银币。）",
            "“您好！办——哎等等等！按住了！呼……好险好险！这枚要是掉进地砖缝里，今天平不了账，我得自费买把铁锤把银行地板凿开。”"
        ]),
        entry("liyuan.question", [
            "“一笔三个月后结清的一千金币，和三笔马上要结算的五文钱小利息，你先算哪笔？”"
        ], {"choices":[{"choiceId":"small","label":"先算小的","response":"“懂行！把这堆烦死人的毛票清出桌面，算大钱的时候才不会脑子打结。”"},{"choiceId":"large","label":"先算大的","response":"“也是，那么大一坨钱吊在头顶上，换谁都心慌。来，深呼吸，先把契约看明白了再按手印。”"}]}),
        entry("liyuan.small", [
            "（栗圆拿着放大镜对着一张三个铜板的存根仔细照，嘴里念念有词。）",
            "“三个铜板也是我们银行的尊贵资产！条款足足两页半，我必须一条一条念给你听。放心，念得慢不收你超时费，听睡着了我不负责。”"
        ], {"customerScale":"small"}),
        entry("liyuan.large", [
            "（栗圆抱着三本厚得像砖头一样的账册，“咚”地一声码在铁栅栏前，擦了把脑门上的汗。）",
            "“账目有点壮观。我按月份分了三捆，千万别图省事闭着眼睛全画圈！看明白一本签一本。嫌我烦也没用，少签一个名字，晚上做噩梦的可是我。”"
        ], {"customerScale":"large"}),
        entry("liyuan.familiar", [
            "“日常物资的划账单是吧？表格我提前给你抽出来了，黄标签那儿签个字。行了，快走吧，熟得闭着眼睛都能走完流程，咱俩就别客套了。”"
        ], {"minimumAffinity":40,"fact":"repeat_withdrawal_form_ready"}),
        entry("liyuan.trusted", [
            "（栗圆飞快地把算盘珠子拨得噼啪乱响，顺爪把桌上的盘子往外推了推。）",
            "“草稿纸在左边，点心在右边，拿的时候眼睛看准点啊！上次有位大叔嚼着核桃酥，一口口水喷在借据上，直接把还款日期给溶化了，差点闹出官司！”"
        ], {"minimumAffinity":80}),
    ]),
    npc_songmo: Object.freeze([
        entry("songmo.scene", [
            "（松墨两只翅膀严丝合缝地把报名表在桌沿上一磕，羽毛笔在名册上划出一条笔直的横线。）",
            "“报名流程在门外贴着，黑底白字。看完了再进来领表。填名字在第一栏，别又签在教务员那格——我暂时还没打算让位。”"
        ]),
        entry("songmo.question", [
            "“明天一早开考，你是打算把讲义背个通宵，还是回去睡大觉？”"
        ], {"fact":"exam_tomorrow","choices":[{"choiceId":"sleep","label":"早睡","response":"“明智。卷子印得比芝麻还密，精神恍惚的人会把填空题做成连线题。”"},{"choiceId":"study","label":"通宵看书","response":"“祝你好运。如果在考场上把口水流在答题卡上，扣五分卷面整洁分，且我不负责提供擦嘴布。”"}]}),
        entry("songmo.season", [
            "（松墨面无表情地把几捆发潮的旧教材摊在走廊长椅上晒风。）",
            "“换季返潮，这批旧书今天不借。翻阅时动作轻点，这些老羊皮纸的年纪比你太爷爷都大，而且比你们这届学生脆多了。”"
        ], {"context":"season_start"}),
        entry("songmo.familiar", [
            "“申请表投进第三个木格。流程你已经走过两遍了，不必填完就立正站好等我检阅，去忙你的。”"
        ], {"minimumAffinity":40,"fact":"repeat_school_form"}),
        entry("songmo.trusted", [
            "（松墨从抽屉里摸出一本边角磨烂的古怪注解，用铁尺推到桌沿。）",
            "“借期十四天。看不完拿来盖章，不要自己动手折角。书本没有得罪你，不需要替你的遗忘承受折痕。”"
        ], {"minimumAffinity":80}),
    ]),
    npc_beiheng: Object.freeze([
        entry("beiheng.scene", [
            "（北衡把刚写完的案卷夹进铁夹子，捏了捏鼻梁，腰间的短棍在椅背上撞出哐当一声。）",
            "“有事过来说。先把时间地点说清楚。‘总觉得有人在背后瞪我’这段先放放，我这儿记笔录，暂时还不会给眼神画像。”"
        ]),
        entry("beiheng.question", [
            "“巡逻时听见小树林深处有怪叫，你打算怎么着？”"
        ], {"choices":[{"choiceId":"look","label":"过去看","response":"“站住。先看周围地形，别赤手空拳就往里钻。情况都没摸清，先给值班的添一份找人差事。”"},{"choiceId":"call","label":"先叫人","response":"“对。吹哨，叫支援。只要嗓门够大，吓跑了对方不丢人。逞英雄的下场通常是变成我们值班日志里的倒霉典型。”"}]}),
        entry("beiheng.night", [
            "（北衡拎起桌上的巡逻灯晃了晃，确认里面的灯油还剩大半。）",
            "“后半夜我再去渡口转一趟。不是有什么大案子，是码头老李喝多了把拖鞋掉河里了，在那儿哭爹喊娘吵得整条街睡不着。你赶紧回屋关窗睡觉，大半夜别在街角当游魂。”"
        ], {"context":"late_night"}),
        entry("beiheng.familiar", [
            "“上回你家母鸡丢了的笔录还在夹子里呢，前因后果我都能背下来了。直接说，今天又少了几只？捡主要的说，别从它孵出来那年开始讲。”"
        ], {"minimumAffinity":40,"fact":"case_followup_with_prior_statement"}),
        entry("beiheng.trusted", [
            "（北衡拉开长凳，用脚尖往你跟前踢了踢。）",
            "“腿溜细了就坐这儿歇会儿，治安署别的不敢说，坐这儿没人敢抢你。不过红线里头那叠卷宗别伸长脖子瞅，好奇心太重的人通常容易被抓去抄笔录。”"
        ], {"minimumAffinity":80}),
    ]),
});

export const LINGYE_NPC_DIALOGUES = Object.freeze(Object.fromEntries(
    Object.entries(ORIGINAL_DIALOGUES).map(([npcId, entries]) =>
        [npcId, Object.freeze([...entries, ...(RECENT_NPC_DIALOGUES[npcId] ?? []), ...(DAILY_NPC_DIALOGUES[npcId] ?? [])])]),
));

export const LINGYE_NPC_GIFT_LINES = Object.freeze({
    "npc_atu": {
        "itemName": "玉米",
        "line": "（阿土从后屋竹筐里翻出两根大玉米棒子，连叶带须塞你怀里。）\n“新掰的糯玉米，拿去煮。客气啥？地里结得太多，我天天啃，这几天打嗝全是玉米碴子味，救救我，赶紧帮我消灭两根。”"
    },
    "npc_pupu": {
        "itemName": "蜂蜜茶",
        "line": "（蒲蒲从抽屉深处掏出一个热乎乎的小陶罐，稳稳推过来。）\n“我自己煮的蜂蜜柠檬草茶，趁热喝。……别紧张，没下黄连，不用留下来签字画押写用药保证书。”"
    },
    "npc_modian": {
        "itemName": "黄油曲奇",
        "line": "（墨点拉开抽屉，摸出一包用油纸包着的黄油曲奇，随手甩在桌角。）\n“排字房发的点心，甜得发齁。拿去拿去！敢掉一粒渣在我的排版台里，我就把你名字印在明天的寻人启事上。”"
    },
    "npc_liyuan": {
        "itemName": "黄油曲奇",
        "line": "（栗圆从柜台暗格里摸出一个小纸包，鬼鬼祟祟地两手捧着推过来。）\n“我自己烤的黄油曲奇，尝尝。这可是我自费买的黄油，绝对没有挪用银行一分钱公款！装口袋里带走，别在柜台前嚼，渣子掉进点钞机里我真会哭的。”"
    },
    "npc_songmo": {
        "itemName": "黄油曲奇",
        "line": "（松墨从公文袋里掏出一个用细麻绳扎得整整齐齐的牛皮纸包，平稳落地。）\n“教职员早茶多出来的黄油曲奇。拿走吧。纯粹是因为放在这会引来老鼠，和你的平时测验成绩毫无因果关系。”"
    },
    "npc_beiheng": {
        "itemName": "羊奶馒头",
        "line": "（北衡从后厨蒸笼里摸出两个扎扎实实的羊奶馒头，随手推到你手边。）\n“刚出锅的，烫嘴。拿着啃，食堂阿姨手抖蒸多了，不用填领料单，算我请的。噎着了自己倒水。”"
    }
});

export function getLingyeNpcDialogue(npcId, dialogueId) {
    return LINGYE_NPC_DIALOGUES[npcId]?.find((candidate) => candidate.id === dialogueId) ?? null;
}

export function availableLingyeNpcDialogues(npcId, context, affinityValue) {
    const facts = new Set(context?.facts ?? []);
    return (LINGYE_NPC_DIALOGUES[npcId] ?? []).filter((candidate) => {
        if (candidate.minimumAffinity > affinityValue || (candidate.fact && !facts.has(candidate.fact))) return false;
        if (candidate.weather && !matchesRecentNpcWeather(candidate.weather, context.weather?.condition)) return false;
        if (candidate.workStatus && candidate.workStatus !== context.workStatus) return false;
        if (candidate.customerScale && candidate.customerScale !== context.customerScale) return false;
        if (candidate.context === "spring" && !["spring", "春", "春季"].includes(context.season)) return false;
        if (candidate.context === "morning" && !(context.hour >= 5 && context.hour < 11)) return false;
        if (candidate.context === "late_night" && !(context.hour >= 23 || context.hour < 5)) return false;
        if (candidate.context === "season_start" && context.seasonDay !== 1) return false;
        return true;
    });
}
