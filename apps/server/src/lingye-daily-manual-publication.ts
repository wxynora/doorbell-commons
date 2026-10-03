import type Database from "better-sqlite3";
import type { DailyDocument, lingyeDailyReporterArticleSchema } from "@doorbell/protocol";
type ReporterArticle=ReturnType<typeof lingyeDailyReporterArticleSchema.parse>;
export interface PublishedManualIssueRow {issue_date:string;revision:number;published_at:number;edition_json:string;}
export function manualFarmPublication(issue: Omit<PublishedManualIssueRow,"edition_json"> & {edition:{editor_document?:DailyDocument}}, version:number) {
    const farm=issue.edition.editor_document?.sections.find(section=>section.key==="farm");
    const body=farm?.blocks.filter(block=>block.type!=="image" && block.type!=="byline")
      .map(block=>(block.runs??[]).map(run=>run.text).join("")).filter(text=>text.trim()).join("\n\n");
    if(!farm || !body) throw new Error("manual_farm_copy_missing");
    const credit=farm.blocks.filter(block=>block.type==="byline").map(block=>block.runs.map(run=>run.text).join("")).filter(Boolean).join("　") || "人工编辑";
    const byline=credit.startsWith("选题：") ? credit.slice(3).split("　撰稿：") : [];
    const publishedAt=new Date(issue.published_at).toISOString();
    const publicationId=`main:lingye-daily:${issue.issue_date}:revision:${issue.revision}:published:${issue.published_at}`;
    return {request:{issue_date:issue.issue_date,publication_id:publicationId,published_at:publishedAt,
      manual_article:{article_text:body,author_credit:credit,version}},article:{publication_id:publicationId,published_at:publishedAt,
      selector:byline.length===2 ? byline[0]! : "人工编辑",writer:byline.length===2 ? byline[1]! : credit,article_text:body,version:issue.revision}};
}
export function saveManualPublicationReference(database:Database.Database,date:string,article:ReporterArticle) {
    database.transaction(()=>{
      for(const table of ["lingye_daily_issues","lingye_daily_editor_drafts"]) {
        const row=database.prepare(`SELECT edition_json FROM ${table} WHERE issue_date=?`).get(date) as {edition_json:string};
        const edition=JSON.parse(row.edition_json);
        if(edition.reporter_articles.some((item:{publication_id:string})=>!item.publication_id.startsWith("main:lingye-daily:")))
          throw new Error("manual_publication_reference_conflict");
        edition.reporter_articles=[article];
        database.prepare(`UPDATE ${table} SET edition_json=? WHERE issue_date=?`).run(JSON.stringify(edition),date);
      }
    })();
}
