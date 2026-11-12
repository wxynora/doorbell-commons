import { MomentsPromotions } from "./promotion.js";
import { MomentsPolls, pollDefinition, pollInputSchema, type PollPost } from "./poll.js";
import { MomentsProgressionStore } from "./progression-store.js";
import { activityStatusKeys, canonicalStatusKeys, collectDailyActivityStatusesMany, isActivityStatusKey, receiptStatusKeys, saveActivityStatuses, type ActivityStatus, type StatusPost } from "./activity-status.js";
import { randomInt, randomUUID } from "node:crypto";
import { loungeDisplayName } from "../lounge-display-name.js";
import type Database from "better-sqlite3";
import { z } from "zod";
import { MomentsNotifications } from "./notifications.js";
import { MomentsStickerAttachments, type StickerAsset } from "./sticker-attachments.js";
import { findMomentSticker } from "./sticker-catalog.js";
import type { RaffleView } from "./raffle.js";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord, type HomeTable, type SqlValue } from "./home-records.js";
import { MomentsError, type ActivityReceipt, type ActorView, type AudienceSubject,
  type FeedQuery, type MomentActor, type MomentView,
  type MomentVisibility, type PublishMoment, type GiftView, type GiftIntent,
  type AnnualMomentsSummary, type GiftItem, type FarmGiftIdentity, type FarmGiftReceipt, type MomentPublishMeta } from "./types.js";

