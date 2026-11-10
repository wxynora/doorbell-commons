import type Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";
import { readEditionRows, saveEditionRows } from "./relational-edition.js";
import { deleteRuntimeRows, publicRuntimeFromState, readPublicRuntimes, readRuntimeRows, readRuntimeRound, saveRuntimeRows, type PublicRuntime } from "./relational-runtime.js";
import { saveBattleRows } from "./relational-battle.js";
import { readMatchEditionView, readRoundRecovery, readScheduledSnowEditions, readTechnicalView } from "./relational-match-view.js";

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const terminalStatus = (status: string) => ["completed", "forfeit", "cancelled"].includes(status);
export const snowRoundRecoveryKey = (matchId:string,index:number) => JSON.stringify([matchId,index]);
const recoveryKeys = (matchId:string) => [0,1,2].map(index=>snowRoundRecoveryKey(matchId,index));
function publicRuntimeChanged(previous:PublicRuntime|undefined,current:PublicRuntime):boolean {
  if(!previous)return true;
  const {lastSeenAt:before,...beforePublic}=previous;
  const {lastSeenAt:after,...afterPublic}=current;
  return !isDeepStrictEqual(beforePublic,afterPublic) || before<current.matchAt && after>=current.matchAt;
}
type SnapshotEdition = {
  id:string; registrationOpenAt:string; matches:{id:string;status:string}[];
  roundRecovery?:Record<string,unknown>;
};
type SnapshotRef = {editionId:string;matchId:string};

/** Uses the community connection; the owning migration creates snow_tournament_editions. */
export class SnowTournamentStore {
  private readonly listeners=new Set<()=>void>();
  private transactions:boolean[]=[];
  private queued=false;
  constructor(private readonly db: Database.Database) {}

