import { installPlayerPatrolSchema } from "./player-patrol-schema.js";
import { SecurityDomainError } from "./service.js";
const OFFSET = 8*3600000;
const DAY = 24*3600000;
export const PLAYER_PATROL_DURATION_MS = 30*60000;
export const patrolDate = at => new Date(at+OFFSET).toISOString().slice(0,10);
export const patrolDayStart = date => Date.parse(`${date}T00:00:00+08:00`);
function fail(code) { throw new SecurityDomainError(code); }
let sequence=0;
function atomic(db, operation) {
    const nested=db.isTransaction, key=`player_patrol_${++sequence}`;
    db.exec(nested?`SAVEPOINT ${key}`:"BEGIN IMMEDIATE");
    try { const value=operation(); db.exec(nested?`RELEASE SAVEPOINT ${key}`:"COMMIT"); return value; }
    catch(error) { db.exec(nested?`ROLLBACK TO SAVEPOINT ${key}`:"ROLLBACK");
        if(nested) db.exec(`RELEASE SAVEPOINT ${key}`); throw error; }
}
const mapDay = row => ({beijingDate:row.beijing_date, residentId:row.resident_id,
    employmentId:row.employment_id, windows:JSON.parse(row.windows_json), revision:row.revision});

export class PlayerPatrolService {
    #database; #now; #getTheftFact; #createJob; #assignJob; #getJob; #recordDecision; #completeJob; #catchTheft; #quoteTheft;
    constructor(database, options={}) {
        this.#database=database; this.#now=options.now??Date.now;
        this.#getTheftFact=options.getCaughtCropTheftFact;
        this.#createJob=options.createJob; this.#assignJob=options.assignJob;
        this.#getJob=options.getJob; this.#recordDecision=options.recordDecision;
        this.#completeJob=options.completeJob; this.#catchTheft=options.catchTheft;
        this.#quoteTheft=options.quoteTheft;
        installPlayerPatrolSchema(database);
    }
    candidates(at=this.#now()) {
        return this.#database.prepare(`SELECT employment.resident_id, employment.employment_id, employment.hired_at
          FROM career_employments employment
          JOIN career_duty_days duty ON duty.employment_id=employment.employment_id
            AND duty.resident_id=employment.resident_id
          WHERE employment.career='constable' AND employment.institution='public_security'
            AND employment.status='active' AND employment.availability='available'
            AND duty.career='constable' AND duty.status='scheduled' AND duty.duty_date=?
            AND EXISTS (SELECT 1 FROM career_certificates certificate
              WHERE certificate.resident_id=employment.resident_id AND certificate.career='constable'
                AND certificate.status='active' AND (certificate.effective_at IS NULL OR certificate.effective_at<=?))
            AND NOT EXISTS (SELECT 1 FROM security_detentions detention
              WHERE detention.resident_id=employment.resident_id AND detention.status='active'
                AND detention.scheduled_release_at>?)
          ORDER BY employment.hired_at, employment.employment_id COLLATE BINARY`)
            .all(patrolDate(at),at,at);
    }
    ensureDay(at=this.#now()) {
        const date=patrolDate(at);
        return atomic(this.#database,()=>{
            const existing=this.#database.prepare("SELECT * FROM security_player_patrol_days WHERE beijing_date=?").get(date);
            if(existing) return mapDay(existing);
            const candidates=this.candidates(at);
            const previous=this.#database.prepare(`SELECT day.resident_id, employment.hired_at, day.employment_id
              FROM security_player_patrol_days day LEFT JOIN career_employments employment
                ON employment.employment_id=day.employment_id
              WHERE day.beijing_date<? AND day.resident_id IS NOT NULL ORDER BY day.beijing_date DESC LIMIT 1`).get(date);
            const next=previous?.hired_at===undefined || previous.hired_at===null?null:
                candidates.find(row=>row.hired_at>previous.hired_at ||
                    (row.hired_at===previous.hired_at && row.employment_id>previous.employment_id));
            const selected=next??candidates[0]??null;
            this.#database.prepare(`INSERT INTO security_player_patrol_days
              (beijing_date,resident_id,employment_id,created_at,updated_at) VALUES (?,?,?,?,?)`)
                .run(date,selected?.resident_id??null,selected?.employment_id??null,at,at);
            if(selected) this.enqueue({noticeId:`patrol-day:${date}:${selected.resident_id}`,
                residentId:selected.resident_id,kind:"patrol_day",fact:{beijingDate:date},at});
            return mapDay(this.#database.prepare("SELECT * FROM security_player_patrol_days WHERE beijing_date=?").get(date));
        });
    }
    hasPlayerDuty(at=this.#now()) {
        const day=this.ensureDay(at);
        return day.residentId!==null && this.candidates(at).some(row=>row.resident_id===day.residentId);
    }
    getOwnDay(residentId,at=this.#now()) {
        const day=this.ensureDay(at);
        return {...day, onDuty:day.residentId===residentId && this.hasPlayerDuty(at)};
    }
    setWindows({residentId,beijingDate,revision,text}) {
        const at=this.#now();
        return atomic(this.#database,()=>{
            const prior=this.#database.prepare(`SELECT text,result_json FROM security_player_patrol_selections
                WHERE beijing_date=? AND resident_id=? AND requested_revision=?`).get(beijingDate,residentId,revision);
            if(prior) {
                if(prior.text!==text) fail("security_patrol_revision_conflict");
                return JSON.parse(prior.result_json);
            }
            const day=this.ensureDay(at);
            if(day.beijingDate!==beijingDate || day.residentId!==residentId || !this.hasPlayerDuty(at))
                fail("security_patrol_not_on_duty");
            if(day.revision!==revision) fail("security_patrol_revision_conflict");
            if(typeof text!=="string" || !/^(?:[01]\d|2[0-3]):[0-5]\d,(?:[01]\d|2[0-3]):[0-5]\d,(?:[01]\d|2[0-3]):[0-5]\d$/.test(text))
                fail("security_patrol_invalid_windows");
            const start=patrolDayStart(day.beijingDate);
            const windows=text.split(",").map(value=>{
                const [h,m]=value.split(":").map(Number); const startedAt=start+(h*60+m)*60000;
                return {startedAt,endedAt:startedAt+PLAYER_PATROL_DURATION_MS};
            }).sort((a,b)=>a.startedAt-b.startedAt);
            const preserved=day.windows.filter(window=>window.startedAt<=at);
            if(windows.some((window,i)=> window.endedAt>start+DAY || (i>0 && window.startedAt<windows[i-1].endedAt) ||
                (window.startedAt<at && !preserved.some(old=>old.startedAt===window.startedAt))) ||
                preserved.some(old=>!windows.some(window=>window.startedAt===old.startedAt)))
                fail("security_patrol_invalid_windows");
            this.#database.prepare(`UPDATE security_player_patrol_days
              SET windows_json=?, revision=revision+1,updated_at=? WHERE beijing_date=? AND resident_id=? AND revision=?`)
                .run(JSON.stringify(windows),at,day.beijingDate,residentId,revision);
            this.#database.prepare(`UPDATE security_patrol_outbox SET acknowledged_at=?
              WHERE notice_id=? AND acknowledged_at IS NULL`).run(at,`patrol-day:${day.beijingDate}:${residentId}`);
            const result=this.getOwnDay(residentId,at);
            this.#database.prepare(`INSERT INTO security_player_patrol_selections
                (beijing_date,resident_id,requested_revision,text,result_json) VALUES (?,?,?,?,?)`)
                .run(beijingDate,residentId,revision,text,JSON.stringify(result));
            return result;
        });
    }
    patrolResidentAt(occurredAt) {
        const stored=this.#database.prepare("SELECT * FROM security_player_patrol_days WHERE beijing_date=?").get(patrolDate(occurredAt));
        if(!stored) return null;
        const day=mapDay(stored);
        if(!this.hasPlayerDuty(occurredAt)) return null;
        return day.windows.some(window=>occurredAt>=window.startedAt && occurredAt<window.endedAt)
            ?day.residentId:null;
    }
    captureTheft(source) {
        return atomic(this.#database,()=>{
            const authority=this.#getTheftFact?.({sourceId:source.sourceId});
            if(!authority || authority.kind!=="stolen" || authority.successful!==true ||
                authority.sourceId!==source.sourceId || authority.occurredAt>this.#now())
                fail("security_crop_theft_not_caught");
            const target=this.patrolResidentAt(authority.occurredAt);
            if(!target || target===authority.residentId || target===source.ownerResidentId ||
                source.career!=="constable" || source.sourceType!=="farm_interaction_complaint") return null;
            let row=this.#database.prepare("SELECT * FROM security_patrol_cases WHERE source_id=?").get(source.sourceId);
            if(!row) {
                const existing=this.#database.prepare(`SELECT job_id FROM career_jobs
                    WHERE source_type=? AND source_id=?`).get(source.sourceType,source.sourceId);
                const jobId=existing?.job_id??`patrol:${source.sourceId}`;
                this.#database.prepare(`INSERT OR IGNORE INTO career_commission_source_facts
                    (source_id,source_type,fact_json,recorded_at) VALUES (?,?,?,?)`)
                    .run(source.sourceId,source.sourceType,JSON.stringify(source.fact),this.#now());
                if(!existing) this.#createJob({ ...source, jobId });
                this.#database.prepare(`INSERT INTO security_patrol_cases
                    (source_id,job_id,target_resident_id,fact_json,authority_json,created_at) VALUES (?,?,?,?,?,?)`)
                    .run(source.sourceId,jobId,target,JSON.stringify(source.fact),JSON.stringify(authority),this.#now());
                row=this.#database.prepare("SELECT * FROM security_patrol_cases WHERE source_id=?").get(source.sourceId);
            }
            this.enqueue({noticeId:`patrol-theft:${row.source_id}`,residentId:row.target_resident_id,
                kind:"patrol_theft",fact:{sourceId:row.source_id,jobId:row.job_id,...JSON.parse(row.fact_json)},
                at:row.created_at});
            this.assignPending(row.target_resident_id);
            return row;
        });
    }
    assignPending(residentId) {
        for(const row of this.#database.prepare(`SELECT patrol.* FROM security_patrol_cases patrol
            JOIN career_jobs job ON job.job_id=patrol.job_id
            WHERE patrol.target_resident_id=? AND job.status IN ('available','assigned','accepted','active')
            ORDER BY patrol.created_at,patrol.source_id`).all(residentId)) {
            let assigned;
            try { assigned=this.#assignJob({jobId:row.job_id}); }
            catch(error) { if(error.code==="authoritative_worker_unavailable") continue; throw error; }
            if(assigned.workerResidentId!==residentId) fail("security_patrol_assignment_conflict");
            this.enqueue({noticeId:`patrol-theft:${row.source_id}`,residentId,kind:"patrol_theft",
                fact:{sourceId:row.source_id,jobId:row.job_id,...JSON.parse(row.fact_json)},at:row.created_at});
        }
    }
    inspectOwnCases(residentId) {
        return atomic(this.#database,()=>{
            this.assignPending(residentId);
            const result=[];
            for(const row of this.#database.prepare(`SELECT patrol.* FROM security_patrol_cases patrol
                JOIN career_jobs job ON job.job_id=patrol.job_id
                WHERE patrol.target_resident_id=? AND job.worker_resident_id=?
                  AND job.status IN ('assigned','accepted','active') ORDER BY patrol.created_at,patrol.source_id`)
                .all(residentId,residentId)) {
                if(!this.candidates().some(candidate=>candidate.resident_id===residentId)) continue;
                const quote=this.#quoteTheft({sourceId:row.source_id});
                // Viewing the authoritative theft record performs this actual evidence check.
                this.#recordDecision({jobId:row.job_id,workerResidentId:residentId,
                    idempotencyKey:`patrol-check:${row.job_id}`,kind:"check",
                    optionReference:`patrol:check:${row.job_id}`,resultReference:row.source_id,
                    consumesResources:false,changesWorld:false});
                result.push({jobId:row.job_id,sourceId:row.source_id,fact:JSON.parse(row.fact_json),quote});
            }
            return result;
        });
    }
    resolveOwnCase({residentId,jobId,disposition,durationHours}) {
        return atomic(this.#database,()=>{
            const row=this.#database.prepare("SELECT * FROM security_patrol_cases WHERE job_id=? AND target_resident_id=?")
                .get(jobId,residentId);
            if(!row || !["fine","detention"].includes(disposition)) fail("security_patrol_case_not_available");
            const prior=this.#database.prepare("SELECT * FROM security_patrol_resolutions WHERE job_id=?").get(jobId);
            if(prior) {
                if(prior.resident_id!==residentId || prior.disposition!==disposition) fail("security_disposition_conflict");
                return JSON.parse(prior.result_json);
            }
            const job=this.#getJob(jobId);
            if(job.workerResidentId!==residentId || !["assigned","accepted","active"].includes(job.status) ||
                job.decisionCount<1 || !this.candidates().some(candidate=>candidate.resident_id===residentId))
                fail("security_patrol_case_not_available");
            const quote=this.#quoteTheft({sourceId:row.source_id});
            if(quote.durationHours!==durationHours) fail("security_patrol_revision_conflict");
            const at=this.#now(), key=`patrol-resolve:${jobId}:${disposition}`;
            const enforcement=this.#catchTheft({sourceId:row.source_id,caughtBy:"human_constable",
                actorResidentId:residentId,disposition,caughtAt:at});
            const reference=enforcement.fine?.paymentReceiptId??enforcement.detention.detentionId;
            this.#database.prepare(`INSERT INTO career_security_resolutions
                (resolution_id,job_id,resident_id,result_kind,note,resolved_at)
                VALUES (?,?,?,'farm_crop_theft',NULL,?)`).run(key,jobId,residentId,at);
            this.#recordDecision({jobId,workerResidentId:residentId,idempotencyKey:key,
                kind:"question",optionReference:`patrol:resolve:${jobId}:${disposition}:${durationHours}`,
                resultReference:reference,consumesResources:false,changesWorld:true});
            const completed=this.#completeJob({jobId,workerResidentId:residentId,
                validationPassed:true,worldResultReference:reference});
            const result={completed,enforcement};
            this.#database.prepare(`INSERT INTO security_patrol_resolutions
                (job_id,resident_id,disposition,result_json,resolved_at) VALUES (?,?,?,?,?)`)
                .run(jobId,residentId,disposition,JSON.stringify(result),at);
            this.#database.prepare(`UPDATE security_patrol_outbox SET acknowledged_at=?
                WHERE notice_id=? AND acknowledged_at IS NULL`).run(at,`patrol-theft:${row.source_id}`);
            this.assignPending(residentId);
            return result;
        });
    }
    enqueue({noticeId,residentId,kind,fact,at=this.#now()}) {
        this.#database.prepare(`INSERT INTO security_patrol_outbox
          (notice_id,recipient_resident_id,kind,fact_json,created_at) VALUES (?,?,?,?,?)
          ON CONFLICT(notice_id) DO NOTHING`).run(noticeId,residentId,kind,JSON.stringify(fact),at);
    }
    pendingNotices(residentId) {
        return this.#database.prepare(`SELECT * FROM security_patrol_outbox
          WHERE recipient_resident_id=? AND acknowledged_at IS NULL ORDER BY created_at,notice_id`)
            .all(residentId).filter(row=> {
                const fact=JSON.parse(row.fact_json);
                if(row.kind==="patrol_day") return fact.beijingDate===patrolDate(this.#now()) && this.getOwnDay(residentId).onDuty;
                return Boolean(this.#database.prepare(`SELECT 1 FROM career_jobs WHERE job_id=?
                    AND status IN ('available','assigned','accepted','active')`).get(fact.jobId));
            }).map(row=>({noticeId:row.notice_id,residentId:row.recipient_resident_id,
                kind:row.kind,fact:JSON.parse(row.fact_json),createdAt:row.created_at}));
    }
    acknowledgeNotices(residentId,noticeIds) {
        return atomic(this.#database,()=>{
            for(const id of noticeIds) this.#database.prepare(`UPDATE security_patrol_outbox
              SET acknowledged_at=? WHERE notice_id=? AND recipient_resident_id=? AND acknowledged_at IS NULL`)
                .run(this.#now(),id,residentId);
        });
    }
}
