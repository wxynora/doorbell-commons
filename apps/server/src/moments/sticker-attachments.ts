import type Database from "better-sqlite3";
import { HomeMomentRecords, type EnsureMomentsHomeTable, type HomeRecord, type HomeRecordKind, type SqlValue } from "./home-records.js";
import { MomentsError, type MomentActor, type MomentSticker, type MomentView } from "./types.js";

export type StickerAsset = MomentSticker;
export interface StickerAttachmentPort {
  notificationIdentity(actor:MomentActor):{homeId:string;actorKey:string};
  get(actor:MomentActor,momentId:string):MomentView;
}
type ExtraKind=HomeRecordKind|"sticker_attachment";
type ExtraRecords={
  all<T>(kind:ExtraKind,where?:string,parameters?:SqlValue[],homeId?:string):T[];
  insert(homeId:string,kind:ExtraKind,fields:Record<string,SqlValue>,id?:string):string;
};
type Attachment=HomeRecord & {moment_id:string;comment_id:string|null;item_id:string;position:number};
type Post=HomeRecord & {moment_id:string;author_id:string;actor_key:string;request_id:string};
type Comment=HomeRecord & {comment_id:string;moment_id:string;actor_key:string;request_id:string};
export class MomentsStickerAttachmentError extends Error {
  constructor(readonly code:"sticker_target_not_found") {
    super(code);this.name="MomentsStickerAttachmentError";
  }
}

/** Free assets only. The supplied catalogue has no purchase or entitlement semantics. */
export class MomentsStickerAttachments {
  private readonly records:ExtraRecords;
  constructor(private readonly database:Database.Database,ensureHomeTable:EnsureMomentsHomeTable,
    private readonly moments:StickerAttachmentPort,private readonly findSticker:(id:string)=>StickerAsset|undefined) {
    this.records=new HomeMomentRecords(database,ensureHomeTable) as unknown as ExtraRecords;
  }

  /** Parent writes the post/comment and attaches IDs inside this same transaction. */
  withStickers<T>(actor:MomentActor,input:{kind:"post"|"comment";requestId:string;ids:readonly string[]},
    write:(attach:(target:{momentId:string;commentId?:string})=>void)=>T):T {
    if(actor.kind!=="resident")throw new MomentsError("resident_only");
    if(!input||!["post","comment"].includes(input.kind)||typeof input.requestId!=="string"||!input.requestId.trim()||!Array.isArray(input.ids))
      throw new MomentsError("invalid_request");
    if(input.ids.some(id=>typeof id!=="string"||!this.findSticker(id)))throw new MomentsError("invalid_request");
    return this.database.transaction(()=>{
      const who=this.moments.notificationIdentity(actor);
      const alreadyExists=this.records.all<Post|Comment>(input.kind,"actor_key=? AND request_id=?",[who.actorKey,input.requestId],who.homeId).length>0;
      let attached=false;
      const attach=(target:{momentId:string;commentId?:string})=>{
        if(!target||typeof target.momentId!=="string"||!target.momentId)throw new MomentsError("invalid_request");
        if(input.kind==="post"){
          if(target.commentId!==undefined)throw new MomentsError("invalid_request");
          const post=this.records.all<Post>("post","moment_id=? AND actor_key=? AND request_id=?",
            [target.momentId,who.actorKey,input.requestId],who.homeId)[0];
          if(!post)throw new MomentsStickerAttachmentError("sticker_target_not_found");
        } else {
          if(typeof target.commentId!=="string"||!target.commentId)throw new MomentsError("invalid_request");
          const comment=this.records.all<Comment>("comment","comment_id=? AND moment_id=? AND actor_key=? AND request_id=?",
            [target.commentId,target.momentId,who.actorKey,input.requestId],who.homeId)[0];
          if(!comment)throw new MomentsStickerAttachmentError("sticker_target_not_found");
        }
        const where=target.commentId===undefined?"moment_id=? AND comment_id IS NULL":"moment_id=? AND comment_id=?";
        const args=target.commentId===undefined?[target.momentId]:[target.momentId,target.commentId];
        const previous=this.records.all<Attachment>("sticker_attachment",where,args,who.homeId).sort((a,b)=>a.position-b.position);
        if(previous.length||alreadyExists){
          if(previous.length!==input.ids.length||previous.some((row,index)=>row.item_id!==input.ids[index]))
            throw new MomentsError("request_conflict");
        } else input.ids.forEach((id,position)=>this.records.insert(who.homeId,"sticker_attachment",{
          moment_id:target.momentId,comment_id:target.commentId??null,item_id:id,position,
        }));
        attached=true;
      };
      const result=write(attach);
      if(!attached)throw new MomentsStickerAttachmentError("sticker_target_not_found");
      return result;
    }).immediate();
  }

  /** Caller has already checked the post's current visibility. */
  projectForReadablePost(momentId:string,commentIds:readonly string[]):{post:StickerAsset[];comments:Record<string,StickerAsset[]>} {
    const visibleComments=new Set(commentIds);
    const result:{post:StickerAsset[];comments:Record<string,StickerAsset[]>}={post:[],comments:{}};
    const rows=this.records.all<Attachment>("sticker_attachment","moment_id=?",[momentId]).sort((a,b)=>a.position-b.position);
    for(const row of rows){
      const sticker=this.findSticker(row.item_id);if(!sticker)continue;
      if(row.comment_id===null)result.post.push(sticker);
      else if(visibleComments.has(row.comment_id))(result.comments[row.comment_id]??=[]).push(sticker);
    }
    return result;
  }
  /** Resolves only IDs attached to the currently readable post and its surviving comments. */
  attachments(actor:MomentActor,momentId:string):{post:StickerAsset[];comments:Record<string,StickerAsset[]>} {
    const post=this.moments.get(actor,momentId);
    return this.projectForReadablePost(momentId,post.comments.map(comment=>comment.id));
  }
}
