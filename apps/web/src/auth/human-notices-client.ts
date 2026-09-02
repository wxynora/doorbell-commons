import {z} from "zod";
import type {FrontendFetcher} from "./auth-client";
const noticeSchema=z.object({id:z.string().min(1),title:z.string(),text:z.string(),at:z.iso.datetime()}).strict();
const responseSchema=z.object({notices:z.array(noticeSchema)}).strict();
export type HumanNotice=z.infer<typeof noticeSchema>;

export async function loadHumanNotices(fetcher:FrontendFetcher=fetch,signal?:AbortSignal):Promise<HumanNotice[]> {
  const response=await fetcher('/api/human-bulletin',{credentials:'same-origin',...(signal?{signal}:{})});
  if(!response.ok) throw new Error('human_bulletin_unavailable');
  return responseSchema.parse(await response.json()).notices;
}

export async function acknowledgeHumanNotices(ids:readonly string[],fetcher:FrontendFetcher=fetch,signal?:AbortSignal):Promise<HumanNotice[]> {
  const response=await fetcher('/api/human-bulletin/ack',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ids}),...(signal?{signal}:{})});
  if(!response.ok) throw new Error('human_bulletin_unavailable');
  return responseSchema.parse(await response.json()).notices;
}
