import * as THREE from 'three';
import {remainingPantryObject} from './pantry-remaining-models.mjs';
import {specialPantryObject} from './pantry-special-models.mjs';
import {detailPantryMaterial} from './pantry-surfaces.mjs';
import {piece,lathe,ring,pipe,block,petal,ball} from './model-kit-v4.mjs';
const palette=new Map();
function material(color,surface='food'){
 const key=color+surface;if(palette.has(key))return palette.get(key);
 const m=surface==='glass'?new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.17,depthWrite:false,roughness:.08,ior:1.46,clearcoat:.35,envMapIntensity:.65}):new THREE.MeshStandardMaterial({color,roughness:{paper:.93,food:.82,fruit:.66,wood:.88,metal:.4,cream:.88}[surface]??.8,metalness:surface==='metal'?.55:0});
 m.userData.pantrySurface=surface;if(surface!=='glass')detailPantryMaterial(m,surface);palette.set(key,m);return m;
}
function smoothLathe(points,m,at=[0,0,0],segments=24){
 const curve=new THREE.SplineCurve(points.map(([x,y])=>new THREE.Vector2(x,y)));
 return lathe(curve.getPoints(18).map(p=>[Math.max(0,p.x),p.y]),m,at,segments);
}
function meshSurface(rows,cols,point,m){
 const p=[],uv=[],indices=[];for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){p.push(...point(x/cols,y/rows));uv.push(x/cols,y/rows);}
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*(cols+1)+x;indices.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return piece(geo,m);
}
function labelMaterial(name,base,ink,emblem){
 const mat=material(base,'paper').clone();mat.userData.pantrySurface='paper';
 if(typeof document==='undefined')return mat;
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=512;const c=canvas.getContext('2d');
 c.fillStyle=base;c.fillRect(0,0,384,512);c.fillStyle=ink;c.globalAlpha=.10;
 for(let i=0;i<900;i++)c.fillRect((i*107)%384,(i*173)%512,1,1);c.globalAlpha=1;
 c.strokeStyle=ink;c.lineWidth=3;c.strokeRect(25,35,334,442);c.lineWidth=1;c.strokeRect(32,42,320,428);
 c.fillStyle=ink;c.font='600 48px "Songti SC",serif';c.textAlign='center';c.fillText(name,192,405);c.lineWidth=5;
 c.save();c.translate(192,205);c.beginPath();
 if(emblem==='star'){for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?38:82;i?c.lineTo(Math.cos(a)*r,Math.sin(a)*r):c.moveTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.stroke();}
 else if(emblem==='salt'){c.moveTo(0,-83);c.lineTo(56,-12);c.lineTo(31,69);c.lineTo(-40,61);c.lineTo(-60,-12);c.closePath();c.stroke();c.moveTo(0,-83);c.lineTo(-5,1);c.lineTo(31,69);c.moveTo(-60,-12);c.lineTo(-5,1);c.lineTo(56,-12);c.stroke();}
 else if(emblem==='seed'){for(let i=0;i<3;i++){c.save();c.translate((i-1)*60,i===1?-25:10);c.rotate((i-1)*.35);c.beginPath();c.ellipse(0,0,24,55,0,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(0,0,16,43,0,0,Math.PI*2);c.stroke();c.restore();}}
 else if(emblem==='honey'){for(let i=0;i<6;i++){const a=i*Math.PI/3;i?c.lineTo(Math.cos(a)*65,Math.sin(a)*65):c.moveTo(65,0);}c.closePath();c.stroke();}
 else{for(let i=0;i<4;i++){c.save();c.rotate(i*Math.PI/2);c.beginPath();c.ellipse(0,-35,23,43,0,0,Math.PI*2);c.stroke();c.restore();}}
 c.restore();const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;mat.map=tex;mat.color.set('#ffffff');return mat;
}
function packet(name,color,ink,emblem){
 const g=new THREE.Group(),h=.92,w=.63;
 // A filled paper pouch with pinched/crimped ends and rounded gussets.
 const body=meshSurface(22,32,(u,v)=>{const a=u*Math.PI*2,bulge=Math.sin(Math.PI*v)**.45,edge=.64+.36*bulge;
  const folds=.010*Math.sin(a*6+v*3)*Math.sin(Math.PI*v)+.006*Math.cos(a*14)*Math.exp(-v*7);
  return [Math.cos(a)*w*.5*edge, v*h, Math.sin(a)*(.035+.115*bulge)+folds];},material(color,'paper'));
 g.add(body);
 for(const y of[.015,h-.015])g.add(block(w*.65,.03,.055,material(ink,'paper'),[0,y,0],.006));
 const tag=meshSurface(12,16,(u,v)=>{const x=(u-.5)*.45,y=.14+v*.65,z=.163-.045*(x/.225)**2+.004*Math.sin(v*Math.PI*2);return[x,y,z];},labelMaterial(name,'#f9edd2',ink,emblem));
 // Surface grid winds towards -Z by default; the label faces the viewer.
 tag.material.side=THREE.DoubleSide;g.add(tag);return g;
}
function jar(name){
 const sugar=name==='砂糖',milk=name==='牛奶',queen=name==='幽灵蜂后蜜',flower=name==='桂花蜜';const g=new THREE.Group();
 const r=milk?.22:sugar?.34:queen?.31:flower?.40:.33,h=milk?1.02:flower?.66:.85;
 const body=smoothLathe([[0,.03],[r*.77,.03],[r,.10],[r*1.04,.25],[r,.59*h/.85],[r*.80,.73*h/.85],[r*.77,.80*h/.85]],material('#edf6eb','glass'));
 g.add(body,ring(r*.78,.018,material('#d1e0d5','glass'),[0,h-.045,0]));
 const contents=sugar?'#f5e7ce':milk?'#fff1dc':queen?'#bc9157':flower?'#e7b64d':'#dca63f';
 g.add(smoothLathe([[0,.07],[r*.73,.07],[r*.91,.13],[r*.94,.30],[r*.91,h*.68],[0,h*.69]],material(contents,sugar?'food':milk?'cream':'fruit')));
 const lid=material(milk?'#9fb9b5':sugar?'#8bafa6':queen?'#a686ae':flower?'#6b9982':'#be9956',milk?'paper':sugar?'wood':'metal');
 g.add(smoothLathe([[0,0],[r*.77,0],[r*.85,.025],[r*.85,.075],[r*.77,.10],[0,.10]],lid,[0,h-.035,0]));
 if(!milk){for(let i=0;i<12;i++){const a=i*Math.PI/6;g.add(pipe([[Math.sin(a)*r*.85,h-.004,Math.cos(a)*r*.85],[Math.sin(a)*r*.85,h+.034,Math.cos(a)*r*.85]],.0025,lid,2));}}
 const label=meshSurface(12,20,(u,v)=>{const a=(u-.5)*1.18;return[Math.sin(a)*(r*1.045),(flower?.12:.18)+v*(milk?.46:flower?.32:.38),Math.cos(a)*(r*1.045)];},labelMaterial(sugar?'砂糖':milk?'鲜奶':queen?'蜂后蜜':flower?'桂花蜜':'蜂蜜',flower?'#dce9d4':'#f7ecd5',queen?'#785779':milk||flower?'#587f79':'#8a6941',sugar?'star':milk||flower?'flower':'honey'));
 label.material.side=THREE.DoubleSide;g.add(label);return g;
}
function softBlock(name){
 const butter=name==='黄油',brown=name==='红糖',g=new THREE.Group(),m=material(butter?'#f0d48a':brown?'#ac794c':'#f5e6d9');
 const o=block(butter?.84:brown?.61:.66,butter?.44:brown?.55:.5,butter?.33:brown?.38:.30,m,[0,.36,0],butter?.055:brown?.026:.13),pos=o.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);const irregular=brown?.008:butter?.003:.009;
  pos.setXYZ(i,x+Math.sin(y*19+z*13)*irregular,y+Math.sin(x*21+z*17)*irregular,z+Math.sin(x*18+y*12)*irregular);}
 o.geometry.computeVertexNormals();g.add(o);
 if(butter){const band=block(.22,.455,.35,material('#c1d6bd','paper'),[0,.36,0],.024);g.add(band);}
 if(brown){const crumb=material('#ce9e69');for(let i=0;i<32;i++){const x=Math.sin(i*2.4)*.25,y=.12+(i/32)*.46;g.add(piece(new THREE.IcosahedronGeometry(.006+(i%3)*.002,0),crumb,[x,y,.199]));}}