  subscribe(listener:()=>void) {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private changed() {
    if(this.transactions.length){this.transactions[this.transactions.length-1]=true;return;}
    if(this.queued)return;
    this.queued=true;queueMicrotask(()=>{this.queued=false;for(const listener of this.listeners)listener();});
  }

  read(id: string): unknown | null {
    return readEditionRows(this.db,id);
  }

  readMatchEdition(editionId:string,matchId:string) {return readMatchEditionView(this.db,editionId,matchId);}
  readEditionPhase(editionId:string) {
    return (this.db.prepare("SELECT phase FROM snow_tournament_edition_details WHERE edition_id=?").get(editionId) as {phase:string}|undefined)?.phase;
  }
  readTechnical(editionId:string) {return readTechnicalView(this.db,editionId);}
  readRoundRecovery(editionId:string,matchId:string,index:number) {return readRoundRecovery(this.db,editionId,matchId,index);}

  latest(): unknown | null {
    const row = this.db.prepare("SELECT edition_id FROM snow_tournament_editions ORDER BY registration_open_at DESC, edition_id DESC LIMIT 1").get() as { edition_id: string } | undefined;
    return row ? this.read(row.edition_id) : null;
  }

  unfinishedSchedules() {return readScheduledSnowEditions(this.db);}
  readSchedule(id:string) {return readScheduledSnowEditions(this.db,id)[0]??null;}

  /** Finished editions may still owe a verified refund or reward after a restart. */
  all():unknown[] {
    const rows=this.db.prepare("SELECT edition_id FROM snow_tournament_editions ORDER BY registration_open_at,edition_id").all() as {edition_id:string}[];
    return rows.map(row=>this.read(row.edition_id));
  }

  readMatchRuntime(editionId: string, matchId: string): unknown | null {
    const invalid=this.db.prepare("SELECT raw_text FROM snow_tournament_invalid_runtime WHERE edition_id=? AND match_id=?")
      .get(editionId,matchId) as {raw_text:string}|undefined;
    if(invalid)return JSON.parse(invalid.raw_text);
    return readRuntimeRows(this.db,editionId,matchId);
  }

  readMatchTerminal(editionId:string,matchId:string,index:number) {
    const invalid=this.db.prepare("SELECT raw_text FROM snow_tournament_invalid_runtime WHERE edition_id=? AND match_id=?")
      .get(editionId,matchId) as {raw_text:string}|undefined;
    if(invalid)return JSON.parse(invalid.raw_text)?.rounds?.[index]??null;
    return readRuntimeRound(this.db,editionId,matchId,index);
  }

  readPublicMatchRuntimes(editionId:string,matchId?:string) {
    return readPublicRuntimes(this.db,editionId,matchId);
  }

  readMatchRuntimeText(editionId:string,matchId:string):string|null {
    const invalid=this.db.prepare("SELECT raw_text FROM snow_tournament_invalid_runtime WHERE edition_id=? AND match_id=?")
      .get(editionId,matchId) as {raw_text:string}|undefined;
    if(invalid)return invalid.raw_text;
    const state=this.readMatchRuntime(editionId,matchId);
    return state===null?null:JSON.stringify(state);
  }

  saveMatchRuntime(editionId: string, matchId: string, state: unknown): void {
    let publicChanged=false;
    this.db.transaction(()=>{
      const invalid=this.db.prepare("SELECT 1 FROM snow_tournament_invalid_runtime WHERE edition_id=? AND match_id=?").get(editionId,matchId);
      const previous=invalid?undefined:readPublicRuntimes(this.db,editionId,matchId).get(matchId);
      saveRuntimeRows(this.db,editionId,matchId,state as Record<string,unknown>);
      if(invalid)this.db.prepare("DELETE FROM snow_tournament_invalid_runtime WHERE edition_id=? AND match_id=?").run(editionId,matchId);
      const current=publicRuntimeFromState(state as Record<string,unknown>);
      publicChanged=publicRuntimeChanged(previous,current);
    })();
    if(publicChanged)this.changed();
  }

  /** Normal running ticks change only the clock, automated seats and battle entities. */
  saveBattleTick(editionId:string,matchId:string,state:Record<string,any>,previous:PublicRuntime):void {
    this.db.transaction(()=>{
      this.db.prepare("UPDATE snow_tournament_runtime_details SET last_seen_at=? WHERE edition_id=? AND match_id=?")
        .run(state.lastSeenAt,editionId,matchId);
      this.db.prepare("UPDATE snow_tournament_active_rounds SET next_tick_at=? WHERE edition_id=? AND match_id=?")
        .run(state.active.nextTickAt,editionId,matchId);
      if(!isDeepStrictEqual(previous.active?.npc,state.active.npc)) {
        this.db.prepare("DELETE FROM snow_tournament_active_participants WHERE edition_id=? AND match_id=? AND kind='npc'").run(editionId,matchId);
        const insert=this.db.prepare("INSERT INTO snow_tournament_active_participants(edition_id,match_id,kind,position,resident_id) VALUES(?,?,'npc',?,?)");
        state.active.npc.forEach((id:string,position:number)=>insert.run(editionId,matchId,position,id));
      }
      saveBattleRows(this.db,editionId,matchId,state.active.battle);
    })();
    if(publicRuntimeChanged(previous,publicRuntimeFromState(state)))this.changed();
  }

  /** Queued in the same transaction as the authoritative terminal match status. */
  scheduleSnapshotExpiry(editionId:string,matchId:string,finishedAt:number):void {
    this.db.prepare(`INSERT OR IGNORE INTO snow_tournament_snapshot_expiries (edition_id,match_id,expires_at)
      VALUES (?,?,?)`).run(editionId,matchId,finishedAt+SNAPSHOT_TTL_MS);
  }

  /** Legacy completed hosts have the final save time. For older cancellations
   * without a verified end time, give them one full retention window from upgrade. */
  seedLegacySnapshotExpiries(now:number):void {
    this.transaction(()=>{
      const queued=this.db.prepare("SELECT 1 FROM snow_tournament_snapshot_expiries WHERE edition_id=? AND match_id=?");
      for (const edition of this.all() as SnapshotEdition[]) for (const match of edition.matches) {
        if (!terminalStatus(match.status) || queued.get(edition.id,match.id)) continue;
        const text=this.readMatchRuntimeText(edition.id,match.id);
        if (text===null && !recoveryKeys(match.id).some(key=>Object.hasOwn(edition.roundRecovery??{},key))) continue;
        let finishedAt=now;
        if (match.status==="completed" && text!==null) {
          try {
            const runtime=JSON.parse(text);
            const at=runtime?.rounds?.[2]?.finishedAt??runtime?.lastSeenAt;
            if (Number.isSafeInteger(at) && at>=0 && at<=now) finishedAt=at;
          } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
        }
        this.scheduleSnapshotExpiry(edition.id,match.id,finishedAt);
      }
    });
  }

  expireSnapshots(now:number):{nextAt:number|null; removed:SnapshotRef[]} {
    const next=this.db.prepare("SELECT expires_at FROM snow_tournament_snapshot_expiries ORDER BY expires_at LIMIT 1");
    const nextAt=()=> (next.get() as {expires_at:number}|undefined)?.expires_at??null;
    const first=nextAt();
    if (first===null || first>now) return {nextAt:first,removed:[]};
    return this.transaction(()=>{
      const due=this.db.prepare(`SELECT edition_id AS editionId,match_id AS matchId
        FROM snow_tournament_snapshot_expiries WHERE expires_at<=?`).all(now) as SnapshotRef[];
      const deleteDeadline=this.db.prepare("DELETE FROM snow_tournament_snapshot_expiries WHERE edition_id=? AND match_id=?");
      const removed:SnapshotRef[]=[];
      for (const ref of due) {
        const {editionId,matchId}=ref, edition=this.read(editionId) as SnapshotEdition|null;
        const match=edition?.matches.find(value=>value.id===matchId);
        if (edition && match && terminalStatus(match.status)) {
          let changed=false;
          for (const key of recoveryKeys(matchId)) if (edition.roundRecovery && Object.hasOwn(edition.roundRecovery,key)) {
            delete edition.roundRecovery[key]; changed=true;
          }
          if (changed) this.save(edition.id,edition.registrationOpenAt,edition);
          if (deleteRuntimeRows(this.db,editionId,matchId)) this.changed();
          removed.push({editionId,matchId});
        }
        deleteDeadline.run(editionId,matchId);
      }
      return {nextAt:nextAt(),removed};
    });
  }

  /** Caller runs its entire domain state transition in one shared-connection transaction. */
  transaction<T>(run: () => T): T {
    this.transactions.push(false);
    let result:T;
    try {result=this.db.transaction(run)();}catch(error){this.transactions.pop();throw error;}
    const changed=this.transactions.pop();if(changed)this.changed();return result;
  }

  save(id: string, registrationOpenAt: string, state: unknown): void {
    this.db.transaction(()=>saveEditionRows(this.db,id,registrationOpenAt,state as Record<string,unknown>))();
    this.changed();
  }
}
