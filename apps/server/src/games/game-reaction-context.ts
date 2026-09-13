import type { ReactionRecord } from './game-reaction-store.js';

export function pendingReactionContext(records:readonly ReactionRecord[],playerId:string,acknowledged:(residentId:string,wakeId:string)=>boolean) {
  const pending=records.filter(r=>r.paid && r.targetId===playerId && r.targetController==='resident' &&
    !acknowledged(r.targetResidentId,`game_reaction:${r.id}`) &&
    !(r.bellWakeIds ?? []).some(wakeId => acknowledged(r.targetResidentId,wakeId)));
  const groups=new Map<string,{name:string;kind:ReactionRecord['kind'];count:number}>();
  for(const r of pending){
    const key=r.senderId+'\0'+r.kind;
    const group=groups.get(key);
    if(group)group.count++;else groups.set(key,{name:r.senderName,kind:r.kind,count:1});
  }
  return {ids:pending.map(r=>r.id),text:[...groups.values()].map(g=>`${g.name}给你${g.kind==='flower'?'送了':'扔了'} ${g.count} 个${g.kind==='flower'?'🌹':'💣'}。`).join('\n')};
}
