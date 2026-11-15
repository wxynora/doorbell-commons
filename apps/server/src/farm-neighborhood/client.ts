import {neighborhoodUpstreamSchema,neighborhoodLayoutSchema} from '@doorbell/protocol';
export class NeighborhoodError extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message);}}
export class FarmNeighborhoodClient{
 constructor(private readonly options:{apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}){}
 async read(binding:{farmHumanKey:string;farmDoorplate:string},input:{action:'overview';doorplates:string[]}|{action:'layout';target:string}){
  const base=new URL(this.options.apiBaseUrl);if(!base.pathname.endsWith('/'))base.pathname+='/';
  let response:Response;
  try{response=await(this.options.fetchImplementation??fetch)(new URL('internal/doorbell/human/farm-neighborhood',base),{method:'POST',headers:{authorization:`Bearer ${this.options.serviceToken}`,'content-type':'application/json'},body:JSON.stringify({farm_human_key:binding.farmHumanKey,expected_farm_doorplate:binding.farmDoorplate,...input}),signal:AbortSignal.timeout(this.options.requestTimeoutMs)});}
  catch{throw new NeighborhoodError(503,'farm_unavailable','农场暂时无法连接。');}
  const payload=await response.json().catch(()=>null);
  if(!response.ok){const code=payload?.error?.code;if(code==='visit_closed')throw new NeighborhoodError(403,code,'当前访问设置不允许查看这家农场。');if(code==='farm_not_found')throw new NeighborhoodError(404,code,'没有找到这家农场。');throw new NeighborhoodError(503,'farm_unavailable','农场布置暂时无法读取。');}
  const parsed=(input.action==='overview'?neighborhoodUpstreamSchema:neighborhoodLayoutSchema).safeParse(payload);
  if(!parsed.success)throw new NeighborhoodError(502,'upstream_contract_unavailable','农场布置数据暂时无法识别。');
  return parsed.data;
 }
}
