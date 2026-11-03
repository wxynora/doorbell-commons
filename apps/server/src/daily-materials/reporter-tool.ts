import { DailyMaterialError, type DailyMaterialService } from "./material-service.js";
import type { MaterialState, MaterialKind } from "./material-store.js";
import type { PublishedArticleSearchResult } from "./published-articles.js";
import type { UpdateMaterial } from "./published-announcements.js";

type Group = { coverage_status: "complete" | "partial"; quote_candidates_available: boolean;
  topics: {topic:string;summary:string}[] };
type Npc = {window:{startMs:number};recordingStartedAt:number|null;unknownEffectsPresent:boolean;
  farms:{farmName:string|null;summary:string;unknownEffectsPresent:boolean}[]};
type Glimmer = {window:{startMs:number};recordingStartedAt:number|null;variants:{variantName:string;
  feedingCount:number;didNotFollowCount:number;dishes:{name:string;quantity:number}[];
  successes:{farmName:string|null;attemptInBaseKindPityCycle:number;guaranteed:boolean}[]}[]};

function availability(state: MaterialState): string | undefined {
  if (state.status === "missing") return "这类素材尚未准备好。";
  if (state.status === "failed") return "这类素材暂时无法提供。";
  return state.last_attempt === "failed" ? "本次更新未完成，以下是上次成功保存的内容。" : undefined;
}

function recording(start: number, recordedAt: number | null): string | undefined {
  if (recordedAt === null) return "记录开始时间未知，更早情况未知。";
  return recordedAt > start ? `记录从 ${new Date(recordedAt).toISOString()} 开始，更早情况未知。` : undefined;
}

export function renderCurrentReporterMaterials(result: Extract<Awaited<ReturnType<DailyMaterialService["reporterMaterials"]>>, {kind:"current"}>,
  selected: readonly MaterialKind[] = ["group", "npc", "glimmer", "announcements"]): string {
  const { materials } = result;
  const sections: string[] = [`《铃野日报》记者素材 · ${result.issue_date}`];
  const add = (kind: MaterialKind, heading: string, state: MaterialState, lines: (data: unknown) => string[]) => {
    if (!selected.includes(kind)) return;
    const prefix = availability(state);
    if (state.status !== "ready") { sections.push([heading, prefix].filter(Boolean).join("\n")); return; }
    const values = lines(state.data);
    sections.push([heading, prefix, ...values].filter(Boolean).join("\n"));
  };
  add("group", "【群聊话题】", materials.group, (input) => {
    const data = input as Group;
    return [data.coverage_status === "partial" ? "群聊采集覆盖不完整，可能缺少内容。" : "群聊采集是否完整未知。",
      ...(data.quote_candidates_available ? [] : ["语录候选是否可用未知。"]),
      ...(data.topics.length ? data.topics.map((topic) => `${topic.topic}\n${topic.summary}`) : ["本期没有这类素材。"])];
  });
  add("npc", "【NPC奇遇】", materials.npc, (input) => {
    const data = input as Npc;
    return [recording(data.window.startMs,data.recordingStartedAt) ?? "",
      ...(data.unknownEffectsPresent ? ["部分实际得失尚无法完整统计。"] : []),
      ...(data.farms.length ? data.farms.map((farm) => `${farm.farmName ? `${farm.farmName}：` : ""}${farm.summary}`)
        : ["本期没有这类素材。"])];
  });
  add("glimmer", "【流光原野】", materials.glimmer, (input) => {
    const data = input as Glimmer;
    return [recording(data.window.startMs,data.recordingStartedAt) ?? "",
      ...(data.variants.length ? data.variants.map((variant) => [
        `${variant.variantName}：有效投喂 ${variant.feedingCount} 次，吃完没跟走 ${variant.didNotFollowCount} 次。`,
        ...(variant.dishes.length ? [`料理：${variant.dishes.map((dish) => `${dish.name} × ${dish.quantity}`).join("、")}`] : []),
        ...variant.successes.map((success) => `${success.farmName ?? ""}带回：本次是该基础物种保底周期内第 ${success.attemptInBaseKindPityCycle} 次有效投喂，${success.guaranteed ? "触发保底" : "未触发保底"}。`),
        "保底按基础物种累计，不是该异色外观的专属次数。",
      ].join("\n")) : ["本期没有这类素材。"])];
  });
  add("announcements", "【铃野更新】", materials.announcements, (input) => {
    const data = input as UpdateMaterial[];
    return data.length ? data.map((item) => `${item.title}\n${item.excerpt}`) : ["本期没有这类素材。"];
  });
  return sections.join("\n\n");
}

function historyText(keyword: string, result: PublishedArticleSearchResult): string {
  const sections = [`《铃野日报》往期检索 · ${keyword}`];
  sections.push(...(result.articles.length ? result.articles.map((article) => [
    `${article.issueDate} · 第 ${article.issueNumber} 期`, `栏目：${article.column}`,
    `标题：${article.title ?? "无单独标题"}`, article.body,
  ].join("\n")) : ["没有找到匹配内容。"]));
  if (result.unresolved.length) sections.push("部分已出版栏目无法可靠切分，结果可能不完整。");
  return sections.join("\n\n");
}

export async function executeReporterMaterialTool(
  service: DailyMaterialService | undefined,
  residentId: string,
  input: {keyword?: string},
): Promise<{isError:boolean;text:string}> {
  if (!service) return {isError:true,text:"素材暂时无法读取，请稍后再试。"};
  try {
    const result = await service.reporterMaterials(residentId,input);
    return {isError:false,text:result.kind === "history" ? historyText(result.keyword,result) : renderCurrentReporterMaterials(result)};
  } catch (error) {
    if (error instanceof DailyMaterialError) {
      if (error.code === "not_reporter") return {isError:true,text:"这项素材只向在职记者开放。"};
      if (error.code === "qualification_unavailable") return {isError:true,text:"暂时无法核验记者资格，请稍后再试。"};
      if (error.code === "keyword_required") return {isError:true,text:"请输入非空白关键词。"};
    }
    return {isError:true,text:"素材暂时无法读取，请稍后再试。"};
  }
}
