import { cloneFarmForMutation } from "../../farm-mutation-scope.js";
import { allFarms, replaceFarmsAtomic } from "../../store.js";
import { ensureKitchen } from "../ranch/state.js";
import { ensureFishing } from "../../fishing.js";
import { fishingBaitById } from "../../content.js";

const LEDGER = "doorbellMomentsRaffleReceipts";
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const key = (...parts) => JSON.stringify(parts);
export class MomentsRaffleFarmError extends Error {
    constructor(code) { super(code); this.name = "MomentsRaffleFarmError"; this.code = code; }
}
const fail = code => { throw new MomentsRaffleFarmError(code); };
function identity(input) {
    if (!text(input.owner_resident_id) || !text(input.owner_farm_doorplate) || !text(input.raffle_id)) fail("invalid_request");
    return {raffle_id:input.raffle_id,owner_resident_id:input.owner_resident_id,owner_farm_doorplate:input.owner_farm_doorplate};
}
function selection(value) {
    if (!exact(value,["kind","id","quantity"]) || !["dish","bait"].includes(value.kind) || !text(value.id)
        || !Number.isSafeInteger(value.quantity) || value.quantity < 1 || (value.kind === "dish" && value.quantity !== 1)) fail("invalid_request");
    return {kind:value.kind,id:value.id,quantity:value.quantity};
}

/** Runs on Farm's existing world and durable transaction; all receipts are immutable. */
export function createMomentsRaffleFarmService({farms=allFarms,commit=replaceFarmsAtomic,now=Date.now}={}) {
    function boundFarm(residentId,doorplate) {
        const matches=farms().filter(farm=>farm.doorbellMcpMigration?.residentId===residentId);
        if(matches.length!==1 || matches[0].id!==doorplate)fail("farm_binding_mismatch");
        return matches[0];
    }
    function ownerFor(input) { return boundFarm(input.owner_resident_id,input.owner_farm_doorplate); }
    return {
        lock(input) {
            if(!exact(input,["raffle_id","owner_resident_id","owner_farm_doorplate","prizes"]) ||
                !Array.isArray(input.prizes) || !input.prizes.length)fail("invalid_request");
            const request={...identity(input),prizes:input.prizes.map(selection)};
            const owner=ownerFor(request),ledger=owner[LEDGER]??{},lockKey=key("lock",request.raffle_id);
            const previous=Object.hasOwn(ledger,lockKey)?ledger[lockKey]:undefined;
            if(previous){
                if(JSON.stringify(previous.request)!==JSON.stringify(request))fail("request_conflict");
                return structuredClone(previous.result);
            }
            const next=cloneFarmForMutation(owner),held=[];
            for(const item of request.prizes) {
                if(item.kind==="dish") {
                    const dishes=ensureKitchen(next).dishes,index=dishes.findIndex(dish=>dish.id===item.id);
                    if(index<0)fail("insufficient_stock");
                    const dish=dishes[index];if(!text(dish.name))fail("item_unavailable");
                    held.push({item:{...item,name:dish.name},dish:structuredClone(dish)});dishes.splice(index,1);
                } else {
                    const bait=fishingBaitById.get(item.id);if(!bait)fail("item_unavailable");
                    const bag=ensureFishing(next).baitInventory;
                    if((bag[item.id]??0)<item.quantity)fail("insufficient_stock");
                    bag[item.id]-=item.quantity;held.push({item:{...item,name:bait.name}});
                }
            }
            const result={...identity(request),prizes:held.map(entry=>entry.item),locked_at:now()};
            next[LEDGER]={...(next[LEDGER]??{}),[lockKey]:{request,result,held}};
            commit([{id:next.id,farm:next,receiptKeys:[{scope:"/doorbellMomentsRaffleReceipts",receiptKey:lockKey}]}]);
            return structuredClone(result);
        },
        settle(input) {
            const keys=["raffle_id","owner_resident_id","owner_farm_doorplate","position","action",...(input?.action==="award"?["recipient_resident_id","recipient_farm_doorplate"]:[])];
            if(!exact(input,keys) || !Number.isSafeInteger(input.position) || input.position<0 || !["award","return"].includes(input.action))fail("invalid_request");
            const request={...identity(input),position:input.position,action:input.action,
                ...(input.action==="award"?{recipient_resident_id:input.recipient_resident_id,recipient_farm_doorplate:input.recipient_farm_doorplate}:{})};
            if(request.action==="award" && (!text(request.recipient_resident_id)||!text(request.recipient_farm_doorplate)))fail("invalid_request");
            const owner=ownerFor(request),ledger=owner[LEDGER]??{},lock=ledger[key("lock",request.raffle_id)];
            if(!lock || !lock.held[request.position])fail("raffle_not_found");
            const settleKey=key("settle",request.raffle_id,request.position),previous=Object.hasOwn(ledger,settleKey)?ledger[settleKey]:undefined;
            if(previous){
                if(JSON.stringify(previous.request)!==JSON.stringify(request))fail("request_conflict");
                return structuredClone(previous.result);
            }
            const recipient=request.action==="return"?owner:boundFarm(request.recipient_resident_id,request.recipient_farm_doorplate);
            if(request.action==="award"&&recipient.id===owner.id)fail("same_farm");
            const from=cloneFarmForMutation(owner),to=request.action==="return"?from:cloneFarmForMutation(recipient),entry=lock.held[request.position];
            if(entry.item.kind==="dish") {
                const dishes=ensureKitchen(to).dishes;
                if(dishes.some(dish=>dish.id===entry.dish.id))fail("item_conflict");
                dishes.push(structuredClone(entry.dish));
            } else {
                const bag=ensureFishing(to).baitInventory,quantity=(bag[entry.item.id]??0)+entry.item.quantity;
                if(!Number.isSafeInteger(quantity))fail("invalid_request");bag[entry.item.id]=quantity;
            }
            const result={...request,item:entry.item,settled_at:now()};
            from[LEDGER]={...(from[LEDGER]??{}),[settleKey]:{request,result}};
            const source={id:from.id,farm:from,receiptKeys:[{scope:"/doorbellMomentsRaffleReceipts",receiptKey:settleKey}]};
            commit(request.action==="return"?[source]:[source,{id:to.id,farm:to,receiptKeys:[]}]);
            return structuredClone(result);
        },
    };
}
