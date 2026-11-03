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
    return {model:state.model!, articles:this.database.prepare(
      "SELECT title,body FROM lingye_daily_farm_articles WHERE issue_date=? ORDER BY ordinal"
    ).all(date) as DailyGeneratedFarm["articles"]};
  }
  save(date: string, update: {status:"pending"|"failed"; error_type?:string} |
    {status:"ready";model:string;articles:DailyGeneratedFarm["articles"]}, now:number) {
    this.database.transaction(() => {
      const previous = this.result(date);
      if (previous) {
        if (update.status === "ready" && JSON.stringify(previous) !== JSON.stringify({model:update.model,articles:update.articles}))
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
      }
    }).immediate();
  }
}
