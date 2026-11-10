import { randomInt } from 'node:crypto';
import { crops } from '../../content.js';
import { cloneFarmForMutation } from '../../farm-mutation-scope.js';
import { allFarms, replaceFarm, withWorldCommitContext } from '../../store.js';
import { decorationState } from '../../domain/farm-decoration/state.js';
import { applySnowKingLease, FINALIST_LEASE_MS } from '../../domain/farm-decoration/champion-lease.js';

const editionId='snow-tournament:2026-11';
const spPool=crops.filter(crop=>crop.rarity==='SP'&&crop.category!=='ugc').map(crop=>crop.id);
const expectedId=farmId=>JSON.stringify(['snow-tournament',editionId,'finale-compensation',farmId]);

export function createTournamentFinaleCompensation({farms=allFarms,commit=replaceFarm,
  checkpoint=withWorldCommitContext,now=Date.now,draw=randomInt}={}) {
  return input=>{
    if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!=='edition_id,farm_id,grant_id,resident_id,statue'||
      input.edition_id!==editionId||typeof input.farm_id!=='string'||!input.farm_id||typeof input.resident_id!=='string'||!input.resident_id||
      input.grant_id!==expectedId(input.farm_id)||typeof input.statue!=='boolean')throw Error('invalid_snow_finale_grant');
    const farm=farms().find(f=>f.id===input.farm_id&&f.doorbellMcpMigration?.residentId===input.resident_id);
    if(!farm)throw Error('snow_finale_binding_unavailable');
    const saved=farm.snowTournamentFinaleCompensation;
    if(saved){
      if(saved.grant_id!==input.grant_id||(saved.statue_expires_at!==null)!==input.statue)throw Error('snow_finale_grant_conflict');
      return structuredClone(saved);
    }
    const at=now(),working=cloneFarmForMutation(farm),seeds=[];
    for(let i=0;i<3;i++){
      const seed=spPool[draw(spPool.length)];
      seeds.push(seed);working.seeds[seed]=(working.seeds[seed]??0)+1;
    }
    const expires=input.statue?applySnowKingLease(working,farm,decorationState(farm,at),editionId,at,FINALIST_LEASE_MS):null;
    const receipt={ok:true,grant_id:input.grant_id,edition_id:editionId,farm_id:farm.id,seed_ids:seeds,granted_at:at,statue_expires_at:expires};
    working.snowTournamentFinaleCompensation=receipt;
    checkpoint({balanceAuthority:'ledger',actor:'system'},()=>commit(farm.id,working));
    return structuredClone(receipt);
  };
}

export async function handleTournamentFinaleCompensation(req,res,method,io){
  if(!io.authorize(req,res,method))return;
  try{return io.jsonOut(res,200,createTournamentFinaleCompensation()(await io.readBody(req)));}
  catch(error){
    if(error?.message==='invalid_snow_finale_grant'||error?.message==='invalid_json')return io.error(res,400,'invalid_request','invalid_request');
    if(error?.message==='snow_finale_grant_conflict')return io.error(res,409,'reward_conflict','reward_conflict');
    return io.error(res,503,'service_unavailable','service_unavailable');
  }
}
