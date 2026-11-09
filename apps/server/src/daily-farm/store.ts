import type Database from "better-sqlite3";
import type { DailyGeneratedFarm } from "@doorbell/protocol";

export class DailyFarmStore {
  constructor(readonly database: Database.Database) {}
  status(date: string) {
    return this.database.prepare("SELECT status,model,error_type FROM lingye_daily_farm_generation WHERE issue_date=?")
      .get(date) as {status:"pending"|"failed"|"ready";model:string|null;error_type:string|null}|undefined;
  }
  result(date: string): DailyGeneratedFarm | undefined {
    const state = this.status(date);
    if (state?.status !== "ready") return;
    const question=this.database.prepare("SELECT text FROM lingye_daily_farm_questions WHERE issue_date=?")
      .get(date) as {text:string|null}|undefined;
    return {model:state.model!, articles:this.database.prepare(
      "SELECT title,body FROM lingye_daily_farm_articles WHERE issue_date=? ORDER BY ordinal"
    ).all(date) as DailyGeneratedFarm["articles"],
      ...(question ? {tomorrow_question:question.text===null ? null : {text:question.text,
        source_ids:(this.database.prepare("SELECT source_id FROM lingye_daily_farm_question_citations WHERE issue_date=? ORDER BY ordinal")
          .all(date) as {source_id:string}[]).map(row=>row.source_id)}} : {})};
  }
  save(date: string, update: {status:"pending"|"failed"; error_type?:string|undefined} |
    ({status:"ready"} & DailyGeneratedFarm), now:number) {
    this.database.transaction(() => {
      const previous = this.result(date);
      if (previous) {
        const incoming=update.status==="ready" ? {model:update.model,articles:update.articles,
          ...(update.tomorrow_question!==undefined ? {tomorrow_question:update.tomorrow_question} : {})} : undefined;
        if (incoming && JSON.stringify(previous) !== JSON.stringify(incoming))
          throw new Error("farm_manuscript_conflict");
        return;
      }
      this.database.prepare(`INSERT INTO lingye_daily_farm_generation(issue_date,status,model,error_type,updated_at)
        VALUES (?,?,?,?,?) ON CONFLICT(issue_date) DO UPDATE SET status=excluded.status,model=excluded.model,
        error_type=excluded.error_type,updated_at=excluded.updated_at`).run(date,update.status,
          update.status === "ready" ? update.model : null, update.status === "failed" ? update.error_type ?? null : null,now);
      if (update.status === "ready") {
        this.database.prepare("DELETE FROM lingye_daily_farm_articles WHERE issue_date=?").run(date);
        const insert=this.database.prepare("INSERT INTO lingye_daily_farm_articles(issue_date,ordinal,title,body) VALUES (?,?,?,?)");
        update.articles.forEach((article,index)=>insert.run(date,index,article.title,article.body));
        if(update.tomorrow_question!==undefined) {
          this.database.prepare("INSERT INTO lingye_daily_farm_questions(issue_date,text) VALUES (?,?)")
            .run(date,update.tomorrow_question?.text ?? null);
          const insertCitation=this.database.prepare("INSERT INTO lingye_daily_farm_question_citations(issue_date,ordinal,source_id) VALUES (?,?,?)");
          update.tomorrow_question?.source_ids.forEach((source,index)=>insertCitation.run(date,index,source));
        }
      }
    }).immediate();
  }
}