return g;
}
function fruit(name){
 const apple=name==='苹果',berry=name==='夜影莓',cranberry=name==='蔓越莓',yam=name==='紫薯',chestnut=name==='栗子';
 const kind=apple?'apple':berry?'berry':cranberry?'cranberry':yam?'yam':'chestnut',g=new THREE.Group();
 const skin=new THREE.MeshStandardMaterial({color:'#ffffff'});skin.userData.pantrySurface='fruit';detailPantryMaterial(skin,kind);
 const fruitMesh=meshSurface(24,32,(u,v)=>{
  const theta=v*Math.PI,a=u*Math.PI*2,s=Math.sin(theta),c=Math.cos(theta);
  if(yam){
   // A crooked tapered root, with unequal shoulders, growth ridges and pointed ends.
   const t=.12+.88*v,r=.32*Math.sin(Math.PI*t)**.55*(1+.19*Math.cos(t*Math.PI));
   const ridges=1+.045*Math.cos(a*3+v*2)+.025*Math.sin(a*7-v*6);
   const bend=.035*Math.sin(v*Math.PI*2-.5)+.045*v;
   return[-.49+1.13*v,.39+bend+r*Math.cos(a)*ridges*.87,.035*Math.sin(v*Math.PI)+r*Math.sin(a)*ridges];
  }
  const lobes=1+(apple?.032:.018)*Math.cos(a*(apple?5:3)+theta*2);
  let x=.40*s*Math.cos(a)*lobes,z=.34*s*Math.sin(a)*lobes,y=.39*c;
  if(apple){y-=.12*Math.exp(-theta*theta*10);y+=.045*Math.exp(-((theta-Math.PI)**2)*7);}
  if(cranberry){
   const shoulder=1+.065*c-.025*c*c;x*=.92*shoulder;y*=.96;z*=.94*shoulder;
   x+=.018*s*c; y-=.036*Math.exp(-theta*theta*18);

  }
  if(berry){y*=.83;y-=.055*Math.exp(-theta*theta*18);}
  if(chestnut){const taper=1-.24*Math.max(c,0);x*=taper;z*=taper;y+=.09*Math.max(c,0)**5;}
  return[x,y+.43,z];
 },skin);if(cranberry)fruitMesh.rotation.x=1.0;g.add(fruitMesh);
 const indices=fruitMesh.geometry.index.array;for(let i=0;i<indices.length;i+=3){const t=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=t;}fruitMesh.geometry.computeVertexNormals();
 if(apple){g.add(pipe([[0,.70,0],[.024,.82,-.015],[.08,.86,0]],.021,material('#796347','wood'),10));const leaf=petal(.29,.09,'#8ba667');leaf.position.set(.045,.79,0);leaf.rotation.z=-1;g.add(leaf);}
 if(berry){for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const l=meshSurface(3,3,(u,v)=>{const r=.02+v*.085,w=(u-.5)*.05*(1-v);return[Math.cos(a)*r-Math.sin(a)*w,.725-.018*v,Math.sin(a)*r+Math.cos(a)*w];},material('#455171','wood'));l.material.side=THREE.DoubleSide;g.add(l);}}

 if(yam){
  const root=material('#8f5c50','wood');
  const cutMaterial=new THREE.MeshStandardMaterial({color:'#a275b7',roughness:.85});cutMaterial.userData.pantrySurface='food';detailPantryMaterial(cutMaterial,'food');
  const cap=meshSurface(10,32,(u,v)=>{const a=u*Math.PI*2,t=.12,r=.32*Math.sin(Math.PI*t)**.55*(1+.19*Math.cos(t*Math.PI)),ridge=1+.045*Math.cos(a*3)+.025*Math.sin(a*7);return[-.4905,.39+.035*Math.sin(-.5)+r*Math.cos(a)*ridge*.87*v,r*Math.sin(a)*ridge*v];},cutMaterial);
  const ci=cap.geometry.index.array;for(let j=0;j<ci.length;j+=3){const n=ci[j+1];ci[j+1]=ci[j+2];ci[j+2]=n;}cap.geometry.computeVertexNormals();g.add(cap);
  g.rotation.y=.58;
  g.add(pipe([[.635,.414,0],[.66,.414,-.008],[.675,.403,-.01]],.0055,root,8));
 }
 return g;
}
function corn(){
 const g=new THREE.Group(),m=material('#eacb70','food');
 g.add(smoothLathe([[0,.02],[.085,.06],[.14,.22],[.14,.68],[.09,.9],[0,.98]],material('#d1bb7d')));
 for(let row=0;row<10;row++)for(let col=0;col<10;col++){const a=col*Math.PI/5,y=.10+row*.081,r=.13*(1-Math.max(0,row-6)*.09);
  const kernel=piece(new THREE.SphereGeometry(.055,8,6),m,[Math.sin(a)*r,y,Math.cos(a)*r],[.88,.78,.63]);kernel.rotation.y=a;g.add(kernel);}
 const leaf=petal(.54,.09,'#9ba96b');leaf.position.set(-.09,.035,.06);leaf.rotation.z=.12;g.add(leaf);return g;
}
function pumpkinPuree(){
 const g=new THREE.Group();
 const bowl=new THREE.MeshStandardMaterial({color:'#e6d1a6',roughness:.52,metalness:0});
 bowl.userData.pantrySurface='ceramic';bowl.userData.pantryDetailed=true;
 g.add(smoothLathe([[0,.025],[.26,.025],[.32,.065],[.39,.15],[.455,.27],[.47,.305],[.46,.326],[.438,.321],[.424,.28],[.36,.13],[.28,.08],[0,.08]],bowl));
 const puree=new THREE.MeshStandardMaterial({color:'#dd7b20',roughness:.76});puree.userData.pantrySurface='cream';detailPantryMaterial(puree,'cream');
 // A single gently mounded spoon-smoothed surface; no stacked coils or pointed peak.
 const surface=meshSurface(22,36,(u,v)=>{const a=u*Math.PI*2,r=v*.432;
  const x=r*Math.cos(a),z=r*Math.sin(a);
  const sweep=.010*Math.exp(-(((z-.035-Math.sin(x*5)*.075)/.023)**2))+.008*Math.exp(-(((z+.13-Math.sin(x*4)*.05)/.027)**2));
  const pulp=.003*Math.sin(x*61+z*27)*Math.sin(z*47+x*19);
  return[x,.28+(.12*(1-v*v)-sweep+pulp)*(1-v*v),z];},puree);
 // Disc parameterization winds downwards.
 const indices=surface.geometry.index.array;for(let j=0;j<indices.length;j+=3){const t=indices[j+1];indices[j+1]=indices[j+2];indices[j+2]=t;}surface.geometry.computeVertexNormals();g.add(surface);
 // Tilt the shallow dish towards the matching game's shared camera.
 g.rotation.x=.70;const root=new THREE.Group();root.add(g);return root;
}

const names=new Set(['南瓜泥','砂糖','蜂蜜','牛奶','桂花蜜','幽灵蜂后蜜','星屑糖粉','幽光岩盐','金南瓜籽','红糖','黄油','蛛丝棉花糖','苹果','夜影莓','蔓越莓','紫薯','栗子','玉米粒']);
export function sculptPantryObject(name){
 const special=specialPantryObject(name)??remainingPantryObject(name);if(special)return special;
 if(!names.has(name))return null;
 if(name==='南瓜泥')return pumpkinPuree();
 if(['砂糖','蜂蜜','牛奶','桂花蜜','幽灵蜂后蜜'].includes(name))return jar(name);
 if(name==='星屑糖粉')return packet('星屑糖粉','#bfa4c4','#7b608b','star');
 if(name==='幽光岩盐')return packet('幽光岩盐','#a1bfb4','#507d7c','salt');
 if(name==='金南瓜籽')return packet('南瓜籽','#c8ad77','#8c7548','seed');
 if(['红糖','黄油','蛛丝棉花糖'].includes(name))return softBlock(name);
 if(name==='玉米粒')return corn();return fruit(name);
}
