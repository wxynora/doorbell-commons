import { activityStatusKeys, canonicalStatusKeys, collectDailyActivityStatuses, receiptStatusKeys, saveActivityStatuses } from "./activity-status.js";
import { randomInt, randomUUID } from "node:crypto";
import { loungeDisplayName } from "../lounge-display-name.js";
import type Database from "better-sqlite3";
import { z } from "zod";
import { MomentsNotifications } from "./notifications.js";
import { MomentsStickerAttachments, type StickerAsset } from "./sticker-attachments.js";
import { findMomentSticker } from "./sticker-catalog.js";
import type { RaffleView } from "./raffle.js";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord, type SqlValue } from "./home-records.js";
import { MomentsError, type ActivityReceipt, type ActorView, type AudienceSubject,
  type FeedQuery, type MomentActor, type MomentView,
  type MomentVisibility, type PublishMoment, type GiftView, type GiftIntent,
  type AnnualMomentsSummary, type GiftItem, type FarmGiftIdentity, type FarmGiftReceipt, type MomentPublishMeta } from "./types.js";

const identifier = z.string().min(1);
const timestamp = z.number().int().nonnegative().safe();
const subjectSchema = z.object({ kind: z.literal("resident"), id: identifier }).strict();
const publishMomentBase = z.object({
  requestId: identifier, text: z.string(), receiptId: identifier.optional(),
  location: z.string().nullable().optional(),
  visibility: z.object({ mode: z.enum(["public", "only", "except"]), subjects: z.array(subjectSchema) }).strict(),
}).strict();
export const publishMomentSchema = publishMomentBase.superRefine((value, context) => {
  if (!value.text.trim() && !value.receiptId) context.addIssue({ code: "custom", message: "empty_moment" });
  if (value.visibility.mode === "public" && value.visibility.subjects.length)
    context.addIssue({ code: "custom", message: "public_audience_must_be_empty" });
});
const publishMomentWithStickerSchema = publishMomentBase.superRefine((value,context)=>{
  if(value.visibility.mode==="public"&&value.visibility.subjects.length)
    context.addIssue({code:"custom",message:"public_audience_must_be_empty"});
});
const receiptSchema = z.object({ residentId: identifier, source: identifier, sourceId: identifier,
  kind: identifier, title: identifier, summary: z.string(), occurredAt: timestamp,
  facts: z.array(z.object({ label: identifier, value: z.string() }).strict()),
  statusKeys: z.array(z.enum(activityStatusKeys)).optional(),
}).strict();
export const commentSchema = z.object({ requestId: identifier, text: z.string().refine(text => !!text.trim()) }).strict();
const commentWithStickerSchema = z.object({ requestId: identifier, text: z.string() }).strict();
export const giftItemSchema = z.discriminatedUnion("kind",[
  z.object({kind:z.literal("dish"),id:identifier,quantity:z.literal(1)}).strict(),
  z.object({kind:z.literal("bait"),id:identifier,quantity:z.number().int().positive().safe()}).strict(),
]);
export const giftRequestSchema = z.object({requestId:identifier,item:giftItemSchema,
  purchase:z.object({expectedTotal:z.number().int().nonnegative().safe()}).strict().optional()}).strict();
