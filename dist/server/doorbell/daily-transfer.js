import { MAX_BODY_BYTES } from "../../config.js";
import { CareerDomainError } from "../../career/contracts.js";
import { reporterTransferCandidates, transferReporterTask } from "../../career/reporter-manual-transfer.js";
import { handoffReporterRelayDuty } from "../../career/reporter-relay-service.js";
import { allFarms } from "../../store.js";
import { jsonOut, readJsonBody } from "../http.js";
import { internalServiceError, isPlainObject, requireDoorbellService, UUID_RE } from "./contract.js";

export async function handleDailyReporterTransfer(req,res,method,runtime,action) {
    if (!requireDoorbellService(req,res,method)) return;
    try {
        const body = await readJsonBody(req,MAX_BODY_BYTES);
        const keys = action === "transfer-candidates" ? ["issueDate"] :
            ["issueDate","lane","requestId","sourceWakeId","previousResidentId","targetResidentId"];
        if (!isPlainObject(body) || Object.keys(body).length !== keys.length ||
            !keys.every(key => typeof body[key] === "string" && body[key].length > 0) ||
            !/^\d{4}-\d{2}-\d{2}$/u.test(body.issueDate))
            return internalServiceError(res,400,"invalid_request","Invalid reporter transfer request");
        const now = runtime.now?.() ?? Date.now();
        if (action === "transfer-candidates") {
            const farms = allFarms();
            const candidates = reporterTransferCandidates(runtime.database,now).map(row => {
                const farm = farms.find(farm => farm.doorbellMcpMigration?.residentId === row.resident_id);
                return {residentId:row.resident_id,displayName:String(farm?.aiName || farm?.name || "社区记者")};
            });
            return jsonOut(res,200,{ok:true,data:{candidates}});
        }
        if (!["farm","voice","submissions"].includes(body.lane) ||
            ![body.requestId,body.previousResidentId,body.targetResidentId].every(id=>UUID_RE.test(id)))
            return internalServiceError(res,400,"invalid_request","Invalid reporter transfer target");
        const result = transferReporterTask(runtime.database,runtime.backend,{...body,now},handoffReporterRelayDuty);
        const wake = result.wake;
        const publicWake = !wake ? null : wake.stage === "selection" ? {
            wake_id:wake.wake_id,recipient_resident_id:wake.recipient_resident_id,issue_date:wake.issue_date,
            stage:wake.stage,materials:wake.materials,action:wake.action,
        } : {wake_id:wake.wake_id,recipient_resident_id:wake.recipient_resident_id,issue_date:wake.issue_date,
            stage:wake.stage,selection_text:wake.selection_text,action:wake.action};
        return jsonOut(res,200,{ok:true,data:{...result,wake:publicWake}});
    } catch(error) {
        if (error instanceof CareerDomainError) return internalServiceError(res,409,error.code,"The reporter task changed or the selected reporter is unavailable");
        return internalServiceError(res,503,"service_unavailable","The reporter transfer could not be confirmed");
    }
}
