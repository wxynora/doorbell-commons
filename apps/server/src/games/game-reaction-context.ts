import type { ReactionRecord } from './game-reaction-store.js';

/**
 * Reactions this resident has not been told about yet. A reaction counts as told
 * as soon as it was included in a wake we sent, whether the home acknowledged that
 * wake or not; withdrawn wakes do not bring it back, because the newer wake that
 * replaced them only carries what came after.
 */
export function pendingReactionContext(records:readonly ReactionRecord[],playerId:string,sent:(residentId:string,wakeId:string)=>boolean) {
  const pending=records.filter(r=>r.paid && r.targetId===playerId && r.targetController==='resident' &&
    !sent(r.targetResidentId,`game_reaction:${r.id}`) &&
    !(r.bellWakeIds ?? []).some(wakeId => sent(r.targetResidentId,wakeId)));
  const groups=new Map<string,{name:string;kind:ReactionRecord['kind'];count:number}>();
  for(const r of pending){
    const key=r.senderId+'\0'+r.kind;
    const group=groups.get(key);
    if(group)group.count++;else groups.set(key,{name:r.senderName,kind:r.kind,count:1});
  }
  return {ids:pending.map(r=>r.id),text:[...groups.values()].map(g=>`${g.name}给你${g.kind==='flower'?'送了':'扔了'} ${g.count} 个${g.kind==='flower'?'🌹':'💣'}。`).join('\n')};
}
