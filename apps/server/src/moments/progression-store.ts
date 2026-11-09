import type Database from "better-sqlite3";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord } from "./home-records.js";

export const progressionMetrics = ["posts", "comments", "likes", "received_likes", "gifts", "received_gifts"] as const;
export type ProgressionMetric = typeof progressionMetrics[number];
export type ProgressionTotals = Record<ProgressionMetric, number>;
export interface ProgressionEvent {
  sequence: number; event: string; source: string; target: string; occurredAt: number; totals: ProgressionTotals;
}
export interface ProgressionGrant { id: string; name: string; silver: number; legacy: boolean; sequence: number }
type Row = HomeRecord & { progression_seq: number; progression_ack: number; kind: string; source_id: string;
  author_id: string | null; occurred_at: number; [key: string]: string | number | null };
const totals = (row: Row): ProgressionTotals => Object.fromEntries(progressionMetrics.map(key => [key, Number(row[`progression_${key}`])])) as ProgressionTotals;
const fields = (value: ProgressionTotals) => Object.fromEntries(progressionMetrics.map(key => [`progression_${key}`, value[key]]));

/** Structured counters and delivery records stay in the existing table for this home. */
export class MomentsProgressionStore {
  private readonly records: HomeMomentRecords;
  constructor(private readonly database: Database.Database, ensureTable: EnsureMomentsHomeTable) {
    this.records = new HomeMomentRecords(database, ensureTable);
  }
  ensure(homeId: string, now: number): Row {
    const previous = this.records.all<Row>("progression", "record_id=?", ["progression"], homeId)[0];
    if (previous) return previous;
    // First use only. Historical cancelled likes have no surviving fact and are not invented.
    const distinctPosts = (kind: "like" | "comment") => new Set(this.records.all<{moment_id:string}>(kind,
      "target_home_id!=?", [homeId], homeId).map(row => row.moment_id)).size;
    const receivedLikes = this.records.all<HomeRecord & {moment_id:string}>("like", "target_home_id=? AND home_id!=?", [homeId,homeId]);
    const initial: ProgressionTotals = {
      posts: this.records.aggregate("post", "1", [], homeId).count,
      comments: distinctPosts("comment"), likes: distinctPosts("like"),
      received_likes: new Set(receivedLikes.map(row => `${row.home_id}:${row.moment_id}`)).size,
      gifts: this.records.aggregate("gift", "target_home_id!=? AND delivered_at IS NOT NULL", [homeId], homeId).count,
      received_gifts: this.records.aggregate("gift", "target_home_id=? AND home_id!=? AND delivered_at IS NOT NULL", [homeId,homeId]).count,
    };
    this.records.insert(homeId,"progression",{...fields(initial), progression_seq:1, progression_ack:0},"progression");
    this.records.insert(homeId,"progression_event",{...fields(initial), progression_seq:1, kind:"initial", source_id:"", occurred_at:now});
    return this.records.all<Row>("progression", "record_id=?", ["progression"], homeId)[0]!;
  }
  change(homeId: string, now: number, event: string, source: string, target: string,
    delta: Partial<ProgressionTotals>): void {
    const state = this.ensure(homeId,now), next = totals(state);
    for (const key of progressionMetrics) {
      next[key] += delta[key] ?? 0;
      if (!Number.isSafeInteger(next[key]) || next[key] < 0) throw new Error("Invalid moments progression counter");
    }
    const values = {...fields(next), progression_seq:state.progression_seq+1};
    this.records.update(homeId,"progression",values);
    this.records.insert(homeId,"progression_event",{...values,kind:event,source_id:source,author_id:target||null,occurred_at:now});
  }
  pending(homeId: string, now: number): {sequence:number;events:ProgressionEvent[]} {
    return this.database.transaction(() => {
      const state = this.ensure(homeId,now);
      const rows = this.records.all<Row>("progression_event", "progression_seq>?", [state.progression_ack], homeId);
      return {sequence:state.progression_seq,events:rows.sort((a,b)=>a.progression_seq-b.progression_seq).map(row=>({
        sequence:row.progression_seq,event:row.kind,source:row.source_id,target:row.author_id??"",occurredAt:row.occurred_at,totals:totals(row),
      }))};
    }).immediate();
  }
  acknowledge(homeId:string, sequence:number, grants:readonly ProgressionGrant[], now:number, taskNotices:readonly {sequence:number;text:string}[]=[]):void {
    this.database.transaction(() => {
      const state = this.ensure(homeId,now);
      if (sequence > state.progression_seq) throw new Error("Invalid progression acknowledgement");
      if (sequence <= state.progression_ack) return;
      for (const grant of grants) {
        const id = `progression-notice:${grant.id}`;
        if (!this.records.all("progression_notice","record_id=?",[id],homeId).length)
          this.records.insert(homeId,"progression_notice",{title:grant.name,progression_silver:grant.silver,kind:grant.legacy?"legacy":"fresh",created_at:now},id);
      }
      for(const notice of taskNotices){
        const id=`progression-task:${notice.sequence}`;
        if(!this.records.all("progression_notice","record_id=?",[id],homeId).length)
          this.records.insert(homeId,"progression_notice",{title:notice.text,progression_silver:0,kind:"task",created_at:now},id);
      }
      this.records.update(homeId,"progression",{progression_ack:sequence});
      for (const row of this.records.all<HomeRecord>("progression_event","progression_seq<=?",[sequence],homeId))
        this.records.delete(homeId,row.record_id);
    }).immediate();
  }
  takeNotices(homeId:string, now:number):string[] {
    return this.database.transaction(() => {
      const rows=this.records.all<HomeRecord & {title:string;progression_silver:number;kind:string}>("progression_notice","read_at IS NULL",[],homeId);
      const legacy=rows.filter(row=>row.kind==="legacy");
      const lines=legacy.length?[`🎁 机哩咕噜成就补发：已补发${legacy.length}项，共${legacy.reduce((sum,row)=>sum+row.progression_silver,0)}银币，称号已解锁。`]:[];
      for(const row of rows){
        if(row.kind==="task")lines.push(row.title);
        else if(row.kind!=="legacy")lines.push(`🎖️ 成就达成「${row.title}」：获得${row.progression_silver}银币，解锁同名称号。`);
        this.records.update(homeId,row.record_id,{read_at:now});
      }
      return lines;
    }).immediate();
  }
}
