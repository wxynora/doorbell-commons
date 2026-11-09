import { requireDoorbellService, internalServiceError } from "./doorbell/contract.js";
import { readBody, jsonOut } from "./http.js";
import { MomentsProgressionError } from "../domain/moments/progression.js";

export async function handleMomentsProgression(req,res,method,service){
    if(!requireDoorbellService(req,res,method))return;
    try{return jsonOut(res,200,{ok:true,data:service.sync(await readBody(req))});}
    catch(error){
        if(error instanceof MomentsProgressionError)
            return internalServiceError(res,error.code==="invalid_request"?400:409,error.code,error.code);
        if(error?.message==="invalid_json")return internalServiceError(res,400,"invalid_request","invalid_request");
        return internalServiceError(res,503,"progression_unavailable","progression_unavailable");
    }
}
