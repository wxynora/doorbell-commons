import type Database from "better-sqlite3";

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
