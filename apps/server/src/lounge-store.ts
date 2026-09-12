import type Database from "better-sqlite3";
import type { LoungePosition } from "./lounge-slots.js";
import type { ResidentSocialStore } from "./resident-social/resident-social-store.js";

export interface LoungeMessageRecord {
  sequence: number;
  messageId: string;
  residentId: string;
  residentName: string;
  text: string;
  createdAt: number;
  replyToMessageId: string | null;
  activityId: string | null;
  withdrawnAt: number | null;
}

export interface LoungeActivityRecord {
  sequence: number;
  activityId: string;
  residentId: string | null;
  residentName: string | null;
  kind: string;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface LoungePresenceRecord {
  residentId: string;
  areaId: string;
  slotId: string | null;
  idlePosition: LoungePosition;
  enteredAt: number;
  lastSpokeAt: number | null;
}

interface LoungeMessageRow {
  sequence: number;
  message_id: string;
  resident_id: string;
  resident_name: string;
  text: string;
  created_at: number;
  reply_to_message_id: string | null;
  activity_id: string | null;
  withdrawn_at: number | null;
}

interface LoungeActivityRow {
  sequence: number;
  activity_id: string;
  resident_id: string | null;
  resident_name: string | null;
  kind: string;
  data_json: string;
  created_at: number;
}

interface LoungePresenceRow {
  resident_id: string;
  area_id: string;
  slot_id: string | null;
  idle_position_json: string;
  entered_at: number;
  last_spoke_at: number | null;
}

function assertTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Lounge timestamps must be non-negative safe integers");
  }
}

function assertIdentifier(value: string, field: string): void {
  if (value.length === 0) {
    throw new TypeError(`Lounge ${field} must not be empty`);
  }
}

function parsePosition(value: string): LoungePosition {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    parsed.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))
  ) {
    throw new Error("Stored lounge idle position is invalid");
  }
  return [parsed[0], parsed[1], parsed[2]];
}

function mapMessage(row: LoungeMessageRow): LoungeMessageRecord {
  return {
    sequence: row.sequence,
    messageId: row.message_id,
    residentId: row.resident_id,
    residentName: row.resident_name,
    text: row.text,
    createdAt: row.created_at,
    replyToMessageId: row.reply_to_message_id,
    activityId: row.activity_id,
    withdrawnAt: row.withdrawn_at,
  };
}

function parseActivityData(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored lounge activity data is invalid");
  }
  return parsed as Record<string, unknown>;
}

function mapActivity(row: LoungeActivityRow): LoungeActivityRecord {
  return {
    sequence: row.sequence,
    activityId: row.activity_id,
    residentId: row.resident_id,
    residentName: row.resident_name,
    kind: row.kind,
    data: parseActivityData(row.data_json),
    createdAt: row.created_at,
  };
}

function mapPresence(row: LoungePresenceRow): LoungePresenceRecord {
  return {
    residentId: row.resident_id,
    areaId: row.area_id,
    slotId: row.slot_id,
    idlePosition: parsePosition(row.idle_position_json),
    enteredAt: row.entered_at,
    lastSpokeAt: row.last_spoke_at,
  };
}

export class LoungeStore {
  constructor(
    private readonly database: Database.Database,
    private readonly residentSocial?: ResidentSocialStore,
  ) {}

  listMessages(): LoungeMessageRecord[] {
    const rows = this.database
      .prepare(
        `SELECT message.sequence,
                message.message_id,
                message.resident_id,
                resident.resident_name,
                message.text,
                message.created_at,
                message.reply_to_message_id,
                message.activity_id,
                message.withdrawn_at
         FROM lounge_public_messages AS message
         JOIN residents AS resident ON resident.resident_id = message.resident_id
         WHERE message.withdrawn_at IS NULL
         ORDER BY message.sequence ASC, message.message_id ASC`,
      )
      .all() as LoungeMessageRow[];
    return rows.map(mapMessage);
  }

