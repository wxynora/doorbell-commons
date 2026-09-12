import { randomUUID } from "node:crypto";
import type { GameCaller } from "./game-identity.js";
import type { GameRoomStore } from "./types.js";
import { GameReactionStore, type ReactionRecord, type ReactionKind } from "./game-reaction-store.js";

export interface ReactionCharge { charge(record: ReactionRecord): Promise<void> }
export class ReactionChargeRejected extends Error {}
export interface ReactionDelivery {
  /** Publish only to authenticated members of this room; deduplicate by id on clients. */
  publish(event: {id:string;roomId:string;senderId:string;targetId:string;kind:ReactionKind}): Promise<void>;
  /** Persist through the existing Bell outbox, deduplicating this id. */
  bell(id: string, residentId: string, text: string): Promise<void>;
}
export class GameReactionService {
  private readonly pending = new Map<string, Promise<{id:string}>>();
  constructor(private readonly rooms: GameRoomStore, private readonly store: GameReactionStore,
    private readonly economy: ReactionCharge, private readonly delivery: ReactionDelivery,
    private readonly nameOf: (playerId: string) => Promise<string>) {}

  async send(caller: GameCaller, input: {roomId:string;targetId:string;kind:ReactionKind;requestId:string}) {
    const actor = await caller.authenticate();
    if (![input.roomId,input.targetId,input.requestId].every(value=>typeof value==="string"&&value.length>0) || !["flower","bomb"].includes(input.kind)) throw new Error("invalid_reaction");
    let record = this.store.find(actor.playerId,input.requestId);
    if (!record) {
      const room=this.rooms.read(input.roomId);
      const sender=room?.seats.find(seat=>seat.playerId===actor.playerId);
      const target=room?.seats.find(seat=>seat.playerId===input.targetId);
      if (!room || !sender || !target || sender.playerId===target.playerId || !actor.residentId || !target.residentId || sender.residentId!==actor.residentId) throw new Error("reaction_not_allowed");
      const senderName=await this.nameOf(actor.playerId);
      if (!senderName) throw new Error("sender_name_unavailable");
      if(this.rooms.read(room.roomId)?.revision!==room.revision) throw new Error("room_changed");
      record=this.store.put({id:randomUUID(),requestId:input.requestId,roomId:input.roomId,senderId:actor.playerId,targetId:input.targetId,senderResidentId:actor.residentId,targetResidentId:target.residentId,targetController:target.controllerType,senderName,actor:actor.controllerType==="human"?"human":"agent",kind:input.kind,paid:false,delivered:false});
    }
    if (record.roomId!==input.roomId || record.targetId!==input.targetId || record.kind!==input.kind || record.senderResidentId!==actor.residentId) throw new Error("reaction_request_conflict");
    const active=this.pending.get(record.id);
    if(active) return active;
    const work=this.complete(record);
    this.pending.set(record.id,work);
    try{return await work;}finally{this.pending.delete(record.id);}
  }
  private async complete(record: ReactionRecord) {
    if(!record.paid) {
      this.store.markCharging(record.id,true);
      try { await this.economy.charge(record); }
      catch(error) { if(error instanceof ReactionChargeRejected) this.store.markCharging(record.id,false); throw error; }
      this.store.markPaid(record.id);
    }
    if(!record.delivered) await this.deliver(record);
    return {id:record.id};
  }
  private async deliver(record: ReactionRecord) {
    if(record.targetController==="resident") await this.delivery.bell(record.id,record.targetResidentId,`${record.senderName}给你${record.kind==="flower"?"送了 1 个🌹":"扔了 1 个💣"}。`);
    await this.delivery.publish({id:record.id,roomId:record.roomId,senderId:record.senderId,targetId:record.targetId,kind:record.kind});
    this.store.markDelivered(record.id);
  }
  /** Recover ambiguous charge attempts using the original id; never retry known rejected purchases. */
  async recoverDelivery() { for(const record of this.store.outstanding()) await this.complete(record); }
}
