// Separate namespace: old ranch decoration holdings are never imported here.
const rows = [
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
];
export const FARM_DECORATION_CATALOG = Object.freeze(rows.map(([model_id, name, w, d, price_farm_coins, purchase_mode = "unit", layer = "furniture"]) => Object.freeze({
  item_id: `farm_decor:${model_id}`, model_id, name, cells: Object.freeze([w, d]),
  price_farm_coins, purchase_mode, layer,
})));
export const decorationById = new Map(FARM_DECORATION_CATALOG.map(item => [item.item_id, item]));
export const ROOF_COLORS = Object.freeze(["mint", "cream", "peach", "blue", "lavender", "red"]);
