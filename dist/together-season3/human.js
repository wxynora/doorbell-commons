import { createHash } from "node:crypto";
import { season3HumanData } from "./presentation.js";
import { togetherSeason3DishNeeds } from "./runtime.js";
import { listInterviewSources } from "./interviews.js";

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

// Human-only public projection. Never feed these labels back into model text,
// and never spread farm objects (which also hold private credentials).
export function season3PublicHumanData(state, viewer, farms) {
  const shared = season3HumanData(state, viewer);
  const names = new Map(farms.map((farm) => [String(farm.id), farm.aiName]));
  const author = (farmId) => {
    const name = names.get(String(farmId));
    return name ? `${name}（门牌 ${farmId}）` : `门牌 ${farmId}`;
  };
  const needs = togetherSeason3DishNeeds(state).filter((need) => need.status !== "not_open");
  const deliveryLines = needs.flatMap((need) => {
    const label = `${need.dishName} ×${need.quantity}`;
    const deliveries = need.deliveries.map((delivery) =>
      `${label}：已交付 · ${author(delivery.farmId)} · ${dateFormat.format(delivery.deliveredAt)}（北京时间）`,
    );
    if (need.id === "preparation_pancake" && need.status === "open")
      deliveries.push(`${label}：公共备餐接力`);
    return deliveries.length ? deliveries
      : [`${label}：${need.status === "closed" ? "交付窗口已结束，未送达" : "待交付"}`];
  });
  shared.currentTask = needs.length ? {
    id: "rain-not-yet-dishes",
    name: "公共料理交付（种类）",
    opening: deliveryLines.join("\n"),
    progress: needs.filter((need) => need.deliveries.length > 0).length,
    target: needs.length,
  } : null;
  const contributions = new Map(state.contributions
    .filter((entry) => entry.kind === "interview")
    .map((entry) => [entry.sourceId, entry.farmId]));
  shared.clues = [...Map.groupBy(listInterviewSources(state.interviews), (source) => source.interviewId)]
    .map(([interviewId, sources]) => {
      const farmId = contributions.get(interviewId);
      return {
        id: "interview_" + createHash("sha256").update(interviewId).digest("hex"),
        title: `${farmId ? `${author(farmId)} · ` : ""}采访${sources[0].npc.name}`,
        text: sources.flatMap((source) => source.answers).map((answer) =>
          `${dateFormat.format(answer.occurredAt)}（北京时间）\n${answer.question}\n\n${answer.answer}`,
        ).join("\n\n"),
      };
    });
  return shared;
}
