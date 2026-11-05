import { randomInt } from 'node:crypto';
import { effectDurationMs, queueEatenEffect, resolveActorHiddenEffects } from './effects.mjs';
import { HalloweenStore, ReceiptConflictError, canonical } from './store.mjs';

export class HalloweenError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status) => { throw new HalloweenError(code, status); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class HalloweenService {
  constructor(database, options = {}) {
    if (!text(options.eventId)) throw new TypeError('event_id_required');
    this.db = database;
    this.store = new HalloweenStore(database, options.eventId);
    this.random = options.random ?? (() => randomInt(0x100000000) / 0x100000000);
  }

  view(farmId, now, side = 'ai') {
    if (!text(farmId) || !['ai', 'human'].includes(side) || !Number.isSafeInteger(now))
      fail('invalid_request', 400);
    const state = this.store.load(farmId);
    return {
      candies: this.store.availableCandies(farmId).map(candy => ({
        id: candy.id,
        image: candy.image,
        senderName: candy.senderName,
        appearance: { name: candy.appearance.name },
        rarity: candy.rarity,
      })),
      effects: structuredClone(state.eatenEffects.filter(entry =>
        entry.actorSide === side && entry.expiresAt > now).map(entry => ({
        candyId: entry.candyId,
        effect: entry.effect,
        expiresAt: entry.expiresAt,
      }))),
    };
  }

  execute({ farmId, side, op, args = {}, requestId }, now = Date.now()) {
    if (!text(farmId) || !['human', 'ai'].includes(side) || !record(args) ||
        !['view', 'eat'].includes(op) || !Number.isSafeInteger(now)) fail('invalid_request', 400);
    if (op === 'view') {
      if (requestId !== undefined || Object.keys(args).length !== 0) fail('invalid_request', 400);
      return this.view(farmId, now, side);
    }
    const keys = Object.keys(args);
    if (!text(args.candyId) || keys.some(key => !['candyId', 'target'].includes(key)) ||
        (Object.hasOwn(args, 'target') && !['self', 'other'].includes(args.target)) || !text(requestId))
      fail('invalid_request', 400);

    // Omitted target and explicit self share the established replay fingerprint.
    const receiptArgs = args.target === 'other' ? { candyId: args.candyId, target: 'other' } : { candyId: args.candyId };
    const command = JSON.stringify(canonical({ side, op, args: receiptArgs }));
    return this.store.transaction(() => {
      let receipt;
      try { receipt = this.store.receipt(farmId, requestId, command); }
      catch (error) {
        if (error instanceof ReceiptConflictError) fail('receipt_conflict');
        throw error;
      }
      if (receipt) return receipt;

      const state = this.store.load(farmId);
      const candy = this.store.ownedCandy(farmId, args.candyId);
      if (!candy) fail('candy_unavailable');
      const target = args.target ?? 'self';
      const eaterSide = target === 'self' ? side : side === 'ai' ? 'human' : 'ai';
      let resolved;
      try { resolved = resolveActorHiddenEffects(JSON.parse(candy.hidden_effect_json), eaterSide, this.random); }
      catch { fail('candy_effect_unavailable', 503); }

      const storedEffects = JSON.parse(candy.hidden_effect_json);
      if (!storedEffects?.ai || !storedEffects?.human ||
          JSON.stringify(storedEffects) !== JSON.stringify(resolved.hiddenEffects)) {
        if (this.store.updateCandyHiddenEffects(farmId, candy.candy_id, resolved.hiddenEffects) !== 1)
          fail('candy_unavailable');
      }
      const effect = resolved.effect;
      this.db.prepare("UPDATE halloween_candies SET status='eaten',eaten_at=? WHERE candy_id=?")
        .run(now, candy.candy_id);
      state.eatenEffects = queueEatenEffect(state.eatenEffects, {
        candyId: candy.candy_id, effect, side: eaterSide, eatenAt: now,
      });
      const result = {
        candyId: candy.candy_id,
        target,
        eaterSide,
        effect,
        expiresAt: now + effectDurationMs(effect, eaterSide),
      };
      this.store.save(farmId, state);
      this.store.saveReceipt(farmId, requestId, command, result);
      return result;
    });
  }
}
