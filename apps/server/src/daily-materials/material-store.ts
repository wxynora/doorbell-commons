import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dailyMaterialWindow, type PublishedAnnouncement, type UpdateMaterial } from "./published-announcements.js";
import type { publicGlimmer } from "./farm-client.js";

export const MATERIAL_KINDS = ["group", "npc", "announcements", "glimmer"] as const;
export type MaterialKind = typeof MATERIAL_KINDS[number];
export interface MaterialState {
  status: "missing" | "ready" | "failed";
  last_attempt: "ready" | "failed" | null;
  data?: unknown;
}

type Glimmer = ReturnType<typeof publicGlimmer>;
type Group = {issue_date:string;period_start:string;period_end:string;coverage_status:string;coverage_note:string;
  quote_candidates_available:boolean;topics:{topic:string;summary:string}[]};
type Npc = {window:{startMs:number;endMs:number;timeZone:"Asia/Shanghai"};recordingStartedAt:number|null;
  unknownEffectsPresent:boolean;farms:{farmName:string|null;summary:string;unknownEffectsPresent:boolean}[]};
type SnapshotRow = {snapshot_id:string;glimmer_available:number;window_start:number;window_end:number;recording_started_at:number|null};
type ResultRow = {material_id:string;issue_date:string;kind:MaterialKind;has_data:number;last_attempt:"ready"|"failed";
  source_id:string|null;period_start:string;period_end:string;coverage_status:string;coverage_note:string;quote_candidates_available:number;
  window_start:number;window_end:number;recording_started_at:number|null;unknown_effects_present:number};

export function materialExpiresAt(issueDate:string):number {
  return dailyMaterialWindow(issueDate).end + 48 * 3_600_000;
}
function writableExpiry(issueDate:string,now:number):number {
  const expiry=materialExpiresAt(issueDate);
  if(now>=expiry) throw new RangeError("materials_expired");
  return expiry;
}

/** Same connection as Main; all material payloads are ordinary relational rows. */
export class DailyMaterialStore {
  constructor(private readonly database: Database.Database) {}

  prune(now:number):void {
    this.database.transaction(()=>{
      this.database.prepare("DELETE FROM lingye_daily_materials WHERE expires_at <= ?").run(now);
      this.database.prepare("DELETE FROM lingye_daily_material_snapshots WHERE expires_at <= ?").run(now);
    })();
  }

