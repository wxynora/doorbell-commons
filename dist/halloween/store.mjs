export class ReceiptConflictError extends Error {
  constructor() { super('receipt_conflict'); }
}

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function emptyHousehold() {
  return { version: 1, materials: {}, purchases: [], exploration: null,
    lastExplorationDay: null, lastCollectionDay: null, eatenEffects: [], deliveredTotal: 0,
    deliveredByDay: {}, deliveredToByDay: {}, npcDeliveryDays: [], npcMissedDays: [], npcArrivals: {}, collection: null,
    collectionRewardClaimsVersion: 1, collectionRewardClaims: {} };
}

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
  load(farmId) {
    const row = this.db.prepare('SELECT state_json FROM halloween_households WHERE event_id=? AND farm_id=?').get(this.eventId, farmId);
    if (!row) return emptyHousehold();
    const state = JSON.parse(row.state_json);
    this.restoreEatenEffectSides(farmId, state);
    return state;
  }
  restoreEatenEffectSides(farmId, state) {
    const pending = (state.eatenEffects ?? []).filter(entry => !['ai', 'human'].includes(entry.actorSide));
    if (!pending.length) return;
    const rows = this.db.prepare(`SELECT command_json FROM halloween_receipts
      WHERE event_id=? AND farm_id=? AND json_extract(command_json,'$.op')='eat'`)
      .all(this.eventId, farmId);
    const sideByCandy = new Map();
    for (const row of rows) {
      try {
        const command = JSON.parse(row.command_json);
        const side = command?.side;
        const candyId = command?.args?.candyId;
        const target = command?.args?.target ?? 'self';
        if (['ai', 'human'].includes(side) && ['self', 'other'].includes(target) &&
            typeof candyId === 'string' && candyId) {
          const eaterSide = target === 'other' ? side === 'ai' ? 'human' : 'ai' : side;
          sideByCandy.set(candyId, eaterSide);
        }
      } catch { /* malformed legacy receipts cannot prove actor ownership */ }
    }
    for (const entry of pending) {
      const side = sideByCandy.get(entry.candyId);
      if (side) entry.actorSide = side;
    }
  }
  save(farmId, state) {
    this.db.prepare(`INSERT INTO halloween_households VALUES (?,?,?)
      ON CONFLICT(event_id,farm_id) DO UPDATE SET state_json=excluded.state_json`)
      .run(this.eventId, farmId, JSON.stringify(state));
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
  insertCandy({ id, owner, source, senderName = null, appearance, effect, rarity, image, now }) {
    this.db.prepare(`INSERT INTO halloween_candies
      (candy_id,event_id,owner_farm_id,source_json,appearance_json,hidden_effect_json,rarity,image,sender_name,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'available',?)`)
      .run(id, this.eventId, owner, JSON.stringify(source), JSON.stringify(appearance), JSON.stringify(effect), rarity, image, senderName, now);
  }
  rewards(farmId) {
    return this.db.prepare(`SELECT reward_id,reward_json,status,paid_at FROM halloween_reward_outbox
      WHERE event_id=? AND farm_id=? ORDER BY reward_id`).all(this.eventId, farmId).map(row => ({
        id: row.reward_id, reward: JSON.parse(row.reward_json), status: row.status, paidAt: row.paid_at,
      }));
  }
  queueReward(farmId, key, reward) {
    this.db.prepare(`INSERT INTO halloween_reward_outbox VALUES (?,?,?,?, 'pending',NULL)
      ON CONFLICT(reward_id) DO NOTHING`).run(`${this.eventId}:${farmId}:${key}`, this.eventId, farmId, JSON.stringify(reward));
  }
}
