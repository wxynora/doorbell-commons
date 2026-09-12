"""CC BY 4.0 rules data adapted from 29-Cu/bisca monopoly defaults."""

from __future__ import annotations

from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "start_cash": 15_000,
    "salary": 2_000,
    "bail": 500,
    "luxury_tax": 1_000,
    "max_houses": 5,
    "jail_max_turns": 3,
    "rail_rents": [250, 500, 1_000, 2_000],
    "util_multipliers": [40, 100],
    "jail_cell": None,
}


DEFAULT_BOARD: list[dict[str, Any]] = [
    {"idx": 0, "type": "go", "name": "起点·出发", "short_name": "起点"},
    {"idx": 1, "type": "prop", "name": "北京·南锣鼓巷", "short_name": "南锣", "group": "g1", "price": 600, "rents": [20, 100, 300, 900, 1600, 2500], "house_cost": 500},
    {"idx": 2, "type": "community", "name": "命运", "short_name": "命运"},
    {"idx": 3, "type": "prop", "name": "天津·五大道", "short_name": "五道", "group": "g1", "price": 600, "rents": [40, 200, 600, 1800, 3200, 4500], "house_cost": 500},
    {"idx": 4, "type": "tax", "name": "所得税", "short_name": "税", "amount": 2000},
    {"idx": 5, "type": "rail", "name": "北京南站", "short_name": "北站", "price": 2000, "rents": [250, 500, 1000, 2000]},
    {"idx": 6, "type": "prop", "name": "成都·宽窄巷子", "short_name": "宽窄", "group": "g2", "price": 1000, "rents": [60, 300, 900, 2700, 4000, 5500], "house_cost": 500},
    {"idx": 7, "type": "chance", "name": "机会", "short_name": "机会"},
    {"idx": 8, "type": "prop", "name": "西安·回民街", "short_name": "回民", "group": "g2", "price": 1000, "rents": [60, 300, 900, 2700, 4000, 5500], "house_cost": 500},
    {"idx": 9, "type": "prop", "name": "重庆·洪崖洞", "short_name": "洪崖", "group": "g2", "price": 1200, "rents": [80, 400, 1000, 3000, 4500, 6000], "house_cost": 500},
    {"idx": 10, "type": "jail", "name": "监狱·探监", "short_name": "监狱"},
    {"idx": 11, "type": "prop", "name": "长沙·太平街", "short_name": "太平", "group": "g3", "price": 1400, "rents": [100, 500, 1500, 4500, 6250, 7500], "house_cost": 1000},
    {"idx": 12, "type": "util", "name": "城南电厂", "short_name": "电厂", "price": 1500, "multipliers": [40, 100]},
    {"idx": 13, "type": "prop", "name": "武汉·户部巷", "short_name": "户部", "group": "g3", "price": 1400, "rents": [100, 500, 1500, 4500, 6250, 7500], "house_cost": 1000},
    {"idx": 14, "type": "prop", "name": "南京·夫子庙", "short_name": "夫子", "group": "g3", "price": 1600, "rents": [120, 600, 1800, 5000, 7000, 9000], "house_cost": 1000},
    {"idx": 15, "type": "rail", "name": "上海虹桥站", "short_name": "虹桥", "price": 2000, "rents": [250, 500, 1000, 2000]},
    {"idx": 16, "type": "prop", "name": "苏州·平江路", "short_name": "平江", "group": "g4", "price": 1800, "rents": [140, 700, 2000, 5500, 7500, 9500], "house_cost": 1000},
    {"idx": 17, "type": "community", "name": "命运", "short_name": "命运"},
    {"idx": 18, "type": "prop", "name": "无锡·南长街", "short_name": "南长", "group": "g4", "price": 1800, "rents": [140, 700, 2000, 5500, 7500, 9500], "house_cost": 1000},
    {"idx": 19, "type": "prop", "name": "杭州·河坊街", "short_name": "河坊", "group": "g4", "price": 2000, "rents": [160, 800, 2200, 6000, 8000, 10000], "house_cost": 1000},
    {"idx": 20, "type": "parking", "name": "免费停车场", "short_name": "停车"},
    {"idx": 21, "type": "prop", "name": "厦门·鼓浪屿", "short_name": "鼓浪", "group": "g5", "price": 2200, "rents": [180, 900, 2500, 7000, 8750, 10500], "house_cost": 1500},
    {"idx": 22, "type": "chance", "name": "机会", "short_name": "机会"},
    {"idx": 23, "type": "prop", "name": "青岛·八大关", "short_name": "八关", "group": "g5", "price": 2200, "rents": [180, 900, 2500, 7000, 8750, 10500], "house_cost": 1500},
    {"idx": 24, "type": "prop", "name": "大连·星海湾", "short_name": "星海", "group": "g5", "price": 2400, "rents": [200, 1000, 3000, 7500, 9250, 11000], "house_cost": 1500},
    {"idx": 25, "type": "rail", "name": "广州南站", "short_name": "广南", "price": 2000, "rents": [250, 500, 1000, 2000]},
    {"idx": 26, "type": "prop", "name": "广州·天河路", "short_name": "天河", "group": "g6", "price": 2600, "rents": [220, 1100, 3300, 8000, 9750, 11500], "house_cost": 1500},
    {"idx": 27, "type": "prop", "name": "深圳·华强北", "short_name": "华强", "group": "g6", "price": 2600, "rents": [220, 1100, 3300, 8000, 9750, 11500], "house_cost": 1500},
    {"idx": 28, "type": "util", "name": "江北水厂", "short_name": "水厂", "price": 1500, "multipliers": [40, 100]},
    {"idx": 29, "type": "prop", "name": "珠海·情侣路", "short_name": "情侣", "group": "g6", "price": 2800, "rents": [240, 1200, 3600, 8500, 10250, 12000], "house_cost": 1500},
    {"idx": 30, "type": "goto_jail", "name": "进监狱", "short_name": "入狱"},
    {"idx": 31, "type": "prop", "name": "上海·新天地", "short_name": "新天", "group": "g7", "price": 3000, "rents": [260, 1300, 3900, 9000, 11000, 12750], "house_cost": 2000},
    {"idx": 32, "type": "prop", "name": "上海·南京路", "short_name": "南路", "group": "g7", "price": 3000, "rents": [260, 1300, 3900, 9000, 11000, 12750], "house_cost": 2000},
    {"idx": 33, "type": "community", "name": "命运", "short_name": "命运"},
    {"idx": 34, "type": "prop", "name": "上海·陆家嘴", "short_name": "陆家", "group": "g7", "price": 3200, "rents": [280, 1500, 4500, 10000, 12000, 14000], "house_cost": 2000},
    {"idx": 35, "type": "rail", "name": "成都东站", "short_name": "成东", "price": 2000, "rents": [250, 500, 1000, 2000]},
    {"idx": 36, "type": "chance", "name": "机会", "short_name": "机会"},
    {"idx": 37, "type": "prop", "name": "北京·王府井", "short_name": "王府", "group": "g8", "price": 3500, "rents": [350, 1750, 5000, 11000, 13000, 15000], "house_cost": 2000},
    {"idx": 38, "type": "luxury_tax", "name": "奢侈税", "short_name": "奢税", "amount": 1000, "flavor": [
        "海关抽查：箱子里的东西按件计费。",
        "本月奢侈品额度超标，超出部分补税。",
        "凌晨手滑下的那单，账单今天到了。",
    ]},
    {"idx": 39, "type": "prop", "name": "上海·外滩", "short_name": "外滩", "group": "g8", "price": 4000, "rents": [500, 2000, 6000, 14000, 17000, 20000], "house_cost": 2000},
]


