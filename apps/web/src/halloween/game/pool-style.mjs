import * as THREE from 'three';
import {shareResource} from './model-kit-v4.mjs';
const materials=new Map();
const outline=shareResource(new THREE.MeshBasicMaterial({color:'#665268',side:THREE.BackSide}));
outline.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 edgeNormal; varying vec3 edgeView;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed += normalize(normal) * 0.012;').replace('#include <project_vertex>','#include <project_vertex>\nvec3 n = normal;\n#ifdef USE_INSTANCING\nn = mat3(instanceMatrix) * n;\n#endif\nedgeNormal = normalMatrix * n; edgeView = -mvPosition.xyz;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 edgeNormal; varying vec3 edgeView;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (abs(dot(normalize(edgeNormal), normalize(edgeView))) > 0.45) discard;');
};
outline.customProgramCacheKey=()=> 'pantry-outline-1';
function freshMaterial(source){
 if(materials.has(source.uuid))return materials.get(source.uuid);
 const m=source.clone();
 const surface=source.userData.pantrySurface;
 const glass=surface==='glass'||(source.transparent&&source.opacity<.5)||source.transmission>0;
 const metal=surface==='metal'||source.metalness>.4;
 if(!glass&&!metal&&!source.userData.pantryDetailed){
  if('roughness' in m)m.roughness=Math.max(m.roughness,surface==='fruit'?.66:.82);
  if('clearcoat' in m)m.clearcoat=0;
  if('specularIntensity' in m)m.specularIntensity=.18;
  if(m.bumpScale)m.bumpScale=Math.min(m.bumpScale,.002);
 }
 // Custom sculpted materials already carry their surface-specific colors.
 if(!surface&&!glass)m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.91, 0.95, 0.88), 0.045);');};
 m.customProgramCacheKey=()=> 'pantry-surface-2';materials.set(source.uuid,m);shareResource(m);return m;
}
export function finishPoolModel(root){
 root.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();const positions=[],normals=[];
 root.traverse(part=>{if(!part.isMesh)return;part.material=freshMaterial(part.material);const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld));positions.push(geometry.attributes.position.array);normals.push(geometry.attributes.normal.array);geometry.dispose();});
 const geometry=new THREE.BufferGeometry();
 for(const[name,arrays]of [['position',positions],['normal',normals]]){const data=new Float32Array(arrays.reduce((sum,a)=>sum+a.length,0));let offset=0;for(const a of arrays){data.set(a,offset);offset+=a.length;}geometry.setAttribute(name,new THREE.BufferAttribute(data,3));}
 const shell=new THREE.Mesh(geometry,outline);shell.userData.poolOutline=true;shell.raycast=()=>{};shell.castShadow=false;shell.receiveShadow=false;root.add(shell);return root;
}
