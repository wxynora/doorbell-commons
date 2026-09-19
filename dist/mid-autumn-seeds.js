import { cropById } from './content.js';
export const MID_AUTUMN_SEED_OPENS_AT = Date.parse('2026-09-19T19:58:09+08:00');
export const MID_AUTUMN_SEED_CLOSES_AT = Date.parse('2026-09-26T08:00:00+08:00');

export const MID_AUTUMN_SEED_TASKS = [
  { id:'water', kind:'water', target:5, cropId:'mid_autumn_moon_dew_osmanthus', label:'替其他农场浇水 5 次' },
  { id:'harvest_common', kind:'harvest_common', target:12, cropId:'mid_autumn_rabbit_radish', label:'收获普通作物 12 株' },
  { id:'harvest_fantasy', kind:'harvest_fantasy', target:5, cropId:'mid_autumn_flowing_lotus', label:'收获奇幻作物 5 株' },
  { id:'fish', kind:'fish', target:2, cropId:'mid_autumn_silver_reed', itemId:'silver_dace', label:'钓到并自动提交银鲦 2 条（消耗鱼）' },
  { id:'dish', kind:'dish', target:1, cropId:'mid_autumn_golden_wheat', itemId:'butter_cookie', label:'做出并自动提交黄油曲奇 1 份（消耗料理）' },
  { id:'craft', kind:'craft', target:1, cropId:'mid_autumn_star_sesame', label:'成功熔炼 1 次' },
];
const ids = new Set(MID_AUTUMN_SEED_TASKS.map(t=>t.cropId));
export const isMidAutumnSeedActive = (now=Date.now()) => now >= MID_AUTUMN_SEED_OPENS_AT && now < MID_AUTUMN_SEED_CLOSES_AT;
export const midAutumnSeedEntryText = (now, farm) => isMidAutumnSeedActive(now)
  ? MID_AUTUMN_SEED_TASKS.filter(task => !farm?.midAutumnSeeds2026?.tasks?.[task.id]?.completedAt).map(task => `${task.label}：${farm?.midAutumnSeeds2026?.tasks?.[task.id]?.progress ?? 0}/${task.target}`).join('\n') : '';
export const isMidAutumnSeedCropId = id => ids.has(id);
export function normalizeMidAutumnSeedFarm(farm, now=Date.now(), force=false) {
  if (!farm.midAutumnSeeds2026) {
    if (!force && !isMidAutumnSeedActive(now)) return null;
    farm.midAutumnSeeds2026={tasks:{},seedBuys:{day:-1,counts:{}},harvestedCropIds:[]};
  }
  const state=farm.midAutumnSeeds2026;
  for (const task of MID_AUTUMN_SEED_TASKS) state.tasks[task.id] ??= {progress:0};
  return state;
}
export function midAutumnSeedUnlocked(farm,cropId,now=Date.now()) {
  const task=MID_AUTUMN_SEED_TASKS.find(t=>t.cropId===cropId);
  return !task || !!normalizeMidAutumnSeedFarm(farm,now)?.tasks[task.id].completedAt;
}
export function recordMidAutumnSeedProgress(farm,kind,amount=1,now=Date.now()) {
  if (!isMidAutumnSeedActive(now)) return null;
  const task=MID_AUTUMN_SEED_TASKS.find(t=>t.kind===kind);
  if (!task || !Number.isSafeInteger(amount) || amount<=0) return null;
  const saved=normalizeMidAutumnSeedFarm(farm,now).tasks[task.id];
  if (saved.completedAt) return null;
  saved.progress=Math.min(task.target,saved.progress+amount);
  const completed=saved.progress===task.target;
  if (completed) {
    saved.completedAt=now;
    farm.seeds ??= {};
    farm.seeds[task.cropId]=(farm.seeds[task.cropId]??0)+1;
  }
  return {...task,progress:saved.progress,completed,cropName:cropById.get(task.cropId)?.name??task.cropId};
}
export function submitMidAutumnSeedFish(farm,state,newCatchIds,now=Date.now()) {
  if (!isMidAutumnSeedActive(now)) return null;
  const saved=normalizeMidAutumnSeedFarm(farm,now).tasks.fish;
  if (saved.completedAt) return null;
  const fresh=new Set(newCatchIds);
  const selected=state.catchInventory.filter(i=>fresh.has(i.id)&&i.fishId==='silver_dace').slice(0,2-saved.progress);
  if (!selected.length) return null;
  const remove=new Set(selected.map(i=>i.id));
  state.catchInventory=state.catchInventory.filter(i=>!remove.has(i.id));
  return {...recordMidAutumnSeedProgress(farm,'fish',selected.length,now),submitted:selected.length,submittedIds:[...remove]};
}
export function submitMidAutumnSeedDish(farm,kitchen,dish,now=Date.now()) {
  if (!isMidAutumnSeedActive(now)||dish?.recipeId!=='butter_cookie'||!kitchen.dishes.includes(dish)) return null;
  if (normalizeMidAutumnSeedFarm(farm,now).tasks.dish.completedAt) return null;
  kitchen.dishes=kitchen.dishes.filter(i=>i!==dish);
  return {...recordMidAutumnSeedProgress(farm,'dish',1,now),submitted:1};
}
export function recordMidAutumnSeedHarvest(farm,crop,seedType,now=Date.now()) {
  const event=recordMidAutumnSeedProgress(farm,seedType==='common'?'harvest_common':seedType==='fantasy'?'harvest_fantasy':'',1,now);
  if (ids.has(crop?.id)) {
    const state=normalizeMidAutumnSeedFarm(farm,now,true);
    if (!state.harvestedCropIds.includes(crop.id)) state.harvestedCropIds.push(crop.id);
  }
  return event;
}
export const midAutumnSeedCollectionComplete = farm => [...ids].every(id=>(farm.midAutumnSeeds2026?.harvestedCropIds??[]).includes(id));
export const midAutumnSeedHarvestSilver = (crop,quality) => ids.has(crop?.id) ? Math.round(crop.midAutumnSilverBase*(Number(quality?.priceFactor)||1)) : null;
export const midAutumnSeedCompletionText = event => event?.completed ? `✅ 已解锁「${event.cropName}」，并获得种子 ×1。可在商店购买。` : '';
export function midAutumnSeedTaskView(farm,now=Date.now()) {
  if (!isMidAutumnSeedActive(now)) return null;
  const state=normalizeMidAutumnSeedFarm(farm,now);
  return {tasks:MID_AUTUMN_SEED_TASKS.map(t=>({...t,...state.tasks[t.id],cropName:cropById.get(t.cropId)?.name}))};
}
