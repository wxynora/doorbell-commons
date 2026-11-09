export class ReceiptConflictError extends Error {
  constructor() { super('receipt_conflict'); }
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

// The same target groups used by takeTargetEffect. Keeping the target in the
// SQL predicate avoids loading unrelated effects from the household queue.
const TARGET_EFFECTS = Object.freeze({
  harvest: ['harvest_gold', 'human_harvest_gold'],
  ranch_collect: ['human_ranch_yield'], cook: ['human_cook_extra'],
  plant: ['plant_time', 'plant_time_add'],
  fish: ['fishing_junk', 'fishing_junk_add'],
  dog_block: ['dog_block_probability_add'], theft: ['theft_caught_gold'],
});

export class HalloweenStore {
  constructor(database, eventId) { this.db = database; this.eventId = eventId; }
  transaction(operation) {
    // SAVEPOINT composes with the existing shared-connection authority transaction.
    this.db.exec('SAVEPOINT halloween_action');
    try {
      const result = operation();
      if (result && typeof result.then === 'function') throw new TypeError('async_transaction_not_supported');
      this.db.exec('RELEASE halloween_action');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK TO halloween_action; RELEASE halloween_action');
      throw error;
    }
  }
  addEatenEffect(farmId, entry) {
    this.db.prepare(`INSERT INTO halloween_eaten_effects
      (event_id,farm_id,candy_id,actor_side,effect_kind,eaten_at,expires_at,entry_json)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(this.eventId, farmId, entry.candyId ?? null, entry.actorSide ?? null,
        entry.effect?.kind ?? null, entry.eatenAt ?? null, entry.expiresAt ?? null, JSON.stringify(entry));
  }
  activeEatenEffects(farmId, side, now) {
    return this.db.prepare(`SELECT entry_json FROM halloween_eaten_effects
      WHERE event_id=? AND farm_id=? AND actor_side=? AND expires_at>?
      ORDER BY effect_id`).all(this.eventId, farmId, side, now).map(row => JSON.parse(row.entry_json));
  }
  firstEatenEffect(farmId, { kind, now, targetAt = now, caught = false, actorSide = 'ai', excluded = [] }) {
    const kinds = TARGET_EFFECTS[kind];
    if (!kinds) throw new TypeError('invalid_target');
    if (kind === 'theft' && !caught) return null;
    const placeholders = kinds.map(() => '?').join(',');
    const row = this.db.prepare(`SELECT effect_id,entry_json FROM halloween_eaten_effects
      WHERE event_id=? AND farm_id=? AND actor_side=? AND effect_kind IN (${placeholders})
        AND eaten_at<=? AND expires_at>?
        AND effect_id NOT IN (SELECT value FROM json_each(?))
      ORDER BY effect_id LIMIT 1`).get(this.eventId, farmId, actorSide, ...kinds, targetAt, now, JSON.stringify(excluded));
    return row ? { id: row.effect_id, entry: JSON.parse(row.entry_json) } : null;
  }
  blockedUntil(farmId, kind, now) {
    const row = this.db.prepare(`SELECT MAX(expires_at) AS expires_at FROM halloween_eaten_effects
      WHERE event_id=? AND farm_id=? AND actor_side='human' AND effect_kind=?
        AND eaten_at<=? AND expires_at>?`).get(this.eventId, farmId, kind, now, now);
    return Math.max(0, row.expires_at ?? 0);
  }
  removeEatenEffect(farmId, effectId) {
    return this.db.prepare('DELETE FROM halloween_eaten_effects WHERE event_id=? AND farm_id=? AND effect_id=?')
      .run(this.eventId, farmId, effectId).changes;
  }
  receipt(farmId, requestId, command) {
    const row = this.db.prepare('SELECT command_json,result_json FROM halloween_receipts WHERE event_id=? AND farm_id=? AND request_id=?').get(this.eventId, farmId, requestId);
    if (!row) return null;
    if (row.command_json !== command) throw new ReceiptConflictError();
    return JSON.parse(row.result_json);
  }
  saveReceipt(farmId, requestId, command, result) {
    this.db.prepare('INSERT INTO halloween_receipts VALUES (?,?,?,?,?)').run(this.eventId, farmId, requestId, command, JSON.stringify(result));
  }
  updateReceipt(farmId, requestId, command, result) {
    return this.db.prepare(`UPDATE halloween_receipts SET result_json=?
      WHERE event_id=? AND farm_id=? AND request_id=? AND command_json=?`)
      .run(JSON.stringify(result), this.eventId, farmId, requestId, command).changes;
  }
  effectReceipt(farmId, targetKind, targetId) {
    const row = this.db.prepare(`SELECT effect_json FROM halloween_effect_receipts
      WHERE event_id=? AND farm_id=? AND target_kind=? AND target_id=?`)
      .get(this.eventId, farmId, targetKind, targetId);
    return row ? JSON.parse(row.effect_json) : undefined;
  }
  saveEffectReceipt(farmId, targetKind, targetId, effect, now) {
    this.db.prepare(`INSERT INTO halloween_effect_receipts VALUES (?,?,?,?,?,?)`)
      .run(this.eventId, farmId, targetKind, targetId, JSON.stringify(effect), now);
  }
  plantEffectReceipts(farmId, prefix) {
    // Generated prefixes end in ':'. The adjacent ';' bounds this operation
    // using the existing (event, farm, kind, target) primary key.
    const rows = this.db.prepare(`SELECT target_id,effect_json FROM halloween_effect_receipts
      WHERE event_id=? AND farm_id=? AND target_kind='plant' AND target_id>=? AND target_id<?`)
      .all(this.eventId, farmId, prefix, prefix.slice(0, -1) + ';');
    return new Map(rows.map(row => [row.target_id, JSON.parse(row.effect_json)]));
  }
  availableCandies(farmId) {
    return this.db.prepare(`SELECT candy_id,appearance_json,rarity,image,sender_name,source_json,created_at
      FROM halloween_candies WHERE event_id=? AND owner_farm_id=? AND status='available'
      ORDER BY created_at,candy_id`).all(this.eventId, farmId).map(row => ({
        id: row.candy_id, appearance: JSON.parse(row.appearance_json), rarity: row.rarity,
        image: row.image, senderName: row.sender_name,
        source: JSON.parse(row.source_json), createdAt: row.created_at,
      }));
  }
  ownedCandy(farmId, candyId) {
    return this.db.prepare(`SELECT * FROM halloween_candies
      WHERE candy_id=? AND event_id=? AND owner_farm_id=? AND status='available'`)
      .get(candyId, this.eventId, farmId);
  }
  updateCandyHiddenEffects(farmId, candyId, effects) {
    return this.db.prepare(`UPDATE halloween_candies SET hidden_effect_json=?
      WHERE candy_id=? AND event_id=? AND owner_farm_id=? AND status='available'`)
      .run(JSON.stringify(effects), candyId, this.eventId, farmId).changes;
  }
}
