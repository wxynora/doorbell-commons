import type Database from "better-sqlite3";

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const terminalStatus = (status: string) => ["completed", "forfeit", "cancelled"].includes(status);
export const snowRoundRecoveryKey = (matchId:string,index:number) => JSON.stringify([matchId,index]);
const recoveryKeys = (matchId:string) => [0,1,2].map(index=>snowRoundRecoveryKey(matchId,index));
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
    const row = this.db.prepare("SELECT state_json FROM snow_tournament_editions WHERE edition_id = ?").get(id) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : null;
  }

  latest(): unknown | null {
    const row = this.db.prepare("SELECT state_json FROM snow_tournament_editions ORDER BY registration_open_at DESC, edition_id DESC LIMIT 1").get() as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : null;
  }

  unfinished(): unknown[] {
    const rows = this.db.prepare(`SELECT state_json FROM snow_tournament_editions
      WHERE json_extract(state_json, '$.phase') IN ('registration','team_formation','round_robin','knockout')
      ORDER BY registration_open_at, edition_id`).all() as { state_json: string }[];
    return rows.map(row => JSON.parse(row.state_json));
  }

  /** Finished editions may still owe a verified refund or reward after a restart. */
  all():unknown[] {
    const rows=this.db.prepare("SELECT state_json FROM snow_tournament_editions ORDER BY registration_open_at,edition_id").all() as {state_json:string}[];
    return rows.map(row=>JSON.parse(row.state_json));
  }

  readMatchRuntime(editionId: string, matchId: string): unknown | null {
    const text=this.readMatchRuntimeText(editionId,matchId);
    return text===null?null:JSON.parse(text);
  }

  readMatchRuntimeText(editionId:string,matchId:string):string|null {
    const row = this.db.prepare("SELECT state_json FROM snow_tournament_match_runtime WHERE edition_id=? AND match_id=?")
      .get(editionId, matchId) as { state_json: string } | undefined;
    return row?.state_json??null;
  }

  saveMatchRuntime(editionId: string, matchId: string, state: unknown): void {
    this.db.prepare(`INSERT INTO snow_tournament_match_runtime (edition_id,match_id,state_json) VALUES (?,?,?)
      ON CONFLICT(edition_id,match_id) DO UPDATE SET state_json=excluded.state_json`)
      .run(editionId, matchId, JSON.stringify(state));
    this.changed();
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
      const deleteRuntime=this.db.prepare("DELETE FROM snow_tournament_match_runtime WHERE edition_id=? AND match_id=?");
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
          if (deleteRuntime.run(editionId,matchId).changes) this.changed();
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
    this.db.prepare(`INSERT INTO snow_tournament_editions (edition_id, registration_open_at, state_json)
      VALUES (?, ?, ?) ON CONFLICT(edition_id) DO UPDATE SET
      registration_open_at = excluded.registration_open_at, state_json = excluded.state_json`)
      .run(id, registrationOpenAt, JSON.stringify(state));
    this.changed();
  }
}