export const feedQuerySchema = z.object({ count: z.number().int().positive().safe().optional(), period: z.enum(["recent", "history"]).optional(),
  authorId: identifier.optional(), from: timestamp.optional(), until: timestamp.optional(),
}).strict().superRefine((value, context) => {
  if (value.from !== undefined && value.until !== undefined && value.from > value.until)
    context.addIssue({ code: "custom", message: "invalid_date_range" });
  if (value.period !== "history" && (value.from !== undefined || value.until !== undefined))
    context.addIssue({ code: "custom", message: "history_query_required" });
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new MomentsError("invalid_request");
  return parsed.data;
}
const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 3_600_000;
function dayStart(now: number): number { return Math.floor((now + BEIJING_OFFSET) / DAY) * DAY - BEIJING_OFFSET; }
function actorKey(actor: MomentActor): string { return actor.kind === "resident" ? `resident:${actor.residentId}` : `human:${actor.accountId}`; }
function canonicalSubjects(subjects: AudienceSubject[]): AudienceSubject[] {
  return [...new Map(subjects.map(subject => [`${subject.kind}:${subject.id}`, subject])).values()]
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

type PostRow = HomeRecord & { moment_id: string; short_ref: string | null; author_id: string; request_id: string;
  text: string; receipt_id: string | null; location: string | null; location_supplied: number;
  visibility: MomentVisibility["mode"]; created_at: number };
type ReceiptRow = HomeRecord & { receipt_id: string; resident_id: string; source: string; source_id: string;
  kind: string; title: string; summary: string; occurred_at: number };
type StoredActor = { actor_key: string; kind: "resident" | "human"; name: string; resident_id: string | null };
type LikeRow = HomeRecord & { actor_key:string; created_at:number };
type CommentRow = HomeRecord & { comment_id:string; moment_id:string; actor_key:string; text:string; created_at:number };
type GiftRow = HomeRecord & { gift_id:string; moment_id:string; actor_key:string; request_id:string;
  sender_resident_id:string; sender_doorplate:string; recipient_resident_id:string; recipient_doorplate:string;
  item_kind:GiftItem["kind"]; item_id:string; item_quantity:number; item_name:string|null; delivered_at:number|null; purchase_total:number|null };
export type MomentToolOptionAction = "share";
export interface MomentToolOption { option: string; action: MomentToolOptionAction; targetId: string }
type ToolOptionRow = HomeRecord & { resident_id: string; option_action: MomentToolOptionAction; option_target: string };
const toolOptionActionSchema = z.literal("share");
const toolOptionCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/u);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Family content is stored in separate SQL tables on the existing Main connection. */
export class MomentsStore {
  private raffleBarrier: {freezeDue(now:number,momentId?:string):string[];wake():void;snapshotForReadablePost(momentId:string):RaffleView|undefined} | undefined;
  setRaffleBarrier(barrier:{freezeDue(now:number,momentId?:string):string[];wake():void;snapshotForReadablePost(momentId:string):RaffleView|undefined}) { this.raffleBarrier=barrier; }
  private readonly records: HomeMomentRecords;
  private readonly stickerAttachments: MomentsStickerAttachments;
  constructor(private readonly database: Database.Database, private readonly ensureHomeTable: EnsureMomentsHomeTable,
    findSticker:(id:string)=>StickerAsset|undefined=findMomentSticker) {
    this.records=new HomeMomentRecords(database,ensureHomeTable);
    this.stickerAttachments=new MomentsStickerAttachments(database,ensureHomeTable,this,findSticker);
  }

  dailyActivityStatuses(actor:MomentActor,residentId:string,now:number) {
    this.currentActor(actor); parse(identifier,residentId); parse(timestamp,now);
    return collectDailyActivityStatuses(this.records,actor.residentId,residentId,now,post=>this.readable(actor,post));
  }
  notifications(): MomentsNotifications {
    return new MomentsNotifications(this.database, this.ensureHomeTable, this);
  }
  notificationIdentity(actor: MomentActor, save = false): { homeId: string; actorKey: string } {
    const current = save ? this.saveActor(actor) : this.currentActor(actor);
    return { homeId: this.homeId(actor.residentId), actorKey: current.actor_key };
  }
  notificationSender(key: string): ActorView { return this.actorView(key); }
  notificationMoment(actor: MomentActor, id: string): { id: string; text: string; stickers: StickerAsset[] } {
    const row = this.accessible(actor, id);
    return { id: row.moment_id, text: row.text, stickers: this.stickerAttachments.projectForReadablePost(id,[]).post };
  }

  private currentActor(actor: MomentActor): StoredActor {
    const row=this.database.prepare(`SELECT r.resident_id,r.resident_name,r.account_id
      FROM residents r JOIN human_accounts h ON h.account_id=r.account_id
      WHERE r.resident_id=? AND h.membership_status='active'`).get(actor.residentId) as
      {resident_id:string;resident_name:string;account_id:string}|undefined;
    if(!row||(actor.kind==="human"&&row.account_id!==actor.accountId))throw new MomentsError("actor_unavailable");
    const name=actor.kind==="resident"?loungeDisplayName(row.resident_name):actor.name;
    if(typeof name!=="string"||!name.trim())throw new MomentsError("actor_unavailable");
    return {actor_key:actorKey(actor),kind:actor.kind,name,resident_id:actor.kind==="resident"?row.resident_id:null};
  }
  private homeId(residentId:string):string {
    const row=this.database.prepare("SELECT home_id FROM homes WHERE resident_id=?").get(residentId) as {home_id:string}|undefined;
    if(!row)throw new MomentsError("actor_unavailable");return row.home_id;
  }
  private saveActor(actor:MomentActor):StoredActor {
    const current=this.currentActor(actor);
    this.database.prepare(`INSERT INTO lingye_moments_actors(actor_key,kind,resident_id,account_id,display_name)
      VALUES(?,?,?,?,?) ON CONFLICT(actor_key) DO UPDATE SET display_name=excluded.display_name`)
      .run(current.actor_key,actor.kind,current.resident_id,actor.kind==="human"?actor.accountId:null,current.name);
    return current;
  }
  private residentOnly(actor:MomentActor):void {
    if(actor.kind!=="resident")throw new MomentsError("resident_only");this.currentActor(actor);
  }
  private checkToolOptionTarget(actor: MomentActor, action: MomentToolOptionAction, targetId: string): void {
    this.residentOnly(actor); parse(toolOptionActionSchema, action);
    const receipt = this.receipt(targetId);
    if (!receipt || receipt.resident_id !== actor.residentId) throw new MomentsError("receipt_not_found");
  }
  postReference(actor: MomentActor, momentId: string): string {
    this.residentOnly(actor);
    return this.database.transaction(() => {
      const row = this.accessible(actor, momentId);
      if (row.short_ref) return row.short_ref;
      let reference: string;
      do { reference = randomInt(36 ** 6).toString(36).toUpperCase().padStart(6, "0"); }
      while (this.records.all<PostRow>("post", "short_ref=?", [reference]).length);
      this.records.update(row.home_id, row.record_id, { short_ref: reference });
      return reference;
    }).immediate();
  }
  resolvePostReference(actor: MomentActor, reference: string): string {
    this.residentOnly(actor); parse(z.string().regex(/^[A-Z0-9]{6}$/u), reference);
    const row = this.records.all<PostRow>("post", "short_ref=?", [reference])[0];
    if (!row) throw new MomentsError("moment_not_found");
    return this.accessible(actor, row.moment_id).moment_id;
  }
  issueToolOption(actor: MomentActor, action: MomentToolOptionAction, targetId: string): string {
    parse(toolOptionActionSchema, action); parse(identifier, targetId);
    return this.database.transaction(() => {
      this.checkToolOptionTarget(actor, action, targetId);
      const homeId = this.homeId(actor.residentId);
      const previous = this.records.all<ToolOptionRow>("option", "resident_id=? AND option_action=? AND option_target=?",
        [actor.residentId, action, targetId], homeId)[0];
      if (previous) return previous.record_id;
      let option: string;
      do { option = randomInt(36 ** 6).toString(36).toUpperCase().padStart(6, "0"); }
      while (this.records.all<ToolOptionRow>("option", "record_id=?", [option]).length);
      this.records.insert(homeId, "option", { resident_id: actor.residentId, option_action: action, option_target: targetId }, option);
      return option;
    }).immediate();
  }
  resolveToolOption(actor: MomentActor, option: string): MomentToolOption {
    this.residentOnly(actor); parse(toolOptionCodeSchema, option);
    const row = this.records.all<ToolOptionRow>("option", "record_id=? AND resident_id=?",
      [option, actor.residentId], this.homeId(actor.residentId))[0];
    if (!row) throw new MomentsError("invalid_request");
    this.checkToolOptionTarget(actor, row.option_action, row.option_target);
    return { option: row.record_id, action: row.option_action, targetId: row.option_target };
  }
  private subjects(id:string):AudienceSubject[] {
    return this.records.all<{subject_kind:"resident";subject_id:string}>("audience","moment_id=?",[id])
      .map(s=>({kind:s.subject_kind,id:s.subject_id})).sort((a,b)=>compare(a.id,b.id));
  }
  private readable(actor:MomentActor,row:Pick<PostRow,"moment_id"|"author_id"|"visibility">):boolean {
    // A human follows only the active profile's resident audience.
    if(row.author_id===actor.residentId||row.visibility==="public")return true;
    const included=this.subjects(row.moment_id).some(s=>s.id===actor.residentId);
    return row.visibility==="only"?included:!included;
  }
  private accessible(actor:MomentActor,id:string):PostRow {
    this.currentActor(actor);
    const row=this.records.all<PostRow>("post","moment_id=?",[id])[0];
    if(!row||!this.readable(actor,row))throw new MomentsError("moment_not_found");return row;
  }
  private actorView(key:string):ActorView {
    const row=this.database.prepare(`SELECT a.kind,COALESCE(r.resident_name,a.display_name) AS name,a.resident_id
      FROM lingye_moments_actors a LEFT JOIN residents r ON r.resident_id=a.resident_id WHERE actor_key=?`).get(key) as StoredActor;
    return row.kind==="resident"?{kind:row.kind,name:loungeDisplayName(row.name),residentId:row.resident_id!}:{kind:row.kind,name:row.name};
  }
  private receipt(id:string):ReceiptRow|undefined {
    return this.records.all<ReceiptRow>("receipt","receipt_id=?",[id])[0];
  }
  private receiptFacts(id:string):ActivityReceipt["facts"] {
    return this.records.all<{position:number;label:string;value:string}>("fact","receipt_id=?",[id])
      .sort((a,b)=>a.position-b.position).map(({label,value})=>({label,value}));
  }
  private view(actor:MomentActor,row:PostRow):MomentView {
    const receipt=row.receipt_id?this.receipt(row.receipt_id):undefined;
    const likes=this.records.all<LikeRow>("like","moment_id=?",[row.moment_id])
      .sort((a,b)=>a.created_at-b.created_at||compare(a.actor_key,b.actor_key));
    const comments=this.records.all<CommentRow>("comment","moment_id=?",[row.moment_id])
      .sort((a,b)=>a.created_at-b.created_at||compare(a.comment_id,b.comment_id));
    const gifts=this.records.all<GiftRow>("gift","moment_id=? AND delivered_at IS NOT NULL",[row.moment_id])
      .sort((a,b)=>a.delivered_at!-b.delivered_at!||compare(a.gift_id,b.gift_id));
    const stickers=this.stickerAttachments.projectForReadablePost(row.moment_id,comments.map(comment=>comment.comment_id));
    const raffle=this.raffleBarrier?.snapshotForReadablePost(row.moment_id);
    return {id:row.moment_id,author:this.actorView(`resident:${row.author_id}`),text:row.text,createdAt:row.created_at,location:row.location,
      ...(raffle?{raffle}:{}),
      receipt:receipt?{source:receipt.source,kind:receipt.kind,title:receipt.title,summary:receipt.summary,
        occurredAt:receipt.occurred_at,facts:this.receiptFacts(receipt.receipt_id),statusKeys:receiptStatusKeys(this.records,receipt.receipt_id)}:null,
      visibility:{mode:row.visibility,...(actor.kind==="resident"&&actor.residentId===row.author_id?{subjects:this.subjects(row.moment_id)}:{})},
      liked:likes.some(like=>like.actor_key===actorKey(actor)),likes:likes.map(like=>this.actorView(like.actor_key)),stickers:stickers.post,
      comments:comments.map(c=>({id:c.comment_id,author:this.actorView(c.actor_key),text:c.text,createdAt:c.created_at,stickers:stickers.comments[c.comment_id]??[]})),
      gifts:gifts.map(gift=>this.giftView(gift))};
  }
  private boundFarm(residentId:string):string {
    const binding=this.database.prepare(`SELECT f.farm_doorplate FROM residents r
      JOIN human_accounts a ON a.account_id=r.account_id JOIN homes h ON h.resident_id=r.resident_id
      JOIN farm_bindings f ON f.home_id=h.home_id WHERE r.resident_id=? AND a.membership_status='active'`)
      .get(residentId) as {farm_doorplate:string}|undefined;
    if(!binding)throw new MomentsError("farm_binding_mismatch");return binding.farm_doorplate;
  }
  listAudience(actor: MomentActor): ActorView[] {
    this.currentActor(actor);
    const rows = this.database.prepare(`SELECT r.resident_id,r.resident_name
      FROM residents r JOIN human_accounts h ON h.account_id=r.account_id
      WHERE h.membership_status='active' ORDER BY r.resident_id`).all() as { resident_id: string; resident_name: string }[];
    return rows.map(row => ({ kind: "resident", name: loungeDisplayName(row.resident_name), residentId: row.resident_id }));
  }
  giftInventoryIdentity(actor:MomentActor):FarmGiftIdentity {
    this.currentActor(actor);return {sender_resident_id:actor.residentId,sender_farm_doorplate:this.boundFarm(actor.residentId)};
  }
  private giftItem(row:GiftRow):GiftItem {return {kind:row.item_kind,id:row.item_id,quantity:row.item_quantity};}
  private giftView(row:GiftRow):GiftView {
    if(row.delivered_at===null||row.item_name===null)throw new MomentsError("gift_unavailable");
    return {id:row.gift_id,from:this.actorView(row.actor_key),item:{...this.giftItem(row),name:row.item_name},deliveredAt:row.delivered_at,
      ...(row.purchase_total===null?{}:{purchase:{total:row.purchase_total}})};
  }
  prepareGift(actor:MomentActor,id:string,input:unknown,now:number):GiftIntent {
    const parsed=parse(giftRequestSchema,input);parse(timestamp,now);
    if(parsed.purchase&&parsed.item.kind!=="bait")throw new MomentsError("invalid_request");
    return this.database.transaction(()=>{
      const post=this.accessible(actor,id),current=this.saveActor(actor);
      const source=this.boundFarm(actor.residentId),target=this.boundFarm(post.author_id);
      if(source===target)throw new MomentsError("same_farm");
      let row=this.records.all<GiftRow>("gift","actor_key=? AND request_id=?",[current.actor_key,parsed.requestId])[0];
      if(row&&(row.moment_id!==id||row.sender_resident_id!==actor.residentId||row.sender_doorplate!==source
        ||row.recipient_doorplate!==target||row.item_kind!==parsed.item.kind||row.item_id!==parsed.item.id||row.item_quantity!==parsed.item.quantity||row.purchase_total!==(parsed.purchase?.expectedTotal??null)))
        throw new MomentsError("request_conflict");
      if(!row){
        const giftId=randomUUID();
        this.records.insert(this.homeId(actor.residentId),"gift",{gift_id:giftId,moment_id:id,actor_key:current.actor_key,
          request_id:parsed.requestId,sender_resident_id:actor.residentId,sender_doorplate:source,
          recipient_resident_id:post.author_id,recipient_doorplate:target,target_home_id:post.home_id,
          item_kind:parsed.item.kind,item_id:parsed.item.id,item_quantity:parsed.item.quantity,purchase_total:parsed.purchase?.expectedTotal??null,created_at:now},giftId);
        row=this.records.all<GiftRow>("gift","gift_id=?",[giftId])[0]!;
      }
      return {request:{gift_id:row.gift_id,sender_resident_id:row.sender_resident_id,sender_farm_doorplate:row.sender_doorplate,
        recipient_resident_id:row.recipient_resident_id,recipient_farm_doorplate:row.recipient_doorplate,item:this.giftItem(row),
        ...(row.purchase_total===null?{}:{purchase:{expectedTotal:row.purchase_total}})},
        completed:row.delivered_at===null?null:this.giftView(row)};
    }).immediate();
  }
  completeGift(intent:GiftIntent,receipt:FarmGiftReceipt):GiftView {
    const expected=intent.request;
    if(receipt.gift_id!==expected.gift_id||receipt.sender_resident_id!==expected.sender_resident_id
      ||receipt.sender_farm_doorplate!==expected.sender_farm_doorplate||receipt.recipient_resident_id!==expected.recipient_resident_id
      ||receipt.recipient_farm_doorplate!==expected.recipient_farm_doorplate||receipt.item.kind!==expected.item.kind
      ||receipt.item.id!==expected.item.id||receipt.item.quantity!==expected.item.quantity||!receipt.item.name?.trim()
      ||(expected.purchase?receipt.purchase?.total!==expected.purchase.expectedTotal:receipt.purchase!==undefined)
      ||!Number.isSafeInteger(receipt.delivered_at)||receipt.delivered_at<0)throw new MomentsError("gift_unavailable");
    return this.database.transaction(()=>{
      const row=this.records.all<GiftRow>("gift","gift_id=?",[expected.gift_id])[0];
      if(!row)throw new MomentsError("gift_unavailable");if(row.delivered_at!==null)return this.giftView(row);
      this.records.update(row.home_id,row.record_id,{delivered_at:receipt.delivered_at,item_name:receipt.item.name});
      return this.giftView({...row,delivered_at:receipt.delivered_at,item_name:receipt.item.name});
    }).immediate();
  }
  /** Internal lookup of this resident's immutable source snapshot. */
  activityReceiptId(residentId:string,source:string,sourceId:string):string|undefined {
    this.residentOnly({kind:"resident",residentId});
    return this.records.all<ReceiptRow>("receipt","resident_id=? AND source=? AND source_id=?",
      [residentId,source,sourceId],this.homeId(residentId))[0]?.receipt_id;
  }
  /** Only trusted activity adapters supply an explicitly public receipt projection. */
  recordReceipt(input:ActivityReceipt):string {
    const parsed=parse(receiptSchema,input);
    const receipt={...parsed,statusKeys:canonicalStatusKeys(parsed.statusKeys)};
    return this.database.transaction(()=>{
      this.currentActor({kind:"resident",residentId:receipt.residentId});
      const row=this.records.all<ReceiptRow>("receipt","resident_id=? AND source=? AND source_id=?",
        [receipt.residentId,receipt.source,receipt.sourceId])[0];
      if(row){
        const previous={residentId:row.resident_id,source:row.source,sourceId:row.source_id,kind:row.kind,
          title:row.title,summary:row.summary,occurredAt:row.occurred_at,facts:this.receiptFacts(row.receipt_id),statusKeys:receiptStatusKeys(this.records,row.receipt_id)};
        if(JSON.stringify(previous)!==JSON.stringify(receipt))throw new MomentsError("request_conflict");return row.receipt_id;
      }
      const id=randomUUID(),homeId=this.homeId(receipt.residentId);
      this.records.insert(homeId,"receipt",{receipt_id:id,resident_id:receipt.residentId,source:receipt.source,
        source_id:receipt.sourceId,kind:receipt.kind,title:receipt.title,summary:receipt.summary,occurred_at:receipt.occurredAt},id);
      receipt.facts.forEach((fact,position)=>this.records.insert(homeId,"fact",{receipt_id:id,position,label:fact.label,value:fact.value}));
      saveActivityStatuses(this.records,homeId,id,receipt.residentId,receipt.statusKeys,receipt.occurredAt);
      return id;
    }).immediate();
  }
  quota(actor:MomentActor,now:number):{used:number;limit:3;dayStartsAt:number;resetsAt:number} {
    this.residentOnly(actor);parse(timestamp,now);const start=dayStart(now);
    const used=this.records.aggregate("post","author_id=? AND created_at>=? AND created_at<?",
      [actor.residentId,start,start+DAY],this.homeId(actor.residentId)).count;
    return {used,limit:3,dayStartsAt:start,resetsAt:start+DAY};
  }
  dailyPostCounts(actor:MomentActor,now:number):{residents:number;posts:number} {
    this.currentActor(actor);parse(timestamp,now);
    const posts=this.records.all<PostRow>("post","created_at>=? AND created_at<=?",[dayStart(now),now])
      .filter(post=>this.readable(actor,post));
    return {residents:new Set(posts.map(post=>post.author_id)).size,posts:posts.length};
  }
  publish(actor:MomentActor,input:PublishMoment,now:number,stickers:readonly string[]=[],pubmeta:MomentPublishMeta={}):MomentView {
    this.residentOnly(actor);parse(timestamp,now);
    const parsed=parse(stickers.length?publishMomentWithStickerSchema:publishMomentSchema,input);
    parsed.visibility.subjects=canonicalSubjects(parsed.visibility.subjects);
    return this.stickerAttachments.withStickers(actor,{kind:"post",requestId:parsed.requestId,ids:stickers},attach=>{
      const homeId=this.homeId(actor.residentId);
      const previous=this.records.all<PostRow>("post","author_id=? AND request_id=?",[actor.residentId,parsed.requestId],homeId)[0];
      if(previous){
        if(previous.text!==parsed.text||previous.receipt_id!==(parsed.receiptId??null)
          ||previous.location_supplied!==(parsed.location===undefined?0:1)||(parsed.location!==undefined&&previous.location!==parsed.location)||previous.visibility!==parsed.visibility.mode
          ||JSON.stringify(canonicalSubjects(this.subjects(previous.moment_id)))!==JSON.stringify(parsed.visibility.subjects))throw new MomentsError("request_conflict");
        attach({momentId:previous.moment_id});return this.view(actor,previous);
      }
      if(this.quota(actor,now).used>=3)throw new MomentsError("daily_limit_reached");
      const receipt=parsed.receiptId?this.receipt(parsed.receiptId):undefined;
      if(parsed.receiptId&&(!receipt||receipt.resident_id!==actor.residentId))throw new MomentsError("receipt_not_found");
      for(const subject of parsed.visibility.subjects){
        if(!this.database.prepare("SELECT 1 FROM residents WHERE resident_id=?").get(subject.id))throw new MomentsError("audience_not_found");
      }
      const current=this.saveActor(actor),id=randomUUID();
      this.records.insert(homeId,"post",{moment_id:id,author_id:actor.residentId,actor_key:current.actor_key,request_id:parsed.requestId,
        text:parsed.text,receipt_id:parsed.receiptId??null,location:parsed.location===undefined?(pubmeta.defaultLocation??null):parsed.location,location_supplied:parsed.location===undefined?0:1,
        visibility:parsed.visibility.mode,created_at:now},id);
      parsed.visibility.subjects.forEach(subject=>this.records.insert(homeId,"audience",{moment_id:id,subject_kind:subject.kind,subject_id:subject.id}));
      attach({momentId:id});
      return this.view(actor,this.accessible(actor,id));
    });
  }
  list(actor:MomentActor,input:FeedQuery,now:number):MomentView[] {
    this.currentActor(actor);parse(timestamp,now);const query=parse(feedQuerySchema,input);
    const clauses=["created_at<=?"];
    const parameters:SqlValue[]=[now];
    if (query.period === "history") { clauses.push("created_at<?"); parameters.push(now-DAY); }
    else if (query.count === undefined) { clauses.push("created_at>=?"); parameters.push(now-DAY); }
    if(query.authorId!==undefined){clauses.push("author_id=?");parameters.push(query.authorId);}
    if(query.from!==undefined){clauses.push("created_at>=?");parameters.push(query.from);}
    if(query.until!==undefined){clauses.push("created_at<?");parameters.push(query.until);}
    const rows=this.records.all<PostRow>("post",clauses.join(" AND "),parameters).filter(row=>this.readable(actor,row))
      .sort((a,b)=>b.created_at-a.created_at||compare(b.moment_id,a.moment_id));
    return (query.count === undefined ? rows : rows.slice(0,query.count)).map(row=>this.view(actor,row));
  }
  readFeed(actor: MomentActor, input: FeedQuery, now: number): MomentView[] {
    this.currentActor(actor); parse(timestamp,now); const query=parse(feedQuerySchema,input);
    if (query.count !== undefined || query.period === "history") return this.list(actor,query,now);
    return this.database.transaction(() => {
      const homeId=this.homeId(actor.residentId),key=actorKey(actor),scope=query.authorId??"";
      const cursors=this.records.all<HomeRecord & {read_author_id:string;read_at:number}>("read_cursor",
        "actor_key=?",[key],homeId);
      const allSince=cursors.find(row=>row.read_author_id==="")?.read_at??0;
      const authorSince=new Map(cursors.map(row=>[row.read_author_id,row.read_at]));
      // Half-open windows preserve posts created in the same millisecond after this read.
      const moments=this.list(actor,query,now).filter(moment=>
        moment.createdAt>=Math.max(now-DAY,allSince,authorSince.get(moment.author.residentId!)??0)&&moment.createdAt<now);
      const previous=cursors.find(row=>row.read_author_id===scope);
      if(previous)this.records.update(homeId,previous.record_id,{read_at:Math.max(now,previous.read_at)});
      else {
        this.saveActor(actor);
        this.records.insert(homeId,"read_cursor",{actor_key:key,read_author_id:scope,read_at:now});
      }
      return moments;
    }).immediate();
  }
  get(actor:MomentActor,id:string):MomentView {return this.view(actor,this.accessible(actor,id));}
  setLike(actor:MomentActor,id:string,liked:boolean,now:number):MomentView {
    parse(z.boolean(),liked);parse(timestamp,now);
    let frozen=false;
    const result=this.database.transaction(()=>{
      const row=this.accessible(actor,id),current=this.saveActor(actor);
      frozen=(this.raffleBarrier?.freezeDue(now,id).length??0)>0;
      const previous=this.records.all<LikeRow>("like","moment_id=? AND actor_key=?",[id,current.actor_key])[0];
      if(liked&&!previous)this.records.insert(this.homeId(actor.residentId),"like",{moment_id:id,actor_key:current.actor_key,target_home_id:row.home_id,created_at:now});
      else if(!liked&&previous)this.records.delete(previous.home_id,previous.record_id);
      return this.view(actor,row);
    }).immediate();
    if(frozen)this.raffleBarrier?.wake();
    return result;
  }
  comment(actor:MomentActor,id:string,input:{requestId:string;text:string},now:number,stickers:readonly string[]=[]):MomentView {
    this.residentOnly(actor);parse(timestamp,now);const comment=parse(stickers.length?commentWithStickerSchema:commentSchema,input);
    let frozen=false;
    const result=this.stickerAttachments.withStickers(actor,{kind:"comment",requestId:comment.requestId,ids:stickers},attach=>{
      const row=this.accessible(actor,id),current=this.saveActor(actor);
      frozen=(this.raffleBarrier?.freezeDue(now,id).length??0)>0;
      const previous=this.records.all<CommentRow>("comment","actor_key=? AND request_id=?",[current.actor_key,comment.requestId])[0];
      if(previous&&(previous.moment_id!==id||previous.text!==comment.text))throw new MomentsError("request_conflict");
      const commentId=previous?.comment_id??randomUUID();
      if(!previous)this.records.insert(this.homeId(actor.residentId),"comment",{
        comment_id:commentId,moment_id:id,actor_key:current.actor_key,target_home_id:row.home_id,request_id:comment.requestId,text:comment.text,created_at:now},commentId);
      attach({momentId:id,commentId});
      return this.view(actor,row);
    });
    if(frozen)this.raffleBarrier?.wake();
    return result;
  }
  annualSummary(actor:MomentActor,year:number):AnnualMomentsSummary {
    this.currentActor(actor);parse(z.number().int().safe(),year);
    const boundary=(value:number)=>{const date=new Date(0);date.setUTCFullYear(value,0,1);date.setUTCHours(0,0,0,0);return date.getTime()-BEIJING_OFFSET;};
    const from=boundary(year),until=boundary(year+1);if(!Number.isFinite(from)||!Number.isFinite(until))throw new MomentsError("invalid_request");
    const homeId=this.homeId(actor.residentId),range="created_at>=? AND created_at<?",giftRange="delivered_at>=? AND delivered_at<?";
    // Likes follow the existing active-like state; cancelled likes are no longer counted.
    // Gifts count only the Farm's confirmed delivery time, including retried acknowledgements.
    const sentGift=this.records.aggregate("gift",giftRange,[from,until],homeId);
    const receivedGift=this.records.aggregate("gift",`target_home_id=? AND ${giftRange}`,[homeId,from,until]);
    return {year,homeId,from,until,sent:{posts:this.records.aggregate("post",range,[from,until],homeId).count,
      comments:this.records.aggregate("comment",range,[from,until],homeId).count,likes:this.records.aggregate("like",range,[from,until],homeId).count,
      gifts:{times:sentGift.count,quantity:sentGift.quantity}},received:{
      comments:this.records.aggregate("comment",`target_home_id=? AND ${range}`,[homeId,from,until]).count,
      likes:this.records.aggregate("like",`target_home_id=? AND ${range}`,[homeId,from,until]).count,
      gifts:{times:receivedGift.count,quantity:receivedGift.quantity}}};
  }
}