  listActivities(): LoungeActivityRecord[] {
    const rows = this.database
      .prepare(
        `SELECT activity.sequence,
                activity.activity_id,
                activity.resident_id,
                resident.resident_name,
                activity.kind,
                activity.data_json,
                activity.created_at
         FROM lounge_public_activities AS activity
         LEFT JOIN residents AS resident ON resident.resident_id = activity.resident_id
         ORDER BY activity.sequence ASC, activity.activity_id ASC`,
      )
      .all() as LoungeActivityRow[];
    return rows.map(mapActivity);
  }

  listPresence(): LoungePresenceRecord[] {
    const rows = this.database
      .prepare(
        `SELECT resident_id,
                area_id,
                slot_id,
                idle_position_json,
                entered_at,
                last_spoke_at
         FROM lounge_presence
         ORDER BY resident_id ASC`,
      )
      .all() as LoungePresenceRow[];
    return rows.map(mapPresence);
  }

  upsertPresence(input: LoungePresenceRecord): LoungePresenceRecord {
    assertIdentifier(input.residentId, "resident id");
    assertIdentifier(input.areaId, "area id");
    if (input.slotId !== null) assertIdentifier(input.slotId, "slot id");
    if (
      input.idlePosition.length !== 3 ||
      input.idlePosition.some(
        (coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate),
      )
    ) {
      throw new TypeError("Lounge idle position must contain three finite numbers");
    }
    assertTimestamp(input.enteredAt);
    if (input.lastSpokeAt !== null) assertTimestamp(input.lastSpokeAt);
    this.database
      .prepare(
        `INSERT INTO lounge_presence (
           resident_id,
           area_id,
           slot_id,
           idle_position_json,
           entered_at,
           last_spoke_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(resident_id) DO UPDATE SET
           area_id = excluded.area_id,
           slot_id = excluded.slot_id,
           idle_position_json = excluded.idle_position_json,
           entered_at = excluded.entered_at,
           last_spoke_at = excluded.last_spoke_at`,
      )
      .run(
        input.residentId,
        input.areaId,
        input.slotId,
        JSON.stringify(input.idlePosition),
        input.enteredAt,
        input.lastSpokeAt,
      );
    return this.#readPresence(input.residentId);
  }

  deletePresence(residentId: string): boolean {
    assertIdentifier(residentId, "resident id");
    return (
      this.database.prepare("DELETE FROM lounge_presence WHERE resident_id = ?").run(residentId)
        .changes === 1
    );
  }

  withdrawMessage(input: { messageId: string; residentId: string; withdrawnAt: number }): boolean {
    assertIdentifier(input.messageId, "message id");
    assertIdentifier(input.residentId, "resident id");
    assertTimestamp(input.withdrawnAt);
    return (
      this.database
        .prepare(
          `UPDATE lounge_public_messages
           SET withdrawn_at = ?
           WHERE message_id = ?
             AND resident_id = ?
             AND withdrawn_at IS NULL`,
        )
        .run(input.withdrawnAt, input.messageId, input.residentId).changes === 1
    );
  }

