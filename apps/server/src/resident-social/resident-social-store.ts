import type Database from "better-sqlite3";

export type ResidentSocialSource = "farm" | "lounge" | "game";
export type ResidentSocialInteractionKind = "chat" | "game";
export type ResidentSocialGameKind =
  | "leaf-game"
  | "doudizhu"
  | "flying-chess"
  | "uno"
  | "monopoly"
  | "mahjong";

export interface ResidentSocialEvent {
  residentId: string;
  source: ResidentSocialSource;
  sequence: number;
  at: number;
  label: string;
  interactions: readonly {
    residentId: string;
    kind: ResidentSocialInteractionKind;
  }[];
}

export interface ResidentSocialGameSeat {
  controllerType: "human" | "resident";
  residentId?: string | null;
}

export interface ResidentSocialActivity {
  source: ResidentSocialSource;
  sequence: number;
  at: number;
  label: string;
}

export interface ResidentSocialRelationship {
  residentId: string;
  name: string;
  kind: ResidentSocialInteractionKind;
  count: number;
  lastAt: number;
}

export interface ResidentSocialSnapshot {
  activities: ResidentSocialActivity[];
  relationships: ResidentSocialRelationship[];
}

export interface ResidentSocialLoungeMessage {
  residentId: string;
  sequence: number;
  at: number;
  replyToResidentId?: string | null;
}

export type ResidentFarmTrailKind = "watered" | "stolen" | "foiled";

export interface ResidentFarmTrailEntry {
  event_id: string;
  kind: ResidentFarmTrailKind;
  actor_name: string;
  actor_farm_doorplate?: string | null;
  plot_id: number;
  crop_name: string | null;
  at: string;
}

const BEIJING_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function beijingCalendarDay(at: number): string {
  return BEIJING_DAY.format(at);
}

function assertIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Resident social ${field} must not be empty`);
  }
}

function assertTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Resident social timestamps must be non-negative safe integers");
  }
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Resident social sequences must be positive safe integers");
  }
}

/** Resident profile projections over committed farm, lounge, and game facts. */
export class ResidentSocialStore {
  readonly #database: Database.Database;
  readonly #now: () => number;

  constructor(database: Database.Database, now: () => number = Date.now) {
    this.#database = database;
    this.#now = now;
  }

  /** Record an externally sequenced fact, such as a farm event. */
  record(event: ResidentSocialEvent): boolean {
    this.#validateEvent(event);
    return this.#database.transaction(() => this.#record(event))();
  }

  /**
   * Record one public lounge message without persisting its body. A reply
   * creates the reciprocal incoming fact for the parent author; self-replies
   * remain an activity but do not create an interaction edge.
   */
  recordLoungeMessage(input: ResidentSocialLoungeMessage): boolean {
    this.#validateLoungeMessage(input);
    return this.#database.transaction(() => this.#recordLoungeMessage(input))();
  }

  /**
   * Import committed farm bulletin facts without treating them as resident
   * interactions. Stable farm event ids remain in their own ledger after a
   * recent activity row is pruned, so replaying a bulletin cannot recount it.
   */
  recordFarmTrail(
    residentId: string,
    entries: readonly ResidentFarmTrailEntry[],
  ): number | undefined {
    assertIdentifier(residentId, "resident id");
    if (!Array.isArray(entries)) throw new TypeError("Resident farm trail must be an array");
    for (const entry of entries) this.#validateFarmTrailEntry(entry);

    return this.#database.transaction(() => {
      let recorded = 0;
      for (const entry of entries) {
        const inserted = this.#database
          .prepare(
            `INSERT OR IGNORE INTO resident_farm_event_ids (resident_id, event_id)
             VALUES (?, ?)`,
          )
          .run(residentId, entry.event_id);
        if (!inserted.changes) continue;

        const sequence = this.#takeNextSequence("farm");
        const timestamp = Date.parse(entry.at);
        this.#record({
          residentId,
          source: "farm",
          sequence,
          at: timestamp,
          label: farmTrailLabel(entry),
          interactions: [],
        });
        recorded += 1;
      }
      return recorded;
    })();
  }

  /**
   * Record one successful game round and save its room in the same SQLite
   * transaction. Game source sequences are allocated only for rooms with a
   * resident-controlled seat; human-only rooms still run the save callback.
   */
  commitGame(
    seats: readonly ResidentSocialGameSeat[],
    save: () => void,
    at?: number,
    kind?: ResidentSocialGameKind,
  ): void {
    if (typeof save !== "function") {
      throw new TypeError("A resident social game commit needs a room save callback");
    }
    if (at !== undefined) assertTimestamp(at);

    this.#database.transaction(() => {
      const occurredAt = at ?? this.#now();
      assertTimestamp(occurredAt);
      const residentIds = [
        ...new Set(
          seats
            .filter((seat) => seat.controllerType === "resident")
            .map((seat) => seat.residentId)
            .filter(
              (residentId): residentId is string =>
                typeof residentId === "string" && residentId.length > 0,
            ),
        ),
      ];
      if (residentIds.length > 0) {
        const sequence = this.#takeNextSequence("game");
        for (const residentId of residentIds) {
          this.#record({
            residentId,
            source: "game",
            sequence,
            at: occurredAt,
            label: gameActivityLabel(kind),
            interactions: residentGamePeers(seats, residentId).map((peerResidentId) => ({
              residentId: peerResidentId,
              kind: "game" as const,
            })),
          });
        }
      }
      save();
    })();
  }

  read(residentId: string): ResidentSocialSnapshot {
    assertIdentifier(residentId, "resident id");
    return {
      activities: this.#database
        .prepare(
          `SELECT source,
                  source_sequence AS sequence,
                  occurred_at AS at,
                  label
           FROM resident_recent_activity
           WHERE resident_id = ?
           ORDER BY occurred_at DESC, source ASC, source_sequence DESC`,
        )
        .all(residentId) as ResidentSocialActivity[],
      relationships: this.#database
        .prepare(
          `SELECT totals.peer_resident_id AS residentId,
                  resident.resident_name AS name,
                  totals.kind,
                  totals.interaction_count AS count,
                  totals.last_at AS lastAt
           FROM resident_interaction_totals AS totals
           JOIN residents AS resident ON resident.resident_id = totals.peer_resident_id
           WHERE totals.resident_id = ?
           ORDER BY totals.last_at DESC, totals.peer_resident_id ASC, totals.kind ASC`,
        )
        .all(residentId) as ResidentSocialRelationship[],
    };
  }

  #recordLoungeMessage(input: ResidentSocialLoungeMessage): boolean {
    const peerResidentId = input.replyToResidentId;
    const authorRecorded = this.#record({
      residentId: input.residentId,
      source: "lounge",
      sequence: input.sequence,
      at: input.at,
      label: "休息室互动",
      interactions:
        peerResidentId && peerResidentId !== input.residentId
          ? [{ residentId: peerResidentId, kind: "chat" }]
          : [],
    });
    if (!peerResidentId || peerResidentId === input.residentId) return authorRecorded;
    const peerRecorded = this.#record({
      residentId: peerResidentId,
      source: "lounge",
      sequence: input.sequence,
      at: input.at,
      label: "休息室互动",
      interactions: [{ residentId: input.residentId, kind: "chat" }],
    });
    return authorRecorded || peerRecorded;
  }

  #record(event: ResidentSocialEvent): boolean {
    const advanced = this.#database
      .prepare(
        `INSERT INTO resident_social_cursors (resident_id, source, source_sequence)
         VALUES (?, ?, ?)
         ON CONFLICT(resident_id, source) DO UPDATE SET
           source_sequence = excluded.source_sequence
         WHERE excluded.source_sequence > resident_social_cursors.source_sequence`,
      )
      .run(event.residentId, event.source, event.sequence);
    if (!advanced.changes) return false;

    this.#database
      .prepare(
        `INSERT INTO resident_recent_activity (
           resident_id, source, source_sequence, occurred_at, label
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.residentId, event.source, event.sequence, event.at, event.label);

    const peers = new Set<string>();
    for (const interaction of event.interactions) {
      const key = `${interaction.kind}:${interaction.residentId}`;
      if (interaction.residentId === event.residentId || peers.has(key)) continue;
      peers.add(key);
      const increment =
        interaction.kind === "chat"
          ? this.#database
              .prepare(
                `INSERT OR IGNORE INTO resident_chat_days (
                   resident_id, peer_resident_id, day
                 ) VALUES (?, ?, ?)`,
              )
              .run(event.residentId, interaction.residentId, beijingCalendarDay(event.at)).changes
          : 1;
      this.#database
        .prepare(
          `INSERT INTO resident_interaction_totals (
             resident_id, peer_resident_id, kind, interaction_count, last_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(resident_id, peer_resident_id, kind) DO UPDATE SET
             interaction_count = interaction_count + excluded.interaction_count,
             last_at = max(last_at, excluded.last_at)`,
        )
        .run(event.residentId, interaction.residentId, interaction.kind, increment, event.at);
    }

    this.#database
      .prepare(
        `DELETE FROM resident_recent_activity
         WHERE resident_id = ?
           AND rowid NOT IN (
             SELECT rowid
             FROM resident_recent_activity
             WHERE resident_id = ?
             ORDER BY occurred_at DESC, source ASC, source_sequence DESC
             LIMIT 50
           )`,
      )
      .run(event.residentId, event.residentId);
    return true;
  }

  #takeNextSequence(source: "farm" | "game"): number {
    const row = this.#database
      .prepare(
        `SELECT next_sequence
         FROM resident_social_source_sequences
         WHERE source = ?`,
      )
      .get(source) as { next_sequence: number } | undefined;
    if (!row) throw new Error(`Resident social source sequence is not initialized: ${source}`);
    const result = this.#database
      .prepare(
        `UPDATE resident_social_source_sequences
         SET next_sequence = next_sequence + 1
         WHERE source = ? AND next_sequence = ?`,
      )
      .run(source, row.next_sequence);
    if (result.changes !== 1) {
      throw new Error(`Resident social source sequence could not advance: ${source}`);
    }
    return row.next_sequence;
  }

  #validateEvent(event: ResidentSocialEvent): void {
    if (!event || typeof event !== "object")
      throw new TypeError("Resident social event is invalid");
    assertIdentifier(event.residentId, "resident id");
    if (!(["farm", "lounge", "game"] as const).includes(event.source)) {
      throw new TypeError("Resident social event source is invalid");
    }
    assertSequence(event.sequence);
    assertTimestamp(event.at);
    assertIdentifier(event.label, "activity label");
    if (!Array.isArray(event.interactions)) {
      throw new TypeError("Resident social interactions must be an array");
    }
    for (const interaction of event.interactions) {
      if (
        !interaction ||
        typeof interaction.residentId !== "string" ||
        interaction.residentId.length === 0 ||
        (interaction.kind !== "chat" && interaction.kind !== "game")
      ) {
        throw new TypeError("Resident social interaction is invalid");
      }
    }
  }

  #validateLoungeMessage(input: ResidentSocialLoungeMessage): void {
    if (!input || typeof input !== "object")
      throw new TypeError("Resident lounge message is invalid");
    assertIdentifier(input.residentId, "resident id");
    assertSequence(input.sequence);
    assertTimestamp(input.at);
    if (input.replyToResidentId !== undefined && input.replyToResidentId !== null) {
      assertIdentifier(input.replyToResidentId, "reply resident id");
    }
  }

  #validateFarmTrailEntry(entry: ResidentFarmTrailEntry): void {
    if (!entry || typeof entry !== "object") {
      throw new TypeError("Resident farm trail entry is invalid");
    }
    assertIdentifier(entry.event_id, "farm event id");
    if (entry.kind !== "watered" && entry.kind !== "stolen" && entry.kind !== "foiled") {
      throw new TypeError("Resident farm trail kind is invalid");
    }
    assertIdentifier(entry.actor_name, "farm actor name");
    if (!Number.isSafeInteger(entry.plot_id) || entry.plot_id < 1) {
      throw new TypeError("Resident farm plot id is invalid");
    }
    if (
      entry.crop_name !== null &&
      (typeof entry.crop_name !== "string" || entry.crop_name.length === 0)
    ) {
      throw new TypeError("Resident farm crop name is invalid");
    }
    if (entry.actor_farm_doorplate !== undefined && entry.actor_farm_doorplate !== null) {
      assertIdentifier(entry.actor_farm_doorplate, "farm actor doorplate");
    }
    const timestamp = typeof entry.at === "string" ? Date.parse(entry.at) : Number.NaN;
    if (!Number.isSafeInteger(timestamp)) {
      throw new TypeError("Resident farm trail timestamp is invalid");
    }
    assertTimestamp(timestamp);
  }
}

function farmTrailLabel(entry: ResidentFarmTrailEntry): string {
  const crop = entry.crop_name ?? `地块${entry.plot_id}`;
  if (entry.kind === "watered") return `${entry.actor_name}帮忙浇了${crop}`;
  if (entry.kind === "stolen") return `${entry.actor_name}偷走了${crop}`;
  return `${entry.actor_name}被狗拦下了`;
}

function gameActivityLabel(kind?: ResidentSocialGameKind): string {
  if (!kind) return "同局游戏";
  const names: Record<ResidentSocialGameKind, string> = {
    "leaf-game": "叶子戏",
    doudizhu: "斗地主",
    "flying-chess": "飞行棋",
    uno: "UNO",
    monopoly: "大富翁",
    mahjong: "麻将",
  };
  return `玩了一局${names[kind]}`;
}

/** Human-controlled seats do not establish interactions between resident AIs. */
export function residentGamePeers(
  seats: readonly ResidentSocialGameSeat[],
  residentId: string,
): string[] {
  const residents = new Set(
    seats
      .filter((seat) => seat.controllerType === "resident")
      .map((seat) => seat.residentId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  return residents.has(residentId) ? [...residents].filter((id) => id !== residentId) : [];
}
