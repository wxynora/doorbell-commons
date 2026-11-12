import type { HomeMomentRecords, HomeRecord, HomeTable, SqlValue } from "./home-records.js";

/** Only trusted, structured activity outcomes may supply these keys. No text classification. */
export const activityStatusKeys = [
  "glimmer.ticket",
  "glimmer.explore",
  "glimmer.explore.choice",
  "glimmer.explore.instant",
  "glimmer.choose",
  "glimmer.catch.success",
  "glimmer.catch.fail",
  "glimmer.assist",
  "glimmer.assist.complete",
  "glimmer.achievement",
  "field.plant",
  "field.plant.common",
  "field.plant.fantasy",
  "field.plant.limited",
  "field.water",
  "field.water.visitor",
  "field.water.ripened",
  "field.water.capped",
  "field.harvest",
  "field.harvest.first",
  "field.harvest.extra",
  "field.harvest.drop",
  "field.harvest.rarity.N",
  "field.harvest.rarity.R",
  "field.harvest.rarity.SR",
  "field.harvest.rarity.SSR",
  "field.harvest.rarity.SP",
  "field.harvest.rarity.OR",
  "field.harvest.quality",
  "field.harvest.quality.1",
  "field.harvest.quality.2",
  "field.harvest.quality.3",
  "field.harvest.quality.4",
  "field.harvest.quality.5",
  "fishing.trip",
  "fishing.catch",
  "fishing.first",
  "fishing.rare",
  "fishing.junk",
  "fishing.empty",
  "fishing.encounter",
  "fishing.rarity.common",
  "fishing.rarity.uncommon",
  "fishing.rarity.rare",
  "fishing.rarity.epic",
  "fishing.rarity.legendary",
  "fishing.rarity.mythic",
  "cooking.research",
  "cooking.finish",
  "cooking.odd",
  "cooking.discovery",
  "cooking.submitted",
  "cooking.rarity.N",
  "cooking.rarity.R",
  "cooking.rarity.SR",
  "cooking.rarity.SSR",
  "cooking.rarity.SP",
  "ranch.buy",
  "ranch.feed",
  "ranch.harvest",
  "commission.activity",
  "commission.publish",
  "commission.accept",
  "commission.complete",
  "commission.reward",
  "newspaper.read",
  "newspaper.comment",
  "snow.played",
  "snow.win",
  "snow.loss",
  "snow.core-win",
  "snow.core-loss",
  "snow.timeout-win",
  "snow.timeout-loss",
  "snow.surrender-win",
  "snow.surrender-loss",
  "snow.reward",
  "snow.champion",
  "snow.champion-furniture",
  "snow.harvest-buff",
  "social.post",
  "social.share",
  "social.like",
  "social.liked",
  "social.comment",
  "social.commented",
  "gift.sent.bait",
  "gift.sent.dish",
  "gift.sent.purchased-bait",
  "gift.received.bait",
  "gift.received.dish",
  "gift.received.purchased-bait",
  "encounter.met",
  "achievement.earned",
  "title.earned",
] as const;
export type ActivityStatusKey = typeof activityStatusKeys[number];
export interface ActivityStatus { key: ActivityStatusKey; occurredAt: number }
const known = new Set<string>(activityStatusKeys);
export function isActivityStatusKey(value: string): value is ActivityStatusKey { return known.has(value); }
export function canonicalStatusKeys(keys: readonly ActivityStatusKey[] = []): ActivityStatusKey[] { return [...new Set(keys)].sort(); }
export function activityDayStart(now: number): number { return Math.floor((now + 8 * 3_600_000) / 86_400_000) * 86_400_000 - 8 * 3_600_000; }

