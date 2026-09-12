import * as T from 'three';
import {defaultSlots,defaultMaterials,characters} from './interaction-slots.js';
const catalogs=new Map();
async function poseFor(character,poseId){
 if(!catalogs.has(character.id))catalogs.set(character.id,import('./'+character.poseCatalog).then(m=>m.poses));
 return (await catalogs.get(character.id)).find(p=>p.id===poseId);
}
function applyMask(material,mask){
 if(!mask?.enabled)return;
 material.onBeforeCompile=shader=>{
  shader.uniforms.localMaskRect={value:new T.Vector4(mask.x/100,1-(mask.y+mask.h)/100,(mask.x+mask.w)/100,1-mask.y/100)};
  shader.uniforms.localMaskEllipse={value:mask.shape==='ellipse'};
  shader.fragmentShader='uniform vec4 localMaskRect;\nuniform bool localMaskEllipse;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
  vec2 maskSize=max(localMaskRect.zw-localMaskRect.xy,vec2(0.00001));
  vec2 maskPoint=(vMapUv-(localMaskRect.xy+localMaskRect.zw)*0.5)/(maskSize*0.5);
  if(localMaskEllipse ? dot(maskPoint,maskPoint)<=1.0 : all(lessThanEqual(abs(maskPoint),vec2(1.0)))) discard;`);
 };
 material.customProgramCacheKey=()=> 'seat-local-mask-v1';
}
export function createResidents({scene,draw}){
 const visible=new Map(),desired=new Map();let disposed=false;
 function remove(id){const mesh=visible.get(id);if(!mesh)return false;scene.remove(mesh);mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();visible.delete(id);return true;}
 async function loadResident(person,entry){
   const slot=defaultSlots.find(s=>s.slotId===person.slotId),character=characters.find(c=>c.doorplate===person.doorplate);
   const pose=slot&&character?await poseFor(character,slot.pose):null;
   if(disposed||desired.get(person.residentId)!==entry)return;
   const src=pose?.src||(!slot?person.avatarSrc:null);
   if(!src){if(remove(person.residentId))draw();return;}
   const key=JSON.stringify([src,person.slotId,person.position]);
   if(visible.get(person.residentId)?.userData.key===key)return;
   const texture=await new T.TextureLoader().loadAsync(src).catch(()=>null);
   if(disposed||desired.get(person.residentId)!==entry){texture?.dispose();return;}
   if(!texture){if(remove(person.residentId))draw();return;}
   const binding=slot?defaultMaterials[slot.pose]:null;
   const height=binding?.footprint.height??2.2;
   const width=slot&&slot.pose!=='09-pet'?binding.footprint.width:height*Math.cos(Math.atan2(18,26))*texture.image.width/texture.image.height;
   const geometry=new T.PlaneGeometry(width,height);geometry.translate(0,height/2,0);texture.colorSpace=T.SRGBColorSpace;
   const material=new T.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.08,depthTest:slot?.occlusion??true,depthWrite:true,toneMapped:false,side:T.DoubleSide});
   applyMask(material,slot?.localMask);
   const mesh=new T.Mesh(geometry,material);mesh.layers.set(1);mesh.name='resident-'+person.residentId;mesh.renderOrder=material.depthTest?0:100;
   mesh.position.fromArray(slot?.position??person.position??[0,.05,3]);mesh.rotation.set(0,Math.atan2(10,24),0);mesh.rotateZ((slot?.angle??0)*Math.PI/180);mesh.scale.setScalar(binding?.scale??1);
   mesh.userData={key,residentId:person.residentId,name:person.name};remove(person.residentId);visible.set(person.residentId,mesh);scene.add(mesh);
   draw();
 }
 async function update(presence){
  if(disposed)return;
  const ids=new Set(presence.map(p=>p.residentId));let removed=false;
  for(const id of desired.keys())if(!ids.has(id))desired.delete(id);
  for(const id of visible.keys())if(!ids.has(id))removed=remove(id)||removed;
  if(removed)draw();
  await Promise.all(presence.map(person=>{
   const key=JSON.stringify([person.slotId,person.doorplate,person.avatarSrc,person.position]);
   let entry=desired.get(person.residentId);
   if(!entry||entry.key!==key){entry={key,promise:null};desired.set(person.residentId,entry);}
   if(!entry.promise)entry.promise=loadResident(person,entry).finally(()=>{entry.promise=null;});
   return entry.promise;
  }));
 }
 return {update,dispose(){disposed=true;desired.clear();for(const id of visible.keys())remove(id);}};
}
