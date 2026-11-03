import { z } from "zod";
const schema=z.strictObject({ok:z.literal(true),data:z.strictObject({
  issue_date:z.iso.date(),window:z.strictObject({startMs:z.number(),endMs:z.number(),timeZone:z.literal("Asia/Shanghai")}),
  materials:z.array(z.strictObject({id:z.string().min(1),category:z.string(),occurredAt:z.number(),
    title:z.string(),content:z.string(),sourceId:z.string().nullable()})),
})});
export function farmFactSource(options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
  const base=new URL(options.apiBaseUrl);if(!base.pathname.endsWith("/"))base.pathname+="/";
  return async(date:string)=>{
    const response=await (options.fetchImplementation??fetch)(new URL("internal/doorbell/lingye-daily/reporter-materials/farm-source",base),{
      method:"POST",headers:{authorization:`Bearer ${options.serviceToken}`,"content-type":"application/json"},
      body:JSON.stringify({issue_date:date}),signal:AbortSignal.timeout(options.requestTimeoutMs),
    });
    if(!response.ok)throw new Error("farm_facts_unavailable");
    const result=schema.parse(await response.json()).data;
    if(result.issue_date!==date)throw new Error("farm_facts_issue_mismatch");
    return result;
  };
}
