import { ensureDailyColumnDraft } from "../daily-columns/draft.js";
import type Database from "better-sqlite3";
import { dailyGeneratedFarmSchema } from "@doorbell/protocol";
import { z } from "zod";
import { LingyeDailyEditorStore } from "../lingye-daily-editor-store.js";
import { DailyFarmStore } from "./store.js";
import { dailyMaterialWindow } from "../daily-materials/published-announcements.js";

const deliverySchema=z.discriminatedUnion("status",[
  z.strictObject({issue_date:z.iso.date(),status:z.literal("ready"),...dailyGeneratedFarmSchema.shape}),
  z.strictObject({issue_date:z.iso.date(),status:z.enum(["pending","failed"]),error_type:z.string().optional()}),
]);
export class DailyFarmService {
  readonly store:DailyFarmStore;
  readonly editor:LingyeDailyEditorStore;
  constructor(readonly options:{database:Database.Database;enabled:(date:string)=>boolean;
    source:(date:string)=>Promise<unknown>;now?:()=>number}) {
    this.store=new DailyFarmStore(options.database);this.editor=new LingyeDailyEditorStore(options.database);
  }
  enabled(date:string) {return this.options.enabled(date);}
  async sources(date:string) {
    z.iso.date().parse(date);
    if (!this.enabled(date)) throw new Error("farm_generation_not_enabled");
    const window=dailyMaterialWindow(date);
    if ((this.options.now??Date.now)()<window.end) throw new Error("farm_observation_window_open");
    return this.options.source(date);
  }
  receive(body:unknown) {
    const input=deliverySchema.parse(body);
    if (!this.enabled(input.issue_date)) throw new Error("farm_generation_not_enabled");
    const now=(this.options.now??Date.now)();
    if (now<dailyMaterialWindow(input.issue_date).end) throw new Error("farm_observation_window_open");
    ensureDailyColumnDraft(this.editor,input.issue_date,now);
    this.store.save(input.issue_date,input,now);
    this.merge(input.issue_date);
    return {issue_date:input.issue_date,status:this.store.status(input.issue_date)!.status,saved:true,published:false};
  }
  merge(date:string) {
    const result=this.store.result(date);
    if (!result || !this.options.database.prepare("SELECT 1 FROM lingye_daily_editor_drafts WHERE issue_date=?").get(date)) return;
    const current=JSON.parse(this.editor.row(date).edition_json).farm_generated;
    if (JSON.stringify(current)===JSON.stringify(result)) return;
    const question=result.tomorrow_question;
    this.editor.merge(date,{farm_generated:result,
      ...(question!==undefined ? {tomorrow_question:question===null ? null : {text:question.text,source_event_ids:question.source_ids}} : {})},
      question===undefined ? ["farm"] : ["farm","tomorrow"],(this.options.now??Date.now)());
  }
  progress(date:string) {
    const status=this.store.status(date)?.status;
    return {lane:"farm" as const,status:status==="ready" ? "completed" as const : status==="failed" ? "unavailable" as const : "pending" as const,
      label:status==="ready" ? (this.store.result(date)!.articles.length ? "Gemini 农场稿已到工作台" : "本期暂无可写的农场素材") :
        status==="failed" ? "Gemini 农场稿生成失败" : "等待 Gemini 农场稿",reporterName:"Gemini",resendable:false};
  }
}