export interface StatusPost extends HomeRecord { moment_id: string; author_id: string; visibility: "public" | "only" | "except"; receipt_id: string | null; created_at: number }
type Receipt = HomeRecord & {receipt_id:string;resident_id:string;kind:string;occurred_at:number};
type StatusRow = HomeRecord & {receipt_id:string;resident_id:string;kind:string;occurred_at:number};
type Interaction = HomeRecord & {moment_id:string;actor_key:string;created_at:number;delivered_at:number|null;item_kind:string|null;purchase_total:number|null};
const receiptFallback: Record<string, ActivityStatusKey> = {
  harvest:"field.harvest", plant:"field.plant", fishing:"fishing.trip", cooking:"cooking.finish", newspaper:"newspaper.read",
  "snow-result":"snow.played", commission:"commission.activity", encounter:"encounter.met", achievement:"achievement.earned", "title-earned":"title.earned",
};
const genericFamilies: Partial<Record<ActivityStatusKey,string>> = {
  "glimmer.explore":"glimmer.explore.",
  "field.water":"field.water.",
  "field.plant":"field.plant.","field.harvest":"field.harvest.","field.harvest.quality":"field.harvest.quality.",
  "fishing.trip":"fishing.","fishing.catch":"fishing.rarity.","fishing.rare":"fishing.rarity.","cooking.finish":"cooking.",
  "snow.played":"snow.","snow.win":"snow.","snow.loss":"snow.","commission.activity":"commission.",
};
export function distinctStatusKeys(keys: readonly ActivityStatusKey[]): ActivityStatusKey[] {
  const unique=canonicalStatusKeys(keys);
  return unique.filter(key => {
    const prefix=genericFamilies[key];
    if(!prefix)return true;
    if(key==="snow.win"||key==="snow.loss")return !unique.some(other=>other.endsWith(key==="snow.win"?"-win":"-loss"));
    return !unique.some(other=>other!==key&&other.startsWith(prefix));
  });
}
export function saveActivityStatuses(records: HomeMomentRecords, homeId:string, receiptId:string, residentId:string, keys:readonly ActivityStatusKey[], occurredAt:number) {
  for(const kind of canonicalStatusKeys(keys)) records.insert(homeId,"activity_status",{receipt_id:receiptId,resident_id:residentId,kind,occurred_at:occurredAt});
}
export function receiptStatusKeys(records:HomeMomentRecords,receiptId:string):ActivityStatusKey[] {
  return canonicalStatusKeys(records.all<StatusRow>("activity_status","receipt_id=?",[receiptId]).map(row=>row.kind).filter(isActivityStatusKey));
}

/**
 * Caller has authenticated the viewer. Every referenced post keeps its own visibility.
 * One shared read set for every requested resident: today's receipts, their status rows, and
 * today's community-wide interactions; the posts they touch are looked up in one reverse query,
 * so today's interaction with an old post still counts as today's activity.
 */
