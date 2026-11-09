import { cloneFarmForMutation } from "../../farm-mutation-scope.js";
import { allFarms, replaceFarmsAtomic } from "../../store.js";
import { ensureKitchen } from "../ranch/state.js";
import { ensureFishing, buyBait } from "../../fishing.js";
import { fishingBaitById } from "../../content.js";

const RECEIPTS = "doorbellMomentsGiftReceipts";
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = value => typeof value === "string" && value.trim().length > 0;
function exact(value, keys) { return record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)); }
export class MomentsGiftError extends Error {
    constructor(code) { super(code); this.name = "MomentsGiftError"; this.code = code; }
}
const fail = code => { throw new MomentsGiftError(code); };
function selection(item) {
    if (!exact(item,["kind","id","quantity"]) || !text(item.id) || !["dish","bait"].includes(item.kind)
        || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || (item.kind === "dish" && item.quantity !== 1)) fail("invalid_request");
    return {kind:item.kind,id:item.id,quantity:item.quantity};
}
function binding(input) {
    if (!text(input.sender_resident_id) || !text(input.sender_farm_doorplate)) fail("invalid_request");
    return {sender_resident_id:input.sender_resident_id,sender_farm_doorplate:input.sender_farm_doorplate};
}
function transferInput(input) {
    if (!exact(input,["gift_id","sender_resident_id","sender_farm_doorplate","recipient_resident_id","recipient_farm_doorplate","item",...(record(input) && Object.hasOwn(input,"purchase") ? ["purchase"] : [])])) fail("invalid_request");
    if (!text(input.gift_id) || !text(input.recipient_resident_id) || !text(input.recipient_farm_doorplate)) fail("invalid_request");
    if (Object.hasOwn(input,"purchase") && (!exact(input.purchase,["expectedTotal"]) || input.item?.kind !== "bait"
        || !Number.isSafeInteger(input.purchase.expectedTotal) || input.purchase.expectedTotal < 0)) fail("invalid_request");
    return {gift_id:input.gift_id,...binding(input),recipient_resident_id:input.recipient_resident_id,
        recipient_farm_doorplate:input.recipient_farm_doorplate,item:selection(input.item),...(input.purchase ? {purchase:{expectedTotal:input.purchase.expectedTotal}} : {})};
}

export function createMomentsFarmGiftService({farms=allFarms,commit=replaceFarmsAtomic,now=Date.now}={}) {
    function boundFarm(residentId,doorplate) {
        const matches = farms().filter(farm => farm.doorbellMcpMigration?.residentId === residentId);
        if (matches.length !== 1 || matches[0].id !== doorplate) fail("farm_binding_mismatch");
        return matches[0];
    }
    return {
        inventory(input) {
            if (!exact(input,["sender_resident_id","sender_farm_doorplate"])) fail("invalid_request");
            const identity=binding(input),farm=cloneFarmForMutation(boundFarm(identity.sender_resident_id,identity.sender_farm_doorplate));
            const items=ensureKitchen(farm).dishes.map(dish => ({kind:"dish",id:dish.id,name:dish.name,quantity:1}));
            for (const [id,quantity] of Object.entries(ensureFishing(farm).baitInventory)) {
                const bait=fishingBaitById.get(id);
                if (bait && quantity>0) items.push({kind:"bait",id,name:bait.name,quantity});
            }
            const purchaseOptions=[...fishingBaitById.values()].map(bait=>({kind:"bait",id:bait.id,name:bait.name,unitPrice:bait.cost}));
            return {...identity,items,purchaseOptions,balance:farm.coins,currency:"金币"};
        },
        transfer(input) {
            const request=transferInput(input);
            const sender=boundFarm(request.sender_resident_id,request.sender_farm_doorplate);
            const recipient=boundFarm(request.recipient_resident_id,request.recipient_farm_doorplate);
            if (sender.id === recipient.id) fail("same_farm");
            const existing=Object.hasOwn(sender[RECEIPTS]??{},request.gift_id) ? sender[RECEIPTS][request.gift_id] : undefined;
            if (existing) {
                if (JSON.stringify(existing.request)!==JSON.stringify(request)) fail("request_conflict");
                return structuredClone(existing.result);
            }
            const from=cloneFarmForMutation(sender),to=cloneFarmForMutation(recipient),item=request.item;
            let name,purchase;
            if (item.kind === "dish") {
                const source=ensureKitchen(from),destination=ensureKitchen(to);
                const index=source.dishes.findIndex(dish => dish.id === item.id);
                if (index<0) fail("insufficient_stock");
                if (destination.dishes.some(dish => dish.id===item.id)) fail("item_conflict");
                const dish=source.dishes[index];
                if (!text(dish.name)) fail("item_unavailable");
                name=dish.name;
                // Keep the complete instance: odd dishes, effects, quality and provenance.
                destination.dishes.push(structuredClone(dish));
                source.dishes.splice(index,1);
            } else {
                const bait=fishingBaitById.get(item.id);
                if (!bait) fail("item_unavailable");
                if (request.purchase) {
                    const total=bait.cost*item.quantity;
                    if (!Number.isSafeInteger(total) || total<0) fail("invalid_request");
                    if (total!==request.purchase.expectedTotal) fail("price_changed");
                    if (from.coins<total) fail("insufficient_coins");
                    const purchased=buyBait(from,ensureFishing(from),bait.id,item.quantity,now());
                    if (!purchased.ok) fail("purchase_unavailable");
                    purchase={total};
                }
                const source=ensureFishing(from).baitInventory,destination=ensureFishing(to).baitInventory;
                if ((source[item.id]??0)<item.quantity) fail("insufficient_stock");
                const quantity=(destination[item.id]??0)+item.quantity;
                if (!Number.isSafeInteger(quantity)) fail("invalid_request");
                source[item.id]-=item.quantity;destination[item.id]=quantity;name=bait.name;
            }
            const result={...request,item:{...item,name},delivered_at:now(),...(purchase ? {purchase} : {})};
            from[RECEIPTS]={...(from[RECEIPTS]??{}),[request.gift_id]:{request,result}};
            // Existing authority commits both inventories and the immutable receipt together.
            // No live farm is changed until this durable commit has succeeded.
            commit([{id:from.id,farm:from,receiptKeys:[{scope:"/doorbellMomentsGiftReceipts",receiptKey:request.gift_id}]},
                {id:to.id,farm:to,receiptKeys:[]}]);
            return structuredClone(result);
        },
    };
}
