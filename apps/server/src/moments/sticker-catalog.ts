/** The user-provided Little Bell sheets are free basic stickers, shared by all residents. */
export const momentsStickerPack = {
  id: "bell-basic",
  name: "小铃铛表情",
  free: true,
  stickers: [
    {"id": "bell01", "name": "天塌了", "src": "/lingye/stickers/bell-basic/bell01.webp", "width": 192, "height": 170},
    {"id": "bell02", "name": "上岸祈福", "src": "/lingye/stickers/bell-basic/bell02.webp", "width": 192, "height": 169},
    {"id": "bell03", "name": "接好运", "src": "/lingye/stickers/bell-basic/bell03.webp", "width": 192, "height": 168},
    {"id": "bell04", "name": "恭喜恭喜", "src": "/lingye/stickers/bell-basic/bell04.webp", "width": 192, "height": 169},
    {"id": "bell05", "name": "笑死我了", "src": "/lingye/stickers/bell-basic/bell05.webp", "width": 192, "height": 166},
    {"id": "bell06", "name": "谁懂啊", "src": "/lingye/stickers/bell-basic/bell06.webp", "width": 192, "height": 167},
    {"id": "bell07", "name": "抱抱你", "src": "/lingye/stickers/bell-basic/bell07.webp", "width": 192, "height": 168},
    {"id": "bell08", "name": "辛苦了", "src": "/lingye/stickers/bell-basic/bell08.webp", "width": 192, "height": 168},
    {"id": "bell09", "name": "谢谢你", "src": "/lingye/stickers/bell-basic/bell09.webp", "width": 192, "height": 176},
    {"id": "bell10", "name": "下班啦", "src": "/lingye/stickers/bell-basic/bell10.webp", "width": 192, "height": 176},
    {"id": "bell11", "name": "好事发生", "src": "/lingye/stickers/bell-basic/bell11.webp", "width": 192, "height": 176},
    {"id": "bell12", "name": "晚安", "src": "/lingye/stickers/bell-basic/bell12.webp", "width": 192, "height": 174},
    {"id": "bell13", "name": "真的不种了", "src": "/lingye/stickers/bell-basic/bell13.webp", "width": 192, "height": 168},
    {"id": "bell14", "name": "一瓢之交", "src": "/lingye/stickers/bell-basic/bell14.webp", "width": 192, "height": 177},
    {"id": "bell15", "name": "菜比我早起", "src": "/lingye/stickers/bell-basic/bell15.webp", "width": 192, "height": 170},
    {"id": "bell16", "name": "我只是路过", "src": "/lingye/stickers/bell-basic/bell16.webp", "width": 192, "height": 167},
    {"id": "bell17", "name": "暴雨已劝退", "src": "/lingye/stickers/bell-basic/bell17.webp", "width": 192, "height": 170},
    {"id": "bell18", "name": "就再喂一盘", "src": "/lingye/stickers/bell-basic/bell18.webp", "width": 192, "height": 162},
    {"id": "bell19", "name": "锅先道个歉", "src": "/lingye/stickers/bell-basic/bell19.webp", "width": 192, "height": 168},
    {"id": "bell20", "name": "一炉暴富", "src": "/lingye/stickers/bell-basic/bell20.webp", "width": 192, "height": 172},
    {"id": "bell21", "name": "请随我走一趟", "src": "/lingye/stickers/bell-basic/bell21.webp", "width": 192, "height": 173},
    {"id": "bell22", "name": "缺一位活的", "src": "/lingye/stickers/bell-basic/bell22.webp", "width": 192, "height": 174},
    {"id": "bell23", "name": "这也能上报", "src": "/lingye/stickers/bell-basic/bell23.webp", "width": 192, "height": 174},
    {"id": "bell24", "name": "队友救一下", "src": "/lingye/stickers/bell-basic/bell24.webp", "width": 192, "height": 172},
  ],
} as const;

export type MomentSticker = typeof momentsStickerPack.stickers[number];
export function findMomentSticker(id: string): MomentSticker | undefined {
  return momentsStickerPack.stickers.find(sticker => sticker.id === id);
}
