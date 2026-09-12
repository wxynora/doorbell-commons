import type { ReactionRecord } from "./game-reaction-store.js";
import { ReactionChargeRejected, type ReactionCharge } from "./game-reaction-service.js";
export class GameReactionClient implements ReactionCharge {
  private readonly endpoint: URL;
  constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    const base=new URL(options.apiBaseUrl);
    if(!base.pathname.endsWith("/")) base.pathname+="/";
    this.endpoint=new URL("internal/doorbell/game-reaction",base);
  }
  async charge(record: ReactionRecord) {
    const response=await (this.options.fetchImplementation??fetch)(this.endpoint,{
      method:"POST",headers:{authorization:`Bearer ${this.options.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify({event_id:record.id,room_id:record.roomId,resident_id:record.senderResidentId,target_id:record.targetId,kind:record.kind,actor:record.actor}),
      signal:AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const result=await response.json() as {ok?:boolean;event_id?:string;charged_gold?:number;error?:{code?:string}};
    if(!response.ok && response.status>=400 && response.status<500 && result.error?.code) throw new ReactionChargeRejected(result.error.code);
    if(!response.ok || result.ok!==true || result.event_id!==record.id || result.charged_gold!==50) throw new Error("reaction_charge_unconfirmed");
  }
}
