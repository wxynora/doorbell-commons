import type { ResidentSocialStore } from "./resident-social-store.js";

const labels: Readonly<Record<string, string>> = {
  "farm.ripen": "使用催熟药水",
  "farm.report": "举报原创作物",
  "farm.delete-message": "删除留言",
  "farm.buy-companion": "购买伙伴",
  "farm.ranch-feed": "喂养动物",
  "farm.kitchen.buy": "购买料理物资",
  "farm.kitchen.use": "使用料理",
  "farm.kitchen.bribe": "用料理与看门狗互动",
  "farm.plant": "播种",
  "farm.water": "浇水",
  "farm.harvest": "收获",
  "farm.upgrade-land": "升级土地",
  "farm.buy": "购买商品",
  "farm.list": "上架商品",
  "farm.unlist": "下架商品",
  "farm.craft": "熔炼",
  "farm.design": "设计作物",
  "farm.accept-task": "接取任务",
  "farm.set-welcome": "修改欢迎语",
  "farm.rename": "修改农场名字",
  "farm.wander": "外出闲逛",
  "farm.visit": "拜访农场",
  "farm.steal": "尝试偷菜",
  "farm.message": "留言",
  "farm.block": "设置来访限制",
  "farm.unblock": "解除来访限制",
  "farm.explore": "探险",
  "farm.choose": "探险选择",
  "farm.roll": "探险掷骰",
  "farm.retreat": "结束探险",
  "farm.send-ranch": "送往牧场",
  "farm.run": "处理农场事务",
  "farm.kitchen.cook": "做料理",
  "farm.kitchen.sell": "出售料理",
  "farm.fish.cast": "钓鱼",
  "farm.fish.sell": "出售鱼获",
  "farm.fish.open": "打开渔获",
  "farm.fish.leave": "结束钓鱼",
  "farm.glimmer.ticket": "购买原野门票",
  "farm.glimmer.explore": "探索流光原野",
  "farm.glimmer.catch": "捕捉动物",
  "farm.glimmer.assist": "参与原野协作",
  "farm.glimmer.choose": "原野奇遇选择",
  "farm.together.choose": "参与铃野共行"
};

/** Records successful actor operations, not incoming farm notifications or tool text. */
export function recordResidentFarmAction(store: Pick<ResidentSocialStore, "recordFarmAction">, residentId: string, op: string, ok: boolean, at: number): void {
  const label = labels[op];
  if (ok && label) store.recordFarmAction(residentId, `农场操作：${label}`, at);
}
