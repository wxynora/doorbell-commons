import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type HomeRecordKind = "post" | "receipt" | "fact" | "audience" | "like" | "comment" | "gift" | "option" | "read_cursor" | "notification_read" | "notification_reported" | "activity_status" | "raffle" | "raffle_prize" | "raffle_audience" | "raffle_sticker" | "sticker_attachment" | "progression" | "progression_event" | "progression_notice";
export type SqlValue = string | number | null;
export type HomeRecord = { record_id: string; home_id: string };
export type EnsureMomentsHomeTable = (homeId: string) => string;
type HomeTable = { home_id: string; table_name: string };

/** One physical content table per home, on Main's existing SQLite connection.
 * Schema creation is injected from database/community-migrations.ts. */
export class HomeMomentRecords {
  constructor(private readonly database: Database.Database, private readonly ensureTable: EnsureMomentsHomeTable) {}

  private tables(homeId?: string): HomeTable[] {
    return (homeId === undefined
      ? this.database.prepare("SELECT home_id,table_name FROM lingye_moments_homes ORDER BY home_id").all()
      : this.database.prepare("SELECT home_id,table_name FROM lingye_moments_homes WHERE home_id=?").all(homeId)) as HomeTable[];
  }

  private quote(table: string): string {
    if (!/^lingye_moments_home_[a-f0-9]{32}$/.test(table)) throw new Error("Invalid moments home table");
    return `"${table}"`;
  }

  all<T>(kind: HomeRecordKind, where="1", parameters: SqlValue[]=[], homeId?: string): T[] {
    return this.tables(homeId).flatMap(({table_name}) =>
      this.database.prepare(`SELECT * FROM ${this.quote(table_name)} WHERE record_type=? AND (${where})`)
        .all(kind,...parameters) as T[]);
  }

  aggregate(kind: HomeRecordKind, where: string, parameters: SqlValue[], homeId?: string): { count: number; quantity: number } {
    const total={count:0,quantity:0};
    for (const {table_name} of this.tables(homeId)) {
      const row=this.database.prepare(`SELECT count(*) AS count,coalesce(sum(item_quantity),0) AS quantity
        FROM ${this.quote(table_name)} WHERE record_type=? AND (${where})`).get(kind,...parameters) as typeof total;
      total.count+=row.count;total.quantity+=row.quantity;
    }
    return total;
  }

  insert(homeId: string, kind: HomeRecordKind, fields: Record<string,SqlValue>, id: string=randomUUID()): string {
    const table=this.quote(this.ensureTable(homeId));
    const values={record_id:id,home_id:homeId,record_type:kind,...fields};
    // Column names are domain-owned literals; request fields are passed only as bound values.
    const columns=Object.keys(values);
    this.database.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES(${columns.map(()=>"?").join(",")})`)
      .run(...Object.values(values));
    return id;
  }

  update(homeId: string, id: string, fields: Record<string,SqlValue>): void {
    const table=this.tables(homeId)[0];if(!table)throw new Error("Missing moments home table");
    this.database.prepare(`UPDATE ${this.quote(table.table_name)} SET ${Object.keys(fields).map(key=>`${key}=?`).join(",")} WHERE record_id=?`)
      .run(...Object.values(fields),id);
  }

  delete(homeId: string, id: string): void {
    const table=this.tables(homeId)[0];if(!table)return;
    this.database.prepare(`DELETE FROM ${this.quote(table.table_name)} WHERE record_id=?`).run(id);
  }
}
