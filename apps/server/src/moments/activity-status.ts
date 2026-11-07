import type { HomeMomentRecords, HomeRecord } from "./home-records.js";

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

/** Caller has authenticated the viewer. Every referenced post keeps its own visibility. */
export function collectDailyActivityStatuses(records:HomeMomentRecords,viewerResidentId:string,residentId:string,now:number,canRead:(post:StatusPost)=>boolean):ActivityStatus[] {
  const from=activityDayStart(now);
  const inDay=(time:number)=>time>=from&&time<=now;
  const posts=records.all<StatusPost>("post");
  const byId=new Map(posts.map(post=>[post.moment_id,post]));
  const visible=(id:string)=>{const post=byId.get(id);return !!post&&canRead(post);};
  const latest=new Map<ActivityStatusKey,number>();
  const add=(key:ActivityStatusKey,time:number)=>{if(inDay(time))latest.set(key,Math.max(time,latest.get(key)??-Infinity));};
  for(const receipt of records.all<Receipt>("receipt","resident_id=? AND occurred_at>=? AND occurred_at<=?",[residentId,from,now])) {
    const linked=posts.filter(post=>post.receipt_id===receipt.receipt_id);
    const own=residentId===viewerResidentId;
    if(!own&&!linked.some(canRead))continue;
    const keys=receiptStatusKeys(records,receipt.receipt_id);
    // Unshared facts stay with their owner; every other viewer needs a readable linked post.
    if(!keys.length&&(own||linked.some(canRead))&&receiptFallback[receipt.kind])keys.push(receiptFallback[receipt.kind]!);
    for(const key of distinctStatusKeys(keys))add(key,receipt.occurred_at);
  }
  for(const post of posts)if(post.author_id===residentId&&canRead(post)&&inDay(post.created_at))add(post.receipt_id?"social.share":"social.post",post.created_at);
  const key=`resident:${residentId}`;
  for(const type of ["like","comment","gift"] as const) {
    for(const row of records.all<Interaction>(type,type==="gift"?"delivered_at>=? AND delivered_at<=?":"created_at>=? AND created_at<=?",[from,now])) {
      if(!visible(row.moment_id))continue;
      const post=byId.get(row.moment_id)!;
      const sent=row.actor_key===key,received=post.author_id===residentId&&row.actor_key!==key;
      const time=type==="gift"?row.delivered_at!:row.created_at;
      if(type==="like"){if(sent)add("social.like",time);if(received)add("social.liked",time);}
      else if(type==="comment"){if(sent)add("social.comment",time);if(received)add("social.commented",time);}
      else {
        const item=row.item_kind==="dish"?"dish":row.purchase_total!==null?"purchased-bait":"bait";
        if(sent)add(`gift.sent.${item}`,time);if(received)add(`gift.received.${item}`,time);
      }
    }
  }
  return [...latest].map(([key,occurredAt])=>({key,occurredAt})).sort((a,b)=>b.occurredAt-a.occurredAt||a.key.localeCompare(b.key));
}
