import * as THREE from 'three';
import { COLORS } from './catalog.mjs';
import {candyOutline,addMoldDetails,candyBevel} from './mold-models.mjs';
import { paint,ball,extrude,pipe } from './model-kit-v4.mjs';
import {mergeStaticMeshes} from './mesh-batching.mjs';
export function createSweet(shape,color,size=.4,colorHex){
 const root=new THREE.Group(),hex=colorHex??COLORS.find(c=>c.id===color)?.hex;if(!hex)throw new TypeError('unknown_candy_color');
 const outline=candyOutline(shape,size),depth=size*(candyBevel(shape)<.1?.38:.7);
 // Sugar glass transmits light through its actual thickness; milk candy stays opaque.
 const milky=color==='cream';
 const bodyMaterial=new THREE.MeshPhysicalMaterial({
  color:milky?hex:new THREE.Color(hex).lerp(new THREE.Color('#ffffff'),.65),
  metalness:0,roughness:milky?.25:.035,clearcoat:1,clearcoatRoughness:.055,
  transmission:milky?0:1,thickness:size*.8,ior:1.48,
  attenuationColor:new THREE.Color(hex),attenuationDistance:size*.70,
  envMapIntensity:1.2,specularIntensity:.85,
 });
 const geometry=new THREE.ExtrudeGeometry(outline,{depth,steps:1,bevelEnabled:true,bevelSegments:4,bevelSize:size*candyBevel(shape),bevelThickness:size*candyBevel(shape),curveSegments:24});
 geometry.translate(0,0,-depth/2);
 const body=new THREE.Mesh(geometry,bodyMaterial);body.castShadow=milky;body.receiveShadow=false;
 root.add(body);
 if(shape==='ghost'){
  const dark=paint('#392036');for(const x of[-.23,.23])root.add(ball(size*.072,dark,[size*x,size*.25,size*.46],[1,1.3,.55]));
  root.add(pipe([[-size*.09,size*.05,size*.46],[0,-size*.015,size*.48],[size*.09,size*.05,size*.46]],size*.022,dark,12));
  for(const x of[-.43,.43])root.add(ball(size*.07,paint('#e89c9e'),[size*x,size*.08,size*.39],[1,.5,.4]));
 }
 if(shape==='pumpkin'){
  root.add(pipe([[0,size*.83,.03],[size*.02,size*1.02,.02],[size*.15,size*1.04,0]],size*.06,paint('#59915b'),12));
  for(const x of[-.46,0,.46])root.add(pipe([[x*size*.66,-size*.58,depth*.55],[x*size,size*.05,depth*.65],[x*size*.66,size*.63,depth*.55]],size*.014,paint(hex,'jelly',{roughness:.3}),16));
 }
 addMoldDetails(root,shape,size,depth,hex);
 mergeStaticMeshes(root,new Set([body]));root.userData.appearance={shape,color};return root;
}
