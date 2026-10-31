import * as THREE from 'three';
export const signedArea=polygon=>polygon.reduce((n,p,i)=>n+p[0]*polygon[(i+1)%polygon.length][1]-p[1]*polygon[(i+1)%polygon.length][0],0)/2;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function hull(points){
 const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(sorted.length<3)return[];
 const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function contains(outline,polygon){
 if(!outline.every(p=>inRing(p,polygon[0])&&!polygon.slice(1).some(hole=>inRing(p,hole))))return false;
 // A hole or concave boundary inside the lower silhouette leaves it exposed,
 // even if all its vertices happen to be under an opaque part of the object.
 for(const ring of polygon){
  if(ring.some(p=>inRing(p,outline)))return false;
  for(let i=0;i<ring.length;i++)for(let j=0;j<outline.length;j++){
   const a=ring[i],b=ring[(i+1)%ring.length],c=outline[j],d=outline[(j+1)%outline.length];
   if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1]))return false;
  }
 }return true;
}
export function visiblePileTiles(tiles,shapeFor,worldCache=new Map()){
 const matrix=new THREE.Matrix4(),unit=new THREE.Vector3(1,1,1),p=new THREE.Vector3(),q=new THREE.Quaternion();
 const objects=tiles.map(tile=>{
  const shape=shapeFor(tile),pose=[...tile.position,...tile.quaternion].join(','),cached=worldCache.get(tile.id);
  if(cached?.pose===pose&&cached.shape===shape)return{...cached,tile};
  matrix.compose(p.fromArray(tile.position),q.fromArray(tile.quaternion),unit);const box=shape.bounds.clone().applyMatrix4(matrix);
  const yawOnly=Math.abs(tile.quaternion[0])+Math.abs(tile.quaternion[2])<1e-9;
  const project=polygon=>polygon.map(([x,z])=>{const v=new THREE.Vector3(x,0,z).applyMatrix4(matrix);return[v.x,v.z];});
  const outline=project(shape.outline),faces=yawOnly?shape.faces.map(polygon=>polygon.map(project)):[];
  const value={tile,shape,pose,box,faces,outline,yawOnly};worldCache.set(tile.id,value);return value;
 });
 const alive=new Set(tiles.map(t=>t.id));for(const id of worldCache.keys())if(!alive.has(id))worldCache.delete(id);
 return objects.filter(({tile,box,outline,yawOnly})=>{
  if(tile.selectable!==false||!yawOnly)return true;
  for(const other of objects){
   // Every surface of the occluder must be above the lower item. The prebuilt
   // opaque silhouette excludes glass and holes; exposed edges stay rendered.
   if(other.tile===tile||other.box.min.y<=box.max.y+1e-5||other.box.max.x<box.min.x||other.box.min.x>box.max.x||other.box.max.z<box.min.z||other.box.min.z>box.max.z)continue;
   for(const polygon of other.faces)if(contains(outline,polygon))return false;
  }return true;
 }).map(o=>o.tile);
}
