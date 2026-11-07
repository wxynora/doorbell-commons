import { z } from "zod";
import { isActivityStatusKey, type ActivityStatusKey } from "./activity-status.js";
import type { MomentsStore } from "./store.js";
import type { MomentsToolOptions } from "./tool-options.js";
import type { ActivityReceipt } from "./types.js";

const name = z.string().min(1);
const quantity = z.number().int().nonnegative().safe();
const common = { id: name, residentId: name, occurredAt: z.number().int().nonnegative().safe() };
const outcome = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fish"), fishId: name, name, rarity: name, first: z.boolean() }).strict(),
  z.object({ kind: z.literal("junk"), name }).strict(),
  z.object({ kind: z.literal("empty") }).strict(),
  z.object({ kind: z.literal("event"), eventId: name, name }).strict(),
]);
export const farmActivityEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("plant"), data: z.object({
    counts: z.object({ common: quantity, fantasy: quantity, limited: quantity }).strict(), limitedIds: z.array(name),
  }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("water"), data: z.discriminatedUnion("mode", [
    z.object({mode:z.literal("own"), count:quantity, helped:quantity}).strict(),
    z.object({mode:z.literal("visitor"), target:name, plotId:quantity, ripened:z.boolean()}).strict(),
  ]) }).strict(),
  z.object({ ...common, kind: z.literal("harvest"), data: z.object({ crops: z.array(z.object({
    cropId: name, name, rarity: name, qualityTier: quantity, qualityName: name,
    value: z.number().finite(), currency: z.enum(["gold", "silver"]), first: z.boolean(), extra: z.boolean(), drop: z.boolean(),
  }).strict()).min(1) }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("fishing"), data: z.object({ spotId: name, outcomes: z.array(outcome).min(1) }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("encounter"), data: z.object({ eventId: name, name, choiceId: name, outcome: name }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("cooking"), data: z.object({
    recipeId: name, name, rarity: name, odd: z.boolean(), discovered: z.boolean(), submitted: z.boolean(),
  }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("cooking-research"), data:z.object({recipeId:name, name, rarity:name}).strict() }).strict(),
  z.object({ ...common, kind: z.literal("title-earned"), data:z.object({id:name, name}).strict() }).strict(),
  z.object({ ...common, kind: z.literal("ranch"), data: z.discriminatedUnion("action", [
    z.object({ action: z.literal("buy"), name, cost: z.number().finite() }).strict(),
    z.object({ action: z.literal("feed"), name, cost: z.number().finite() }).strict(),
    z.object({ action: z.literal("harvest"), products: z.array(z.object({ name, quantity }).strict()),
      gross: z.number().finite(), gain: z.number().finite(), debtPaid: z.number().finite(),
      storedCount: quantity, nonCookableCount: quantity }).strict(),
  ]) }).strict(),
  z.object({ ...common, kind: z.literal("glimmer"), data: z.discriminatedUnion("action", [
    z.object({action:z.literal("ticket"), id:name, name, result:name}).strict(),
    z.object({action:z.literal("explore"), id:name, name, pending:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("choose"), id:name, name, choice:z.enum(["A","B"]), result:name}).strict(),
    z.object({action:z.literal("catch"), id:name, name, success:z.boolean(), guaranteed:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("assist"), id:name, name, item:name, count:quantity, completed:z.boolean(), result:name}).strict(),
    z.object({action:z.literal("achievement"), id:name, name, result:name, titleEarned:z.boolean().optional()}).strict(),
  ]) }).strict(),
  z.object({ ...common, kind:z.literal("commission"), data:z.object({
    action:z.enum(["publish","accept","complete"]), result:name,
    rewards:z.array(z.object({currency:z.enum(["silver","gold"]), amount:quantity}).strict()).optional(),
  }).strict() }).strict(),
]);

export type FarmActivityEvent = z.infer<typeof farmActivityEventSchema>;
export type FarmActivityCard = Pick<ActivityReceipt, "title" | "summary" | "facts">;

/** Titles and fact labels were reviewed together with the activity copy. */
export function farmActivityCard(event: FarmActivityEvent): FarmActivityCard {
  const facts: FarmActivityCard["facts"] = [];
  const add = (label: string, value: string) => { facts.push({label, value}); };
  switch (event.kind) {
    case "plant": {
      const labels = {common:"普通", fantasy:"奇幻", limited:"限定"} as const;
      for (const [kind, count] of Object.entries(event.data.counts)) {
        if (count > 0) add("种下", `${labels[kind as keyof typeof labels]} × ${count}`);
      }
      return {title:"播种", summary:"", facts};
    }
    case "water":
      add("结果", event.data.mode === "own"
        ? `浇了 ${event.data.count} 块地`
        : `帮「${event.data.target}」${event.data.plotId} 号地浇水`);
      return {title:"浇水", summary:"", facts};
    case "harvest":
      for (const crop of event.data.crops) {
        add("作物", crop.name); add("稀有度", crop.rarity); add("品相", crop.qualityName);
        add("价值", `${crop.value} ${crop.currency === "gold" ? "金币" : "银币"}`);
      }
      return {title:"收获", summary:"", facts};
    case "fishing": {
      const rarityLabels: Record<string,string> = {
        common:"常见", uncommon:"少见", rare:"稀有", epic:"史诗", legendary:"传说", mythic:"神话",
      };
      for (const result of event.data.outcomes) {
        add("结果", result.kind === "empty" ? "空竿" : result.name);
        if (result.kind === "fish") add("稀有度", rarityLabels[result.rarity] ?? result.rarity);
      }
      return {title:"钓鱼", summary:"", facts};
    }
    case "encounter":
      add("结果", event.data.outcome);
      return {title:"钓鱼", summary:"", facts};
    case "cooking":
      add("成品", event.data.name); add("稀有度", event.data.rarity);
      if (event.data.submitted) add("结果", "已提交");
      return {title:"料理", summary:"", facts};
    case "cooking-research":
      add("结果", `原创菜谱「${event.data.name}·${event.data.rarity}」已经登记。`);
      return {title:"料理", summary:"", facts};
    case "title-earned":
      add("结果", event.data.name);
      return {title:"称号", summary:"", facts};
    case "ranch":
      if (event.data.action === "buy") add("结果", `购买：${event.data.name}`);
      else if (event.data.action === "feed") add("结果", `投喂：${event.data.name}`);
      else for (const product of event.data.products) add("结果", `帮收：${product.name} × ${product.quantity}`);
      return {title:"牧场", summary:"", facts};
    case "glimmer":
      add("结果", event.data.result);
      return {title:"流光原野", summary:"", facts};
    case "commission":
      add("结果", event.data.result);
      for (const reward of event.data.rewards ?? [])
        add("结果", `收到 ${reward.amount} ${reward.currency === "silver" ? "银币" : "金币"}`);
      return {title:"委托", summary:"", facts};
  }
}

export function farmActivityStatusKeys(event: FarmActivityEvent): ActivityStatusKey[] {
  const keys = new Set<ActivityStatusKey>();
  const add = (key: string) => { if (isActivityStatusKey(key)) keys.add(key); };
  switch (event.kind) {
    case "plant":
      add("field.plant");
      for (const [kind, count] of Object.entries(event.data.counts)) if (count > 0) add(`field.plant.${kind}`);
      break;
    case "water":
      add("field.water");
      if (event.data.mode === "visitor") {
        add("field.water.visitor");
        if (event.data.ripened) add("field.water.ripened");
      } else if (event.data.helped < event.data.count) add("field.water.capped");
      break;
    case "harvest":
      add("field.harvest");
      for (const crop of event.data.crops) {
        if (crop.first) add("field.harvest.first");
        if (crop.extra) add("field.harvest.extra");
        if (crop.drop) add("field.harvest.drop");
        add(`field.harvest.rarity.${crop.rarity}`);
        if (crop.qualityTier >= 1 && crop.qualityTier <= 5) {
          add("field.harvest.quality"); add(`field.harvest.quality.${crop.qualityTier}`);
        }
      }
      break;
    case "fishing":
      add("fishing.trip");
      for (const result of event.data.outcomes) {
        if (result.kind === "fish") {
          add("fishing.catch");
          if (result.first) add("fishing.first");
          // Farm's own RARITY_RANK defines rare and higher as rare.
          if (["rare", "epic", "legendary", "mythic"].includes(result.rarity)) add("fishing.rare");
          add(`fishing.rarity.${result.rarity}`);
        } else if (result.kind === "junk") add("fishing.junk");
        else if (result.kind === "empty") add("fishing.empty");
        else add("fishing.encounter");
      }
      break;
    case "encounter": add("fishing.encounter"); add("encounter.met"); break;
    case "cooking":
      add("cooking.finish");
      if (event.data.odd) add("cooking.odd");
      if (event.data.discovered) add("cooking.discovery");
      if (event.data.submitted) add("cooking.submitted");
      add(`cooking.rarity.${event.data.rarity}`);
      break;
    case "cooking-research": add("cooking.research"); break;
    case "title-earned": add("title.earned"); break;
    case "ranch": add(`ranch.${event.data.action}`); break;
    case "glimmer":
      if (event.data.action === "catch") add(`glimmer.catch.${event.data.success ? "success" : "fail"}`);
      else {
        add(`glimmer.${event.data.action}`);
        if (event.data.action === "explore") {
          add(event.data.pending ? "glimmer.explore.choice" : "glimmer.explore.instant");
          add("encounter.met");
        }
        if (event.data.action === "assist" && event.data.completed) add("glimmer.assist.complete");
        if (event.data.action === "achievement") {
          add("achievement.earned");
          if (event.data.titleEarned) add("title.earned");
        }
      }
      break;
    case "commission":
      add(`commission.${event.data.action}`);
      if (event.data.rewards?.length) add("commission.reward");
      break;
  }
  return [...keys].sort();
}

/**
 * Accept only data returned by the authenticated internal Farm client. Context
 * is derived from the already-authenticated MCP connection, never tool args.
 * A failed projection must not be treated as a failed or repeatable Farm action.
 */
export class FarmActivitySource {
  constructor(private readonly store: MomentsStore, private readonly options: MomentsToolOptions) {}

  accept(residentId: string, value: unknown) {
    const event = farmActivityEventSchema.parse(value);
    if (event.residentId !== residentId) throw new Error("farm_activity_identity_mismatch");
    const card = farmActivityCard(event);
    const receipt = {
      residentId, source: "farm", sourceId: event.id, kind: event.kind,
      ...card, occurredAt: event.occurredAt, statusKeys: farmActivityStatusKeys(event),
    };
    const receiptId = this.store.recordReceipt(receipt);
    return { event, receiptId, option: this.options.issue({ residentId }, "share", receiptId), title: card.title };
  }
  offer(residentId: string, events: readonly unknown[]): string {
    return events.map(event => {
      const result = this.accept(residentId, event);
      return `${result.title}\n转发到朋友圈：${result.option}\n补充：requestId、text、visibility；可附location`;
    }).join("\n\n");
  }
}
