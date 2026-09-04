import {dailyDocumentSchema,type DailyDocument} from "@doorbell/protocol";
export interface EditorDraft {
  issueDate:string;version:number;publishedVersion:number|null;updatedAt:number;editorModel:string;issueNumber:number;
  document:DailyDocument;images:{image_id:string;media_type:string;data_base64:string}[];
  readiness:{group:boolean;reporter:boolean;submissions:boolean;weather:boolean};
  submissions:{submission_id?:string;text:string;source_label:string;paid:boolean}[];
  publicationReward:{recipientName:string;amount:5000;paid:boolean}|null;
}
export interface EditorProgressLane {
  lane:"farm"|"submissions";status:"pending"|"completed"|"empty"|"not_started"|"unavailable";
  label:string;reporterName?:string;resendable:boolean;
}
export interface EditorProgress {issueDate:string;lanes:EditorProgressLane[];}
export async function editorRequest<T>(path:string,method="GET",body?:unknown):Promise<T> {
  const response=await fetch(`/api/lingye-daily/editor${path}`,{method,credentials:"same-origin",
    headers:{accept:"application/json",...(body ? {"content-type":"application/json"} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error?.message ?? "工作台暂时无法连接，请重试。");
  if(payload.document) payload.document=dailyDocumentSchema.parse(payload.document);
  return payload as T;
}
