import { MAX_BODY_BYTES } from '../../config.js';
import { readFarm, readNatureWorld } from '../../store.js';
import { natureSceneWeather } from '../../nature.js';
import { decorationState } from '../../domain/farm-decoration/state.js';
import { houseState } from '../../domain/farm-decoration/house.js';
import { decorationById } from '../../domain/farm-decoration/catalog.js';
import { reachable } from '../farm/social.js';
import { jsonOut, readJsonBody } from '../http.js';
import { FARM_DOORPLATE_RE, humanFieldError, isPlainObject, requireDoorbellHumanFieldService, validateFarmBinding } from './contract.js';

export function publicHouse(farm){
 const state=farm.farmDecorations, house=houseState(state?.owned??{},state?.layout?.house);
 return {doorplate:farm.id,style:house.style,level:house.level,roof:state?.layout?.roof??'mint',accessible:reachable(farm)};
}
export function publicLayout(farm,now=Date.now()){
 const state=decorationState(farm,now),house=houseState(state.owned,state.layout.house);
 const nature=natureSceneWeather(readNatureWorld(),now),hour=((now/3600000+8)%24+24)%24;
 const night=hour<5||hour>=19?1:hour<7?(7-hour)/2:hour<17?0:(hour-17)/2;
 const used=new Set(state.layout.decorations.map(d=>d.item_id));
 return {
   doorplate:farm.id,layout:state.layout,
   house:{level:house.level,classic_level:house.classic_level,style:house.style},
   catalog:[...used].map(id=>{const d=decorationById.get(id);return {item_id:d.item_id,model_id:d.model_id,name:d.name,cells:d.cells,layer:d.layer};}),
   plots:(farm.plots??[]).map(p=>({plot_id:p.id,state:!p.crop?'empty':p.crop.ripe?'ripe':'growing',seed_type:p.crop?.seedType??null})),
   environment:{season:nature.season?.id??null,weather:nature.weather?.condition??null,night},
 };
}
// Pure authorization/projection boundary is separately testable without changing any farm.
export function readNeighborhood(actor,body,lookup=readFarm){
 if(body.action==='overview'){
   const homes=body.doorplates.map(id=>lookup(id)).filter(Boolean).map(f=>f.id===actor.id||reachable(actor)&&reachable(f)?{...publicHouse(f),accessible:true}:{doorplate:f.id,style:'unavailable',level:0,roof:'',accessible:false});
   return {status:200,data:{homes}};
 }
 const target=lookup(body.target);
 if(!target)return {status:404,error:'farm_not_found'};
 if(target.id!==actor.id&&(!reachable(actor)||!reachable(target)))return {status:403,error:'visit_closed'};
 return {status:200,data:publicLayout(target)};
}
export async function handleFarmNeighborhood(req,res,method){
 if(!requireDoorbellHumanFieldService(req,res,method))return;
 try{
  const body=await readJsonBody(req,MAX_BODY_BYTES);
  if(!isPlainObject(body))return humanFieldError(res,400,'invalid_request','请求格式不正确。');
  const allowed=['action','farm_human_key','expected_farm_doorplate',body.action==='overview'?'doorplates':'target'];
  if(Object.keys(body).length!==allowed.length||!allowed.every(k=>Object.hasOwn(body,k))||!['overview','layout'].includes(body.action)||
    (body.action==='overview'? !Array.isArray(body.doorplates)||!body.doorplates.every(id=>typeof id==='string'&&FARM_DOORPLATE_RE.test(id))||new Set(body.doorplates).size!==body.doorplates.length : typeof body.target!=='string'||!FARM_DOORPLATE_RE.test(body.target)))return humanFieldError(res,400,'invalid_request','请求格式不正确。');
  const binding=validateFarmBinding(body);if(binding.error)return humanFieldError(res,binding.error.status,binding.error.code,binding.error.message);
  const result=readNeighborhood(binding.farm,body);
  if(result.error)return humanFieldError(res,result.status,result.error,result.error==='visit_closed'?'当前访问设置不允许查看这家农场。':'没有找到这家农场。');
  return jsonOut(res,200,result.data);
 }catch{return humanFieldError(res,503,'farm_unavailable','农场布置暂时无法读取。');}
}
