import type { SnowDanmaku, SnowDanmakuInput } from "@doorbell/protocol";
import type Database from "better-sqlite3";

interface MessageRow {
  sequence: number;
  activity_id: string;
  sender_name: string;
  text: string;
  created_at: number;
}
interface ActivityRecord {
  activityId: string;
  opensAt: number;
  closesAt: number;
  matchStartsAt: number[];
  retired?: boolean;
}
const publicMessage = (row: MessageRow): SnowDanmaku => ({
  sequence: row.sequence,
  activityId: row.activity_id,
  senderName: row.sender_name,
  text: row.text,
  createdAt: row.created_at,
});
export class SnowLiveStore {
  constructor(private readonly database: Database.Database) {}
  activity(): ActivityRecord | null {
    const row = this.database
      .prepare("SELECT value FROM snow_war_meta WHERE key='together_activity'")
      .get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }
  series(id: string): unknown {
    const row = this.database
      .prepare("SELECT state_json FROM snow_war_series WHERE series_id=?")
      .get(id) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : undefined;
  }
  battle(id: string): unknown {
    const row = this.database
      .prepare("SELECT state_json FROM snow_war_battle WHERE battle_id=?")
      .get(id) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : undefined;
  }
  nameOf(id: string): string {
    const row = this.database
      .prepare("SELECT resident_name FROM residents WHERE resident_id=?")
      .get(id) as { resident_name: string } | undefined;
    return row?.resident_name ?? "—";
  }
  messages(activityId: string, after = 0): SnowDanmaku[] {
    return (
      this.database
        .prepare(
          "SELECT sequence,activity_id,sender_name,text,created_at FROM snow_spectator_messages WHERE activity_id=? AND sequence>? ORDER BY sequence",
        )
        .all(activityId, after) as MessageRow[]
    ).map(publicMessage);
  }
  append(
    activityId: string,
    accountId: string,
    senderName: string,
    input: SnowDanmakuInput,
    now: number,
  ): { message: SnowDanmaku; replay: boolean } {
    return this.database
      .transaction(() => {
        const previous = this.database
          .prepare(
            "SELECT sequence,activity_id,sender_name,text,created_at FROM snow_spectator_messages WHERE activity_id=? AND account_id=? AND client_message_id=?",
          )
          .get(activityId, accountId, input.clientMessageId) as MessageRow | undefined;
        if (previous) {
          if (previous.text !== input.text) throw Error("message_conflict");
          return { message: publicMessage(previous), replay: true };
        }
        const row = this.database
          .prepare(
            "INSERT INTO snow_spectator_messages(activity_id,account_id,client_message_id,sender_name,text,created_at) VALUES(?,?,?,?,?,?) RETURNING sequence,activity_id,sender_name,text,created_at",
          )
          .get(
            activityId,
            accountId,
            input.clientMessageId,
            senderName,
            input.text,
            now,
          ) as MessageRow;
        return { message: publicMessage(row), replay: false };
      })
      .immediate();
  }
}
