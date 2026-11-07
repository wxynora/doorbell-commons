import { z } from "zod";
import { MomentsError, type FarmGiftIdentity, type FarmGiftPort, type FarmGiftRequest } from "./types.js";

const item=z.object({kind:z.enum(["dish","bait"]),id:z.string().min(1),name:z.string().min(1),quantity:z.number().int().positive().safe()}).strict();
export class MomentsFarmGiftClient implements FarmGiftPort {
  private readonly base: URL;
  constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    const base=new URL(options.apiBaseUrl);if(!base.pathname.endsWith("/"))base.pathname+="/";
    this.base=new URL("internal/doorbell/moments/gifts/",base);
  }
  private async request(action:string,input:object):Promise<unknown> {
    try {
      const response=await (this.options.fetchImplementation??fetch)(new URL(action,this.base),{
        method:"POST",headers:{authorization:`Bearer ${this.options.serviceToken}`,"content-type":"application/json"},
        body:JSON.stringify(input),signal:AbortSignal.timeout(this.options.requestTimeoutMs),
      });
      const value:unknown=await response.json();
      if(!response.ok){
        const parsed=z.object({error:z.object({code:z.string()})}).safeParse(value);
        const code=parsed.success?parsed.data.error.code:"gift_unavailable";
        if(["invalid_request","farm_binding_mismatch","same_farm","request_conflict","insufficient_stock","item_conflict","item_unavailable","price_changed","insufficient_coins","purchase_unavailable"].includes(code)
          &&[400,409].includes(response.status))throw new MomentsError(code as ConstructorParameters<typeof MomentsError>[0]);
        throw new MomentsError("gift_unavailable");
      }
      return value;
    } catch(cause){if(cause instanceof MomentsError)throw cause;throw new MomentsError("gift_unavailable");}
  }
  async inventory(input:FarmGiftIdentity){
    const schema=z.object({ok:z.literal(true),data:z.object({sender_resident_id:z.literal(input.sender_resident_id),
      sender_farm_doorplate:z.literal(input.sender_farm_doorplate),items:z.array(item),
      purchaseOptions:z.array(z.object({kind:z.literal("bait"),id:z.string().min(1),name:z.string().min(1),unitPrice:z.number().int().nonnegative().safe()}).strict()),
      balance:z.number().int().nonnegative().safe(),currency:z.literal("金币")}).strict()}).strict();
    const parsed=schema.safeParse(await this.request("inventory",input));
    if(!parsed.success)throw new MomentsError("gift_unavailable");
    const {items,purchaseOptions,balance,currency}=parsed.data.data;
    return {items,purchaseOptions,balance,currency};
  }
  async transfer(input:FarmGiftRequest){
    const schema=z.object({ok:z.literal(true),data:z.object({gift_id:z.literal(input.gift_id),
      sender_resident_id:z.literal(input.sender_resident_id),sender_farm_doorplate:z.literal(input.sender_farm_doorplate),
      recipient_resident_id:z.literal(input.recipient_resident_id),recipient_farm_doorplate:z.literal(input.recipient_farm_doorplate),
      item:z.object({kind:z.literal(input.item.kind),id:z.literal(input.item.id),quantity:z.literal(input.item.quantity),name:z.string().min(1)}).strict(),
      delivered_at:z.number().int().nonnegative().safe(),
      purchase:z.object({total:z.number().int().nonnegative().safe()}).strict().optional()}).strict()}).strict();
    const parsed=schema.safeParse(await this.request("transfer",input));
    if(!parsed.success)throw new MomentsError("gift_unavailable");
    const {purchase,...receipt}=parsed.data.data;
    if(input.purchase?purchase?.total!==input.purchase.expectedTotal:purchase!==undefined)throw new MomentsError("gift_unavailable");
    return {...receipt,...(purchase===undefined?{}:{purchase})};
  }
}
