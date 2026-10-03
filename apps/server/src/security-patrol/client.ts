import {z} from "zod";
import {patrolPendingSchema,type PatrolClient,type PatrolNotice} from "./contracts.js";
export class FarmSecurityPatrolClient implements PatrolClient {
  readonly #base:URL; readonly #token:string; readonly #timeout:number; readonly #fetch:typeof fetch;
  constructor(options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    this.#base=new URL(options.apiBaseUrl.endsWith("/")?options.apiBaseUrl:`${options.apiBaseUrl}/`);
    this.#token=options.serviceToken;this.#timeout=options.requestTimeoutMs;this.#fetch=options.fetchImplementation??fetch;
  }
  async #post(action:"pending"|"ack",body:Record<string,unknown>):Promise<unknown> {
    const response=await this.#fetch(new URL(`internal/doorbell/security/patrol/${action}`,this.#base),{
      method:"POST",headers:{authorization:`Bearer ${this.#token}`,"content-type":"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(this.#timeout),
    });
    if(!response.ok) throw new Error("Farm patrol transport unavailable");
    return response.json();
  }
  async pending(residentId:string):Promise<PatrolNotice[]> {
    const result=patrolPendingSchema.parse(await this.#post("pending",{resident_id:residentId}));
    if(result.resident_id!==residentId) throw new Error("Farm patrol recipient mismatch");
    return result.notices;
  }
  async acknowledge(residentId:string,noticeIds:string[]):Promise<void> {
    z.strictObject({ok:z.literal(true)}).parse(await this.#post("ack",{resident_id:residentId,notice_ids:noticeIds}));
  }
}
