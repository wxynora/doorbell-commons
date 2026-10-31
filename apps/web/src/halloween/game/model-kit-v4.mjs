import * as THREE from 'three';
const paints=new Map(),textures=new Map(),sharedResources=new WeakSet();
export function shareResource(resource){sharedResources.add(resource);return resource;}
export function retainModelResources(root){root.traverse(o=>{if(o.geometry)shareResource(o.geometry);for(const material of [o.material].flat().filter(Boolean)){shareResource(material);for(const value of Object.values(material))if(value?.isTexture)shareResource(value);}});return root;}
export function mutablePaint(...args){return paint(...args).clone();}
function surfaceColor(color,kind){
 const key=`${color}:${kind}`;if(textures.has(key))return textures.get(key);
 const n=256,data=new Uint8Array(n*n*4),base=new THREE.Color(color);let seed=71;
 const rgb=[base.r,base.g,base.b].map(v=>THREE.ColorManagement.workingToColorSpace(new THREE.Color(v,v,v),THREE.SRGBColorSpace).r*255);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const random=seed/4294967296;
  let v=1;
  if(kind==='fruit')v=.86+.11*Math.sin(x*.057+Math.sin(y*.025))+.08*Math.sin(y*.037)+(random>.975?.22:0)+(random-.5)*.065;
  if(kind==='wood')v=.86+.09*Math.sin(x*.16+Math.sin(y*.018)*2)+.035*Math.sin(x*.9)+random*.06;
  if(kind==='cloth')v=.88+(x%5<2?.05:0)+(y%5<2?.05:0)+(random-.5)*.07;
  if(kind==='sugar')v=.86+random*.19+(random>.96?.12:0);
  const i=(y*n+x)*4;for(let c=0;c<3;c++)data[i+c]=Math.min(255,rgb[c]*v);data[i+3]=255;
 }
 const map=new THREE.DataTexture(data,n,n);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.needsUpdate=true;textures.set(key,map);shareResource(map);return map;
}
function grain(kind){
 if(textures.has(kind))return textures.get(kind);
 const n=128,data=new Uint8Array(n*n*4);let seed=43;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;let v=128+(seed/4294967296-.5)*50;
  if(kind==='wood')v=125+Math.sin(x*.34+Math.sin(y*.043)*2)*21+Math.sin(x*.91)*7+(seed/4294967296-.5)*12;
  if(kind==='cloth')v=128+((x%5<2?1:-1)+(y%5<2?1:-1))*25;
  const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,n,n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;textures.set(kind,t);shareResource(t);return t;
}
export function paint(color,kind='glaze',extra={}){
 const key=JSON.stringify([color,kind,extra]);if(paints.has(key))return paints.get(key);
 const natural=['wood','cloth','sugar','fruit'].includes(kind);
 const mat=new THREE.MeshPhysicalMaterial({color:natural?'#ffffff':color,...(natural?{map:surfaceColor(color,kind)}:{}),roughness:kind==='cloth'?.92:kind==='wood'?.57:kind==='sugar'?.83:kind==='fruit'?.42:kind==='metal'?.31:.3,metalness:kind==='metal'?.72:0,clearcoat:kind==='fruit'?.22:['glaze','jelly'].includes(kind)?.75:0,clearcoatRoughness:.19,
  ...(['wood','cloth','sugar','fruit'].includes(kind)?{bumpMap:grain(kind),bumpScale:kind==='cloth'?.012:kind==='sugar'?.009:kind==='wood'?.004:.0045}:{}),...extra});paints.set(key,mat);shareResource(mat);return mat;
}
export function piece(geometry,mat,position=[0,0,0],scale=null){const m=new THREE.Mesh(geometry,typeof mat==='string'?paint(mat):mat);m.position.set(...position);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;return m;}
export function ball(r,mat,position=[0,0,0],scale=null){return piece(new THREE.SphereGeometry(r,28,20),mat,position,scale);}
export function lathe(profile,mat,position=[0,0,0],segments=48){return piece(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments),mat,position);}
export function cyl(top,bottom,h,mat,position=[0,0,0],segments=32){return piece(new THREE.CylinderGeometry(top,bottom,h,segments),mat,position);}
export function ring(r,t,mat,position=[0,0,0],axis='y',arc=Math.PI*2){const o=piece(new THREE.TorusGeometry(r,t,10,48,arc),mat,position);if(axis==='y')o.rotation.x=Math.PI/2;return o;}
export function pipe(points,r,mat,segments=24){return piece(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,r,8,false),mat);}
export function roundRect(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
export function extrude(shape,depth,mat,position=[0,0,0],bevel=.025){const geo=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSegments:4,bevelSize:bevel,bevelThickness:bevel,curveSegments:32});geo.translate(0,0,-depth/2);return piece(geo,mat,position);}
export function block(w,h,d,mat,position=[0,0,0],r=.05){return extrude(roundRect(w,h,r),d,mat,position,Math.min(r*.45,d*.22));}
export function petal(length=.4,width=.15,color='#4e9b43'){
 const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(-width,length*.18,-width,length*.72,0,length);s.bezierCurveTo(width,length*.72,width,length*.18,0,0);
 const g=new THREE.ShapeGeometry(s,20),p=g.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getY(i)/length*Math.PI)*.045);g.computeVertexNormals();
 const root=new THREE.Group();root.add(piece(g,paint(color,'fruit',{side:THREE.DoubleSide})));root.add(pipe([[0,0,.008],[0,length*.45,.052],[0,length,.005]],.009,paint('#b4ce72'),12));
 for(const dir of[-1,1])for(let i=1;i<4;i++){const y=length*i/5;root.add(pipe([[0,y,.05],[dir*width*.65,y+length*.15,.035]],.004,paint('#9ec16a'),4));}return root;
}
// Bake the designed parts once and merge identical materials. Repeated physical
// objects can then be rendered as a handful of instances instead of 50 parts.
export function bakeModel(root){
 root.updateMatrixWorld(true);const buckets=new Map();root.traverse(o=>{if(!o.isMesh)return;const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();source.applyMatrix4(o.matrixWorld);const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{mat:o.material,geometries:[]});buckets.get(key).geometries.push(source);});
 const baked=new THREE.Group();for(const {mat,geometries}of buckets.values()){
  const geometry=new THREE.BufferGeometry();for(const attr of['position','normal','uv']){const arrays=geometries.map(g=>g.getAttribute(attr));if(arrays.some(a=>!a))continue;const joined=new Float32Array(arrays.reduce((n,a)=>n+a.array.length,0));let at=0;for(const a of arrays){joined.set(a.array,at);at+=a.array.length;}geometry.setAttribute(attr,new THREE.BufferAttribute(joined,arrays[0].itemSize));}
  geometry.computeBoundingBox();geometry.computeBoundingSphere();baked.add(piece(geometry,mat));for(const g of geometries)g.dispose();
 }return baked;
}
export function studioEnvironment(renderer){
 const room=new THREE.Scene();room.background=new THREE.Color('#a89f9f');
 const shell=new THREE.Mesh(new THREE.BoxGeometry(12,10,12),new THREE.MeshBasicMaterial({color:'#777181',side:THREE.BackSide}));room.add(shell);
 const addPanel=(w,h,color,pos,look)=>{const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));p.position.set(...pos);p.lookAt(...look);room.add(p);};
 addPanel(5,3,'#ffffff',[-3,4,4],[0,1,0]);addPanel(2,4,'#ffe1ab',[4,2,3],[0,1,0]);addPanel(3,3,'#d8d4ff',[0,4,-3],[0,1,0]);
 const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(room,.02,.1,30);pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return target;
}
export function disposeOwned(root){
 const owned=new Set();root.traverse(o=>{if(o.geometry)owned.add(o.geometry);for(const material of [o.material].flat().filter(Boolean)){if(sharedResources.has(material))continue;owned.add(material);for(const value of Object.values(material))if(value?.isTexture)owned.add(value);}if(o.shadow)o.shadow.dispose();});
 for(const resource of owned)if(!sharedResources.has(resource))resource.dispose();
}
