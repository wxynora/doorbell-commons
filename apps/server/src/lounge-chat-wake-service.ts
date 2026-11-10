import { randomUUID } from "node:crypto";
import type { LoungeSnapshot } from "@doorbell/protocol";
import type { LoungeService } from "./lounge-service.js";
import type { LoungeChatSessionStore } from "./lounge-chat-session-store.js";
import type { LoungeWakeStore } from "./lounge-wake-store.js";
import { evaluateLoungeChatWake, type LoungeChatWakeMessages } from "./lounge-chat-wake-policy.js";

export interface LoungeChatWakeOptions {
  lounge: Pick<LoungeService, "readSnapshotForResident" | "subscribe" | "chooseArea" | "leave"> & {
    readChatWakeFacts?: LoungeService["readChatWakeFacts"];
    readSnapshotsForResidents?: (
      residentIds: readonly string[],
    ) => Map<string, LoungeSnapshot>;
  };
  sessions: LoungeChatSessionStore;
  wakes: LoungeWakeStore;
  bell: { notifyResident(residentId:string):void; notifyWakeCancelled(residentId:string,wakeId:string):void };
  /** Approved copy is supplied at final assembly, never invented in a timer. */
  message: string;
  canChat(residentId:string):boolean;
  currentMode?(residentId:string): import("./lounge-chat-session-store.js").LoungeChatMode;
  now?:()=>number;
  onError(error:unknown):void;
}

export class LoungeChatWakeService {
  private readonly now:()=>number;
  private readonly timers=new Map<string,ReturnType<typeof setTimeout>>();
  private readonly unsubscribe:()=>void;
  private running=false;
  private closed=false;
  constructor(private readonly options:LoungeChatWakeOptions) {
    this.now=options.now??Date.now;
    this.unsubscribe=options.lounge.subscribe(()=>this.reconcile());
  }
  start():void {this.reconcile();}
  close():void {this.closed=true;this.unsubscribe();for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();}
  reconcile():void {
    if(this.closed||this.running)return;
    this.running=true;
    try {
      for(const timer of this.timers.values())clearTimeout(timer);this.timers.clear();
      const sessions = this.options.sessions.list();
      let snapshots: Map<string, LoungeSnapshot> | undefined;
      if (sessions.length && !this.options.lounge.readChatWakeFacts && this.options.lounge.readSnapshotsForResidents) {
        try {
          snapshots = this.options.lounge.readSnapshotsForResidents(
            sessions.map((session) => session.residentId),
          );
        } catch (error) {
          this.options.onError(error);
        }
      }
      for(const session of sessions) { try { this.reconcileSession(session.residentId, snapshots?.get(session.residentId)); } catch(error) { this.options.onError(error); } }
    } catch(error){this.options.onError(error);} finally {this.running=false;}
  }
  sessionChanged(residentId:string):void {
    const now=this.now(), active=this.options.sessions.active(residentId,now);
    for(const id of this.options.wakes.cancelInvalidChat(residentId,active?.enteredAt??null,now))this.options.bell.notifyWakeCancelled(residentId,id);
    this.reconcile();
  }
  private reconcileSession(residentId:string, snapshot?: LoungeSnapshot):void {
    const {sessions,wakes,lounge,bell}=this.options;
    const now=this.now(),session=sessions.active(residentId,now);
    if(!session) {
      sessions.leave(residentId);
      for(const id of wakes.cancel(residentId,now,"lounge_chat"))bell.notifyWakeCancelled(residentId,id);
      if(this.options.canChat(residentId))lounge.leave(residentId);
      return;
    }
    if (!this.options.canChat(residentId)) {
      for (const id of wakes.cancel(residentId,now,"lounge_chat")) bell.notifyWakeCancelled(residentId,id);
      this.schedule(residentId, session.expiresAt);
      return;
    }
    const facts = lounge.readChatWakeFacts
      ? lounge.readChatWakeFacts(residentId, session.lastDeliveredSequence)
      : this.readSnapshotWakeFacts(residentId, session.lastDeliveredSequence, snapshot);
    if (this.options.currentMode) session.mode = this.options.currentMode(residentId);
    const result=evaluateLoungeChatWake({now,session,messages:facts});
    if(result.due) {
      const sequence = facts.latestSequence;
      const recorded=sessions.recordWake(residentId,session.enteredAt,now,sequence,()=>{
        wakes.enqueue({wakeId:randomUUID(),residentId,reason:"lounge_chat",sourceKey:`chat:${session.enteredAt}:${sequence}`,sessionEnteredAt:session.enteredAt,text:this.options.message,now,expiresAt:session.expiresAt});
      });
      if(recorded)bell.notifyResident(residentId);
    }
    const next=result.due?session.expiresAt:Math.min(result.nextDueAt??session.expiresAt,session.expiresAt);
    this.schedule(residentId, next);
  }
  private readSnapshotWakeFacts(residentId:string, after:number, snapshot?:LoungeSnapshot):LoungeChatWakeMessages {
    const {lounge} = this.options;
    let current = snapshot ?? lounge.readSnapshotForResident(residentId);
    if (!current.presence.some(person => person.resident_id === residentId)) {
      lounge.chooseArea({residentId, areaId:"conversation"});
      current = lounge.readSnapshotForResident(residentId);
    }
    const messages = current.messages;
    const unseen = messages.filter(message => message.sequence > after && message.resident_id !== residentId);
    const owners = new Map(messages.map(message => [message.message_id, message.resident_id]));
    const latest = unseen.at(-1), last = messages.at(-1);
    return {latestSequence:latest?.sequence??after,lastMessageAt:last?Date.parse(last.created_at):null,
      hasDirectedMessage:unseen.some(message=>message.reply_to_message_id!==null&&owners.get(message.reply_to_message_id)===residentId)};
  }
  private schedule(residentId: string, at: number): void {
    const timer=setTimeout(()=>{
      this.timers.delete(residentId);
      if (this.closed) return;
      this.running = true;
      try { this.reconcileSession(residentId); }
      catch (error) { this.options.onError(error); }
      finally { this.running = false; }
    },Math.max(0,at-this.now()));
    timer.unref?.();this.timers.set(residentId,timer);
  }
}
