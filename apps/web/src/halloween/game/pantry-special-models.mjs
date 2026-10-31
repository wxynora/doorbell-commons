import * as THREE from 'three';
import {piece,lathe,ring,pipe,roundRect} from './model-kit-v4.mjs';
import {detailPantryMaterial} from './pantry-surfaces.mjs';
const TAU=Math.PI*2,cache=new Map();
function finish(color,kind='food',options={}){
 const key=JSON.stringify([color,kind,options]);if(cache.has(key))return cache.get(key);
 const m=new THREE.MeshStandardMaterial({color,...options});m.userData.pantrySurface=kind;
 detailPantryMaterial(m,kind);Object.assign(m,options);cache.set(key,m);return m;
}
function packageBlock(w,h,d,m,at,r){
 const geo=new THREE.ExtrudeGeometry(roundRect(w,h,r),{depth:d,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:Math.min(.012,d*.2),bevelThickness:Math.min(.012,d*.2),curveSegments:5});geo.translate(0,0,-d/2);return piece(geo,m,at);
}
function clearGlass(){const key='glass';if(cache.has(key))return cache.get(key);const m=new THREE.MeshPhysicalMaterial({color:'#e2f0e8',roughness:.08,transparent:true,opacity:.23,depthWrite:false,ior:1.46,clearcoat:.65,envMapIntensity:1.1});m.userData.pantrySurface='glass';cache.set(key,m);return m;}
function surface(rows,cols,point,mat,reverse=false){const p=[],uv=[],ix=[];for(let v=0;v<=rows;v++)for(let u=0;u<=cols;u++){p.push(...point(u/cols,v/rows));uv.push(u/cols,v/rows);}for(let v=0;v<rows;v++)for(let u=0;u<cols;u++){const i=v*(cols+1)+u;ix.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2);}if(reverse)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();return piece(geo,mat);}
function label(text,ink,kind){
 const m=finish('#f9ecd2','paper').clone();m.side=THREE.DoubleSide;
 if(typeof document==='undefined')return m;
 const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#f9ecd2';ctx.fillRect(0,0,256,256);ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=3;ctx.strokeRect(12,12,232,232);ctx.lineWidth=1;ctx.strokeRect(18,18,220,220);
 ctx.save();ctx.translate(128,100);ctx.lineWidth=5;
 if(kind==='moon'){
  ctx.beginPath();ctx.arc(0,-8,46,0,TAU);ctx.fill();ctx.fillStyle='#f9ecd2';ctx.beginPath();ctx.arc(20,-23,40,0,TAU);ctx.fill();
 }else if(kind==='ghost'){
  ctx.beginPath();ctx.moveTo(-42,39);ctx.lineTo(-42,-12);ctx.bezierCurveTo(-42,-73,42,-73,42,-12);ctx.lineTo(42,39);ctx.lineTo(21,26);ctx.lineTo(0,39);ctx.lineTo(-21,26);ctx.closePath();ctx.stroke();for(const x of[-13,13]){ctx.beginPath();ctx.ellipse(x,-12,5,8,0,0,TAU);ctx.fill();}
 }else if(kind==='skull'){
  ctx.beginPath();ctx.ellipse(0,-10,42,40,0,0,TAU);ctx.stroke();ctx.strokeRect(-21,23,42,19);for(const x of[-16,16]){ctx.beginPath();ctx.arc(x,-10,9,0,TAU);ctx.fill();}
 }else if(kind==='maple'){
  ctx.beginPath();for(const [x,y] of [[0,-65],[14,-25],[43,-42],[33,-8],[62,4],[22,24],[7,25],[3,57],[-3,57],[-7,25],[-22,24],[-62,4],[-33,-8],[-43,-42],[-14,-25]])ctx.lineTo(x,y);ctx.closePath();ctx.fill();
 }else if(kind==='cat'){
  ctx.beginPath();ctx.moveTo(-42,-18);ctx.lineTo(-42,-61);ctx.lineTo(-13,-36);ctx.quadraticCurveTo(0,-42,13,-36);ctx.lineTo(42,-61);ctx.lineTo(42,-18);ctx.bezierCurveTo(55,45,-55,45,-42,-18);ctx.fill();
  ctx.fillStyle='#f9ecd2';for(const x of[-17,17]){ctx.beginPath();ctx.ellipse(x,-5,5,8,0,0,TAU);ctx.fill();}
 }else if(kind==='flower'){
  for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*TAU/5);ctx.beginPath();ctx.ellipse(0,-25,14,28,0,0,TAU);ctx.stroke();ctx.restore();}ctx.beginPath();ctx.arc(0,0,9,0,TAU);ctx.fill();
 }else if(kind==='caramel'){
  ctx.fillStyle='#d79b54';ctx.fillRect(-47,-31,72,59);ctx.fillStyle='#a76a36';ctx.beginPath();ctx.moveTo(25,-31);ctx.lineTo(47,-49);ctx.lineTo(47,10);ctx.lineTo(25,28);ctx.fill();ctx.fillStyle='#edbf7b';ctx.beginPath();ctx.moveTo(-47,-31);ctx.lineTo(-25,-49);ctx.lineTo(47,-49);ctx.lineTo(25,-31);ctx.fill();
 }else{
  for(let i=0;i<3;i++){ctx.strokeStyle=['#629da3','#8e87b9','#c7ac73'][i];ctx.beginPath();ctx.moveTo(-64,-25+i*23);ctx.bezierCurveTo(-20,-65+i*23,23,25+i*23,64,-18+i*23);ctx.stroke();}
 }
 ctx.restore();ctx.fillStyle=ink;ctx.textAlign='center';ctx.font='600 32px "Songti SC",serif';ctx.fillText(text,128,202);
 m.color.set('#ffffff');m.map=new THREE.CanvasTexture(c);m.map.colorSpace=THREE.SRGBColorSpace;return m;
}
function syrup(night){
 const g=new THREE.Group(),glass=clearGlass(),r=night?.37:.255,h=night?.78:1.08;
 const profile=night?[[0,.035],[.28,.035],[.36,.09],[.37,.19],[.37,.52],[.32,.61],[.3,.67],[.3,.72],[.28,.72],[.28,.65],[.31,.59],[.346,.51],[.346,.15],[.27,.07],[0,.07]]:[[0,.025],[.18,.025],[.25,.07],[.26,.2],[.26,.68],[.23,.77],[.12,.86],[.115,1.02],[.094,1.02],[.094,.85],[.207,.75],[.236,.67],[.236,.12],[.18,.055],[0,.055]];
 g.add(lathe(profile,glass,[0,0,0],night?12:32));
 const liquid=new THREE.MeshStandardMaterial({color:night?'#a46a4b':'#86c9bb',roughness:.24,metalness:0});liquid.userData.pantrySurface='liquid';liquid.userData.pantryDetailed=true;
 if(!night){const data=new Uint8Array(8*64*4),a=new THREE.Color('#77b9b0'),b=new THREE.Color('#b4a0ce');for(let y=0;y<64;y++)for(let x=0;x<8;x++){const c=a.clone().lerp(b,(y/63)*.65).convertLinearToSRGB(),i=(y*8+x)*4;data[i]=c.r*255;data[i+1]=c.g*255;data[i+2]=c.b*255;data[i+3]=255;}const t=new THREE.DataTexture(data,8,64);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;t.magFilter=THREE.LinearFilter;liquid.map=t;liquid.color.set('#ffffff');}
 g.add(lathe(night?[[0,.08],[.27,.08],[.337,.14],[.337,.51],[.32,.55],[0,.55]]:[[0,.065],[.18,.065],[.231,.12],[.231,.65],[.22,.70],[0,.70]],liquid,[0,0,0],night?12:32));
 const lid=finish(night?'#79546c':'#b78e63',night?'metal':'wood',{metalness:night?.32:0});
 g.add(lathe(night?[[0,.70],[.305,.70],[.317,.725],[.317,.775],[.29,.795],[0,.795]]:[[0,1.005],[.12,1.005],[.13,1.04],[.125,1.10],[0,1.10]],lid,[0,0,0],32));
 if(night)g.add(ring(.306,.009,finish('#b9a06b','metal',{metalness:.45}),[0,.725,0]));
 const tag=surface(10,18,(u,v)=>{const a=(u-.5)*(night?1.16:1.36);return[Math.sin(a)*(r+.003),.18+v*(night?.29:.36),Math.cos(a)*(r+.003)];},label(night?'永夜花蜜':'极光糖浆',night?'#78516d':'#517f85',night?'flower':'aurora'));g.add(tag);
 return g;
}
function creamCup(){
 const g=new THREE.Group(),paper=finish('#e8e1c5','paper'),foil=finish('#98b4a8','metal',{metalness:.35});
 g.add(lathe([[0,.03],[.29,.03],[.30,.075],[.355,.48],[.36,.50],[0,.50]],paper,[0,0,0],40));
 g.add(lathe([[0,.5],[.362,.5],[.373,.515],[.369,.535],[0,.535]],foil,[0,0,0],40));
 const tag=surface(10,20,(u,v)=>{const y=.10+v*.32,r=.303+(y-.075)*.135,a=(u-.5)*1.55;return[Math.sin(a)*r,y,Math.cos(a)*r+.002];},label('私藏奶油','#42434b','cat'));g.add(tag);
 const tab=packageBlock(.115,.05,.055,foil,[.34,.514,.055],.02);tab.rotation.z=-.12;g.add(tab);return g;
}
function caramelTin(){
 const g=new THREE.Group(),base=finish('#9c6a7f','metal',{metalness:.22}),edge=finish('#c6a16b','metal',{metalness:.42});
 g.add(packageBlock(.79,.66,.25,base,[0,.36,0],.11),packageBlock(.81,.68,.045,edge,[0,.36,.13],.12),packageBlock(.78,.65,.055,base,[0,.36,.153],.11));
 const l=piece(new THREE.PlaneGeometry(.57,.49),label('秘制焦糖','#765047','caramel'),[0,.36,.199]);g.add(l);return g;
}
function pomegranate(){
 const g=new THREE.Group(),skin=finish('#ffffff','pomegranate');skin.userData.pantrySurface='fruit';
 g.add(surface(24,40,(u,v)=>{const a=u*TAU,t=v*Math.PI,s=Math.sin(t),lobes=1+.055*Math.cos(a*6);const x=.395*s*Math.cos(a)*lobes,y=.4+.365*Math.cos(t),z=.33*s*Math.sin(a)*lobes;return[x,y,Math.min(z,.16)];},skin,true));
 // The opened front belongs inside the red rind, with cream membranes between arils.
 const flesh=finish('#eacb9d','food');
 const face=surface(10,40,(u,v)=>{const a=u*TAU,r=v*.348*(1+.035*Math.cos(a*6));return[Math.cos(a)*r,.4+Math.sin(a)*r*.91,.164+.013*(1-v*v)];},flesh);g.add(face);
 const seedMats=['#b71d46','#d03250','#9d193f'].map(c=>finish(c,'fruit',{roughness:.39}));
 const seedGeo=new THREE.SphereGeometry(1,10,7);const pos=seedGeo.attributes.position;
 for(let i=0;i<pos.count;i++){const y=pos.getY(i);pos.setX(i,pos.getX(i)*(1-.22*Math.max(y,0)));}seedGeo.computeVertexNormals();
 // Close-packed arils with narrow radial membrane gaps, rather than five berry clumps.
 for(let row=-4;row<=4;row++)for(let col=-4;col<=4;col++){
  const x=col*.069+(Math.abs(row)%2)*.0345,y=row*.065,r=Math.hypot(x,y);if(r>.304)continue;
  const angle=Math.atan2(y,x),membrane=Math.abs(Math.atan2(Math.sin((angle-.95)*5),Math.cos((angle-.95)*5)))/5;
  if(r>.075&&membrane*r<.013)continue;
  const k=(row+4)*9+col+4,seed=piece(seedGeo,seedMats[k%3],[x,.4+y,.195],[.032,.039,.026]);seed.rotation.z=angle+.15*Math.sin(k);g.add(seed);
 }
 const calyx=finish('#975342','wood',{side:THREE.DoubleSide});g.add(lathe([[.06,.72],[.085,.77],[.09,.80],[.07,.82]],calyx,[0,0,0],20));
 // Six pointed, curved dry sepals form a hollow crown; no apple stalk or leaf.
 for(let i=0;i<6;i++){const a=i*TAU/6;g.add(surface(6,6,(u,v)=>{const w=(u-.5)*.10*(1-v),r=.078+v*.05;return[Math.sin(a)*r+Math.cos(a)*w,.78+v*.135,Math.cos(a)*r-Math.sin(a)*w];},calyx));}
 return g;
}
function honeycombToffee(){
 const shape=new THREE.Shape(),points=[[-.39,-.26],[-.44,.04],[-.34,.31],[-.12,.35],[.08,.30],[.27,.34],[.40,.14],[.35,-.17],[.13,-.30],[-.12,-.27]];points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const holes=[];for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){const x=col*.14+(Math.abs(row)%2)*.07,y=row*.12;if(Math.abs(x)<.33&&Math.hypot(x,y)<.34)holes.push([x,y,.065]);}
 for(const[x,y,r]of holes){const hole=new THREE.Path();for(let i=0;i<6;i++){const a=-i*TAU/6;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?hole.lineTo(px,py):hole.moveTo(px,py);}hole.closePath();shape.holes.push(hole);}
 const g=new THREE.Group(),inside=finish('#d89c3c','food'),crust=finish('#b7803a','food');
 const porous=new THREE.ExtrudeGeometry(shape,{depth:.22,steps:1,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,curveSegments:5});porous.translate(0,0,-.11);g.add(piece(porous,inside,[0,.38,0]));
 for(const[x,y,r]of holes){const cell=new THREE.Shape();for(let i=0;i<6;i++){const a=i*TAU/6;i?cell.lineTo(Math.cos(a)*r,Math.sin(a)*r):cell.moveTo(r,0);}cell.closePath();g.add(piece(new THREE.ShapeGeometry(cell),finish('#a76a24','food'),[x,.38+y,-.085]));}
 const bottom=points.slice(0,3).map(([x,y])=>[x,.38+y,-.10]);g.add(pipe(bottom,.012,crust,10));return g;
}
function starCrystal(){
 const vertices=[0,.10,0],index=[],n=6;
 for(let ring=0;ring<2;ring++)for(let i=0;i<n;i++){
  const a=i*TAU/n+.17,r=(ring?.285:.25)*(1+.08*Math.sin(i*2.1));
  vertices.push(Math.cos(a)*r,(ring?.65:.12)+.025*Math.cos(i*1.8),Math.sin(a)*r*.85);
 }
 vertices.push(.045,.91,-.025);
 for(let i=0;i<n;i++){const j=(i+1)%n,b=1+i,bj=1+j,t=7+i,tj=7+j;index.push(0,b,bj,b,t,bj,bj,t,tj,t,13,tj);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(index);geo.computeVertexNormals();
 const mat=new THREE.MeshPhysicalMaterial({color:'#b7c7e6',roughness:.08,metalness:0,transparent:true,opacity:.66,depthWrite:false,clearcoat:1,envMapIntensity:1.5,ior:1.46,flatShading:true});mat.userData.pantrySurface='glass';
 const g=new THREE.Group(),crystal=piece(geo,mat);crystal.rotation.z=-.23;g.add(crystal);g.rotation.y=.28;return g;
}

export function specialPantryObject(name){
 if(name==='血月石榴')return pomegranate();
 if(name==='极光糖浆')return syrup(false);
 if(name==='永夜花蜜')return syrup(true);
 if(name==='黑猫私藏奶油')return creamCup();
 if(name==='魔女秘制焦糖')return caramelTin();
 if(name==='午夜蜂巢糖')return honeycombToffee();
 if(name==='星落糖晶')return starCrystal();
 return null;
}

export {finish,clearGlass,surface,label,packageBlock};
