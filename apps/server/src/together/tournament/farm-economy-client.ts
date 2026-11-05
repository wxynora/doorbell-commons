import { z } from "zod";
import type { HarvestGrant, SnowTournamentEconomy } from "./settlement.js";

const journal=z.string().min(1);
const payment=z.object({ok:z.literal(true),payment_id:journal,resident_id:journal,gold:z.literal(10000),journal_id:journal}).strict();
const found=payment.extend({status:z.literal("paid")});
const absent=payment.extend({status:z.literal("not_found"),journal_id:z.null()});
const refund=payment.extend({refund_id:journal});
const award=z.object({ok:z.literal(true),grant_id:journal,resident_id:journal,gold:z.number().int().nonnegative(),
  silver:z.number().int().nonnegative(),journal_ids:z.array(journal)}).strict();
const rejected=z.object({error:z.object({code:z.literal("registration_balance_insufficient")}).strict()}).strict();
const furniture=z.object({ok:z.literal(true),grant_id:journal,edition_id:journal,resident_id:journal,item_id:z.literal("farm_decor:snow_king"),
  quantity:z.literal(1),granted_at:z.number().int().nonnegative(),expires_at:z.number().int().positive()}).strict();
const harvest=z.object({ok:z.literal(true),grant_id:journal,edition_id:journal,resident_id:journal,
  bonus_percent:z.literal(15),granted_at:z.number().int().nonnegative(),expires_at:z.number().int().positive()}).strict();

/** Only the original service-authenticated Farm ledger owns these balances. */
export class SnowTournamentFarmEconomy implements SnowTournamentEconomy {
  private readonly base:URL;
  constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    this.base=new URL(options.apiBaseUrl);
    if (!this.base.pathname.endsWith("/")) this.base.pathname+="/";
    if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs<=0) throw new Error("invalid_upstream_timeout");
  }
  private async post(path:string,input:unknown) {
    const response=await (this.options.fetchImplementation??fetch)(new URL(`internal/doorbell/together/${path}`,this.base),{
      method:"POST",headers:{authorization:`Bearer ${this.options.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify(input),signal:AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    return {status:response.status,data:await response.json() as unknown};
  }
  private input(input:Parameters<SnowTournamentEconomy["charge"]>[0]) {
    return {payment_id:input.paymentId,resident_id:input.residentId,gold:input.gold};
  }
  private matches(input:Parameters<SnowTournamentEconomy["charge"]>[0],value:z.infer<typeof payment>|z.infer<typeof absent>) {
    if (value.payment_id!==input.paymentId || value.resident_id!==input.residentId || value.gold!==input.gold)
      throw new Error("snow_payment_receipt_mismatch");
  }
  async charge(input:Parameters<SnowTournamentEconomy["charge"]>[0]) {
    const result=await this.post("registration",this.input(input));
    if (result.status===409 && rejected.safeParse(result.data).success) return {...input,outcome:"failed" as const};
    if (result.status!==200) return null;
    const value=payment.parse(result.data);this.matches(input,value);
    return {...input,outcome:"paid" as const,journalId:value.journal_id};
  }
  async findCharge(input:Parameters<SnowTournamentEconomy["findCharge"]>[0]) {
    const result=await this.post("registration/read",this.input(input));
    if (result.status!==200) return null;
    const value=z.union([found,absent]).parse(result.data);this.matches(input,value);
    // Not-found cannot prove a timed-out concurrent charge will never commit.
    return value.status==="paid"?{...input,outcome:"paid" as const,journalId:value.journal_id}:null;
  }
  async refund(input:Parameters<SnowTournamentEconomy["refund"]>[0]) {
    const result=await this.post("registration/refund",{...this.input(input),refund_id:input.refundId});
    if (result.status!==200) return null;
    const value=refund.parse(result.data);this.matches(input,value);
    if (value.refund_id!==input.refundId) throw new Error("snow_refund_receipt_mismatch");
    return {...input,journalId:value.journal_id};
  }
  async grant(input:Parameters<SnowTournamentEconomy["grant"]>[0]) {
    const result=await this.post("reward",{grant_id:input.id,resident_id:input.residentId,gold:input.gold,silver:input.silver});
    if (result.status!==200) return null;
    const value=award.parse(result.data);
    if (value.grant_id!==input.id || value.resident_id!==input.residentId || value.gold!==input.gold || value.silver!==input.silver ||
        value.journal_ids.length!==Number(input.gold>0)+Number(input.silver>0) || new Set(value.journal_ids).size!==value.journal_ids.length)
      throw new Error("snow_grant_receipt_mismatch");
    return {...input,journalIds:value.journal_ids};
  }
  async grantFurniture(input:Parameters<NonNullable<SnowTournamentEconomy["grantFurniture"]>>[0]) {
    const result=await this.post("furniture",{grant_id:input.id,edition_id:input.editionId,resident_id:input.residentId,item_id:input.itemId});
    if(result.status!==200) return null;
    const value=furniture.parse(result.data);
    if(value.grant_id!==input.id || value.edition_id!==input.editionId || value.resident_id!==input.residentId || value.item_id!==input.itemId ||
      value.expires_at<value.granted_at+30*24*60*60*1000) throw new Error("snow_furniture_receipt_mismatch");
    return {...input,quantity:value.quantity,grantedAt:value.granted_at,expiresAt:value.expires_at};
  }
  async grantHarvest(input:HarvestGrant) {
    const result=await this.post("harvest",{grant_id:input.id,edition_id:input.editionId,resident_id:input.residentId});
    if (result.status!==200) return null;
    const value=harvest.parse(result.data);
    return {id:value.grant_id,editionId:value.edition_id,residentId:value.resident_id,bonusPercent:value.bonus_percent,
      grantedAt:value.granted_at,expiresAt:value.expires_at};
  }
}
