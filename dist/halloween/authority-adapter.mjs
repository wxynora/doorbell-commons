import { AsyncLocalStorage } from 'node:async_hooks';
import { HalloweenError } from './service.mjs';

const requiredText = value => typeof value === 'string' && value.trim().length > 0;
const validMoney = value => Number.isSafeInteger(value) && value >= 0;

function fail(code, status = 503) { throw new HalloweenError(code, status); }
const actionScope = new AsyncLocalStorage();

// Adapter for the existing Farm world's already-open Lingye SQLite connection.
// Wallets are changed only through its trusted ledger commands; crop seeds,
// titles, and the corresponding Farm balance projection are committed using
// the existing same-connection Farm persistence port.
export function createHalloweenFarmAuthorityAdapter({ database, backend, persistence,
  getFarm, resolveFarmByDoorplate, listFarmNeighbors = () => [], crops, titles,
  eventId = 'halloween-2026', random = Math.random }) {
  if (!database || typeof database.prepare !== 'function' || !backend?.trustedQueries?.getAccount ||
      !backend?.trustedSystemCommands?.chargeToSystem || !backend?.trustedSystemCommands?.creditFromSystem ||
      !persistence?.commitMutation || typeof getFarm !== 'function' ||
      typeof resolveFarmByDoorplate !== 'function' || !Array.isArray(crops) || !Array.isArray(titles) ||
      !requiredText(eventId) || typeof random !== 'function') throw new TypeError('halloween_farm_authority_unavailable');

  const commands = backend.trustedSystemCommands;
  const titleById = new Map(titles.filter(title => title?.manual === true &&
    requiredText(title.id) && requiredText(title.name)).map(title => [title.id, title]));
  const seedPools = Object.freeze({
    SSR: crops.filter(crop => crop?.rarity === 'SSR'),
    // This is the existing public-expedition SP pool, not an event-specific
    // extra pool. Keep its exact source condition when it is assembled.
    SP: crops.filter(crop => crop?.rarity === 'SP' && crop?.seedPrice === 3600),
  });

  function boundFarm(farmId) {
    const farm = getFarm(farmId);
    const residentId = farm?.doorbellMcpMigration?.residentId;
    const migrationId = farm?.doorbellMcpMigration?.migrationId;
    const row = database.prepare('SELECT binding_reference FROM residents WHERE resident_id=?').get(residentId ?? '');
    if (!farm || !requiredText(residentId) || !requiredText(migrationId) || migrationId !== row?.binding_reference)
      fail('farm_binding_unavailable', 503);
    return { farm, residentId, migrationId };
  }

  function stageFarm(farm, working, operationId) {
    if (!Array.isArray(working.titles)) working.titles = [];
    if (!working.seeds || typeof working.seeds !== 'object' || Array.isArray(working.seeds)) working.seeds = {};
    if (working.doorbellMcpMigration) {
      working.doorbellMcpMigration.balanceProjection = {
        authority: 'ledger', operationId,
        gold: working.coins, silver: working.silver,
      };
    }
    const action = actionScope.getStore();
    if (!action) fail('farm_action_context_required', 503);
    action.farms.set(farm.id, { farm, working });
  }

  function stagedFarm(farmId) {
    const action = actionScope.getStore();
    if (!action) fail('farm_action_context_required', 503);
    let entry = action.farms.get(farmId);
    if (!entry) {
      const { farm } = boundFarm(farmId);
      entry = { farm, working: structuredClone(farm) };
      action.farms.set(farmId, entry);
    }
    return entry;
  }

  function commitFarmSnapshots(action) {
    for (const [farmId, { farm, working }] of action.farms) {
      if (!working.doorbellMcpMigration) fail('farm_binding_unavailable', 503);
      working.doorbellMcpMigration.balanceProjection = {
        authority: 'ledger', operationId: `${eventId}:${action.operationId}`,
        gold: working.coins, silver: working.silver,
      };
      persistence.commitMutation({ farms: [{ id: farmId, state: working }], components: [], durableBoundary: true });
    }
  }

  function publishFarmSnapshots(action) {
    for (const { farm, working } of action.farms.values()) {
      const keys = new Set(Object.keys(working));
      for (const key of Object.keys(farm)) if (!keys.has(key)) delete farm[key];
      Object.assign(farm, working);
    }
  }

  function ledgerAccount(residentId) {
    const account = backend.trustedQueries.getAccount(residentId);
    if (!validMoney(account?.availableGold) || !validMoney(account?.availableSilver)) fail('wallet_unavailable', 503);
    return account;
  }

  function walletCommand({ residentId, currency, amount, operationId, side, debit }) {
    const businessRef = `${eventId}:${operationId}:${currency}`;
    const input = { residentId, currency, amount, actor: side === 'ai' ? 'agent' : 'human',
      businessType: debit ? 'halloween_candy_shop' : 'halloween_material_event',
      businessRef, idempotencyKey: businessRef };
    return debit ? commands.chargeToSystem(input) : commands.creditFromSystem(input);
  }

  function applyBalance({ farmId, side, currency, amount, operationId, capLoss = false }) {
    if (!['gold', 'silver'].includes(currency) || !Number.isSafeInteger(amount) || amount === 0 || !requiredText(operationId))
      fail('wallet_unavailable', 503);
    const { residentId } = boundFarm(farmId);
    const before = ledgerAccount(residentId);
    const available = currency === 'gold' ? before.availableGold : before.availableSilver;
    const appliedAmount = amount < 0 && capLoss ? -Math.min(available, -amount) : amount;
    if (appliedAmount === 0) return { appliedAmount: 0 };
    if (appliedAmount < 0 && available < -appliedAmount)
      fail(currency === 'silver' ? 'insufficient_silver' : 'insufficient_gold', 409);
    const account = walletCommand({ residentId, currency, amount: Math.abs(appliedAmount), operationId,
      side, debit: appliedAmount < 0 });
    if (!validMoney(account?.availableGold) || !validMoney(account?.availableSilver)) fail('wallet_receipt_unavailable', 503);
    const { farm, working } = stagedFarm(farmId);
    working.coins = account.availableGold;
    working.silver = account.availableSilver;
    stageFarm(farm, working, operationId);
    return { appliedAmount, availableGold: account.availableGold, availableSilver: account.availableSilver };
  }

  function chooseSeed(poolName) {
    const pool = seedPools[poolName];
    if (!pool?.length) fail('reward_seed_pool_unavailable', 503);
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) fail('reward_seed_pool_unavailable', 503);
    const crop = pool[Math.floor(roll * pool.length)];
    if (!requiredText(crop?.id) || !requiredText(crop?.name)) fail('reward_seed_pool_unavailable', 503);
    return crop;
  }

  function grantReward({ farmId, rewardId, reward }) {
    if (!requiredText(rewardId) || !reward || typeof reward !== 'object' || Array.isArray(reward))
      fail('reward_unconfirmed', 503);
    const action = actionScope.getStore();
    if (!action) fail('farm_action_context_required', 503);
    const { farm, residentId } = boundFarm(farmId);
    const prior = action.farms.get(farmId);
    const working = structuredClone(prior?.working ?? farm);
    const title = reward.title === undefined ? null : titleById.get(reward.title);
    if (reward.title !== undefined && !title) fail('reward_title_unavailable', 503);
    const currencies = [];
    for (const currency of ['gold', 'silver']) {
      const amount = reward[currency];
      if (amount === undefined || amount === 0) continue;
      if (!Number.isSafeInteger(amount) || amount < 0) fail('reward_unconfirmed', 503);
      currencies.push({ currency, amount });
    }
    if (reward.seeds !== undefined && (!reward.seeds || typeof reward.seeds !== 'object' || Array.isArray(reward.seeds)))
      fail('reward_unconfirmed', 503);
    const seedCounts = new Map();
    for (const [poolName, quantity] of Object.entries(reward.seeds ?? {})) {
      if (!['SSR', 'SP'].includes(poolName) || !Number.isSafeInteger(quantity) || quantity < 0)
        fail('reward_unconfirmed', 503);
      for (let index = 0; index < quantity; index++) {
        const crop = chooseSeed(poolName);
        const seed = seedCounts.get(crop.id) ?? { id: crop.id, name: crop.name, tier: poolName, quantity: 0 };
        seed.quantity++;
        seedCounts.set(crop.id, seed);
      }
    }
    let account = ledgerAccount(residentId);
    const operationId = `${eventId}:reward:${rewardId}`;
    for (const { currency, amount } of currencies) {
      account = walletCommand({ residentId, currency, amount, operationId: `${operationId}:${currency}`,
        side: 'human', debit: false });
      if (!validMoney(account?.availableGold) || !validMoney(account?.availableSilver)) fail('reward_unconfirmed', 503);
    }
    working.coins = account.availableGold;
    working.silver = account.availableSilver;
    if (title) {
      working.titles ??= [];
      if (!working.titles.includes(title.id)) working.titles.push(title.id);
    }
    for (const seed of seedCounts.values()) {
      working.seeds[seed.id] = (working.seeds[seed.id] ?? 0) + seed.quantity;
    }
    stageFarm(farm, working, operationId);
    return { paid: true, availableGold: account.availableGold, availableSilver: account.availableSilver,
      seeds: [...seedCounts.values()] };
  }

  function resolveNeighbor({ farmId, doorplate }) {
    if (!requiredText(doorplate)) return null;
    const sender = getFarm(farmId);
    const recipient = resolveFarmByDoorplate(doorplate);
    if (!sender || !recipient || recipient.id === sender.id ||
        !listNeighbors({ farmId }).some(neighbor => neighbor.doorplate === recipient.id)) return null;
    return { farmId: recipient.id, senderName: String(sender.name ?? sender.humanName ?? '邻居'),
      recipientName: String(recipient.name ?? recipient.humanName ?? doorplate) };
  }

  function listNeighbors({ farmId }) {
    return listFarmNeighbors(farmId).filter(farm => farm?.id !== farmId && requiredText(farm?.id))
      .map(farm => ({ doorplate: farm.id, name: String(farm.name ?? farm.humanName ?? farm.id) }));
  }

  return Object.freeze({
    withRewardSavepoint(operation) {
      const action = actionScope.getStore();
      if (!action || typeof operation !== 'function') fail('farm_action_context_required', 503);
      const before = new Map(action.farms);
      try { return operation(); }
      catch (error) {
        action.farms = before;
        throw error;
      }
    },
    withAuthorityAction({ farmId, side, requestId, now }, operation) {
      if (!requiredText(farmId) || !['human', 'ai'].includes(side) || !requiredText(requestId) ||
          !Number.isSafeInteger(now) || typeof operation !== 'function') fail('invalid_request', 400);
      const action = { farmId, side, operationId: requestId, now, farms: new Map() };
      database.exec('SAVEPOINT halloween_farm_action');
      let result;
      try {
        result = actionScope.run(action, operation);
        if (result && typeof result.then === 'function') fail('async_farm_action_not_supported', 503);
        commitFarmSnapshots(action);
        database.exec('RELEASE halloween_farm_action');
      } catch (error) {
        database.exec('ROLLBACK TO halloween_farm_action; RELEASE halloween_farm_action');
        throw error;
      }
      publishFarmSnapshots(action);
      return result;
    },
    debitSilver({ farmId, side, amount, operationId }) {
      if (!Number.isSafeInteger(amount) || amount <= 0) fail('shop_unconfigured', 503);
      const result = applyBalance({ farmId, side, currency: 'silver', amount: -amount,
        operationId: `shop:${farmId}:${operationId}`, capLoss: false });
      return { paid: true, availableSilver: result.availableSilver };
    },
    applyCurrency({ farmId, side, currency, amount, operationId, capLoss }) {
      return applyBalance({ farmId, side, currency, amount,
        operationId: `exploration:${farmId}:${operationId}`, capLoss: capLoss === true });
    },
    grantReward,
    resolveNeighbor,
    listNeighbors,
    seedPools,
  });
}
