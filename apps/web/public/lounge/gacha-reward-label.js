export function rewardRarity(reward){
 const category=reward.category;
 if(category==='sp_seed'||category==='sp_material')return 'SP';
 if(category==='ssr_seed')return 'SSR';
 if(category==='sr_seed')return 'SR';
 return typeof reward.rarity==='string'?reward.rarity.toUpperCase():'';
}
export function rewardLabel(reward,fallback=''){const rarity=rewardRarity(reward),name=reward.name||fallback;return rarity&&!name.toUpperCase().startsWith(rarity)?`${rarity} · ${name}`:name;}
