import { MAX_BODY_BYTES } from "../../config.js";
import { jsonOut,readJsonBody } from "../http.js";
import { requireDoorbellService,UUID_RE,isPlainObject,internalServiceError } from "./contract.js";

export async function handleDoorbellSecurityPatrol(req,res,method,runtime,action) {
    if(!requireDoorbellService(req,res,method)) return;
    if(!runtime?.backend) return internalServiceError(res,503,"service_unavailable","The patrol service is unavailable");
    try {
        const body=await readJsonBody(req,MAX_BODY_BYTES);
        const keys=isPlainObject(body)?Object.keys(body):[];
        const expected=action==="pending"?["resident_id"]:["resident_id","notice_ids"];
        if(keys.length!==expected.length || expected.some(key=>!keys.includes(key)) || !UUID_RE.test(body.resident_id??"") ||
            (action==="ack" && (!Array.isArray(body.notice_ids) || body.notice_ids.some(id=>typeof id!=="string" || !id))))
            return internalServiceError(res,400,"invalid_request","The patrol request is invalid");
        if(action==="ack") {
            runtime.backend.trustedSystemCommands.acknowledgePlayerPatrolNotices(body.resident_id,body.notice_ids);
            return jsonOut(res,200,{ok:true});
        }
        const notices=runtime.backend.trustedQueries.pendingPlayerPatrolNotices(body.resident_id).map(notice=>({
            notice_id:notice.noticeId,kind:notice.kind,created_at:notice.createdAt,
            facts:notice.kind==="patrol_day"?{beijing_date:notice.fact.beijingDate}:{
                occurred_at:notice.fact.event.t,thief_name:notice.fact.event.by,
                victim_name:notice.fact.victimName,crop_name:notice.fact.event.crop,
            },
        }));
        return jsonOut(res,200,{resident_id:body.resident_id,notices});
    } catch {
        return internalServiceError(res,503,"service_unavailable","The patrol service is unavailable");
    }
}
