import { randomUUID } from "node:crypto";
import type { LoungeSnapshot } from "@doorbell/protocol";
import type { LoungeService } from "./lounge-service.js";
import type { LoungeChatSessionStore } from "./lounge-chat-session-store.js";
import type { LoungeWakeStore } from "./lounge-wake-store.js";
import { evaluateLoungeChatWake } from "./lounge-chat-wake-policy.js";

export interface LoungeChatWakeOptions {
  lounge: Pick<LoungeService, "readSnapshotForResident" | "subscribe" | "chooseArea" | "leave"> & {
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
      if (this.options.lounge.readSnapshotsForResidents) {
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
    let currentSnapshot=snapshot ?? lounge.readSnapshotForResident(residentId);
    if (!currentSnapshot.presence.some(person => person.resident_id === residentId)) {
      lounge.chooseArea({ residentId, areaId: "conversation" });
      currentSnapshot = lounge.readSnapshotForResident(residentId);
    }
    if (this.options.currentMode) session.mode = this.options.currentMode(residentId);
    const messages=currentSnapshot.messages;
    const unseen=messages.filter(message=>message.sequence>session.lastDeliveredSequence && message.resident_id!==residentId);
    const owners=new Map(messages.map(message=>[message.message_id,message.resident_id]));
    const latest=unseen.at(-1),last=messages.at(-1);
    const result=evaluateLoungeChatWake({now,session,messages:{latestSequence:latest?.sequence??session.lastDeliveredSequence,lastMessageAt:last?Date.parse(last.created_at):null,hasDirectedMessage:unseen.some(message=>message.reply_to_message_id!==null&&owners.get(message.reply_to_message_id)===residentId)}});
    if(result.due && latest) {
      const recorded=sessions.recordWake(residentId,session.enteredAt,now,latest.sequence,()=>{
        wakes.enqueue({wakeId:randomUUID(),residentId,reason:"lounge_chat",sourceKey:`chat:${session.enteredAt}:${latest.sequence}`,sessionEnteredAt:session.enteredAt,text:this.options.message,now,expiresAt:session.expiresAt});
      });
      if(recorded)bell.notifyResident(residentId);
    }
    const next=result.due?session.expiresAt:Math.min(result.nextDueAt??session.expiresAt,session.expiresAt);
    this.schedule(residentId, next);
  }
  private schedule(residentId: string, at: number): void {
    const timer=setTimeout(()=>{this.timers.delete(residentId);this.reconcile();},Math.max(0,at-this.now()));
    timer.unref?.();this.timers.set(residentId,timer);
  }
}
