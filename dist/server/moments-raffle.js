import { requireDoorbellService, internalServiceError } from "./doorbell/contract.js";
import { readBody, jsonOut } from "./http.js";
import { createMomentsRaffleFarmService, MomentsRaffleFarmError } from "../domain/moments/raffle.js";

export async function handleMomentsRaffle(req,res,method,action) {
    if(!requireDoorbellService(req,res,method))return;
    if(action!=="lock"&&action!=="settle")return internalServiceError(res,404,"not_found","not_found");
    try {
        const input=await readBody(req),service=createMomentsRaffleFarmService();
        return jsonOut(res,200,{ok:true,data:action==="lock"?service.lock(input):service.settle(input)});
    } catch(error) {
        if(error instanceof MomentsRaffleFarmError)return internalServiceError(res,error.code==="invalid_request"?400:409,error.code,error.code);
        if(error?.message==="invalid_json")return internalServiceError(res,400,"invalid_request","invalid_request");
        return internalServiceError(res,503,"raffle_unavailable","raffle_unavailable");
    }
}