DEFAULT_CARDS: dict[str, list[dict[str, Any]]] = {
    "chance": [
        {"id": "c01", "text": "路边随手买的彩票中了个小奖，进账 1500。", "effect": {"type": "money", "amount": 1500}},
        {"id": "c02", "text": "半夜急诊，自付医药费 1000。", "effect": {"type": "money", "amount": -1000}},
        {"id": "c03", "text": "一觉醒来发现走错了城市，回到起点并领工资。", "effect": {"type": "move_to", "cell": 0, "collect_go": True}},
        {"id": "c04", "text": "被朋友拉去外滩看夜景，直接移动到上海·外滩。", "effect": {"type": "move_to", "cell": 39, "collect_go": True}},
        {"id": "c05", "text": "地图导航把你带沟里了，后退 3 格。", "effect": {"type": "move_rel", "n": -3}},
        {"id": "c06", "text": "深夜街头飙车被拦下，直接进监狱。", "effect": {"type": "goto_jail"}},
        {"id": "c07", "text": "认识了靠谱律师，获赠一张出狱卡。", "effect": {"type": "get_out_free"}},
        {"id": "c08", "text": "今天你过生日，其他每位玩家各送你 500。", "effect": {"type": "per_player", "amount": 500}},
        {"id": "c09", "text": "嘴一快说了这顿我请，给其他每人 500。", "effect": {"type": "per_player", "amount": -500}},
        {"id": "c10", "text": "房屋年检：每栋房付 250，每座旅馆付 1000。", "effect": {"type": "repairs", "per_house": 250, "per_hotel": 1000}},
        {"id": "c11", "text": "抢到一张打折高铁票，移动到北京南站。", "effect": {"type": "move_to", "cell": 5, "collect_go": True}},
        {"id": "c12", "text": "银行利息算错了，退还你 500。", "effect": {"type": "money", "amount": 500}},
    ],
    "community": [
        {"id": "m01", "text": "年终奖到账，进账 2000。", "effect": {"type": "money", "amount": 2000}},
        {"id": "m02", "text": "物业费该补缴了，支出 1500。", "effect": {"type": "money", "amount": -1500}},
        {"id": "m03", "text": "去监狱探望老朋友，只是探监。", "effect": {"type": "move_to", "cell": 10, "collect_go": False}},
        {"id": "m04", "text": "顺路搭上邻居的车，前进 3 格。", "effect": {"type": "move_rel", "n": 3}},
        {"id": "m05", "text": "在小区群里骂街被举报，直接进监狱。", "effect": {"type": "goto_jail"}},
        {"id": "m06", "text": "社区评你为年度好人，赠一张出狱卡。", "effect": {"type": "get_out_free"}},
        {"id": "m07", "text": "同事集体凑份子，其他每人各给你 200。", "effect": {"type": "per_player", "amount": 200}},
        {"id": "m08", "text": "过节发红包，给其他每人 300。", "effect": {"type": "per_player", "amount": -300}},
        {"id": "m09", "text": "街道统一翻修：每栋房 400，每座旅馆 1150。", "effect": {"type": "repairs", "per_house": 400, "per_hotel": 1150}},
        {"id": "m10", "text": "旧手机卖了个好价，进账 1000。", "effect": {"type": "money", "amount": 1000}},
        {"id": "m11", "text": "深夜手滑下单，退货窗口已关，支出 2000。", "effect": {"type": "money", "amount": -2000}},
        {"id": "m12", "text": "决定回起点重整旗鼓并领工资。", "effect": {"type": "move_to", "cell": 0, "collect_go": True}},
    ],
}
