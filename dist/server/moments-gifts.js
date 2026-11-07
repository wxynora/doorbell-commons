import { requireDoorbellService, internalServiceError } from "./doorbell/contract.js";
import { readBody, jsonOut } from "./http.js";
import { createMomentsFarmGiftService, MomentsGiftError } from "../domain/moments/gifts.js";

export async function handleMomentsGifts(req,res,method,action) {
    if (!requireDoorbellService(req,res,method)) return;
    try {
        const input=await readBody(req),service=createMomentsFarmGiftService();
        const data=action === "inventory" ? service.inventory(input) : service.transfer(input);
        return jsonOut(res,200,{ok:true,data});
    } catch(error) {
        if (error instanceof MomentsGiftError) {
            const status=error.code === "invalid_request" ? 400 : 409;
            return internalServiceError(res,status,error.code,error.code);
        }
        if (error?.message === "invalid_json") return internalServiceError(res,400,"invalid_request","invalid_request");
        return internalServiceError(res,503,"gift_unavailable","gift_unavailable");
    }
}
