import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Static inverted hulls share one unlit draw; no full-screen effects or frame rebuild.
export function createRoomOutline(room,width,height){
 room.updateMatrixWorld(true);
 const parts=[];
 room.traverse(o=>{
  if(!o.isMesh||!o.visible||o.userData.noOutline||Array.isArray(o.material)||o.material.transparent)return;
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
  for(const name of Object.keys(g.attributes))if(name!=='position'&&name!=='normal')g.deleteAttribute(name);
  g.applyMatrix4(o.matrixWorld);parts.push(g);
 });
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
 const material=new T.ShaderMaterial({
  uniforms:{resolution:{value:new T.Vector2(width,height)},thickness:{value:1.8},ink:{value:new T.Color('#7e6853')}},
  vertexShader:`
   uniform vec2 resolution;uniform float thickness;
   void main(){
    vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
    vec2 n=(projectionMatrix*vec4(normalize(normalMatrix*normal),0.)).xy;
    p.xy+=n/max(length(n),.00001)*thickness*2./resolution*p.w;
    gl_Position=p;
   }`,
  fragmentShader:`uniform vec3 ink;
   void main(){
    gl_FragColor=vec4(ink,1.);
    #include <colorspace_fragment>
   }`,
  side:T.BackSide,depthWrite:false,toneMapped:false
 });
 const outline=new T.Mesh(geometry,material);outline.name='room-outline';outline.renderOrder=1;outline.raycast=()=>{};
 return outline;
}
