import { z } from "zod";
import type { ProgressionEvent, ProgressionGrant } from "./progression-store.js";

export interface ProgressionRequest {
  residentId:string; farmDoorplate:string; day:number; postsToday:number; sequence:number; events:ProgressionEvent[];
}
export interface ProgressionReply { residentId:string; farmDoorplate:string; through:number; grants:ProgressionGrant[]; taskNotices:{sequence:number;text:string}[] }
export interface ProgressionFarmPort { sync(input:ProgressionRequest):Promise<ProgressionReply> }

export class MomentsProgressionClient implements ProgressionFarmPort {
  private readonly url:URL;
  constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    const base=new URL(options.apiBaseUrl);if(!base.pathname.endsWith("/"))base.pathname+="/";
    this.url=new URL("internal/doorbell/moments/progression",base);
  }
  async sync(input:ProgressionRequest):Promise<ProgressionReply> {
    const response=await (this.options.fetchImplementation??fetch)(this.url,{method:"POST",
      headers:{authorization:`Bearer ${this.options.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify(input),signal:AbortSignal.timeout(this.options.requestTimeoutMs)});
    if(!response.ok)throw new Error("Moments progression unavailable");
    const integer=z.number().int().nonnegative().safe();
    const result=z.object({ok:z.literal(true),data:z.object({
      residentId:z.literal(input.residentId),farmDoorplate:z.literal(input.farmDoorplate),through:z.literal(input.sequence),
      taskNotices:z.array(z.object({sequence:integer.positive(),text:z.string().min(1)}).strict()),
      grants:z.array(z.object({id:z.string().min(1),name:z.string().min(1),silver:integer.positive(),legacy:z.boolean(),sequence:integer.positive()}).strict()),
    }).strict()}).strict().parse(await response.json()).data;
    if([...result.grants,...result.taskNotices].some(grant=>!input.events.some(event=>event.sequence===grant.sequence)))throw new Error("Invalid progression grant receipt");
    return result;
  }
}