  saveSourceSnapshot(issueDate:string,announcements:PublishedAnnouncement[],input:unknown|null,now:number):string {
    const expires=writableExpiry(issueDate,now);
    const id=randomUUID();
    const glimmer=input as Glimmer|null;
    return this.database.transaction(()=>{
      this.database.prepare(`INSERT INTO lingye_daily_material_snapshots
        (snapshot_id,issue_date,created_at,expires_at,glimmer_available,window_start,window_end,recording_started_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(id,issueDate,now,expires,glimmer?1:0,
          glimmer?.window.startMs??null,glimmer?.window.endMs??null,glimmer?.recordingStartedAt??null);
      const insertAnnouncement=this.database.prepare(`INSERT INTO lingye_daily_material_snapshot_announcements
        (snapshot_id,position,announcement_id,title,body,published_at) VALUES(?,?,?,?,?,?)`);
      announcements.forEach((a,i)=>insertAnnouncement.run(id,i,a.id,a.title,a.body,a.publishedAt));
      const variant=this.database.prepare(`INSERT INTO lingye_daily_material_glimmer_variants
        (snapshot_id,position,variant_name,variant_type,feeding_count,did_not_follow_count) VALUES(?,?,?,?,?,?)`);
      const dish=this.database.prepare(`INSERT INTO lingye_daily_material_glimmer_dishes
        (snapshot_id,variant_position,position,name,quantity) VALUES(?,?,?,?,?)`);
      const success=this.database.prepare(`INSERT INTO lingye_daily_material_glimmer_successes
        (snapshot_id,variant_position,position,farm_name,occurred_at,attempt,guaranteed) VALUES(?,?,?,?,?,?,?)`);
      glimmer?.variants.forEach((v,i)=>{
        variant.run(id,i,v.variantName,v.variantType,v.feedingCount,v.didNotFollowCount);
        v.dishes.forEach((d,j)=>dish.run(id,i,j,d.name,d.quantity));
        v.successes.forEach((s,j)=>success.run(id,i,j,s.farmName,s.at,s.attemptInBaseKindPityCycle,s.guaranteed?1:0));
      });
      return id;
    })();
  }

  private glimmer(row:SnapshotRow):Glimmer|null {
    if(!row.glimmer_available) return null;
    const variants=this.database.prepare(`SELECT position,variant_name,variant_type,feeding_count,did_not_follow_count
      FROM lingye_daily_material_glimmer_variants WHERE snapshot_id=? ORDER BY position`).all(row.snapshot_id) as
      {position:number;variant_name:string;variant_type:string;feeding_count:number;did_not_follow_count:number}[];
    return {window:{startMs:row.window_start,endMs:row.window_end,timeZone:"Asia/Shanghai"},recordingStartedAt:row.recording_started_at,
      variants:variants.map((v)=>({variantName:v.variant_name,variantType:v.variant_type,feedingCount:v.feeding_count,
        didNotFollowCount:v.did_not_follow_count,
        dishes:this.database.prepare(`SELECT name,quantity FROM lingye_daily_material_glimmer_dishes
          WHERE snapshot_id=? AND variant_position=? ORDER BY position`).all(row.snapshot_id,v.position) as {name:string;quantity:number}[],
        successes:(this.database.prepare(`SELECT farm_name,occurred_at,attempt,guaranteed FROM lingye_daily_material_glimmer_successes
          WHERE snapshot_id=? AND variant_position=? ORDER BY position`).all(row.snapshot_id,v.position) as
          {farm_name:string|null;occurred_at:number;attempt:number;guaranteed:number}[]).map((s)=>({farmName:s.farm_name,
            at:s.occurred_at,attemptInBaseKindPityCycle:s.attempt,guaranteed:!!s.guaranteed,pityScope:"base_kind" as const})),
      }))};
  }

  sourceSnapshot(issueDate:string,id:string,now:number):{announcements:PublishedAnnouncement[];glimmer:Glimmer|null}|undefined {
    const row=this.database.prepare(`SELECT snapshot_id,glimmer_available,window_start,window_end,recording_started_at
      FROM lingye_daily_material_snapshots WHERE issue_date=? AND snapshot_id=? AND expires_at>?`).get(issueDate,id,now) as SnapshotRow|undefined;
    if(!row) return undefined;
    const announcements=this.database.prepare(`SELECT announcement_id AS id,title,body,published_at AS publishedAt
      FROM lingye_daily_material_snapshot_announcements WHERE snapshot_id=? ORDER BY position`).all(id) as PublishedAnnouncement[];
    return {announcements,glimmer:this.glimmer(row)};
  }

  saveReady(issueDate:string,kind:MaterialKind,data:unknown,now:number,sourceId:string|null=null):void {
    const expires=writableExpiry(issueDate,now);
    const id=`${issueDate}:${kind}`;
    const group=kind==="group"?data as Group:null;
    const npc=kind==="npc"?data as Npc:null;
    this.database.transaction(()=>{
      this.database.prepare(`INSERT INTO lingye_daily_materials
        (material_id,issue_date,kind,has_data,last_attempt,updated_at,expires_at,source_id,
        period_start,period_end,coverage_status,coverage_note,quote_candidates_available,
        window_start,window_end,recording_started_at,unknown_effects_present)
        VALUES(?,?,?,1,'ready',?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(issue_date,kind) DO UPDATE SET has_data=1,last_attempt='ready',updated_at=excluded.updated_at,
        source_id=excluded.source_id,period_start=excluded.period_start,period_end=excluded.period_end,
        coverage_status=excluded.coverage_status,coverage_note=excluded.coverage_note,
        quote_candidates_available=excluded.quote_candidates_available,window_start=excluded.window_start,
        window_end=excluded.window_end,recording_started_at=excluded.recording_started_at,
        unknown_effects_present=excluded.unknown_effects_present`)
        .run(id,issueDate,kind,now,expires,sourceId,group?.period_start??null,group?.period_end??null,
          group?.coverage_status??null,group?.coverage_note??null,group?Number(group.quote_candidates_available):null,
          npc?.window.startMs??null,npc?.window.endMs??null,npc?.recordingStartedAt??null,npc?Number(npc.unknownEffectsPresent):null);
      for(const table of ["lingye_daily_material_topics","lingye_daily_material_npc_summaries","lingye_daily_material_updates"])
        this.database.prepare(`DELETE FROM ${table} WHERE material_id=?`).run(id);
      const topic=this.database.prepare("INSERT INTO lingye_daily_material_topics(material_id,position,topic,summary) VALUES(?,?,?,?)");
      group?.topics.forEach((v,i)=>topic.run(id,i,v.topic,v.summary));
      const farm=this.database.prepare(`INSERT INTO lingye_daily_material_npc_summaries
        (material_id,position,farm_name,summary,unknown_effects_present) VALUES(?,?,?,?,?)`);
      npc?.farms.forEach((v,i)=>farm.run(id,i,v.farmName,v.summary,Number(v.unknownEffectsPresent)));
      if(kind==="announcements") {
        const update=this.database.prepare(`INSERT INTO lingye_daily_material_updates
          (material_id,position,announcement_id,title,published_at,kind,excerpt) VALUES(?,?,?,?,?,?,?)`);
        (data as UpdateMaterial[]).forEach((v,i)=>update.run(id,i,v.announcementId,v.title,v.publishedAt,v.kind,v.excerpt));
      }
    })();
  }

  saveFailure(issueDate:string,kind:MaterialKind,now:number):void {
    const expires=writableExpiry(issueDate,now);
    this.database.prepare(`INSERT INTO lingye_daily_materials(material_id,issue_date,kind,has_data,last_attempt,updated_at,expires_at)
      VALUES(?,?,?,0,'failed',?,?) ON CONFLICT(issue_date,kind) DO UPDATE SET
      last_attempt='failed',updated_at=excluded.updated_at`).run(`${issueDate}:${kind}`,issueDate,kind,now,expires);
  }

  read(issueDate:string,now:number):Record<MaterialKind,MaterialState> {
    const rows=this.database.prepare("SELECT * FROM lingye_daily_materials WHERE issue_date=? AND expires_at>?")
      .all(issueDate,now) as ResultRow[];
    const states=Object.fromEntries(MATERIAL_KINDS.map((kind)=>[kind,{status:"missing",last_attempt:null}])) as Record<MaterialKind,MaterialState>;
    for(const row of rows){
      if(!row.has_data){states[row.kind]={status:"failed",last_attempt:row.last_attempt};continue;}
      let data:unknown;
      if(row.kind==="group") data={issue_date:row.issue_date,period_start:row.period_start,period_end:row.period_end,
        coverage_status:row.coverage_status,coverage_note:row.coverage_note,quote_candidates_available:!!row.quote_candidates_available,
        topics:this.database.prepare("SELECT topic,summary FROM lingye_daily_material_topics WHERE material_id=? ORDER BY position").all(row.material_id)};
      else if(row.kind==="npc") data={window:{startMs:row.window_start,endMs:row.window_end,timeZone:"Asia/Shanghai"},
        recordingStartedAt:row.recording_started_at,unknownEffectsPresent:!!row.unknown_effects_present,
        farms:(this.database.prepare(`SELECT farm_name,summary,unknown_effects_present FROM lingye_daily_material_npc_summaries
          WHERE material_id=? ORDER BY position`).all(row.material_id) as {farm_name:string|null;summary:string;unknown_effects_present:number}[])
          .map((v)=>({farmName:v.farm_name,summary:v.summary,unknownEffectsPresent:!!v.unknown_effects_present}))};
      else if(row.kind==="announcements") data=this.database.prepare(`SELECT announcement_id AS announcementId,title,
        published_at AS publishedAt,kind,excerpt FROM lingye_daily_material_updates WHERE material_id=? ORDER BY position`).all(row.material_id);
      else data=this.sourceSnapshot(issueDate,row.source_id!,now)?.glimmer;
      if(data!==undefined&&data!==null) states[row.kind]={status:"ready",last_attempt:row.last_attempt,data};
    }
    return states;
  }
}