const identifier = z.string().min(1);
const timestamp = z.number().int().nonnegative().safe();
const subjectSchema = z.object({ kind: z.literal("resident"), id: identifier }).strict();
const publishMomentBase = z.object({
  requestId: identifier, text: z.string(), receiptId: identifier.optional(), poll: pollInputSchema.optional(),
  location: z.string().nullable().optional(),
  visibility: z.object({ mode: z.enum(["public", "only", "except"]), subjects: z.array(subjectSchema) }).strict(),
}).strict();
export const publishMomentSchema = publishMomentBase.superRefine((value, context) => {
  if (!value.text.trim() && !value.receiptId && !value.poll) context.addIssue({ code: "custom", message: "empty_moment" });
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

type PostRow = HomeRecord & PollPost & { moment_id: string; short_ref: string | null; author_id: string; request_id: string;
  text: string; receipt_id: string | null; location: string | null; location_supplied: number;
  visibility: MomentVisibility["mode"]; created_at: number };
type ReceiptRow = HomeRecord & { receipt_id: string; resident_id: string; source: string; source_id: string;
  kind: string; title: string; summary: string; occurred_at: number };
type StoredActor = { actor_key: string; kind: "resident" | "human"; name: string; resident_id: string | null };
type LikeRow = HomeRecord & { moment_id:string; actor_key:string; created_at:number };
type CommentRow = HomeRecord & { comment_id:string; moment_id:string; actor_key:string; text:string; created_at:number };
type GiftRow = HomeRecord & { gift_id:string; moment_id:string; actor_key:string; request_id:string;
  sender_resident_id:string; sender_doorplate:string; recipient_resident_id:string; recipient_doorplate:string;
  item_kind:GiftItem["kind"]; item_id:string; item_quantity:number; item_name:string|null; delivered_at:number|null; purchase_total:number|null };
type AttachmentRow = HomeRecord & { moment_id:string; comment_id:string|null; item_id:string; position:number };
type AudienceRow = { moment_id:string; subject_kind:"resident"; subject_id:string };
type StatusKeyRow = HomeRecord & { receipt_id:string; kind:string };
type FactRow = HomeRecord & { receipt_id:string; position:number; label:string; value:string };
export type MomentToolOptionAction = "share";
export interface MomentToolOption { option: string; action: MomentToolOptionAction; targetId: string }
type ToolOptionRow = HomeRecord & { resident_id: string; option_action: MomentToolOptionAction; option_target: string };
const toolOptionActionSchema = z.literal("share");
const toolOptionCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/u);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function quoteHomeTable(table:string):string {
  if(!/^lingye_moments_home_[a-f0-9]{32}$/.test(table))throw new Error("Invalid moments home table");
  return `"${table}"`;
}

/** Family content is stored in separate SQL tables on the existing Main connection. */
export class MomentsStore {
  private raffleBarrier: {freezeDue(now:number,momentId?:string):string[];wake():void;snapshotForReadablePost(momentId:string):RaffleView|undefined} | undefined;
  setRaffleBarrier(barrier:{freezeDue(now:number,momentId?:string):string[];wake():void;snapshotForReadablePost(momentId:string):RaffleView|undefined}) { this.raffleBarrier=barrier; }
  private readonly records: HomeMomentRecords;
  readonly progression: MomentsProgressionStore;
  readonly promotions: MomentsPromotions;
  private readonly polls: MomentsPolls;
  private progressionSync: ((residentId:string)=>Promise<void>) | undefined;
  setProgressionSync(sync:(residentId:string)=>Promise<void>) { this.progressionSync=sync; }
  async syncProgression(residentId:string) { await this.progressionSync?.(residentId); }
  progressionHome(residentId:string):string { this.currentActor({kind:"resident",residentId}); return this.homeId(residentId); }
  takeProgressionNotices(residentId:string,now:number):string[] { return this.progression.takeNotices(this.progressionHome(residentId),now); }
  private readonly stickerAttachments: MomentsStickerAttachments;
  constructor(private readonly database: Database.Database, private readonly ensureHomeTable: EnsureMomentsHomeTable,
    private readonly findSticker:(id:string)=>StickerAsset|undefined=findMomentSticker) {
    this.records=new HomeMomentRecords(database,ensureHomeTable);
    this.polls=new MomentsPolls(this.records);
    this.promotions=new MomentsPromotions(database,this.records,this);
    this.progression=new MomentsProgressionStore(database,ensureHomeTable);
    this.stickerAttachments=new MomentsStickerAttachments(database,ensureHomeTable,this,findSticker);
  }

  dailyActivityStatuses(actor:MomentActor,residentId:string,now:number) {
    return this.dailyActivityStatusesMany(actor,[residentId],now).get(residentId)!;
  }
  /** One shared read set for every author shown on the page; visibility is resolved once per post. */
  dailyActivityStatusesMany(actor:MomentActor,residentIds:readonly string[],now:number):Map<string,ActivityStatus[]> {
    this.currentActor(actor);parse(timestamp,now);
    const ids=[...new Set(residentIds)];
    for(const id of ids)parse(identifier,id);
    const directory=this.records.homeTables();
    return collectDailyActivityStatusesMany(this.records,actor.residentId,ids,now,
      posts=>this.readableMany(actor,posts,directory),directory);
  }
  private readableMany(actor:MomentActor,posts:readonly StatusPost[],directory?:HomeTable[]):Map<string,boolean> {
    const hiddenIds=posts.filter(post=>post.author_id!==actor.residentId&&post.visibility!=="public").map(post=>post.moment_id);
    const audience=this.audienceMap(hiddenIds,directory);
    return new Map(posts.map(post=>[post.moment_id,this.readableWith(actor,post,audience)]));
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
  private subjects(id:string,homeId?:string):AudienceSubject[] {
    return this.records.all<{subject_kind:"resident";subject_id:string}>("audience","moment_id=?",[id],homeId)
      .map(s=>({kind:s.subject_kind,id:s.subject_id})).sort((a,b)=>compare(a.id,b.id));
  }
  private readable(actor:MomentActor,row:Pick<PostRow,"moment_id"|"author_id"|"visibility"> & {home_id?:string}):boolean {
    // A human follows only the active profile's resident audience.
    if(row.author_id===actor.residentId||row.visibility==="public")return true;
    const included=this.subjects(row.moment_id,row.home_id).some(s=>s.id===actor.residentId);
    return row.visibility==="only"?included:!included;
  }
  private accessible(actor:MomentActor,id:string,homeId?:string):PostRow {
    this.currentActor(actor);
    const row=this.records.all<PostRow>("post","moment_id=?",[id],homeId)[0];
    if(!row||!this.readable(actor,row))throw new MomentsError("moment_not_found");return row;
  }
  private actorView(key:string):ActorView {
    const row=this.database.prepare(`SELECT a.kind,COALESCE(r.resident_name,a.display_name) AS name,a.resident_id
      FROM lingye_moments_actors a LEFT JOIN residents r ON r.resident_id=a.resident_id WHERE actor_key=?`).get(key) as StoredActor;
    return row.kind==="resident"?{kind:row.kind,name:loungeDisplayName(row.name),residentId:row.resident_id!}:{kind:row.kind,name:row.name};
  }
  private receipt(id:string,homeId?:string):ReceiptRow|undefined {
    return this.records.all<ReceiptRow>("receipt","receipt_id=?",[id],homeId)[0];
  }
  promotionSource(actor: MomentActor, id: string, homeId?: string) {
    const post = this.accessible(actor, id, homeId);
    const receipt = !post.text.trim() && post.receipt_id ? this.receipt(post.receipt_id, post.home_id) : undefined;
    const text = post.text.trim() || receipt?.title ||
      this.records.all<{ item_id: string; position: number }>(
        "sticker_attachment", "moment_id=? AND comment_id IS NULL", [id], post.home_id,
      ).sort((a, b) => a.position - b.position).flatMap(row => this.findSticker(row.item_id)?.name ?? []).join("、");
    return { homeId: post.home_id, authorId: post.author_id,
      authorName: this.actorView(`resident:${post.author_id}`).name, reference: post.short_ref, text };
  }
  private receiptFacts(id:string):ActivityReceipt["facts"] {
    return this.records.all<{position:number;label:string;value:string}>("fact","receipt_id=?",[id])
      .sort((a,b)=>a.position-b.position).map(({label,value})=>({label,value}));
  }
  private actorViews(keys: readonly string[]): Map<string, ActorView> {
    const unique = [...new Set(keys)].sort();
    if (!unique.length) return new Map();
    const rows = this.database.prepare(`SELECT a.actor_key,a.kind,COALESCE(r.resident_name,a.display_name) AS name,a.resident_id
      FROM lingye_moments_actors a LEFT JOIN residents r ON r.resident_id=a.resident_id
      WHERE a.actor_key IN (${unique.map(() => "?").join(",")})`).all(...unique) as
      ({ actor_key: string } & StoredActor)[];
    return new Map(rows.map(row => [row.actor_key, row.kind === "resident"
      ? { kind: row.kind, name: loungeDisplayName(row.name), residentId: row.resident_id! }
      : { kind: row.kind, name: row.name }]));
  }

  /** Readability for a batch of posts with one shared audience read (same rule as readable()). */
  private readableWith(actor: MomentActor, row: Pick<PostRow, "moment_id" | "author_id" | "visibility">, audience: Map<string, AudienceSubject[]>): boolean {
    if (row.author_id === actor.residentId || row.visibility === "public") return true;
    const included = (audience.get(row.moment_id) ?? []).some(subject => subject.id === actor.residentId);
    return row.visibility === "only" ? included : !included;
  }

  /** Batched audience lookup for visibility checks and subject display; rows may live in any home table. */
  private audienceMap(momentIds: readonly string[], directory?: HomeTable[]): Map<string, AudienceSubject[]> {
    const ids = [...new Set(momentIds)];
    const map = new Map<string, AudienceSubject[]>();
    if (!ids.length) return map;
    const tables = directory ?? this.records.homeTables();
    const clause = ids.map(() => "?").join(",");
    for (const row of this.records.allOver<AudienceRow>(tables, "audience", `moment_id IN (${clause})`, ids)) {
      const subjects = map.get(row.moment_id);
      if (subjects) subjects.push({ kind: row.subject_kind, id: row.subject_id });
      else map.set(row.moment_id, [{ kind: row.subject_kind, id: row.subject_id }]);
    }
    return map;
  }

  /** One batched read per home table for the whole batch; likes, comments, gifts and stickers may live in any home table. */
  private assemble(actor: MomentActor, rows: readonly PostRow[], now: number, directory?: HomeTable[]): MomentView[] {
    if (!rows.length) return [];
    const tables = directory ?? this.records.homeTables();
    const ids = [...new Set(rows.map(row => row.moment_id))];
    const idClause = ids.map(() => "?").join(",");
    const key = actorKey(actor);

    const likesOf = new Map<string, LikeRow[]>();
    const commentsOf = new Map<string, CommentRow[]>();
    const giftsOf = new Map<string, GiftRow[]>();
    const stickerRows: AttachmentRow[] = [];
    const actorKeys = new Set<string>(rows.map(row => `resident:${row.author_id}`));
    for (const row of this.records.allOver<(LikeRow | CommentRow | GiftRow | AttachmentRow) & { record_type: string }>(
      tables, ["like", "comment", "gift", "sticker_attachment"],
      `moment_id IN (${idClause}) AND (record_type!='gift' OR delivered_at IS NOT NULL)`, ids,
    )) {
      if (row.record_type === "like") {
        const like = row as LikeRow;
        (likesOf.get(like.moment_id) ?? likesOf.set(like.moment_id, []).get(like.moment_id)!).push(like);
        actorKeys.add(like.actor_key);
      } else if (row.record_type === "comment") {
        (commentsOf.get(row.moment_id) ?? commentsOf.set(row.moment_id, []).get(row.moment_id)!).push(row as CommentRow);
        actorKeys.add((row as CommentRow).actor_key);
      } else if (row.record_type === "gift") {
        const gift = row as GiftRow;
        (giftsOf.get(gift.moment_id) ?? giftsOf.set(gift.moment_id, []).get(gift.moment_id)!).push(gift);
        actorKeys.add(gift.actor_key);
      } else stickerRows.push(row as AttachmentRow);
    }
    const actors = this.actorViews([...actorKeys]);

    const receiptIds = [...new Set(rows.map(row => row.receipt_id).filter(id => id !== null))] as string[];
    const receipts = new Map<string, ReceiptRow>();
    const factsOf = new Map<string, FactRow[]>();
    const statusKeysOf = new Map<string, StatusKeyRow[]>();
    if (receiptIds.length) {
      const receiptClause = receiptIds.map(() => "?").join(",");
      for (const row of this.records.allOver<(ReceiptRow | FactRow | StatusKeyRow) & { record_type: string }>(
        tables, ["receipt", "fact", "activity_status"], `receipt_id IN (${receiptClause})`, receiptIds,
      )) {
        if (row.record_type === "receipt") receipts.set(row.receipt_id, row as ReceiptRow);
        else if (row.record_type === "fact") {
          const fact = row as FactRow;
          (factsOf.get(fact.receipt_id) ?? factsOf.set(fact.receipt_id, []).get(fact.receipt_id)!).push(fact);
        } else {
          const status = row as StatusKeyRow;
          (statusKeysOf.get(status.receipt_id) ?? statusKeysOf.set(status.receipt_id, []).get(status.receipt_id)!).push(status);
        }
      }
    }

    // Sticker projection mirrors projectForReadablePost: position order, post rows first, then visible comments.
    stickerRows.sort((a, b) => a.position - b.position);
    const stickersOf = new Map<string, { post: StickerAsset[]; comments: Record<string, StickerAsset[]> }>();
    const visibleComments = new Map<string, Set<string>>(rows.map(row => {
      const commentIds = (commentsOf.get(row.moment_id) ?? []).sort((a, b) => a.created_at - b.created_at || compare(a.comment_id, b.comment_id));
      return [row.moment_id, new Set(commentIds.map(comment => comment.comment_id))];
    }));
    for (const row of stickerRows) {
      const sticker = this.findSticker(row.item_id);
      if (!sticker) continue;
      const projected = stickersOf.get(row.moment_id) ?? stickersOf.set(row.moment_id, { post: [], comments: {} }).get(row.moment_id)!;
      if (row.comment_id === null) projected.post.push(sticker);
      else if (visibleComments.get(row.moment_id)?.has(row.comment_id)) (projected.comments[row.comment_id] ??= []).push(sticker);
    }

    // Subject display needs audience rows only for posts the viewing resident authored.
    const ownIds = actor.kind === "resident"
      ? rows.filter(row => row.author_id === actor.residentId).map(row => row.moment_id)
      : [];
    const ownAudience = this.audienceMap(ownIds, tables);

    return rows.map(row => {
      const receipt = row.receipt_id ? receipts.get(row.receipt_id) : undefined;
      const likes = (likesOf.get(row.moment_id) ?? []).sort((a, b) => a.created_at - b.created_at || compare(a.actor_key, b.actor_key));
      const comments = (commentsOf.get(row.moment_id) ?? []).sort((a, b) => a.created_at - b.created_at || compare(a.comment_id, b.comment_id));
      const gifts = (giftsOf.get(row.moment_id) ?? []).sort((a, b) => a.delivered_at! - b.delivered_at! || compare(a.gift_id, b.gift_id));
      const stickers = stickersOf.get(row.moment_id) ?? { post: [], comments: {} };
      const raffle = this.raffleBarrier?.snapshotForReadablePost(row.moment_id);
      const poll = this.polls.view(row, key, now);
      const subjects = ownAudience.get(row.moment_id) ?? [];
      return { id: row.moment_id, author: actors.get(`resident:${row.author_id}`)!, text: row.text, createdAt: row.created_at, location: row.location,
        ...(raffle ? { raffle } : {}), ...(poll ? { poll } : {}),
        receipt: receipt ? { source: receipt.source, kind: receipt.kind, title: receipt.title, summary: receipt.summary,
          occurredAt: receipt.occurred_at,
          facts: (factsOf.get(receipt.receipt_id) ?? []).sort((a, b) => a.position - b.position).map(({ label, value }) => ({ label, value })),
          statusKeys: canonicalStatusKeys((statusKeysOf.get(receipt.receipt_id) ?? []).map(row => row.kind).filter(isActivityStatusKey)) } : null,
        visibility: { mode: row.visibility, ...(actor.kind === "resident" && actor.residentId === row.author_id ? { subjects: subjects.sort((a, b) => compare(a.id, b.id)) } : {}) },
        liked: likes.some(like => like.actor_key === key), likes: likes.map(like => actors.get(like.actor_key)!), stickers: stickers.post,
        comments: comments.map(comment => ({ id: comment.comment_id, author: actors.get(comment.actor_key)!, text: comment.text, createdAt: comment.created_at, stickers: stickers.comments[comment.comment_id] ?? [] })),
        gifts: gifts.map(gift => this.giftView(gift, actors)) };
    });
  }
  private view(actor: MomentActor, row: PostRow, now: number): MomentView {
    return this.assemble(actor, [row], now)[0]!;
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
  private giftView(row:GiftRow,actors?:Map<string,ActorView>):GiftView {
    if(row.delivered_at===null||row.item_name===null)throw new MomentsError("gift_unavailable");
    const from=actors?actors.get(row.actor_key)!:this.actorView(row.actor_key);
    return {id:row.gift_id,from,item:{...this.giftItem(row),name:row.item_name},deliveredAt:row.delivered_at,
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
      const targetHome=this.homeId(row.recipient_resident_id);
      this.progression.ensure(row.home_id,receipt.delivered_at);
      this.progression.ensure(targetHome,receipt.delivered_at);
      this.records.update(row.home_id,row.record_id,{delivered_at:receipt.delivered_at,item_name:receipt.item.name});
      this.progression.change(row.home_id,receipt.delivered_at,"gift",row.gift_id,row.recipient_resident_id,{gifts:1});
      this.progression.change(targetHome,receipt.delivered_at,"receive_gift",row.gift_id,row.sender_resident_id,{received_gifts:1});
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
    const directory=this.records.homeTables();
    const posts=this.records.allOver<PostRow>(directory,"post","created_at>=? AND created_at<=?",[dayStart(now),now]);
    const hiddenIds=posts.filter(post=>post.author_id!==actor.residentId&&post.visibility!=="public").map(post=>post.moment_id);
    const audience=this.audienceMap(hiddenIds,directory);
    const visible=posts.filter(post=>this.readableWith(actor,post,audience));
    return {residents:new Set(visible.map(post=>post.author_id)).size,posts:visible.length};
  }
  /** Which of the given moments the actor may currently see; used by notification counting without full view assembly. */
  visibleMomentIds(actor:MomentActor,momentIds:readonly string[]):Set<string> {
    this.currentActor(actor);
    const ids=[...new Set(momentIds)].filter(id=>typeof id==="string"&&id);
    const visible=new Set<string>();
    if(!ids.length)return visible;
    const directory=this.records.homeTables();
    const posts=this.records.allOver<PostRow>(directory,"post",`moment_id IN (${ids.map(() => "?").join(",")})`,ids);
    const hiddenIds=posts.filter(post=>post.author_id!==actor.residentId&&post.visibility!=="public").map(post=>post.moment_id);
    const audience=this.audienceMap(hiddenIds,directory);
    for(const post of posts)if(this.readableWith(actor,post,audience))visible.add(post.moment_id);
    return visible;
  }
  publish(actor:MomentActor,input:PublishMoment,now:number,stickers:readonly string[]=[],pubmeta:MomentPublishMeta={}):MomentView {
    this.residentOnly(actor);parse(timestamp,now);
    const parsed=parse(stickers.length?publishMomentWithStickerSchema:publishMomentSchema,input);
    const poll=parsed.poll ? pollDefinition(parsed.poll,parsed.text) : undefined;
    if(poll && parsed.receiptId)throw new MomentsError("invalid_poll");
    parsed.visibility.subjects=canonicalSubjects(parsed.visibility.subjects);
    return this.stickerAttachments.withStickers(actor,{kind:"post",requestId:parsed.requestId,ids:stickers},attach=>{
      const homeId=this.homeId(actor.residentId);
      const previous=this.records.all<PostRow>("post","author_id=? AND request_id=?",[actor.residentId,parsed.requestId],homeId)[0];
      if(previous){
        if(!this.polls.matches(previous,poll)||previous.text!==parsed.text||previous.receipt_id!==(parsed.receiptId??null)
          ||previous.location_supplied!==(parsed.location===undefined?0:1)||(parsed.location!==undefined&&previous.location!==parsed.location)||previous.visibility!==parsed.visibility.mode
          ||JSON.stringify(canonicalSubjects(this.subjects(previous.moment_id)))!==JSON.stringify(parsed.visibility.subjects))throw new MomentsError("request_conflict");
        attach({momentId:previous.moment_id});return this.view(actor,previous,now);
      }
      if(poll && poll.at<=now)throw new MomentsError("invalid_poll");
      if(this.quota(actor,now).used>=3)throw new MomentsError("daily_limit_reached");
      const receipt=parsed.receiptId?this.receipt(parsed.receiptId):undefined;
      if(parsed.receiptId&&(!receipt||receipt.resident_id!==actor.residentId))throw new MomentsError("receipt_not_found");
      for(const subject of parsed.visibility.subjects){
        if(!this.database.prepare("SELECT 1 FROM residents WHERE resident_id=?").get(subject.id))throw new MomentsError("audience_not_found");
      }
      this.progression.ensure(homeId,now);
      const current=this.saveActor(actor),id=randomUUID();
      this.records.insert(homeId,"post",{moment_id:id,author_id:actor.residentId,actor_key:current.actor_key,request_id:parsed.requestId,
        text:parsed.text,receipt_id:parsed.receiptId??null,location:parsed.location===undefined?(pubmeta.defaultLocation??null):parsed.location,location_supplied:parsed.location===undefined?0:1,
        visibility:parsed.visibility.mode,created_at:now,poll_ends_at:poll?.at??null,poll_max_choices:poll?.max??null},id);
      if(poll)this.polls.addOptions(homeId,id,poll);
      parsed.visibility.subjects.forEach(subject=>this.records.insert(homeId,"audience",{moment_id:id,subject_kind:subject.kind,subject_id:subject.id}));
      attach({momentId:id});
      this.progression.change(homeId,now,"publish",id,"",{posts:1});
      return this.view(actor,this.accessible(actor,id),now);
    });
  }
  /** Candidate rows for a feed: window/author filters, visibility and unread-cursor exclusion are pushed into
   * SQL; with `limit` each home table returns at most that many newest rows, so the rows taken from SQLite stay
   * bounded as history grows, and the per-table results merge newest-first. Detail assembly happens later, only
   * for the rows that survive. */
  private feedRows(actor: MomentActor, query: FeedQuery, now: number,
      options: { limit?: number; since?: number; upperExclusive?: boolean; cursor?: { actorKey: string; homeId: string } } = {}):
    { rows: PostRow[]; directory: HomeTable[] } {
    const directory=this.records.homeTables();
    const clauses:string[]=["record_type='post'"],parameters:SqlValue[]=[];
    // Half-open upper window: a readFeed pass must not re-serve posts created at the read instant.
    clauses.push(options.upperExclusive?"created_at<?":"created_at<=?");parameters.push(now);
    if (query.period === "history") { clauses.push("created_at<?"); parameters.push(now-DAY); }
    else if (query.count === undefined && options.since === undefined) { clauses.push("created_at>=?"); parameters.push(now-DAY); }
    if(options.since!==undefined){clauses.push("created_at>=?");parameters.push(options.since);}
    if(query.authorId!==undefined){clauses.push("author_id=?");parameters.push(query.authorId);}
    if(query.from!==undefined){clauses.push("created_at>=?");parameters.push(query.from);}
    if(query.until!==undefined){clauses.push("created_at<?");parameters.push(query.until);}
    const cursor=options.cursor;
    if(cursor){
      // All read cursors of one actor live in the actor's own home table; skip posts whose author's
      // cursor sits after their creation (same rule as the previous in-memory survivor filter).
      const viewerTable=directory.find(table=>table.home_id===cursor.homeId);
      if(viewerTable){
        clauses.push(`NOT EXISTS(SELECT 1 FROM ${quoteHomeTable(viewerTable.table_name)} c
          WHERE c.record_type='read_cursor' AND c.actor_key=? AND c.read_author_id=p.author_id AND c.read_at>p.created_at)`);
        parameters.push(cursor.actorKey);
      }
    }
    const limit=options.limit;
    const rows=directory.flatMap(({table_name})=>{
      const match=`SELECT 1 FROM ${quoteHomeTable(table_name)} a WHERE a.record_type='audience' AND a.moment_id=p.moment_id AND a.subject_kind='resident' AND a.subject_id=?`;
      // Same visibility rule as readableWith(): own or public posts, 'only' when the resident is in
      // the audience of the post's own table, 'except' (or unset) when not.
      const visibility=`(p.author_id=? OR p.visibility='public' OR (p.visibility='only' AND EXISTS(${match}))
        OR ((p.visibility='except' OR p.visibility IS NULL) AND NOT EXISTS(${match})))`;
      const sql=`SELECT * FROM ${quoteHomeTable(table_name)} p WHERE ${[...clauses,visibility].join(" AND ")}`+
        (limit===undefined?"":" ORDER BY p.created_at DESC, p.moment_id DESC LIMIT ?");
      return this.database.prepare(sql).all(...parameters,actor.residentId,actor.residentId,actor.residentId,
        ...(limit===undefined?[]:[limit])) as PostRow[];
    });
    rows.sort((a,b)=>b.created_at-a.created_at||compare(b.moment_id,a.moment_id));
    return { rows: limit===undefined?rows:rows.slice(0,limit), directory };
  }
  list(actor:MomentActor,input:FeedQuery,now:number):MomentView[] {
    this.currentActor(actor);parse(timestamp,now);const query=parse(feedQuerySchema,input);
    const { rows, directory }=this.feedRows(actor,query,now,query.count===undefined?{}:{limit:query.count});
    return this.assemble(actor,rows,now,directory);
  }
  readFeed(actor: MomentActor, input: FeedQuery, now: number): MomentView[] {
    this.currentActor(actor); parse(timestamp,now); const query=parse(feedQuerySchema,input);
    if (query.count !== undefined || query.period === "history") return this.list(actor,query,now);
    return this.database.transaction(() => {
      const homeId=this.homeId(actor.residentId),key=actorKey(actor),scope=query.authorId??"";
      const cursors=this.records.all<HomeRecord & {read_author_id:string;read_at:number}>("read_cursor",
        "actor_key=?",[key],homeId);
      const allSince=cursors.find(row=>row.read_author_id==="")?.read_at??0;
      // Half-open windows preserve posts created in the same millisecond after this read; the unread
      // cursor lower bounds move into SQL together with visibility so candidates stay bounded.
      const cursorOptions=cursors.some(row=>row.read_author_id!=="")?{cursor:{actorKey:key,homeId}}:{};
      const { rows, directory }=this.feedRows(actor,query,now,
        {since:Math.max(now-DAY,allSince),upperExclusive:true,...cursorOptions});
      const previous=cursors.find(row=>row.read_author_id===scope);
      if(previous)this.records.update(homeId,previous.record_id,{read_at:Math.max(now,previous.read_at)});
      else {
        this.saveActor(actor);
        this.records.insert(homeId,"read_cursor",{actor_key:key,read_author_id:scope,read_at:now});
      }
      return this.assemble(actor,rows,now,directory);
    }).immediate();
  }
  get(actor:MomentActor,id:string,now:number=Date.now()):MomentView {return this.view(actor,this.accessible(actor,id),now);}
  vote(actor: MomentActor, id: string, choices: unknown, now: number): MomentView {
    parse(timestamp, now);
    return this.database.transaction(() => {
      const post = this.accessible(actor, id);
      this.polls.vote(post, this.saveActor(actor).actor_key, choices, now);
      return this.view(actor, post, now);
    }).immediate();
  }
  setLike(actor:MomentActor,id:string,liked:boolean,now:number):MomentView {
    parse(z.boolean(),liked);parse(timestamp,now);
    let frozen=false;
    const result=this.database.transaction(()=>{
      const row=this.accessible(actor,id),current=this.saveActor(actor);
      frozen=(this.raffleBarrier?.freezeDue(now,id).length??0)>0;
      const previous=this.records.all<LikeRow>("like","moment_id=? AND actor_key=?",[id,current.actor_key])[0];
      const homeId=this.homeId(actor.residentId), external=homeId!==row.home_id;
      const before=this.records.aggregate("like","moment_id=?",[id],homeId).count;
      if(external) { this.progression.ensure(homeId,now); this.progression.ensure(row.home_id,now); }
      if(liked&&!previous)this.records.insert(homeId,"like",{moment_id:id,actor_key:current.actor_key,target_home_id:row.home_id,created_at:now});
      else if(!liked&&previous)this.records.delete(previous.home_id,previous.record_id);
      const delta=liked&&!previous&&before===0?1:!liked&&previous&&before===1?-1:0;
      if(external&&delta){
        this.progression.change(homeId,now,delta>0?"like":"unlike",id,row.author_id,{likes:delta});
        this.progression.change(row.home_id,now,delta>0?"receive_like":"receive_unlike",id,actor.residentId,{received_likes:delta});
      }
      return this.view(actor,row,now);
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
      if(!previous){
        const homeId=this.homeId(actor.residentId), external=homeId!==row.home_id;
        const first=!this.records.aggregate("comment","moment_id=?",[id],homeId).count;
        if(external)this.progression.ensure(homeId,now);
        this.records.insert(homeId,"comment",{
          comment_id:commentId,moment_id:id,actor_key:current.actor_key,target_home_id:row.home_id,request_id:comment.requestId,text:comment.text,created_at:now},commentId);
        if(external)this.progression.change(homeId,now,"comment",id,row.author_id,{comments:first?1:0});
      }
      attach({momentId:id,commentId});
      return this.view(actor,row,now);
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
