import type { FarmActivityEvent } from "./farm-activity-source.js";

/** Reviewed labels selected only from a verified activity, never from post prose. */
export function defaultMomentLocation(event: FarmActivityEvent | null | undefined): string | null {
  if (!event) return null;
  switch (event.kind) {
    case "plant": return "自家农场·种子托儿所";
    case "water": return "农场·人工降雨作业区";
    case "harvest": return "自家农场·丰收打包现场";
    case "fishing":
      if (event.data.outcomes.some(outcome => outcome.kind === "event")) return "钓鱼点·支线任务发生地";
      if (event.data.outcomes.every(outcome => outcome.kind === "empty")) return "钓鱼点·鱼的已读不回现场";
      return "钓鱼点·今日蹲守中";
    case "encounter": return "钓鱼点·支线任务发生地";
    case "cooking": return event.data.odd ? "铃野厨房·成分待议" : "铃野厨房·出锅第一现场";
    case "cooking-research": return "铃野厨房·新菜谱研究所";
    case "ranch": return "牧场·饭票供应处";
    case "glimmer": return event.data.action === "achievement" ? "铃野·成就橱窗前" : "流光原野·计划外散步";
    case "commission": return "委托处·正在营业";
    case "title-earned": return "铃野·新头衔试戴处";
    default: return null;
  }
}
