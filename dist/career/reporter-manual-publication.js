import { createHash } from "node:crypto";
import { CareerDomainError } from "./contracts.js";
import { runInTransaction } from "./persistence.js";
import { installCareerSchema } from "./schema.js";
const fail = () => { throw new CareerDomainError("reporter_manual_publication_conflict", "reporter_manual_publication_conflict"); };
export function manualPublication(database, id) {
    return database.prepare("SELECT * FROM career_reporter_manual_publications WHERE publication_id=?").get(id);
}
export function registerManualPublication(database, backend, input) {
    installCareerSchema(database);
    const {issueDate,publicationId,publishedAt,manualArticle} = input;
    if (!manualArticle || Object.keys(manualArticle).sort().join(",") !== "article_text,author_credit,version" ||
        typeof manualArticle.article_text !== "string" || !manualArticle.article_text.trim() ||
        typeof manualArticle.author_credit !== "string" || !manualArticle.author_credit.trim() ||
        !Number.isSafeInteger(manualArticle.version) || manualArticle.version < 1 ||
        !new RegExp(`^main:lingye-daily:${issueDate}:revision:[1-9][0-9]*:published:${publishedAt}$`).test(publicationId)) fail();
    return runInTransaction(database, () => {
        const old=manualPublication(database,publicationId);
        if(old) {
            if(old.issue_date!==issueDate || old.published_at!==publishedAt || old.article_text!==manualArticle.article_text ||
                old.author_credit!==manualArticle.author_credit || old.version!==manualArticle.version) fail();
            return {issueDate,publicationId,publishedAt,status:"already_published"};
        }
        const issue=database.prepare("SELECT * FROM career_reporter_relay_issues WHERE issue_date=?").get(issueDate);
        if(issue?.status === "published" && !database.prepare("SELECT 1 FROM career_reporter_manual_publications WHERE issue_date=?").get(issueDate)) fail();
        // Only completed, evidenced selection work may own career performance.
        const selector=issue ? database.prepare(`SELECT job.* FROM career_jobs job
          JOIN career_work_records work ON work.job_id=job.job_id AND work.resident_id=job.worker_resident_id
            AND work.record_kind='completed'
          WHERE job.job_id=? AND job.status='completed'`).get(issue.selector_job_id) : null;
        let careerId=null;
        if(selector) {
            const articleId=`manual-daily-article:${publicationId}`;
            const version=database.prepare("SELECT COALESCE(MAX(version),0)+1 AS version FROM career_reporter_articles WHERE job_id=?").get(selector.job_id).version;
            database.prepare(`INSERT INTO career_reporter_articles(article_id,job_id,resident_id,pack_id,version,revision_kind,
              article_text,numeric_claims_json,payload_hash,idempotency_key,status,reviewer_reference,submitted_at,reviewed_at,published_at)
              VALUES(?,?,?,?,?,'initial',?,'[]',?,?,'published',?,?,?,?)`).run(articleId,selector.job_id,selector.worker_resident_id,
              issue.pack_id,version,manualArticle.article_text,createHash("sha256").update(manualArticle.article_text).digest("hex"),
              articleId,`manual-main:${manualArticle.author_credit}:version:${manualArticle.version}`,publishedAt,publishedAt,publishedAt);
            database.prepare("UPDATE career_reporter_publications SET status='superseded' WHERE job_id=? AND status='open'").run(selector.job_id);
            database.prepare(`INSERT INTO career_reporter_publications(publication_id,article_id,job_id,resident_id,article_version,
              published_at,evaluation_opens_at,evaluation_closes_at,status) VALUES(?,?,?,?,?,?,?,?,'open')`).run(publicationId,
              articleId,selector.job_id,selector.worker_resident_id,version,publishedAt,publishedAt,publishedAt+48*3600000);
            careerId=publicationId;
            database.prepare("UPDATE career_reporter_relay_issues SET article_id=? WHERE issue_date=?").run(articleId,issueDate);
        }
        database.prepare(`INSERT INTO career_reporter_manual_publications VALUES(?,?,?,?,?,?,?)`).run(publicationId,issueDate,
          manualArticle.article_text,manualArticle.author_credit,manualArticle.version,publishedAt,careerId);
        if(issue) {
            for(const jobId of [issue.selector_job_id,issue.writer_job_id,issue.reviewer_job_id,issue.submission_reviewer_job_id].filter(Boolean)) {
                const job=database.prepare("SELECT status FROM career_jobs WHERE job_id=?").get(jobId);
                if(job && ["available","accepted","active"].includes(job.status)) backend.trustedSystemCommands.cancelJob(jobId);
            }
            database.prepare("UPDATE career_reporter_relay_issues SET status='published',published_at=?,updated_at=? WHERE issue_date=?")
              .run(publishedAt,publishedAt,issueDate);
            // Unfinished AI writing stays cancelled, never marked completed.
            database.prepare("UPDATE career_reporter_story_workflows SET status='rejected' WHERE issue_reference=? AND status<>'published'")
              .run(issue.issue_reference);
        }
        return {issueDate,publicationId,publishedAt,status:"published"};
    });
}
export function manualEvaluationClosesAt(database, issueDate) {
    return database.prepare(`SELECT MIN(published_at) AS closes_at FROM (
      SELECT issue.issue_date,publication.published_at FROM career_reporter_relay_issues issue
        JOIN career_reporter_publications publication ON publication.article_id=issue.article_id
      UNION ALL SELECT issue_date,published_at FROM career_reporter_manual_publications
    ) WHERE issue_date>?`).get(issueDate).closes_at;
}
export function standaloneManualPublications(database,input,kind) {
    return database.prepare("SELECT * FROM career_reporter_manual_publications WHERE career_publication_id IS NULL AND version=(SELECT MAX(latest.version) FROM career_reporter_manual_publications latest WHERE latest.issue_date=career_reporter_manual_publications.issue_date) ORDER BY published_at DESC").all().map(row=>{
        const closesAt=manualEvaluationClosesAt(database,row.issue_date);
        const actor=kind==="human" ? input.humanActorKey : input.residentId;
        const hasLiked=!!database.prepare("SELECT 1 FROM career_reporter_manual_likes likes JOIN career_reporter_manual_publications pub USING(publication_id) WHERE pub.issue_date=? AND actor_kind=? AND actor_id=?")
          .get(row.issue_date,kind,actor);
        const open=input.now>=row.published_at && (closesAt===null || input.now<closesAt);
        const validLikes=database.prepare("SELECT COUNT(*) AS n FROM career_reporter_manual_likes JOIN career_reporter_manual_publications USING(publication_id) WHERE issue_date=?").get(row.issue_date).n;
        return {publicationId:row.publication_id,likeRef:`daily_like_${createHash("sha256").update(row.publication_id).digest("hex").slice(0,24)}`,
          authorResidentId:null,selectorResidentId:null,writerResidentId:null,reviewerResidentId:null,
          authorName:row.author_credit,articleText:row.article_text,sectionName:null,publishedAt:row.published_at,
          evaluationClosesAt:closesAt,validLikes,hasLiked,canLike:open&&!hasLiked,
          ...(kind==="human"?{ownHousehold:false}:{ownArticle:false}),status:open?"open":"closed"};
    });
}
export function recordStandaloneManualLike(database,input,kind) {
    const rows=standaloneManualPublications(database,input,kind);
    const row=rows.find(row=>kind==="human"?row.likeRef===input.likeRef:row.publicationId===input.publicationId);
    if(!row) return null;
    if(row.hasLiked) return {accepted:false,duplicate:true,publicationId:row.publicationId,likeRef:row.likeRef,validLikes:row.validLikes,residentId:input.residentId,jobId:null};
    if(!row.canLike) throw new CareerDomainError("reporter_evaluation_window_closed","reporter_evaluation_window_closed");
    database.prepare("INSERT INTO career_reporter_manual_likes VALUES(?,?,?,?,?)").run(row.publicationId,kind,
      kind==="human"?input.humanActorKey:input.residentId,kind==="human"?input.viaResidentId:input.residentId,input.now);
    return {accepted:true,duplicate:false,publicationId:row.publicationId,likeRef:row.likeRef,validLikes:row.validLikes+1,residentId:input.residentId,jobId:null};
}

export function manualPerformanceWorkflow(database,publicationId) {
    const manual=manualPublication(database,publicationId);
    if(!manual) return null;
    const issue=database.prepare("SELECT * FROM career_reporter_relay_issues WHERE issue_date=?").get(manual.issue_date);
    return issue ? {issueReference:issue.issue_reference,selectorJobId:issue.selector_job_id,reviewerJobId:null} : null;
}
