import type { DailyColumnImageGenerator } from "./service.js";

export function columnImageGenerator(options:{url?:string|undefined;token:string;fetchImplementation?:typeof fetch}):DailyColumnImageGenerator {
  return async(prompt:string)=>{
    if (!options.url || !options.token) throw new Error("daily_column_image_gateway_not_configured");
    const response=await (options.fetchImplementation??fetch)(options.url,{
      method:"POST",headers:{authorization:`Bearer ${options.token}`,"content-type":"application/json"},
      body:JSON.stringify({prompt}),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0]?.trim()!=="image/webp")
      throw new Error(`daily_column_image_gateway_failed_${response.status}`);
    return {mediaType:"image/webp",data:Buffer.from(await response.arrayBuffer())};
  };
}
