import { randomUUID } from 'node:crypto';
import { DIY_OPTIONS, scorePreferenceOrder } from './scoring.js';
import { EVENT_ID, OPENS_AT, DELIVERY_AT, CLOSES_AT, ORDERS, ORDER_DESCRIPTIONS, initialState, rewardOrder, availableOptions, approvedFeedback } from './catalog.js';

export class MidAutumnError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new MidAutumnError(code, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('invalid_request', 400);
}
function string(value) { if (typeof value !== 'string' || !value.trim()) fail('invalid_request', 400); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const READS = new Set(['view', 'preview', 'memorial']);
const ARGUMENTS = {
  view: [], memorial: [], complete_collection: [], begin: [], restock: [], accept: ['orderId'], cook: ['cake', 'replaceCakeId'],
  preview: ['orderId', 'cakeIds', 'boxId'], deliver: ['orderId', 'cakeIds', 'boxId'],
  choose_stamp: ['pattern'], pack: ['cakeIds', 'letter'], unpack: ['boxId'], send: ['boxId'],
};

export class MidAutumnService {
  constructor(database, options = {}) {
    this.db = database;
    this.opensAt = options.opensAt ?? OPENS_AT;
    this.deliveryAt = options.deliveryAt ?? DELIVERY_AT;
    this.closesAt = options.closesAt ?? CLOSES_AT;
    this.id = options.generateId ?? randomUUID;
    this.grantGiftReward = options.grantGiftReward;
    if (this.opensAt !== null && (!Number.isSafeInteger(this.opensAt) || this.opensAt >= this.deliveryAt)) throw new TypeError('Invalid event window');
    if (!Number.isSafeInteger(this.deliveryAt) || this.deliveryAt >= this.closesAt) throw new TypeError('Invalid event window');
    if (!Number.isSafeInteger(this.closesAt)) throw new TypeError('Invalid event window');
  }
  phase(now) {
    if (!Number.isSafeInteger(now)) fail('invalid_time', 400);
    if (now >= this.closesAt) return 'ended';
    return this.opensAt === null ? 'unconfigured' : now < this.opensAt ? 'upcoming' : 'open';
  }
  state(farmId) {
    const row = this.db.prepare('SELECT state_json FROM mid_autumn_households WHERE event_id=? AND farm_id=?').get(EVENT_ID, farmId);
    return row ? JSON.parse(row.state_json) : initialState();
  }
  save(farmId, state) {
    this.db.prepare('INSERT INTO mid_autumn_households VALUES (?,?,?) ON CONFLICT(event_id,farm_id) DO UPDATE SET state_json=excluded.state_json').run(EVENT_ID, farmId, JSON.stringify(state));
  }
  transaction(operation) {
    this.db.exec('SAVEPOINT mid_autumn_action');
    try {
      const result = operation();
      this.db.exec('RELEASE mid_autumn_action');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK TO mid_autumn_action; RELEASE mid_autumn_action');
      throw error;
    }
  }
  // Called only by a trusted chapter-completion handler, never exposed in action args.
  grantHumanChapter(farmId, chapter, now) {
    string(farmId);
    if (!['crust', 'sweet', 'five_nuts', 'yolk'].includes(chapter)) fail('invalid_chapter', 400);
    if (this.phase(now) !== 'open') fail('event_not_open');
    return this.transaction(() => {
      const state = this.state(farmId);
      if (!state.humanChapters.includes(chapter)) state.humanChapters.push(chapter);
      this.save(farmId, state);
      return { chapter };
    });
  }
  cakes(farmId, side, ids, expected, status = 'available') {
    if (!Array.isArray(ids) || ids.length !== expected || new Set(ids).size !== ids.length) fail('invalid_selection', 400);
    return Array.from(ids, id => {
      string(id);
      const row = this.db.prepare('SELECT * FROM mid_autumn_cakes WHERE id=? AND event_id=? AND farm_id=? AND side=?').get(id, EVENT_ID, farmId, side);
      if (!row || row.status !== status) fail('cake_unavailable');
      return { ...row, cake: JSON.parse(row.config_json) };
    });
  }
  order(state, id) {
    const order = ORDERS.find(value => value.id === id);
    if (!order) fail('invalid_order', 400);
    if (!state.started || order.requires.some(value => !state.completed.includes(value))) fail('order_locked');
    return order;
  }
  execute({ farmId, side, op, args = {}, requestId }, now = Date.now()) {
    string(farmId);
    if (!['ai', 'human'].includes(side) || !Object.hasOwn(ARGUMENTS, op)) fail('invalid_request', 400);
    keys(args, ARGUMENTS[op], op === 'cook' ? ['cake'] : ['preview', 'deliver'].includes(op) ? ['orderId'] : ARGUMENTS[op]);
    const phase = this.phase(now);
    if (op === 'view' || op === 'memorial') return this.view(farmId, side, phase, op === 'memorial', now);
    if (side === 'human' && ['begin', 'restock', 'accept', 'preview', 'deliver', 'choose_stamp'].includes(op)) fail('actor_not_allowed', 403);
    if (side !== 'human' && op === 'complete_collection') fail('actor_not_allowed', 403);
    if (!READS.has(op)) string(requestId);
    const command = JSON.stringify(canonical({ op, args }));
    return this.transaction(() => {
      if (!READS.has(op)) {
        const receipt = this.db.prepare('SELECT command_json,result_json FROM mid_autumn_receipts WHERE event_id=? AND farm_id=? AND side=? AND request_id=?').get(EVENT_ID, farmId, side, requestId);
        if (receipt) {
          if (receipt.command_json !== command) fail('receipt_conflict');
          return JSON.parse(receipt.result_json);
        }
      }
      if (phase !== 'open') fail('event_not_open');
      const state = this.state(farmId);
      const result = this.perform(farmId, side, op, args, state, now);
      if (!READS.has(op)) {
        this.save(farmId, state);
        this.db.prepare('INSERT INTO mid_autumn_receipts VALUES (?,?,?,?,?,?)').run(EVENT_ID, farmId, side, requestId, command, JSON.stringify(result));
      }
      return result;
    });
  }
  perform(farmId, side, op, args, state, now) {
    if (op === 'complete_collection') {
      state.humanCollectionCompleted = true;
      return { materialsUnlocked: true };
    }
    if (op === 'begin') {
      if (!state.started) {
        state.started = true;
        state.recipes = [0, 1];
        if (!state.shapes.includes('圆月')) state.shapes.push('圆月');
        if (!state.shapes.includes('花朵')) state.shapes.push('花朵');
        state.materials.dough = 8; state.materials.fillings[0] = 4; state.materials.fillings[1] = 4;
      }
      return { started: true };
    }
    if (op === 'restock') {
      if (!state.started) fail('not_started');
      state.materials.dough = Math.max(4, state.materials.dough);
      for (const filling of state.recipes) state.materials.fillings[filling] = Math.max(4, state.materials.fillings[filling]);
      if (state.completed.includes('traditional')) state.materials.yolks = Math.max(4, state.materials.yolks);
      return { restocked: true };
    }
    if (op === 'accept') {
      const order = this.order(state, args.orderId);
      if (!state.accepted.includes(order.id)) state.accepted.push(order.id);
      return { orderId: order.id, accepted: true };
    }
    if (op === 'cook') {
      if (Object.hasOwn(args, 'replaceCakeId')) {
        if (side !== 'human') fail('actor_not_allowed', 403);
        this.cakes(farmId, side, [args.replaceCakeId], 1);
      }
      keys(args.cake, ['filling', 'yolk', 'shape', 'pattern', 'bake']);
      try { scorePreferenceOrder('sweet_cute', args.cake); } catch { fail('invalid_cake', 400); }
      const cake = args.cake;
      if (side === 'ai') {
        if (!state.shapes.includes(cake.shape) || !state.patterns.includes(cake.pattern)) fail('option_locked');
        if ((!state.completed.includes('sweet_cute') && cake.pattern !== '无') || (!state.completed.includes('traditional') && cake.bake !== 75)) fail('option_locked');
        if (!state.recipes.includes(cake.filling)) fail('recipe_locked');
        const stock = state.materials;
        if (stock.dough < 1 || stock.fillings[cake.filling] < 1 || (cake.yolk && stock.yolks < 1)) fail('insufficient_materials');
        stock.dough--; stock.fillings[cake.filling]--; if (cake.yolk) stock.yolks--;
      } else {
        if (!state.humanCollectionCompleted && (!state.humanChapters.includes('crust') || !state.humanChapters.includes(cake.filling === 3 ? 'five_nuts' : 'sweet') || (cake.yolk && !state.humanChapters.includes('yolk')))) fail('chapter_locked');
      }
      const cakeId = args.replaceCakeId ?? this.id();
      if (args.replaceCakeId) {
        this.db.prepare('UPDATE mid_autumn_cakes SET config_json=? WHERE id=?').run(JSON.stringify(cake), cakeId);
      } else {
        this.db.prepare('INSERT INTO mid_autumn_cakes VALUES (?,?,?,?,?,?,?)').run(cakeId, EVENT_ID, farmId, side, JSON.stringify(cake), 'available', now);
      }
      return { cakeId };
    }
    if (op === 'preview' || op === 'deliver') {
      const order = this.order(state, args.orderId);
      if (!state.accepted.includes(order.id)) fail('order_not_accepted');
      keys(args, order.size === 4 ? ['orderId', 'boxId'] : ['orderId', 'cakeIds']);
      let box;
      if (order.size === 4) {
        string(args.boxId);
        box = this.db.prepare('SELECT * FROM mid_autumn_boxes WHERE id=? AND event_id=? AND farm_id=? AND side=?').get(args.boxId, EVENT_ID, farmId, side);
        if (!box || box.status !== 'packed') fail('box_unavailable');
      }
      const selected = this.cakes(farmId, side, box ? JSON.parse(box.cakes_json) : args.cakeIds, order.size, box ? 'boxed' : 'available');
      const evaluation = scorePreferenceOrder(order.id, selected.map(row => row.cake), {pattern:state.completed.includes('sweet_cute')});
      if (op === 'preview') return { orderId: order.id, ...evaluation };
      for (const row of selected) this.db.prepare("UPDATE mid_autumn_cakes SET status='delivered' WHERE id=?").run(row.id);
      if (box) this.db.prepare("UPDATE mid_autumn_boxes SET status='delivered' WHERE id=?").run(box.id);
      const reward = rewardOrder(state, order);
      state.accepted = state.accepted.filter(id => id !== order.id);
      return { orderId: order.id, ...(box ? { boxId: box.id } : {}), cakeIds: selected.map(row => row.id), ...evaluation, reward,
        feedback: approvedFeedback(order.id, evaluation) };
    }
    if (op === 'choose_stamp') {
      if (!DIY_OPTIONS.patterns.includes(args.pattern) || args.pattern === '无') fail('invalid_pattern', 400);
      if (state.patterns.includes(args.pattern)) fail('already_unlocked');
      if (state.stampChoices < 1) fail('no_stamp_choice');
      state.stampChoices--; state.patterns.push(args.pattern);
      return { pattern: args.pattern };
    }
    if (op === 'pack') {
      if (typeof args.letter !== 'string') fail('invalid_letter', 400);
      const selected = this.cakes(farmId, side, args.cakeIds, 4);
      const boxId = this.id();
      this.db.prepare('INSERT INTO mid_autumn_boxes VALUES (?,?,?,?,?,?,?,?,?)').run(boxId, EVENT_ID, farmId, side, JSON.stringify(selected.map(row => row.id)), args.letter, 'packed', now, null);
      for (const row of selected) this.db.prepare("UPDATE mid_autumn_cakes SET status='boxed' WHERE id=?").run(row.id);
      return { boxId };
    }
    string(args.boxId);
    const box = this.db.prepare('SELECT * FROM mid_autumn_boxes WHERE id=? AND event_id=? AND farm_id=? AND side=?').get(args.boxId, EVENT_ID, farmId, side);
    if (!box || box.status !== 'packed') fail('box_unavailable');
    if (op === 'unpack') {
      for (const id of JSON.parse(box.cakes_json)) this.db.prepare("UPDATE mid_autumn_cakes SET status='available' WHERE id=? AND status='boxed'").run(id);
      this.db.prepare('DELETE FROM mid_autumn_boxes WHERE id=?').run(box.id);
      return { unpackedBoxId: box.id };
    }
    if (op === 'send') {
      let reward = null;
      if (!state.giftRewardedAt) {
        if (!this.grantGiftReward) fail('reward_service_unavailable', 503);
        reward = { coins: 1314, silver: 520, titleId: 'mid_autumn_2026_gift' };
        this.grantGiftReward(farmId, reward, side);
        state.giftRewardedAt = now;
      }
      this.db.prepare("UPDATE mid_autumn_boxes SET status='sent',sent_at=? WHERE id=?").run(now, box.id);
      return { boxId: box.id, recipientSide: side === 'ai' ? 'human' : 'ai', sentAt: now, reward };
    }
    fail('invalid_request', 400);
  }
  view(farmId, side, phase, memorial, now) {
    if (phase === 'upcoming' || phase === 'unconfigured')
      return { eventId: EVENT_ID, phase, opensAt: this.opensAt, deliveryAt: this.deliveryAt, closesAt: this.closesAt, gifts: [] };
    const state = this.state(farmId);
    const boxes = this.db.prepare("SELECT * FROM mid_autumn_boxes WHERE event_id=? AND farm_id=? AND (side=? OR status='sent') ORDER BY created_at,id").all(EVENT_ID, farmId, side);
    const gifts = boxes.filter(box => box.status !== 'delivered' && (!memorial || box.status === 'sent') &&
      (box.side === side || now >= this.deliveryAt)).map(box => ({
      id: box.id, side: box.side, letter: box.letter, status: box.status, sentAt: box.sent_at,
      cakes: JSON.parse(box.cakes_json).map(id => {
        const row = this.db.prepare('SELECT config_json FROM mid_autumn_cakes WHERE id=? AND event_id=? AND farm_id=?').get(id, EVENT_ID, farmId);
        return { id, cake: JSON.parse(row.config_json) };
      }),
    }));
    if (memorial || phase === 'ended') return { eventId: EVENT_ID, phase, destination: 'memorial', gifts: gifts.filter(box => box.status === 'sent') };
    const options = side === 'ai' ? availableOptions(state) : {
      fillings: DIY_OPTIONS.fillings.flatMap((name, id) =>
        state.humanCollectionCompleted || (state.humanChapters.includes('crust') && state.humanChapters.includes(id === 3 ? 'five_nuts' : 'sweet')) ? [{ id, name }] : []),
      shapes: [...DIY_OPTIONS.shapes], patterns: [...DIY_OPTIONS.patterns],
      bake: { ...DIY_OPTIONS.bake }, stages: { pattern: true, bake: true },
    };
    options.yolk = side === 'ai' ? state.completed.includes('traditional') : Boolean(state.humanCollectionCompleted || state.humanChapters.includes('yolk'));
    return { eventId: EVENT_ID, phase, opensAt: this.opensAt, deliveryAt: this.deliveryAt, closesAt: this.closesAt,
      started: side === 'ai' ? state.started : Boolean(state.humanCollectionCompleted || state.humanChapters.length > 0), options, materials: side === 'ai' ? state.materials : null,
      humanChapters: side === 'human' ? state.humanChapters : undefined, stampChoices: side === 'ai' ? state.stampChoices : 0,
      stampChoiceOptions: side === 'ai' ? DIY_OPTIONS.patterns.filter(pattern => !state.patterns.includes(pattern)) : [],
      orders: side === 'ai' ? ORDERS.map(order => ({ id: order.id, npcId: order.npcId, size: order.size,
        available: state.started && order.requires.every(id => state.completed.includes(id)),
        accepted: state.accepted.includes(order.id), completed: state.completed.includes(order.id),
        ...ORDER_DESCRIPTIONS[order.id] })) : [],
      cakes: this.db.prepare("SELECT id,config_json FROM mid_autumn_cakes WHERE event_id=? AND farm_id=? AND side=? AND status='available' ORDER BY created_at,id").all(EVENT_ID, farmId, side).map(row => ({ id: row.id, cake: JSON.parse(row.config_json) })), gifts };
  }
}
