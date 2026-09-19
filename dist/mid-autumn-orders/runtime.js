import {getFarm} from '../store.js';
import {createFarmWorldSqlitePersistence} from '../farm-world-sqlite-persistence.js';
import {MidAutumnService} from './service.js';
import {EVENT_ID} from './catalog.js';

// Credit the existing ledger and stage the Farm projection in one service transaction.
export function createMidAutumnRuntime(database, options = {}) {
  const persistence = createFarmWorldSqlitePersistence(database);
  const resolveFarm = options.getFarm ?? getFarm;
  let publication = null;
  const service = new MidAutumnService(database, {...options, grantGiftReward(farmId,reward) {
    const farm = resolveFarm(farmId);
    const residentId = farm?.doorbellMcpMigration?.residentId;
    const binding = database.prepare('SELECT binding_reference FROM residents WHERE resident_id=?').get(residentId ?? '');
    if (!farm || !residentId || farm.doorbellMcpMigration.migrationId !== binding?.binding_reference)
      throw new Error('mid_autumn_reward_binding_invalid');
    const commands = options.backend?.trustedSystemCommands;
    if (!commands?.creditFromSystem) throw new Error('mid_autumn_reward_backend_unavailable');
    const working = structuredClone(farm);
    let credited;
    for (const [currency,amount] of [['gold',reward.coins],['silver',reward.silver]]) {
      const key = `${EVENT_ID}:first-gift:${farmId}:${currency}`;
      credited = commands.creditFromSystem({residentId,currency,amount,
        businessType:'mid_autumn_gift',businessRef:key,idempotencyKey:key});
    }
    working.coins = credited.availableGold;
    working.silver = credited.availableSilver;
    working.titles ??= [];
    if (!working.titles.includes(reward.titleId)) working.titles.push(reward.titleId);
    working.doorbellMcpMigration.balanceProjection = {authority:'ledger',
      operationId:`${EVENT_ID}:first-gift:${farmId}`,gold:working.coins,silver:working.silver};
    persistence.commitMutation({farms:[{id:farmId,state:working}],components:[],durableBoundary:true});
    publication = {farm,working};
  }});
  return {execute(input,now) {
    if (database.isTransaction) throw new Error('mid_autumn_runtime_requires_transaction_boundary');
    publication = null;
    try {
      const result = service.execute(input,now);
      if (publication) {
        const {farm,working} = publication;
        farm.coins = working.coins; farm.silver = working.silver;
        farm.titles = working.titles;
        farm.doorbellMcpMigration.balanceProjection = working.doorbellMcpMigration.balanceProjection;
      }
      return result;
    } finally {publication = null;}
  }};
}
