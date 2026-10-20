// Separate namespace: old ranch decoration holdings are never imported here.
const rows = [
  ["snow_fort", "团团雪堡", 3, 2, 0],
  ["house_level_two", "二级房屋升级", 1, 1, 150000, "unlock", "house"],
  ["house_level_three", "三级房屋升级", 1, 1, 300000, "unlock", "house"],
  ["floral_canopy", "花植雨棚", 1, 1, 50000, "unlock", "house"],
  ["paving_sandstone", "暖米石砖", 1, 1, 30000, "unlock", "ground"],
  ["paving_terracotta", "红陶砖", 1, 1, 40000, "unlock", "ground"],
  ["paving_slate", "灰蓝石板", 1, 1, 50000, "unlock", "ground"],
  ["paving_pebbles", "浅色鹅卵石", 1, 1, 40000, "unlock", "ground"],
  ["flowerbed", "花圃", 1, 1, 30000, "unlock"],
  ["flowerbed_hydrangea", "绣球花圃", 1, 1, 50000, "unlock"],
  ["flowerbed_sunflower", "向日葵花圃", 1, 1, 40000, "unlock"],
  ["flowerbed_tulip", "郁金香花圃", 1, 1, 40000, "unlock"],
  ["scarecrow", "稻草人", 1, 1, 8000],
  ["welcome_sign", "欢迎木牌", 1, 1, 6000],
  ["pumpkin_cart", "南瓜推车", 2, 1, 18000],
  ["mushroom_lamp", "蘑菇灯", 1, 1, 12000],
  ["tea_table", "茶歇桌", 2, 2, 22000],
  ["rattan_chair", "藤椅", 1, 1, 16000],
  ["windmill", "大风车", 2, 2, 60000],
  ["waterwheel", "水车", 2, 1, 60000],
  ["parasol_lounger", "阳伞躺椅", 2, 2, 38000],
  ["garden_pond", "小池塘", 3, 3, 50000],
  ["garden_string_lights", "木柱串灯", 3, 1, 22000],
  ["garden_lamppost", "庭院路灯", 1, 1, 18000],
  ["double_swing", "双人秋千", 3, 2, 48000],
  ["floral_arch", "花藤拱门", 2, 1, 36000],
  ["garden_mailbox", "庭院信箱", 1, 1, 18000],
  ["white_fence", "白木栅栏", 1, 1, 82000, "unlock"],
  ["timber_fence", "原木矮栏", 1, 1, 72000, "unlock"],
  ["stone_wall", "石砌矮墙", 1, 1, 118000, "unlock"],
  ["hedge", "修剪绿篱", 1, 1, 88000, "unlock"],
  ["lavender", "薰衣草花带", 1, 1, 68000, "unlock", "ground"],
  ["daisies", "雏菊花带", 1, 1, 58000, "unlock", "ground"],
  ["ferns", "蕨类花丛", 1, 1, 62000, "unlock", "ground"],
  ["ornamental_grass", "绣线草丛", 1, 1, 58000, "unlock", "ground"],
  ["log_steps", "圆木踏步", 1, 1, 52000, "unlock", "ground"],
  ["moss_path", "青苔石径", 1, 1, 88000, "unlock", "ground"],
  ["checker_tiles", "棋盘砖", 1, 1, 72000, "unlock", "ground"],
  ["garden_bench", "花园长椅", 2, 1, 22000],
  ["stone_fountain", "石砌喷泉", 2, 2, 65000],
  ["bird_bath", "鸟浴盆", 1, 1, 18000],
  ["flower_stand", "阶梯花架", 2, 1, 28000],
  ["pumpkin_path", "南瓜灯小径", 1, 1, 105000, "unlock", "ground"],
  ["ghost_fence", "幽灵木栅栏", 1, 1, 130000, "unlock"],
  ["black_roses", "黑蔷薇花圃", 1, 1, 110000, "unlock", "ground"],
  ["red_roses", "深红玫瑰花圃", 1, 1, 108000, "unlock", "ground"],
  ["web_tiles", "蛛网石砖", 1, 1, 88000, "unlock", "ground"],
  ["witch_cauldron", "巫师坩埚", 2, 2, 72000],
  ["cat_pumpkin", "大南瓜灯与小黑猫", 2, 1, 45000],
  ["ghost_lamp", "小幽灵灯", 1, 1, 22000],
  ["pumpkin_lamppost", "南瓜路灯", 1, 1, 38000],
  ["ghost_rocker", "幽灵摇椅", 1, 1, 50000],
  ["bat_arch", "蝙蝠拱门", 2, 1, 58000],
  ["candy_cart", "糖果推车", 2, 1, 42000],
  ["haunted_lantern", "歪歪鬼屋灯", 1, 1, 26000],
  ["cherry_tree", "樱花树", 1, 1, 220000],
  ["maple_tree", "红枫", 1, 1, 190000],
  ["ginkgo_tree", "银杏", 1, 1, 170000],
  ["birch_tree", "白桦", 1, 1, 130000],
  ["pine_tree", "松树", 1, 1, 240000],
  ["osmanthus_tree", "桂花树", 1, 1, 160000],
  ["house_pumpkin", "南瓜屋", 1, 1, 400000, "unlock", "house"],
  ["house_stump", "树桩屋", 1, 1, 400000, "unlock", "house"],
  ["house_mushroom", "蘑菇屋", 1, 1, 400000, "unlock", "house"],
];
export const FARM_DECORATION_CATALOG = Object.freeze(rows.map(([model_id, name, w, d, price_farm_coins, purchase_mode = "unit", layer = "furniture"]) => Object.freeze({
  item_id: `farm_decor:${model_id}`, model_id, name, cells: Object.freeze([w, d]),
  price_farm_coins, purchase_mode, layer,
})));
export const decorationById = new Map(FARM_DECORATION_CATALOG.map(item => [item.item_id, item]));
export const ROOF_COLORS = Object.freeze(["mint", "cream", "peach", "blue", "lavender", "red"]);

export const FARM_BOUNDARY_FENCE_ITEM_IDS = Object.freeze([
  "farm_decor:white_fence",
  "farm_decor:timber_fence",
  "farm_decor:stone_wall",
  "farm_decor:hedge",
  "farm_decor:ghost_fence",
]);

const HALLOWEEN_DECORATION_IDS = new Set([
  "farm_decor:pumpkin_path", "farm_decor:ghost_fence", "farm_decor:black_roses",
  "farm_decor:red_roses", "farm_decor:web_tiles", "farm_decor:witch_cauldron",
  "farm_decor:cat_pumpkin", "farm_decor:ghost_lamp", "farm_decor:pumpkin_lamppost",
  "farm_decor:ghost_rocker", "farm_decor:bat_arch", "farm_decor:candy_cart",
  "farm_decor:haunted_lantern",
]);
export const HALLOWEEN_DECORATION_SALE_UNTIL = Date.parse("2026-11-01T00:00:00+08:00");
export function isDecorationSaleOpen(item, now = Date.now()) {
  const id = typeof item === "string" ? item : item?.item_id;
  if (id === "farm_decor:snow_fort") return false; // Activity reward only; also excluded from gacha.
  return !HALLOWEEN_DECORATION_IDS.has(id) || Number(now) < HALLOWEEN_DECORATION_SALE_UNTIL;
}
export function isDecorationGachaEligible(item, now = Date.now()) {
  return item?.layer === "furniture" && isDecorationSaleOpen(item, now);
}
