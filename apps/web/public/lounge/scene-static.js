import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Batch only immutable opaque scenery. Named objects keep their own picking boundary.
export function optimizeStaticRoom(root){
 root.updateMatrixWorld(true);
 const owners=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.name||Array.isArray(mesh.material)||mesh.material.transparent||mesh.material.onBeforeCompile!==T.Material.prototype.onBeforeCompile)return;
  let owner=root;
  for(let part=mesh;part;part=part.parent){
   if(!part.visible||part.userData.poseChair||part.userData.gameTable||part.userData.updateWindow||part.userData.noPoseOcclusion||part.name.startsWith('tabletop-'))return;
   if(part!==mesh&&part.name&&owner===root)owner=part;
   if(part===root)break;
  }
  const key=[mesh.material.id,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask,Boolean(mesh.userData.noOutline)].join(':');
  if(!owners.has(owner))owners.set(owner,new Map());
  const buckets=owners.get(owner);
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(mesh);
 });
 for(const [owner,buckets] of owners){
  const inverse=new T.Matrix4().copy(owner.matrixWorld).invert();
  for(const meshes of buckets.values()){
   if(meshes.length<2)continue;
   const parts=meshes.map(mesh=>{
    const part=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    return part.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));
   });
   const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());
   if(!geometry)continue;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const first=meshes[0],batch=new T.Mesh(geometry,first.material);
   batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;
   batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;
   batch.userData.noOutline=Boolean(first.userData.noOutline);
   for(const mesh of meshes)mesh.removeFromParent();
   owner.add(batch);
  }
 }
 return root;
}