export function collectDailyActivityStatusesMany(records:HomeMomentRecords,viewerResidentId:string,residentIds:readonly string[],now:number,canReadPosts:(posts:StatusPost[])=>Map<string,boolean>,directory?:HomeTable[]):Map<string,ActivityStatus[]> {
  const from=activityDayStart(now);
  const inDay=(time:number)=>time>=from&&time<=now;
  const residents=[...new Set(residentIds)];
  if(!residents.length)return new Map<string,ActivityStatus[]>();
  const inList=(values:readonly SqlValue[])=>values.map(() => "?").join(",");
  const keyOf=new Map<string,string>(residents.map(id=>[`resident:${id}`,id]));
  const latest=new Map<string,Map<ActivityStatusKey,number>>();
  const tables=directory??records.homeTables();

  const receipts=records.allOver<Receipt>(tables,"receipt",`resident_id IN (${inList(residents)}) AND occurred_at>=? AND occurred_at<=?`,[...residents,from,now]);
  const receiptIds=[...new Set(receipts.map(receipt=>receipt.receipt_id))];
  const statusKeysOf=new Map<string,ActivityStatusKey[]>();
  if(receiptIds.length) {
    for(const row of records.allOver<StatusRow>(tables,"activity_status",`receipt_id IN (${inList(receiptIds)})`,receiptIds)) {
      if(!isActivityStatusKey(row.kind))continue;
      const keys=statusKeysOf.get(row.receipt_id);
      if(keys)keys.push(row.kind);else statusKeysOf.set(row.receipt_id,[row.kind]);
    }
    for(const [receiptId,keys] of statusKeysOf)statusKeysOf.set(receiptId,canonicalStatusKeys(keys));
  }
  // Today's interactions span the whole community: likes, comments and gifts may sit in any home table
  // and may target posts from any day.
  type TimedRow={type:"like"|"comment"|"gift";row:Interaction;time:number};
  const interactions:TimedRow[]=[];
  for(const row of records.allOver<Interaction & { record_type:string }>(tables,["like","comment","gift"],
    "(record_type!='gift' AND created_at>=? AND created_at<=?) OR (record_type='gift' AND delivered_at>=? AND delivered_at<=?)",
    [from,now,from,now]))
    interactions.push({type:row.record_type as "like"|"comment"|"gift",row,time:row.record_type==="gift"?row.delivered_at!:row.created_at});
  const interactionMomentIds=[...new Set(interactions.map(({row})=>row.moment_id))];
  const postClauses:string[]=[`(created_at>=? AND created_at<=? AND author_id IN (${inList(residents)}))`];
  const postParameters:SqlValue[]=[from,now,...residents];
  if(receiptIds.length){postClauses.push(`receipt_id IN (${inList(receiptIds)})`);postParameters.push(...receiptIds);}
  if(interactionMomentIds.length){postClauses.push(`moment_id IN (${inList(interactionMomentIds)})`);postParameters.push(...interactionMomentIds);}
  const posts=records.allOver<StatusPost>(tables,"post",postClauses.join(" OR "),postParameters);
  const byId=new Map(posts.map(post=>[post.moment_id,post]));
  const linked=new Map<string,StatusPost[]>();
  for(const post of posts)if(post.receipt_id){
    const list=linked.get(post.receipt_id);
    if(list)list.push(post);else linked.set(post.receipt_id,[post]);
  }
  const readable=canReadPosts(posts);
  const visible=(id:string)=>{const post=byId.get(id);return !!post&&readable.get(post.moment_id)===true;};
  const add=(residentId:string,key:ActivityStatusKey,time:number)=>{
    if(!inDay(time))return;
    const per=latest.get(residentId)??latest.set(residentId,new Map()).get(residentId)!;
    per.set(key,Math.max(time,per.get(key)??-Infinity));
  };
  for(const receipt of receipts) {
    const residentId=keyOf.get(`resident:${receipt.resident_id}`);
    if(residentId===undefined)continue;
    const own=residentId===viewerResidentId;
    const receiptPosts=linked.get(receipt.receipt_id)??[];
    if(!own&&!receiptPosts.some(post=>readable.get(post.moment_id)===true))continue;
    let keys=statusKeysOf.get(receipt.receipt_id)??[];
    // Unshared facts stay with their owner; every other viewer needs a readable linked post.
    if(!keys.length&&(own||receiptPosts.some(post=>readable.get(post.moment_id)===true))&&receiptFallback[receipt.kind])
      keys=[receiptFallback[receipt.kind]!];
    for(const key of distinctStatusKeys(keys))add(residentId,key,receipt.occurred_at);
  }
  for(const post of posts) {
    const residentId=keyOf.get(`resident:${post.author_id}`);
    if(residentId!==undefined&&readable.get(post.moment_id)===true&&inDay(post.created_at))
      add(residentId,post.receipt_id?"social.share":"social.post",post.created_at);
  }
  for(const {type,row,time} of interactions) {
    if(!visible(row.moment_id))continue;
    const post=byId.get(row.moment_id)!;
    const actorResident=keyOf.get(row.actor_key);
    const authorResident=keyOf.get(`resident:${post.author_id}`);
    if(actorResident!==undefined){
      if(type==="like")add(actorResident,"social.like",time);
      else if(type==="comment")add(actorResident,"social.comment",time);
      else add(actorResident,`gift.sent.${giftItemKey(row)}`,time);
    }
    if(authorResident!==undefined&&row.actor_key!==`resident:${authorResident}`){
      if(type==="like")add(authorResident,"social.liked",time);
      else if(type==="comment")add(authorResident,"social.commented",time);
      else add(authorResident,`gift.received.${giftItemKey(row)}`,time);
    }
  }
  return new Map(residents.map(residentId=>{
    const per=latest.get(residentId)??new Map<ActivityStatusKey,number>();
    return [residentId,[...per].map(([key,occurredAt])=>({key,occurredAt}))
      .sort((a,b)=>b.occurredAt-a.occurredAt||a.key.localeCompare(b.key))] as const;
  }));
}
function giftItemKey(row:Interaction):"dish"|"purchased-bait"|"bait" {
  return row.item_kind==="dish"?"dish":row.purchase_total!==null?"purchased-bait":"bait";
}
