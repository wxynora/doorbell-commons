import * as THREE from 'three';
import {paint,piece,lathe,cyl,ring,ball,pipe,block,extrude,roundRect} from './model-kit-v4.mjs';
import {candyOutline as candyShape,addMoldDetails,candyBevel} from './mold-models.mjs';
import {createSweet} from './candy-models-v2.mjs';
export {makePot,makeSpoon,makePitcher} from './workshop-cookware.mjs';
import {mergeStaticMeshes} from './mesh-batching.mjs';
function offsetContour(points, distance) {
 const clockwise=THREE.ShapeUtils.isClockWise(points),direction=clockwise?-1:1;
 return points.map((p,i)=>{
  const before=p.clone().sub(points[(i+points.length-1)%points.length]).normalize();
  const after=points[(i+1)%points.length].clone().sub(p).normalize();
  const a=new THREE.Vector2(before.y,-before.x).multiplyScalar(direction);
  const b=new THREE.Vector2(after.y,-after.x).multiplyScalar(direction);
  const normal=a.clone().add(b).normalize();
  return p.clone().addScaledVector(normal,distance/Math.max(.45,normal.dot(b)));
 });
}
function wellWall(layers,material){
 const count=layers[0].points.length,positions=[],uvs=[],indices=[];
 for(let layer=0;layer<layers.length;layer++)for(let i=0;i<=count;i++){
  const p=layers[layer].points[i%count];positions.push(p.x,layers[layer].y,-p.y);uvs.push(i/count,layer/(layers.length-1));
  if(layer<layers.length-1&&i<count){const a=layer*(count+1)+i,b=a+count+1;indices.push(a,a+1,b,a+1,b+1,b);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 return piece(geometry,material);
}
export function makeMold(shape,color){
 const root=new THREE.Group(),top=roundRect(3.08,3.76,.2),candies=[],centers=[];
 const silicone=new THREE.MeshStandardMaterial({color:'#b6a0bd',roughness:.82,metalness:0});
 const well=silicone.clone();well.color.set('#9984a3');well.side=THREE.DoubleSide;
 const raised=silicone.clone();raised.color.set('#bca7c3');const engraving=well.clone();engraving.color.set('#665571');
 const sample=candyShape(shape,.42).getPoints(24),points=sample.filter((p,i)=>!i||p.distanceToSquared(sample[i-1])>1e-10);
 if(points[0].distanceToSquared(points.at(-1))<1e-10)points.pop();
 const bounds=new THREE.Box2().setFromPoints(points),center=bounds.getCenter(new THREE.Vector2()),size=bounds.getSize(new THREE.Vector2());
 // Include the candy's rounded bevel when fitting every silhouette to its cell.
 const bevel=.42*candyBevel(shape),fit=Math.min(1.12/(size.x+bevel*2),1.00/(size.y+bevel*2));
 const contour=points.map(p=>p.clone().sub(center).multiplyScalar(fit));
 const rim=offsetContour(contour,bevel*fit+.04),lip=offsetContour(contour,bevel*fit+.022),bottom=offsetContour(contour,bevel*fit*.72);
 const candyTemplate=createSweet(shape,color,.42),candyBounds=new THREE.Box3().setFromObject(candyTemplate);
 const impressionTemplate=new THREE.Group();addMoldDetails(impressionTemplate,shape,.42,.01,'#a995b9');
 for(let i=0;i<6;i++){
  const x=(i%2-.5)*1.43,z=(Math.floor(i/2)-1)*1.18;
  top.holes.push(new THREE.Path(rim.map(p=>new THREE.Vector2(p.x+x,p.y-z))));
  centers.push(new THREE.Vector3(x,.29,z));
  const wall=wellWall([{points:rim,y:.32},{points:offsetContour(contour,bevel*fit+.032),y:.318},{points:lip,y:.31},{points:offsetContour(contour,bevel*fit+.016),y:.298},{points:offsetContour(contour,bevel*fit+.014),y:.285},{points:bottom,y:.09},{points:offsetContour(contour,bevel*fit*.64),y:.073}],well);wall.position.set(x,0,z);root.add(wall);
  const floor=piece(new THREE.ShapeGeometry(new THREE.Shape(bottom),24),well,[x,.073,z]);floor.rotation.x=-Math.PI/2;root.add(floor);
  const impressions=impressionTemplate.clone(true);
  if(shape==='ghost'){
   for(const side of[-1,1])impressions.add(ball(.03,raised,[side*.097,.105,.01],[1,1.3,.3]));
   impressions.add(pipe([[-.04,.02,.01],[0,-.01,.01],[.04,.02,.01]],.008,raised,16));
  }
  if(shape==='pumpkin')for(const side of[-1,0,1])impressions.add(pipe([[side*.13,-.25,.01],[side*.19,.02,.01],[side*.13,.25,.01]],.008,raised,24));
  impressions.traverse(part=>{if(part.isMesh)part.material=part.material.color?.getHexString()==='473140'?engraving:raised;});impressions.scale.set(fit,fit,.6);impressions.rotation.x=-Math.PI/2;impressions.position.set(x-center.x*fit,.076,z+center.y*fit);root.add(impressions);
  const candy=i===0?candyTemplate:candyTemplate.clone(true);candy.rotation.x=-Math.PI/2;candy.scale.set(fit,fit,.8);candy.position.set(x-center.x*fit,.12,z+center.y*fit);candy.userData.moldFit={fit,center:[center.x,center.y],x,z,minDepth:candyBounds.min.z,depth:candyBounds.max.z-candyBounds.min.z};candy.visible=false;root.add(candy);candies.push(candy);
 }
 const geo=new THREE.ExtrudeGeometry(top,{depth:.075,steps:1,bevelEnabled:true,bevelSegments:3,bevelSize:.012,bevelThickness:.012,curveSegments:24});geo.translate(0,0,-.0375);
 const slab=piece(geo,silicone,[0,.2705,0]);slab.rotation.x=-Math.PI/2;root.add(slab);
 const edge=roundRect(3.08,3.76,.2).getPoints(48);edge.pop();root.add(wellWall([{points:edge,y:.308},{points:edge,y:.044}],silicone));
 const base=extrude(roundRect(3.11,3.79,.21),.075,silicone,[0,.025,0],.018);base.rotation.x=-Math.PI/2;root.add(base);
 for(const dir of[-1,1]){
  const tab=extrude(roundRect(.3,.76,.1),.075,silicone,[dir*1.66,.18,0],.018);tab.rotation.x=-Math.PI/2;root.add(tab);
  for(let i=0;i<4;i++)root.add(pipe([[dir*1.58,.226,-.22+i*.14],[dir*1.73,.226,-.22+i*.14]],.009,raised,8));
 }
 mergeStaticMeshes(root,new Set(candies));
 return{root,candies,centers};
}

export function makeDesk(){
 const g=new THREE.Group(),data=new Uint8Array(256*256*4);let seed=82;for(let y=0;y<256;y++)for(let x=0;x<256;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=Math.sin(x*.18+Math.sin(y*.009)*.7)*.018+Math.sin(x*.76)*.007+(seed/4294967296-.5)*.025;const i=(y*256+x)*4;data[i]=106*(1+n);data[i+1]=68*(1+n);data[i+2]=44*(1+n);data[i+3]=255;}
 const map=new THREE.DataTexture(data,256,256);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(5,2);map.needsUpdate=true;
 const wood=new THREE.MeshStandardMaterial({map,roughness:.53});g.add(block(18,.18,18,wood,[0,-.11,0],.06));
 for(let i=-4;i<5;i++)g.add(block(.012,.005,18,paint('#6b3b22','wood'),[i*1.55,-.01,0],.002));
 const cloth=block(2.3,.025,2.5,paint('#60406f','cloth'),[2.65,0,-2.1],.1);g.add(cloth);
 const dish=lathe([[0,0],[.2,0],[.36,.08],[.43,.24],[.4,.26],[.31,.12],[0,.06]],paint('#a26737','wood'),[-2.2,0,-1.6]);g.add(dish);
 for(let i=0;i<4;i++){const c=createSweet('star','amber',.12);c.rotation.x=-Math.PI/2;c.position.set(-2.2+Math.sin(i*2.4)*.2,.2,-1.6+Math.cos(i*2.4)*.2);g.add(c);}return g;
}
