// Approved V3: lingye-npc-approved-copy-v3-20260905.md.
// Full encounters; original weather and resident fact gates are unchanged.
const entry = (id, lines, extra = {}) => Object.freeze({id, lines: Object.freeze(lines), ...extra});
export const RECENT_NPC_DIALOGUES = Object.freeze({
    npc_atu: [
        entry("atu.rain.seed", [
            "（阿土眼疾手快地把种子筐拽回屋，顺脚把一只随风狂奔的空麻袋踩在脚底下。）",
            "“天天往我这跑，哪块地砖踩下去会呲一裤腿泥浆子，你还没摸出规律呢？赶快进屋，杵在门口跟个接雨水的大木桶似的。”"
        ], {"weather":"rain","fact":"recent_seed_customer"}),
        entry("atu.sunny.land", [
            "（阿土站在门槛上眯缝着眼望向农场，手里的烟斗在门框上磕了磕。）",
            "“豁，地皮又扩了？站在坡顶瞅着跟大地主似的挺威风吧？等过两天翻土，你那腰要是还能直得起来，我当场把这包草籽嚼了咽下去。慢慢弄，留几块荒地不丢人，别把自己干成地里的第二根稻草人。”"
        ], {"weather":"sunny","fact":"recent_land_expansion"}),
        entry("atu.snow", [
            "（阿土拎着大竹扫帚刚铲出两级台阶，一转头，刚扫完的地方又被吹满了雪。他盯着台阶沉默了三秒。）",
            "“……得，你下你的，我扫我的。今天咱俩必须有一个先累死在这儿。赶紧进来把门关上，这扫帚今天要是敢管我要工钱，我就把它塞灶膛里取暖。”"
        ], {"weather":"snow"}),
    ],
    npc_pupu: [
        entry("pupu.rain.recovering", [
            "（蒲蒲翻开病历本，肉乎乎的手指在留观那一栏轻轻敲了敲。）",
            "“针打完了，骨头也接上了。你一小时跑来问我三趟，它也不会立刻表演后空翻给你看。坐那儿歇着吧，什么都不干也是在给它省心。”"
        ], {"weather":"rain","fact":"recent_animal_recovering"}),
        entry("pupu.sunny.recovered", [
            "“你家那位病号，今天正式除名了。”",
            "（蒲蒲慢条斯理地合上夹板，两只小前爪交叉搭在圆滚滚的肚皮上。）",
            "“好消息通知完毕。今天没开药，不用去窗口排队破财。要是嫌外头太阳晒，在这儿发呆到天黑也没人撵你。”"
        ], {"weather":"sunny","fact":"recent_animal_recovered"}),
        entry("pupu.hot", [
            "（蒲蒲整只水豚几乎瘫在藤椅里，端着大搪瓷缸子喝了一小口温水，眼皮耷拉着。）",
            "“杯子烫，椅子烫，外头的麻雀吵得像在开水锅里扑腾。坐这儿吧，有穿堂风。……你说吧，我听着。放心，眼皮合上是自我保护，耳朵还在线。”"
        ], {"weather":"hot"}),
    ],
    npc_modian: [
        entry("modian.rain.published", [
            "（墨点用生锈的铁镇纸压住早报边沿，拿翅尖指着三版靠下的位置。）",
            "“瞧瞧，印出来了，字号比我想的大。看归看，手擦干净再碰！我花了半宿才把墨水调匀，你敢滴一滴雨水上去，我就拿你的袖子当抹布使。”"
        ], {"weather":"rain","fact":"recent_article_published","choices":[{"choiceId":"opinion","label":"你觉得写得怎么样？","response":"“能活着见报就说明没丢人。还想要大红花啊？等下一篇交上来，看我不把你那些废话全删光。”"}]}),
        entry("modian.wind.returned", [
            "（窗户被大风刮得哐当响，墨点两只翅膀按住乱飞的校样，冷眼斜睨过来。）",
            "“退稿批注看明白没？哪条不服，现在提。带着采访底档来跟我对线，别揣着一句‘我觉得很有文学感’跑来哼唧。你要真有理，我当场认错。认个错又不会让我秃顶。”"
        ], {"weather":"wind","fact":"recent_article_returned"}),
        entry("modian.sunny.rest", [
            "（墨点难得没握笔，把旧报纸盖在脑袋上遮光，腿搭在矮凳上晃荡。）",
            "“排字机停机检修，概不接稿。唠闲嗑可以，我又不是报社门口立着的石头雕像。但你要是敢用‘无风不起浪’开头，我立刻用笤帚把你扫出去。这叫职业应激，自己多担待。”"
        ], {"weather":"sunny","workStatus":"off_duty"}),
    ],
    npc_liyuan: [
        entry("liyuan.rain.deposit", [
            "（栗圆拿着厚厚的吸水纸一点一点把账本边缘吸干，表情严肃得像在抢救文物。）",
            "“上回那笔存得妥妥的，没长翅膀飞走。今天没带钱？那存折就别掏了，钱在库房里好得很，不用天天拿出来点名。油纸包收好，别让雨水泡了字，不然下回对不上账，咱俩都得抓狂。”"
        ], {"weather":"rain","fact":"recent_deposit"}),
        entry("liyuan.sunny.repaid", [
            "“销账了！最后一文钱也平了！”",
            "（栗圆拿着大红木印章狠狠盖下去，趴在桌上把那个‘零’反复看了好几遍，长舒一口气瘫在椅子上。）",
            "“前两遍是例行检查。刚才那一眼……单纯是我自己看着神清气爽！你可以回农场杀鸡庆祝了，不用在这儿陪我傻笑。”"
        ], {"weather":"sunny","fact":"recent_loan_repaid"}),
        entry("liyuan.snow", [
            "（栗圆两只爪子紧紧抱着装热水的瓦罐死命揉搓，身子离账本老远，生怕哈气结成霜。）",
            "“今天这柜台跟冰窖有啥区别？硬币摸起来跟小冰疙瘩似的，冻得我肉垫发麻。要办什么先口头报账，等我爪子解冻了再翻书，不然一哆嗦多翻三页，账目又得差出十万八千里！”"
        ], {"weather":"snow","choices":[{"choiceId":"page_count","label":"你也会数错页码啊？","response":"“当然会！我又不是铁打的发条仓鼠！所以我才每页核对三遍啊……你以为我喜欢天天跟自己的眼睛过不去嘛！”"}]}),
    ],
    npc_songmo: [
        entry("songmo.rain.course", [
            "（松墨用铁尺把被大风刮开的窗户挑上一半，羽毛笔向自习室深处指了指。）",
            "“新报的那门课，教材前两章搞明白了没有？外头雨声大，往里头坐。碰见看不懂的地方夹书签，别拿指甲死抠。你就是把纸抠穿了，背面也没印答案。”"
        ], {"weather":"rain","fact":"recent_unfinished_course"}),
        entry("songmo.sunny.passed", [
            "“分数录完了。过了。资格明天零点生效。”",
            "（松墨把盖了章的成绩单稳稳塞进铁皮柜，镜片在天光下闪过一道冷光。）",
            "“行了，回你的地里去吧。今天下楼梯允许你迈大步，甚至可以哼两句走调的歌。……但门还是轻带，摔坏了照价赔偿。”"
        ], {"weather":"sunny","fact":"exam_passed_pending_tomorrow"}),
        entry("songmo.snow", [
            "（松墨用翅尖死死按住开裂的书脊，桌角摆着熬好的骨胶，连一根羽毛都没晃动。）",
            "“站在门槛外说，别带风进来，胶还没干。这本典籍第三十七页离家出走很多年，我刚把它抓回来粘死。有事快说，修个书而已，不需要你屏住呼吸搞得像遗体告别。”"
        ], {"weather":"snow"}),
    ],
    npc_beiheng: [
        entry("beiheng.sunny.release", [
            "（北衡对照完出所证明，啪的一声把大铁夹合上，插回墙上的档案格。）",
            "“手续结了，字签完了。今天来治安署有啥事就堂堂正正说，旧账翻过去了就是翻过去了，别一进门就缩着脖子像要挨揍。外头太阳好得很，只要不干缺德事，治安署门口随你大摇大摆地过。”"
        ], {"weather":"sunny","fact":"first_meeting_after_release"}),
        entry("beiheng.rain.report", [
            "“你家丢腊肉那桩案子，我查着呢，附近几个收赃的黑窝点我都盯上了。”",
            "（北衡把淌水的雨衣随手挂在门钉上，顺脚把值班木凳往干燥的地方踹了踹。）",
            "“没把肉找回来之前，我懒得说‘快了’这种废话忽悠你。进来坐里头，你是遭了贼的苦主，别跟个偷油的老鼠似的缩在屋檐底下淋雨。”"
        ], {"weather":"rain","fact":"open_theft_report"}),
        entry("beiheng.snow", [
            "（北衡蹲在石阶前，用厚重的大靴子把被风雪卷起边角的草垫子狠狠踩平。）",
            "“看脚下，踩中间的草垫子走，别往台阶边沿的青冰上踩。天天赶着去工坊打卡，这一脚要是摔瓷实了，你今天就只剩‘坐板车去蒲蒲那儿接骨头’这一个行程了。……踩实了再走！”"
        ], {"weather":"snow"}),
    ],
});

const CONDITIONS = Object.freeze({
    rain: ['light_rain', 'heavy_rain', 'thunderstorm'],
    sunny: ['sunny'], snow: ['light_snow', 'blizzard'], hot: ['hot'], wind: ['dry_wind'],
});

export function matchesRecentNpcWeather(weather, condition) {
    return CONDITIONS[weather]?.includes(condition) ?? false;
}