  appendMessage(input: {
    messageId: string;
    residentId: string;
    text: string;
    createdAt: number;
    replyToMessageId?: string | null;
    activityId?: string | null;
  }): LoungeMessageRecord {
    assertIdentifier(input.messageId, "message id");
    assertIdentifier(input.residentId, "resident id");
    if (input.text.trim().length === 0) {
      throw new TypeError("Lounge message text must not be empty");
    }
    assertTimestamp(input.createdAt);
    const transaction = this.database.transaction(() => {
      const sequence = this.#takeNextSequence();
      const replyToResidentId = this.#replyToResidentId(input.replyToMessageId ?? null);
      this.database
        .prepare(
          `INSERT INTO lounge_public_messages (
             message_id,
             sequence,
             resident_id,
             text,
             created_at,
             reply_to_message_id,
             activity_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.messageId,
          sequence,
          input.residentId,
          input.text,
          input.createdAt,
          input.replyToMessageId ?? null,
          input.activityId ?? null,
        );
      this.residentSocial?.recordLoungeMessage({
        residentId: input.residentId,
        sequence,
        at: input.createdAt,
        replyToResidentId,
      });
      return this.#readMessage(input.messageId);
    });
    return transaction.immediate();
  }

  appendActivity(input: {
    activityId: string;
    residentId?: string | null;
    kind: string;
    data?: Record<string, unknown>;
    createdAt: number;
  }): LoungeActivityRecord {
    assertIdentifier(input.activityId, "activity id");
    if (input.kind.trim().length === 0) {
      throw new TypeError("Lounge activity kind must not be empty");
    }
    if (input.residentId !== undefined && input.residentId !== null) {
      assertIdentifier(input.residentId, "resident id");
    }
    assertTimestamp(input.createdAt);
    const data = input.data ?? {};
    const transaction = this.database.transaction(() => {
      const sequence = this.#takeNextSequence();
      this.database
        .prepare(
          `INSERT INTO lounge_public_activities (
             activity_id,
             sequence,
             resident_id,
             kind,
             data_json,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.activityId,
          sequence,
          input.residentId ?? null,
          input.kind,
          JSON.stringify(data),
          input.createdAt,
        );
      return this.#readActivity(input.activityId);
    });
    return transaction.immediate();
  }

  #takeNextSequence(): number {
    const row = this.database
      .prepare(
        `SELECT next_sequence
         FROM lounge_event_sequence
         WHERE singleton_id = 1`,
      )
      .get() as { next_sequence: number } | undefined;
    if (!row) {
      throw new Error("Lounge event sequence is not initialized");
    }
    const result = this.database
      .prepare(
        `UPDATE lounge_event_sequence
         SET next_sequence = next_sequence + 1
         WHERE singleton_id = 1 AND next_sequence = ?`,
      )
      .run(row.next_sequence);
    if (result.changes !== 1) {
      throw new Error("Lounge event sequence could not advance");
    }
    return row.next_sequence;
  }

  #replyToResidentId(messageId: string | null): string | null {
    if (messageId === null) return null;
    // Retraction hides the body from public reads; it does not erase the
    // historical reply target used by cumulative social facts.
    const row = this.database
      .prepare(
        `SELECT resident_id
         FROM lounge_public_messages
         WHERE message_id = ?`,
      )
      .get(messageId) as { resident_id: string } | undefined;
    return row?.resident_id ?? null;
  }

  #readMessage(messageId: string): LoungeMessageRecord {
    const row = this.database
      .prepare(
        `SELECT message.sequence,
                message.message_id,
                message.resident_id,
                resident.resident_name,
                message.text,
                message.created_at,
                message.reply_to_message_id,
                message.activity_id,
                message.withdrawn_at
         FROM lounge_public_messages AS message
         JOIN residents AS resident ON resident.resident_id = message.resident_id
         WHERE message.message_id = ?`,
      )
      .get(messageId) as LoungeMessageRow | undefined;
    if (!row) throw new Error("Inserted lounge message could not be read");
    return mapMessage(row);
  }

  #readActivity(activityId: string): LoungeActivityRecord {
    const row = this.database
      .prepare(
        `SELECT activity.sequence,
                activity.activity_id,
                activity.resident_id,
                resident.resident_name,
                activity.kind,
                activity.data_json,
                activity.created_at
         FROM lounge_public_activities AS activity
         LEFT JOIN residents AS resident ON resident.resident_id = activity.resident_id
         WHERE activity.activity_id = ?`,
      )
      .get(activityId) as LoungeActivityRow | undefined;
    if (!row) throw new Error("Inserted lounge activity could not be read");
    return mapActivity(row);
  }

  #readPresence(residentId: string): LoungePresenceRecord {
    const row = this.database
      .prepare(
        `SELECT resident_id,
                area_id,
                slot_id,
                idle_position_json,
                entered_at,
                last_spoke_at
         FROM lounge_presence
         WHERE resident_id = ?`,
      )
      .get(residentId) as LoungePresenceRow | undefined;
    if (!row) throw new Error("Upserted lounge presence could not be read");
    return mapPresence(row);
  }
}
