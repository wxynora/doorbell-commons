import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {group,mesh,box,random,mat} from './fairytale-model-kit.mjs';
import {snowSurface} from './fairytale-snow-cover.mjs';

// Front +Z. Low house floor 1.72, offset ridge 5.68. All details share world coordinates.
const C={wood:'#a77750',edge:'#cfab7e',cream:'#fff0ce',pink:'#f0b8c8',leaf:'#85a453',gold:'#d2ae68'};
const pixels=new Uint8Array(32*32*4);
for(let y=0;y<32;y++)for(let x=0;x<32;x++){const d=Math.min(1,Math.hypot((x-15.5)/22,(y-17)/26)),i=(y*32+x)*4;pixels[i]=255;pixels[i+1]=Math.round(218-d*64);pixels[i+2]=Math.round(137-d*86);pixels[i+3]=255;}
const windowTexture=new T.DataTexture(pixels,32,32,T.RGBAFormat);windowTexture.colorSpace=T.SRGBColorSpace;windowTexture.needsUpdate=true;windowTexture.magFilter=T.LinearFilter;
const lampGlow=new T.MeshStandardMaterial({color:'#dec796',roughness:.6,emissive:'#ffb45c',emissiveMap:windowTexture,emissiveIntensity:0});
const glass=new T.MeshBasicMaterial({color:'#dfe5da',transparent:true,opacity:.16,depthWrite:false});
const roomFloor=new T.MeshStandardMaterial({color:'#a88c66',roughness:1});
const petals=['#e8bfca','#eed9c6','#dca3b3'];
// Tiny petals and leaves read as soft ellipsoids at farm scale with only eight faces.
const ballGeometry=new Map();
function ball(g,color,pos,size){
 const largest=Math.max(...size),detail=largest<=.32?'micro':largest<=.8?'low':'full';
 const segments=detail==='micro'?[4,2]:detail==='low'?[6,4]:[8,6],key=segments.join('x');
 if(!ballGeometry.has(key))ballGeometry.set(key,new T.SphereGeometry(1,...segments));
 return mesh(g,ballGeometry.get(key),color,pos,size);
}
function tube(g,color,points,radius=.04,requested=24){
 const vectors=points.map(p=>new T.Vector3(...p));let bend=0;
 for(let i=1;i<vectors.length-1;i++){
  const a=vectors[i].clone().sub(vectors[i-1]).normalize(),b=vectors[i+1].clone().sub(vectors[i]).normalize();
  bend+=Math.acos(T.MathUtils.clamp(a.dot(b),-1,1));
 }
 const segments=Math.max(1,Math.min(requested,points.length-1,Math.ceil(bend*2)));
 return mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(vectors),segments,radius,3,false),color);
}
function glow(g,geometry,pos){const m=mesh(g,geometry,lampGlow,pos);m.userData.windowGlow=true;m.castShadow=false;return m;}
function pane(g,geometry,pos){const m=mesh(g,geometry,glass,pos);m.userData.glassPane=true;m.castShadow=false;return m;}
function archShape(x,y,w,h){const r=w/2,s=new T.Shape();s.moveTo(x-r,y);s.lineTo(x+r,y);s.lineTo(x+r,y+h-r);s.absarc(x,y+h-r,r,0,Math.PI,false);s.closePath();return s;}
function hole(shape){return new T.Path(shape.getPoints(20));}
function railing(g,anchors){
 for(const [x,y,z] of anchors)tube(g,C.wood,[[x,y-.025,z],[x,y+.42,z]],.025,1);
 for(let i=1;i<anchors.length;i++)tube(g,C.wood,[anchors[i-1].map((v,j)=>v+(j===1?.42:0)),anchors[i].map((v,j)=>v+(j===1?.42:0))],.027,1);
}
export function setRoseTreehouseNight(h,night){
 h.traverse(o=>{if(o.userData.lanternSpill)o.userData.lanternSpill.value=night?1:0;if(o.userData.interiorLight)o.visible=night;if(o.userData.windowGlow)o.material.emissiveIntensity=night?1.8:0;});
}
function prism(g,points,depth,color,z){const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return mesh(g,new T.ExtrudeGeometry(s,{depth,bevelEnabled:false}),color,[0,0,z]);}
function blossom(g,pos,size=.12,color=petals[0],facing=[0,0,0]){
 const f=group(g,'blossom',pos);f.rotation.set(...facing);
 for(let k=0;k<5;k++){const a=k*Math.PI*2/5,p=petal(f,color,[Math.cos(a)*size*.56,Math.sin(a)*size*.56,0],[size*.49,size*.30,size*.18]);p.rotation.z=a;}
 const center=mesh(f,new T.CircleGeometry(size*.25,5),'#d7ad56',[0,0,.025]);center.material.side=T.DoubleSide;return f;
}
function petal(g,color,p,size){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-1,0,0,0,-1,.18,1,0,0,0,1,.18],3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const m=mesh(g,geo,color,p,size);m.material.side=T.DoubleSide;return m;}
function leaf(g,p,s,angle=0,color=C.leaf){const l=petal(g,color,p,[s*.45,s,s*.15]);l.rotation.set(-.25,0,angle);return l;}
function foliage(g,points,seed,density=10){
 const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),rng=random(seed);
 tube(g,'#71804b',points,.018,Math.max(10,points.length*5));const count=Math.ceil(curve.getLength()*density*1.3);
 for(let i=0;i<count;i++){
  const p=curve.getPoint(i/Math.max(1,count-1)),side=rng()>.5?1:-1;
  p.x+=side*(.035+rng()*.14);p.y+=(rng()-.5)*.17;p.z+=.03+rng()*.08;
  const l=leaf(g,p.toArray(),.045+rng()*.055,side*(.4+rng()*1.2),['#7e8a4c','#91a15c','#61713f'][i%3]);l.rotation.y=(rng()-.5)*1.4;
  if(i%8===2)blossom(g,[p.x,p.y,p.z+.03],.065+rng()*.03,petals[i%3]);
 }
}
function bush(g,p,r,seed,flowers=12){
 const rng=random(seed);
 for(let i=0;i<18;i++){const a=rng()*Math.PI*2,d=Math.sqrt(rng())*r;ball(g,['#728149','#879651','#a1ac66'][i%3],[p[0]+Math.cos(a)*d,p[1]+rng()*.16,p[2]+Math.sin(a)*d],[.16,.11,.14]);}
 for(let i=0;i<flowers;i++){const a=rng()*Math.PI*2,d=Math.sqrt(rng())*r*.85;blossom(g,[p[0]+Math.cos(a)*d,p[1]+.16+rng()*.15,p[2]+Math.sin(a)*d],.07+rng()*.045,petals[i%3],[-.5,0,rng()]);}
}
function branch(g,points,r0,r1,color=C.wood){
 const segments=Math.max(8,(points.length-1)*2),radial=5,curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),geo=new T.TubeGeometry(curve,segments,1,radial,false),p=geo.attributes.position;
 for(let i=0;i<=segments;i++){const c=curve.getPointAt(i/segments),r=r0+(r1-r0)*i/segments;for(let j=0;j<=radial;j++){const n=i*(radial+1)+j;p.setXYZ(n,c.x+(p.getX(n)-c.x)*r,c.y+(p.getY(n)-c.y)*r,c.z+(p.getZ(n)-c.z)*r);}}
 geo.computeVertexNormals();return mesh(g,geo,color);
}
function stairSlab(g,pos,width,depth,color,seed){
 const rng=random(seed),w=width/2,d=depth/2,s=new T.Shape();
 // Uneven ends and chipped corners, with a level, continuous walking surface.
 const points=[[-w+.035,-d],[-w*.15,-d-.008],[w-.045,-d+.012],[w,-d+.035],[w-.012,d-.025],[w-.055,d],[-w*.30,d+.008],[-w+.025,d-.008],[-w-.012,d-.05],[-w,-d+.04]];
 points.forEach(([x,z],i)=>{const zz=z+(rng()-.5)*.008;i?s.lineTo(x,-zz):s.moveTo(x,-zz);});s.closePath();
 const geo=new T.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1});geo.rotateX(-Math.PI/2);
 return mesh(g,geo,color,[pos[0],pos[1]-.128,pos[2]]);
}
function stairGreens(g,pos,seed,angle=0,length=.24){
 const b=group(g,'stair-edge-greens',pos);b.rotation.y=angle;const rng=random(seed);
 // Moss lives at the edge; little leaves spill over the riser, not across the tread.
 for(let i=0;i<9;i++){
  const x=(rng()-.5)*length,z=(rng()-.35)*.12;
  ball(b,['#687847','#819251','#98a363'][i%3],[x,.012,z],[.045+rng()*.025,.018+rng()*.012,.042+rng()*.02]);
 }
 for(let i=0;i<12;i++){
  const x=(rng()-.5)*length,z=(rng()-.2)*.15;
  const l=leaf(b,[x,.045+rng()*.035,z],.045+rng()*.035,(rng()-.5)*1.6,['#71864d','#96a966','#829653'][i%3]);l.rotation.x=1.0+rng()*.35;l.rotation.y=rng()*2;
 }
 // One attached trailing sprig hangs down the exposed face of each planted edge.
 const stem=[[-length*.20,.035,.06],[-length*.12,.005,.13],[length*.04,-.07,.16],[length*.16,-.15,.15]];
 tube(b,'#71804b',stem,.009,7);
 for(let i=0;i<6;i++){
  const t=i/5,side=i%2?1:-1;
  const l=leaf(b,[-length*.18+t*length*.33+side*.032,.035-t*.17,.11+t*.045],.045+(i%3)*.008,side*.8,i%2?'#8c9e5e':'#6c814a');l.rotation.x=.65;
 }
 if(seed%3===0)blossom(b,[-length*.15,.09,.035],.045,petals[1],[-.7,0,.2]);
}
function lantern(g,pos,size=1){
 const l=group(g,'hanging-lantern',pos);l.scale.setScalar(size);
 mesh(l,new T.CylinderGeometry(.18,.13,.07,6),C.gold,[0,0,0]);glow(l,new T.CylinderGeometry(.14,.11,.32,6),[0,.19,0]);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(l,C.gold,[[Math.cos(a)*.12,.03,Math.sin(a)*.12],[Math.cos(a)*.16,.36,Math.sin(a)*.16]],.018,1);}
 mesh(l,new T.ConeGeometry(.22,.18,6),C.gold,[0,.44,0]);tube(l,C.wood,[[0,.54,0],[0,.69,0],[.07,.75,0],[.15,.69,0],[.15,.60,0]],.022,12);return l;
}
function mushroomNightlights(g){
 const caps=lampGlow.clone();caps.name='mushroom-night-cap';caps.color.set('#c79598');
 const profile=[[0,0],[.5,-.025],[.92,0],[1,.08],[.96,.23],[.78,.48],[.4,.67],[0,.72]].map(p=>new T.Vector2(...p));
 for(const [x,z,r,h] of [[-.88,1.83,.24,.29],[-.57,2.03,.17,.20],[-1.12,2.10,.12,.14]]){
  const m=group(g,'mushroom-nightlight',[x,0,z]);
  mesh(m,new T.CylinderGeometry(r*.20,r*.28,h,8),'#dfcfb9',[0,h/2,0]);
  const cap=glow(m,new T.LatheGeometry(profile,16),[0,h-.01,0]);cap.scale.setScalar(r);cap.material=caps;
  for(let k=0;k<5;k++){
   const a=k*Math.PI*2/5,spot=ball(m,'#eedfd0',[Math.cos(a)*r*.55,h-.01+r*.595,Math.sin(a)*r*.55],[r*.13,r*.035,r*.10]);
   spot.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.cos(a)*.5,.85,Math.sin(a)*.5).normalize());
  }
  ball(m,'#eedfd0',[0,h-.01+r*.72,0],[r*.15,r*.025,r*.12]);
 }
}
function houseTrinkets(g){
 const details=group(g,'house-trinkets');
 // Fastened to the bay awning, above the window; these are bulbs, not extra point lights.
 const cable=new T.CatmullRomCurve3([[-.85,3.135,1.86],[-.28,3.045,1.88],[.40,3.10,1.88],[1.03,3.045,1.88],[1.65,3.135,1.86]].map(p=>new T.Vector3(...p)));
 mesh(details,new T.TubeGeometry(cable,28,.009,4,false),C.wood);
 for(const x of [-.85,.4,1.65])tube(details,C.gold,[[x,3.19,1.84],[x,3.10,1.88]],.012,1);
 for(let i=0;i<9;i++){
  const p=cable.getPointAt((i+.5)/9),drop=.035+(i%3)*.012;
  tube(details,C.wood,[p.toArray(),[p.x,p.y-drop,p.z]],.006,1);
  mesh(details,new T.CylinderGeometry(.025,.024,.035,6),C.gold,[p.x,p.y-drop-.012,p.z]);
  const bulb=glow(details,new T.SphereGeometry(.045,8,6),[p.x,p.y-drop-.060,p.z]);bulb.scale.y=1.15;
 }
 // A little brass chime hangs OUTSIDE the porch rail, never over the stair entrance.
 const chime=group(details,'porch-brass-chime',[-2.43,2.24,1.35]);
 tube(chime,C.gold,[[0,-.07,0],[-.10,.07,0],[-.22,.07,0],[-.24,-.01,0]],.016,8);
 tube(chime,C.wood,[[-.24,-.04,-.16],[-.24,-.04,.16]],.013,1);
 for(let i=-1;i<=1;i++){
  const z=i*.13,y=-.21-Math.abs(i)*.035;
  tube(chime,C.gold,[[-.24,-.04,z],[-.24,y+.09,z]],.004,1);
  const profile=[[.052,0],[.050,.014],[.032,.055],[.017,.085],[0,.09]].map(p=>new T.Vector2(...p));
  mesh(chime,new T.LatheGeometry(profile,10),C.gold,[-.24,y,z]);ball(chime,C.wood,[-.24,y-.009,z],[.013,.016,.013]);
 }
 // The sill top is y=2.15. Both pots rest on it, with real stems rather than floating flowers.
 for(const [x,height,color] of [[1.03,.18,'#d6c3a6'],[1.32,.13,'#bd8c96']]){
  const z=1.56,top=2.15+height;
  mesh(details,new T.CylinderGeometry(.095,.066,height,10),color,[x,2.15+height/2,z]);
  const rim=mesh(details,new T.TorusGeometry(.094,.015,4,12),color,[x,top,z]);rim.rotation.x=Math.PI/2;
  const soil=mesh(details,new T.CircleGeometry(.079,10),C.wood,[x,top+.002,z]);soil.rotation.x=-Math.PI/2;
  for(let i=0;i<3;i++){
   const a=i*2.4,fx=x+Math.cos(a)*.055,fz=z+Math.sin(a)*.05,fy=top+.10+(i%2)*.035;
   tube(details,C.leaf,[[x,top,z],[fx,fy,fz]],.006,2);leaf(details,[fx,fy-.05,fz],.042,a);
   blossom(details,[fx,fy,fz],.055,petals[i],[-.4,0,a]);
  }
 }
 // Two small lanterns hang from the solid deck underside, away from the walking route.
 for(const [x,z] of [[-.75,1.29],[1.23,1.15]]){
  lantern(details,[x,1.34,z],.34);
  tube(details,C.gold,[[x+.051,1.544,z],[x+.051,1.645,z]],.009,1);
 }
 mushroomNightlights(details);
}
function arch(g,pos,w,h){
 const q=group(g,'arched-window',pos),r=w*.5,s=archShape(0,0,w,h);
 pane(q,new T.ShapeGeometry(s,16),[0,0,.025]);const outline=[[-r,0,.055],[-r,h-r,.055]];
 for(let i=0;i<=20;i++){const a=Math.PI-i*Math.PI/20;outline.push([r*Math.cos(a),h-r+r*Math.sin(a),.055]);}outline.push([r,0,.055]);
 tube(q,C.edge,outline,.043,28);box(q,C.edge,[0,0,.055],[w+.08,.07,.08]);
 tube(q,C.edge,[[-r+.04,.08,.06],[-r*.4,h*.34,.06],[r*.4,h*.62,.06],[r-.04,h-.20,.06]],.025,14);tube(q,C.edge,[[r-.04,.08,.06],[r*.4,h*.34,.06],[-r*.4,h*.62,.06],[-r+.04,h-.20,.06]],.025,14);return q;
}
// The main ridge runs left/right; the front gable meets it at a right angle.
const mainRoofY=(x,z)=>3.46+1.20*Math.pow(Math.max(0,1-Math.abs(z+.40)/1.76),1.35);
const frontRoofY=(x,z)=>z<-.40?-100:3.46+(1.20+(z+.40)*.54)*Math.pow(Math.max(0,1-Math.abs(x-.38)/2.28),1.42);
const houseRoofY=(x,z)=>Math.max(mainRoofY(x,z),frontRoofY(x,z));
function roofGarden(g){
 const garden=group(g,'roof-garden'),rng=random(351),up=new T.Vector3(0,0,1);
 const colors=['#596e41','#718651','#869963','#a2ad78'].map((color,i)=>{
  const m=new T.MeshStandardMaterial({color,roughness:.94,side:T.DoubleSide});m.name=`roof-ivy-leaf-${i}`;return m;
 });
 const stemMaterial=new T.MeshStandardMaterial({color:'#667746',roughness:1});stemMaterial.name='roof-ivy-stem';
 const veinMaterial=new T.MeshStandardMaterial({color:'#93a273',roughness:1});veinMaterial.name='roof-ivy-vein';
 const surface=(x,z,h=.13)=>new T.Vector3(x,houseRoofY(x,z)+h,z);
 const normalAt=(x,z)=>new T.Vector3(-(houseRoofY(x+.01,z)-houseRoofY(x-.01,z))/.02,1,-(houseRoofY(x,z+.01)-houseRoofY(x,z-.01))/.02).normalize();
 const stem=(points,r=.012)=>vein(points,r*2,stemMaterial);
 const vein=(points,width,material=veinMaterial)=>{
  const vertices=[],indices=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],direction=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]);
   const side=new T.Vector3().crossVectors(direction,normalAt(p.x,p.z)).normalize().multiplyScalar(width);
   vertices.push(...p.clone().add(side).toArray(),...p.clone().sub(side).toArray());
   if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(garden,geo,material);
 };
 // A cupped, three-lobed ivy leaf: the raised midrib is actual geometry, not a flat stamp.
 const leafAt=(x,z,size,angle,height=.14,tone=1)=>{
  const n=normalAt(x,z),forward=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
  forward.y=-(n.x*forward.x+n.z*forward.z)/n.y;forward.normalize();
  const side=new T.Vector3().crossVectors(forward,n).normalize(),curl=.045+rng()*.045;
  const point=(u,v)=>{
   const xx=x+size*(side.x*u+forward.x*v),zz=z+size*(side.z*u+forward.z*v);
   const fold=(.18-.22*Math.abs(u))*Math.sin(v*Math.PI)+curl*v*v;
   return surface(xx,zz,height+size*fold);
  };
  const positions=[],indices=[];
  const rim=[[0,0],[-.29,.20],[-.46,.48],[-.22,.74],[0,1],[.22,.74],[.46,.48],[.29,.20]];
  for(const [u,v] of [...rim,[0,.50]])positions.push(...point(u,v).toArray());
  for(let i=0;i<rim.length;i++)indices.push(i,(i+1)%rim.length,rim.length);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
  mesh(garden,geo,colors[Math.min(3,Math.max(0,tone))]);
  stem([surface(x,z,.12),point(0,.02)],.006);
 };
 const vine=(path,size=.17,density=7)=>{
  const curve=new T.CatmullRomCurve3(path.map(([x,z])=>new T.Vector3(x,0,z))),length=curve.getLength(),points=[];
  for(let i=0,count=Math.ceil(length*4);i<=count;i++){const p=curve.getPoint(i/count);points.push(surface(p.x,p.z));}stem(points);
  for(let d=.05;d<length;d+=.10+rng()*.12){
   const t=d/length,p=curve.getPointAt(t),direction=curve.getTangentAt(t),angle=Math.atan2(direction.x,direction.z);
   for(let k=0,count=rng()<density/10?2:1;k<count;k++){
    const turn=(k===0?-1:1)*(.65+rng()*.85),scale=size*(.72+rng()*.50)*(1-.40*t);
    leafAt(p.x,p.z,scale,angle+turn,.13+rng()*.025,2+Math.floor(rng()*2));
   }
  }
 };
 // Deliberately placed climbing routes leave connected, readable expanses of pink shingles.
 const routes=[
  [[-2.22,-.52],[-1.6,-.42],[-.88,-.56],[-.05,-.44],[.64,-.55],[1.39,-.35],[2.30,-.46]],
  [[.40,-.42],[.34,.02],[.50,.53],[.31,.93],[.41,1.47]],
  [[-2.13,-1.72],[-2.02,-1.30],[-1.68,-1.06],[-1.75,-.72],[-1.55,-.44]],
  [[-1.81,1.38],[-1.37,1.35],[-.95,1.43],[-.44,1.34],[.36,1.46]]
 ];
 routes.forEach(path=>vine(path,.23,10));
 const clusters=[
  [-2.02,-.50,.24,.24,20],[-1.38,-.56,.44,.38,39],[-.74,-.38,.29,.25,23],
  [.04,-.52,.49,.43,43],[.70,-.39,.31,.26,26],[1.34,-.22,.42,.39,37],[2.05,-.48,.30,.29,26],
  [.43,.14,.23,.29,25],[.33,.75,.31,.35,31],[.37,1.34,.22,.26,21],
  [-1.80,-1.10,.26,.30,22],[-1.63,1.33,.27,.18,20],[-.85,1.29,.34,.27,30],[-1.04,.61,.22,.26,19]
 ];
 for(const [cx,cz,rx,rz,count] of clusters){
  for(let i=0;i<count;i++){
   const a=rng()*Math.PI*2,r=Math.sqrt(rng()),x=cx+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;
   const layer=(1-r)*.18+rng()*.045,height=.14+layer,size=.23+(1-r)*.15+rng()*.065;
   // Every leaf stalk joins the local climbing branch, including the raised centre leaves.
   stem([surface(cx,cz),surface((cx+x)/2,(cz+z)/2,.14+layer*.5),surface(x,z,height)],.006);
   leafAt(x,z,size,a+(rng()-.5)*1.4,height,Math.floor(rng()*3));
  }
 }
 // Side shoots cross only part of each bare area; they do not fill the entire roof again.
 [
  [[-1.32,-.47],[-1.04,-.84],[-.63,-1.08],[-.42,-1.48],[-.65,-1.77]],
  [[.12,-.46],[.39,-.86],[.26,-1.19],[.64,-1.43],[.99,-1.49]],
  [[1.51,-.39],[1.75,-.80],[2.10,-.96],[2.20,-1.36]],
  [[-1.52,-.44],[-1.38,-.09],[-.95,.10],[-1.03,.48],[-.68,.74]],
  [[-1.57,1.35],[-1.48,1.02],[-1.65,.68],[-1.36,.46]],
  [[.44,.69],[.98,.55],[1.31,.72],[1.65,.62],[1.87,.91]],
  [[2.13,-.47],[2.09,-.04],[1.83,.18],[1.94,.42],[2.32,.53]],
  [[-.83,1.34],[-.50,1.02],[-.18,.94]],
  [[.42,.06],[.90,-.02],[1.08,.19]]
 ].forEach(path=>vine(path,.20,5));
 for(const [x,z,scale] of [[-1.36,-.49,1],[.12,-.43,1.2],[1.53,-.36,1],[-1.85,-1.05,.8],[.42,1.11,1.1],[-1.21,1.35,1],[-.60,1.37,.8]]){
  for(let k=0;k<4;k++){
   const a=k*2.4,fx=x+Math.cos(a)*.10,fz=z+Math.sin(a)*.09,h=.36+(k%2)*.025;
   stem([surface(x,z,.17),surface(fx,fz,h)],.010);
   leafAt(fx,fz,.12,a+.7,h-.07,2);
   ball(garden,colors[1],surface(fx,fz,h-.012).toArray(),[.038,.027,.038]);
   const f=blossom(garden,surface(fx,fz,h).toArray(),(.065+rng()*.025)*scale,petals[k%3]);f.quaternion.setFromUnitVectors(up,normalAt(fx,fz));
  }
 }
}
function triangles(positions){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();return geo;}
function clipRoof(geometry,owns){
 const g=geometry.index?geometry.toNonIndexed():geometry,p=g.attributes.position,out=[];
 for(let i=0;i<p.count;i+=3){
  let poly=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k)),result=[];
  for(let j=0;j<3;j++){
   const a=poly[j],b=poly[(j+1)%3],da=owns(a.x,a.z),db=owns(b.x,b.z);
   if(da>=0)result.push(a);
   if((da>=0)!==(db>=0)){
    let lo=0,hi=1;for(let n=0;n<16;n++){const t=(lo+hi)/2,v=a.clone().lerp(b,t);if((owns(v.x,v.z)>=0)===(da>=0))lo=t;else hi=t;}
    result.push(a.clone().lerp(b,(lo+hi)/2));
   }
  }
  for(let j=1;j<result.length-1;j++)out.push(...result[0].toArray(),...result[j].toArray(),...result[j+1].toArray());
 }
 if(g!==geometry)g.dispose();geometry.dispose();return triangles(out);
}
function crossedRoof(g){
 const rng=random(43),backing=mat('#916a58');backing.side=T.DoubleSide;
 for(const kind of ['main','front'])for(const sign of [-1,1]){
  const height=kind==='main'?mainRoofY:frontRoofY;
  const owns=(x,z)=>kind==='main'?mainRoofY(x,z)-frontRoofY(x,z):frontRoofY(x,z)-mainRoofY(x,z);
  const point=(u,v)=>kind==='main'?[-2.35+v*4.85,-.40+sign*u*1.76]:[.38+sign*u*2.28,-.40+v*1.98];
  const coords=[];
  for(let u=0;u<8;u++)for(let v=0;v<6;v++){
   const corners=[[u/8,v/6],[(u+1)/8,v/6],[(u+1)/8,(v+1)/6],[u/8,(v+1)/6]].map(([a,b])=>{const [x,z]=point(a,b);return [x,height(x,z),z];});
   for(const k of [0,1,2,0,2,3])coords.push(...corners[k]);
  }
  mesh(g,clipRoof(triangles(coords),owns),backing);
  const rows=kind==='main'?7:10,cols=kind==='main'?19:8;
  for(let row=rows-1;row>=0;row--)for(let col=0;col<cols;col++){
   const s=new T.Shape();s.moveTo(0,0);s.lineTo(.83,0);s.quadraticCurveTo(1,0,1,.20);s.lineTo(1,.8);s.quadraticCurveTo(1,1,.83,1);s.lineTo(0,1);s.closePath();
   const geo=new T.ShapeGeometry(s,2),p=geo.attributes.position;
   for(let i=0;i<p.count;i++){
    const a=p.getX(i),b=p.getY(i),t=p.getZ(i),u=Math.min(1,(row+a*1.16)/rows),v=Math.min(1,(col+b*.98+(row%2)*.12)/cols),[x,z]=point(u,v);
    p.setXYZ(i,x,height(x,z)+.047+(rows-row)*.002+t+Math.sin(b*Math.PI)*.014,z);
   }
   const color=['#bf8f89','#c4958f','#c89b94','#bd8c88'][Math.floor(rng()*4)],material=mat(color);material.side=T.DoubleSide;
   const clipped=clipRoof(geo,owns);if(clipped.attributes.position.count)mesh(g,clipped,material);else clipped.dispose();
  }
 }
 // Continuous eave boards follow the actual roof, rather than overlapping gables.
 for(const x of [-2.38,2.53]){const pts=[];for(let i=0;i<=28;i++){const z=-2.16+i/28*3.52;pts.push([x,mainRoofY(x,z)+.075,z]);}tube(g,C.wood,pts,.075,32);}
 for(const sign of [-1,1]){const pts=[];for(let i=0;i<=26;i++){const x=.38+sign*i/26*2.28;pts.push([x,frontRoofY(x,1.60)+.07,1.60]);}tube(g,C.wood,pts,.075,30);}
 tube(g,C.wood,[[-2.47,4.72,-.4],[-1.5,4.72,-.4],[.38,4.72,-.4],[1.7,4.72,-.4],[2.60,4.72,-.4]],.065,24);
 for(const sign of [-1,1]){const x=sign===-1?-2.47:2.60;tube(g,C.wood,[[x,4.7,-.4],[x+sign*.16,4.85,-.4],[x+sign*.11,5.02,-.4],[x-sign*.04,5.03,-.4],[x-sign*.08,4.9,-.4]],.057,18);}
 tube(g,C.wood,[[.38,4.73,-.40],[.38,5.20,.5],[.38,5.80,1.60],[.38,6.02,1.68],[.38,6.08,1.52]],.065,24);
}
function houseShell(g){
 const material=new T.MeshStandardMaterial({color:C.cream,roughness:1,side:T.DoubleSide});
 for(const z of [1.13,-1.13]){
  const s=new T.Shape();s.moveTo(-1.94*.88,1.82);s.lineTo(1.96*.88,1.82);
  for(let i=0;i<=40;i++){const x=1.96-i/40*3.9;s.lineTo(x,houseRoofY(x,z));}s.closePath();
  if(z>0){
   for(const [x,y,w,h] of [[.37,3.62,.52,.93],[-.31,3.59,.37,.69],[1.03,3.59,.37,.69]])s.holes.push(hole(archShape(x,y,w,h)));
   const bay=new T.Path();bay.moveTo(-.68,2.12);bay.lineTo(1.54,2.12);bay.lineTo(1.54,3.06);bay.lineTo(-.68,3.06);bay.closePath();s.holes.push(bay);
   s.holes.push(hole(archShape(-1.36,1.82,.72,1.35)));
  }else{const circle=new T.Path();circle.absarc(.15,2.7,.37,0,Math.PI*2);s.holes.push(circle);}
  mesh(g,new T.ExtrudeGeometry(s,{depth:.08,bevelEnabled:false,curveSegments:32}),material,[0,0,z-.04]);
 }
 for(const x of [-1.94,1.96]){
  const s=new T.Shape();s.moveTo(-1.13,1.82);s.lineTo(1.13,1.82);for(let i=0;i<=30;i++){const z=1.13-i/30*2.26;s.lineTo(z,houseRoofY(x,z));}s.closePath();
  s.holes.push(hole(archShape(-.4,2.64,.46,.66)));const geo=new T.ExtrudeGeometry(s,{depth:.08,bevelEnabled:false,curveSegments:24}),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){const z=p.getX(i),y=p.getY(i),thickness=p.getZ(i)-.04,xx=x*(.88+.12*(y-1.82)/(houseRoofY(x,z)-1.82))+Math.sign(x)*thickness;p.setXYZ(i,xx,y,z);}geo.computeVertexNormals();mesh(g,geo,material);
 }
}
function furnishInterior(g){
 const wood=new T.MeshStandardMaterial({color:'#805b3f',roughness:.85}),cloth=new T.MeshStandardMaterial({color:'#c5ac83',roughness:1}),pot=new T.MeshStandardMaterial({color:'#ab795e',roughness:1});
 // Every piece starts at the actual floor; small objects sit on furniture, not in mid-air.
 const floor=1.84,tableTop=2.34;
 for(const x of [-.17,1.01])for(const z of [.42,.80])box(g,wood,[x,(floor+tableTop-.06)/2,z],[.075,tableTop-.06-floor,.075]);
 box(g,wood,[.42,tableTop-.03,.61],[1.42,.06,.62]);
 box(g,wood,[-.45,2.10,-.87],[1.35,.52,.36]);
 for(const x of [-.78,-.12]){box(g,'#a27f56',[x,2.12,-.68],[.59,.42,.025]);ball(g,C.gold,[x+.18,2.13,-.65],[.025,.025,.018]);}
 for(const x of [.16,.48])for(const z of [-.37,-.05])box(g,wood,[x,2.00,z],[.055,.32,.055]);
 box(g,wood,[.32,2.18,-.21],[.43,.06,.43]);for(const x of [.13,.51])box(g,wood,[x,2.35,-.42],[.05,.38,.05]);box(g,wood,[.32,2.49,-.42],[.43,.07,.05]);
 const plant=(x,y,z)=>{
  mesh(g,new T.CylinderGeometry(.07,.05,.13,10),pot,[x,y+.065,z]);tube(g,'#637348',[[x,y+.13,z],[x,y+.34,z]],.012,2);
  for(const sign of [-1,1])leaf(g,[x+sign*.048,y+.23,z],.074,sign*.65,'#76854d');blossom(g,[x,y+.35,z],.06,petals[1]);
 };
 plant(.75,tableTop,.65);box(g,cloth,[.12,tableTop+.014,.61],[.34,.028,.21]);
 box(g,wood,[.37,3.59,.65],[1.45,.25,.43]);plant(.05,3.715,.64);plant(.82,3.715,.64);
 // Curtains hang from an actual rod just behind the bay frame.
 tube(g,wood,[[-.66,3.035,1.32],[1.47,3.035,1.32]],.018,1);
 for(const x of [-.62,1.43])for(let i=0;i<3;i++)box(g,cloth,[x+(i-1)*.035,2.66,1.32+(i%2)*.018],[.043,.75,.025]);
 for(const [x,y,z,ceiling,power] of [[.42,2.80,.61,3.395,7],[.37,4.14,.70,houseRoofY(.37,.70)-.07,8]]){
  tube(g,wood,[[x,ceiling,z],[x,y+.12,z]],.012,1);mesh(g,new T.ConeGeometry(.16,.14,16,1,true),wood,[x,y+.13,z]);
  glow(g,new T.SphereGeometry(.055,12,8),[x,y,z]);
  const light=new T.PointLight('#ffd39a',power,4,2);light.position.set(x,y,z);light.castShadow=false;light.visible=false;light.userData.interiorLight=true;g.add(light);
 }
}
function rabbit(g,pos){
 const ball=(parent,color,position,size)=>mesh(parent,new T.SphereGeometry(1,8,6),color,position,size);
 const r=group(g,'little-ceramic-rabbit',pos);ball(r,'#e6dfcf',[0,.2,0],[.15,.22,.13]);ball(r,'#e6dfcf',[0,.45,.02],[.16,.16,.14]);
 for(const s of [-1,1]){const e=ball(r,'#e6dfcf',[s*.075,.66,.01],[.048,.20,.045]);e.rotation.z=-s*.16;const pink=ball(r,'#d5b4b5',[s*.075,.67,.05],[.022,.12,.012]);pink.rotation.z=-s*.16;ball(r,'#544337',[s*.07,.46,.145],[.014,.017,.01]);ball(r,'#e6dfcf',[s*.09,.035,.09],[.09,.04,.10]);}
 ball(r,'#bb9695',[0,.41,.16],[.02,.015,.013]);
}
function clock(g,pos){
 const q=group(g,'hanging-clock',pos);mesh(q,new T.CylinderGeometry(.19,.19,.065,24),C.gold).rotation.x=Math.PI/2;mesh(q,new T.CircleGeometry(.16,24),'#eee3d4',[0,0,.04]);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const t=box(q,C.wood,[Math.sin(a)*.13,Math.cos(a)*.13,.05],[.014,.033,.008]);t.rotation.z=-a;}
 tube(q,C.wood,[[0,.10,.055],[0,0,.055],[.07,-.03,.055]],.013,2);tube(q,C.gold,[[0,.2,0],[0,.31,0],[.06,.35,0],[.11,.29,0],[.07,.23,0]],.025,12);
 for(let i=0;i<10;i++){const loop=mesh(q,new T.TorusGeometry(.035,.009,4,8),C.gold,[.15,-.22-i*.055,0]);loop.rotation.y=i%2*Math.PI/2;}
}
function finishSurfaces(root){
 const cache=new Map(),clay=new Set(['916a58','bf8f89','c4958f','c89b94','bd8c88','a97a73']);
 const palette={'916a58':'bc8773','bf8f89':'f0b7bd','c4958f':'edb4bd','c89b94':'f4c5ca','bd8c88':'e9a9b5','a97a73':'d7919d','d6c3a6':'fff0ce','c3ac90':'ead5ac','baa58b':'e3c797','a88c66':'d4b17c','805b3f':'b3895c','ad8a62':'d6b782','a3825c':'cba571','a7825c':'d3ad78','b18d66':'dec18c','97764f':'c49c64'};
 root.traverse(o=>{
  if(!o.isMesh||o.userData.windowGlow||o.userData.glassPane||!o.material.color)return;
  const source=o.material,color=source.color.getHexString(),key=color+':'+source.side;
  if(!cache.has(key)){const tint=new T.Color(palette[color]?'#'+palette[color]:source.color);const m=new T.MeshLambertMaterial({color:tint,side:source.side});m.name='treehouse-'+(clay.has(color)?'clay':'plain')+'-'+color;cache.set(key,m);}
  o.material=cache.get(key);
 });
}
function bakeLanternSpill(root){
 // Bake the fixed lanterns' nearby warm bounce into vertices once; no extra runtime lights.
 root.updateMatrixWorld(true);const sources=[],night={value:0},materials=new Set();root.userData.lanternSpill=night;
 root.traverse(o=>{
  if(!o.isMesh||!o.userData.windowGlow)return;
  const parent=o.parent.name;if(parent!=='hanging-lantern'&&parent!=='mushroom-nightlight')return;
  const scale=o.getWorldScale(new T.Vector3()),mushroom=parent==='mushroom-nightlight';
  sources.push({p:o.getWorldPosition(new T.Vector3()),range:mushroom?.72:1.95*scale.x,strength:mushroom?.55:1.25});
 });
 root.traverse(o=>{
  if(!o.isMesh||o.userData.windowGlow||o.userData.glassPane)return;
  const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,normalMatrix=new T.Matrix3().getNormalMatrix(o.matrixWorld),a=[];
  const v=new T.Vector3(),normal=new T.Vector3(),direction=new T.Vector3();
  for(let i=0;i<p.count;i++){
   v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);normal.fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();let energy=0;
   // Exterior lanterns cannot light the closed room through its walls.
   const exterior=v.y<1.76||Math.abs(v.x)>1.98||v.z>1.47||v.z< -1.20;
   if(exterior)for(const s of sources){
    direction.copy(s.p).sub(v);const d=direction.length();if(d>=s.range)continue;
    const facing=Math.max(0,normal.dot(direction.multiplyScalar(1/Math.max(d,.001))));energy+=s.strength*(1-d/s.range)**2*facing;
   }
   const e=Math.min(1.1,energy);a.push(e,e*.53,e*.19);
  }
  o.geometry.setAttribute('lanternBounce',new T.Float32BufferAttribute(a,3));
  if(materials.has(o.material))return;materials.add(o.material);
  o.material.onBeforeCompile=shader=>{
   shader.uniforms.treehouseNight=night;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 lanternBounce; varying vec3 vLanternBounce;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLanternBounce = lanternBounce;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float treehouseNight; varying vec3 vLanternBounce;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vLanternBounce * treehouseNight * diffuseColor.rgb;');
  };
  o.material.customProgramCacheKey=()=> 'treehouse-lantern-bounce';
 });
}
function batch(root){
 root.updateMatrixWorld(true);const inverse=new T.Matrix4().copy(root.matrixWorld).invert(),pools=new Map(),remove=[];
 root.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));const interior=Boolean(o.userData.interior),key=o.material.uuid+Boolean(o.userData.windowGlow)+interior;if(!pools.has(key))pools.set(key,{m:o.material,glow:Boolean(o.userData.windowGlow),glass:Boolean(o.userData.glassPane),interior,geos:[]});pools.get(key).geos.push(geo);remove.push(o);});
 for(const o of remove){o.removeFromParent();o.geometry.dispose();}
 for(const {m,glow,glass,interior,geos} of pools.values()){const parts=geos.map(g=>{const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();if(!m.map&&!m.emissiveMap)n.deleteAttribute('uv');return n;});const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());const o=mesh(root,geo,m);o.userData.windowGlow=glow;o.userData.glassPane=glass;o.userData.interior=interior;o.castShadow=!glow&&!glass&&!interior;o.receiveShadow=!glow&&!interior;}
}
export function createRoseTreehouse(parent){
 const h=group(parent,'rose-treehouse');
 // Two twisting stems and uneven roots, not a radial star around a straight stump.
 branch(h,[[-.38,.06,.28],[-.46,.52,.12],[.10,1.13,-.06],[.40,1.76,.10]],.39,.34);
 branch(h,[[.51,.04,-.13],[.36,.53,.20],[-.10,1.09,.30],[-.38,1.76,.08]],.38,.32);
 const roots=[[[.3,.6,.3],[.62,.28,.72],[1.1,.14,1.22],[1.65,.06,1.29]],[[-.2,.7,.3],[-.64,.3,.6],[-.53,.14,1.25],[-.04,.05,1.63]],[[.3,.6,-.2],[.86,.32,-.62],[1.37,.13,-.44],[1.67,.05,-.12]],[[-.3,.5,-.2],[-.7,.22,-.7],[-1.3,.1,-1],[-1.64,.05,-.77]],[[.2,.6,-.3],[.49,.25,-.92],[.08,.12,-1.42],[-.38,.06,-1.59]]];
 for(const pts of roots){branch(h,pts,.24,.035);tube(h,C.edge,pts.map(([x,y,z])=>[x,y+.13,z]),.022,22);}
 for(const [x,z] of [[-1.3,-.6],[1.35,-.7],[1.36,.9],[-1.3,.9]])branch(h,[[0,.7,.1],[x*.35,1.12,z*.4],[x,1.72,z]],.21,.13);
 for(let k=0;k<6;k++){const a=k*Math.PI/3;tube(h,k%2?C.edge:'#604330',[[Math.cos(a)*.5,.10,Math.sin(a)*.45],[-.2+Math.cos(a+.6)*.39,.55,Math.sin(a+.6)*.42],[Math.cos(a+1)*.33,1.13,Math.sin(a+1)*.42],[.08+Math.cos(a+1.5)*.4,1.7,Math.sin(a+1.5)*.43]],.018,24);}
 foliage(h,[[.4,1.5,.52],[.16,1,.56],[.49,.5,.61],[1.2,.16,.88]],48,10);
 // Irregular timber deck, soft moss edges, no detached display plinth.
 for(let i=0;i<19;i++){const x=(i-9)*.25,len=3.1*Math.sqrt(Math.max(0,1-(x/2.5)**2));box(h,['#9b7957','#aa8967','#8d6a4e'][i%3],[x,1.72,0],[.24,.15,len]);}
 for(let i=0;i<52;i++){const a=i*Math.PI*2/52;ball(h,['#748047','#8b9556'][i%2],[Math.cos(a)*2.16,1.82+(i%3)*.012,Math.sin(a)*1.40],[.13,.045,.12]);}
 // A clear porch links the door to compact steps folded around the front-left roots.
 for(let i=0;i<11;i++)box(h,i%2?'#ad8a62':'#a3825c',[-2.44+i*.16,1.75,1.54],[.155,.14,.82]);
 box(h,C.edge,[-1.64,1.71,1.95],[1.77,.20,.09]);
 branch(h,[[-.4,.65,.5],[-1.15,1.10,1.02],[-2.30,1.68,1.72]],.17,.12);
 // Same route and heights, but each tread has its own length and softened irregular ends.
 for(let i=0;i<4;i++){
  const x=-.75-i*.30,top=.17+i*.15,depth=[.76,.94,.80,1.02][i],offset=[-.015,.025,-.025,.005][i];
  stairSlab(h,[x,top,3.28+offset],.34,depth,i%2?'#b2a388':'#a99d82',501+i);
  stairGreens(h,[x,top,3.28+offset+depth/2-.045],510+i,0,.23);
  stairGreens(h,[x,top,3.28+offset-depth/2+.045],520+i,Math.PI,.20);
 }
 for(let i=0;i<5;i++)box(h,i%2?'#a7825c':'#b18d66',[-2.47+i*.16,.70,3.28],[.155,.14,.54]);
 for(let i=0;i<4;i++){
  const z=2.88-i*.26,top=.98+i*.21,width=[.84,1.06,.88,.98][i],offset=[.015,-.025,.02,-.015][i];
  for(let p=0;p<2;p++){
   const w=width-(p===i%2?.045:0),xx=-2.15+offset+(p===0?-.015:.012),zz=z+(p-.5)*.15;
   stairSlab(h,[xx,top,zz],w,.148,(i+p)%2?'#ad8a62':'#a3825c',530+i*2+p);
   // Shallow grain follows the long board instead of making regular tiled blocks.
   for(const dz of [-.026,.027])tube(h,'#97764f',[[xx-w*.36,top+.001,zz+dz],[xx-.03,top+.002,zz+dz+.007],[xx+w*.37,top+.001,zz+dz-.003]],.003,5);
  }
  stairGreens(h,[-2.15+offset-width/2+.045,top,z],540+i,-Math.PI/2,.24);
  stairGreens(h,[-2.15+offset+width/2-.045,top,z+.015],550+i,Math.PI/2,.18);
 }
 stairGreens(h,[-2.47,.77,3.38],563,-Math.PI/2,.30);
 stairGreens(h,[-2.18,.77,3.52],564,0,.38);
 for(const x of [-2.41,-1.89])tube(h,C.wood,[[x,.64,3.05],[x,1.12,2.45],[x,1.70,1.90]],.055,2);
 branch(h,[[-2.15,.05,3.28],[-2.21,.35,3.27],[-2.15,.64,3.28]],.13,.11);
 // Separate runs leave the entry, turn and porch opening unobstructed.
 railing(h,[[-.75,.17,3.56],[-1.35,.47,3.56],[-1.65,.62,3.56]]);
 railing(h,[[-1.84,.77,3.51],[-2.47,.77,3.51],[-2.47,.77,3.06],[-2.43,.98,2.88],[-2.43,1.40,2.36],[-2.43,1.61,2.10],[-2.43,1.82,1.93],[-2.43,1.82,1.24]]);
 railing(h,[[-1.77,1.82,1.92],[-.84,1.82,1.92]]);
 // A single joined shell follows the two intersecting roof surfaces.
 houseShell(h);
 // The windows open into two real rooms; nothing is attached to the glass as a glowing backdrop.
 box(h,roomFloor,[0,1.81,0],[3.42,.06,2.22]);
 box(h,roomFloor,[0,3.43,0],[3.65,.07,2.22]);
 const interior=group(h,'simple-interior');furnishInterior(interior);interior.traverse(o=>{o.userData.interior=true;});
 for(let i=0;i<9;i++){
  const y=1.95+i*.19,exclusions=[];if(y<3.17)exclusions.push([-1.73,-.99]);if(y>2.12&&y<3.06)exclusions.push([-.69,1.55]);
  let start=-1.79;for(const [a,b] of [...exclusions,[1.79,1.79]]){if(a>start)box(h,'#c3ac90',[(start+a)/2,y,1.141],[a-start,.015,.018]);start=b;}
 }
 const right=box(h,C.wood,[1.81,2.7,1.19],[.14,1.95,.14]);right.rotation.z=-.10;const left=box(h,C.wood,[-1.98,2.68,1.19],[.13,1.78,.13]);left.rotation.z=.10;
 crossedRoof(h);
 roofGarden(h);
 const door=group(h,'front-pink-door',[-1.36,1.82,1.18]),s=new T.Shape();s.moveTo(-.36,0);s.lineTo(.36,0);s.lineTo(.36,.99);s.absarc(0,.99,.36,0,Math.PI,false);s.closePath();
 mesh(door,new T.ExtrudeGeometry(s,{depth:.06,bevelEnabled:false,curveSegments:16}),C.pink);
 const rim=[[-.40,0,.07],[-.40,.99,.07]];for(let i=0;i<=20;i++){let a=Math.PI-i*Math.PI/20;rim.push([Math.cos(a)*.40,.99+Math.sin(a)*.40,.07]);}rim.push([.40,0,.07]);tube(door,C.wood,rim,.04,26);
 for(const x of [-.25,-.12,.01,.14,.27])box(door,'#a87581',[x,.56,.066],[.012,1.06,.01]);
 const heart=new T.Shape();heart.moveTo(0,0);heart.bezierCurveTo(-.27,.18,-.14,.34,0,.19);heart.bezierCurveTo(.14,.34,.27,.18,0,0);mesh(door,new T.ShapeGeometry(heart,12),'#d4ae68',[0,.93,.076]);ball(door,C.gold,[.24,.62,.095],[.039,.039,.025]);
 for(const y of [.25,.85])box(door,C.wood,[-.28,y,.08],[.12,.035,.025]);
 // Projecting downstairs window opens into the house, without floating props or individual window boxes.
 for(const x of [-.73,1.58])box(h,C.edge,[x,2.61,1.31],[.075,1.08,.31]);
 for(let i=0;i<3;i++){
  const x=-.31+i*.70;pane(h,new T.PlaneGeometry(.59,.85),[x,2.60,1.468]);
  for(const xx of [x-.32,x+.32])box(h,C.wood,[xx,2.60,1.50],[.055,.95,.07]);box(h,C.edge,[x,2.7,1.50],[.64,.035,.04]);
 }
 box(h,C.wood,[.40,2.10,1.52],[2.38,.1,.30]);box(h,C.wood,[.40,3.08,1.50],[2.40,.1,.16]);
 for(const x of [-.43,1.21])tube(h,C.wood,[[x,2.08,1.64],[x,1.98,1.57],[x,1.87,1.30],[x,1.92,1.19]],.045,18);
 for(const sign of [-1,1]){
  tube(h,'#b79672',[[.40,1.84,1.60],[.40+sign*.25,1.99,1.60],[.40+sign*.61,2.02,1.60],[.40+sign*.73,1.94,1.60],[.40+sign*.57,1.91,1.60],[.40+sign*.49,1.98,1.60]],.028,24);
 }
 for(let i=0;i<12;i++){const awning=box(h,i%2?'#b78b7d':'#c19788',[-.84+i*.215,3.21,1.51],[.225,.055,.62]);awning.rotation.x=.27;}
 tube(h,C.edge,[[-.88,3.16,1.85],[.40,3.13,1.88],[1.67,3.16,1.85]],.04,16);
 arch(h,[.37,3.62,1.18],.52,.93);arch(h,[-.31,3.59,1.18],.37,.69);arch(h,[1.03,3.59,1.18],.37,.69);
 // Tulip and scroll-cut timber ornament under the gable.
 for(const sign of [-1,1]){
  tube(h,'#c5a285',[[.37,4.72,1.22],[.37+sign*.25,4.67,1.22],[.37+sign*.42,4.78,1.22],[.37+sign*.33,4.86,1.22],[.37+sign*.23,4.79,1.22]],.035,18);
  tube(h,'#c5a285',[[.37,4.68,1.22],[.37+sign*.61,4.58,1.22],[.37+sign*.76,4.62,1.22]],.035,16);leaf(h,[.37+sign*.09,5.03,1.22],.16,sign*.55,'#d6a5ae');
 }
 leaf(h,[.37,5.11,1.22],.17,0,'#e1b6bc');tube(h,'#c5a285',[[.37,4.68,1.22],[.37,5.03,1.22]],.028,1);
 const back=group(h,'back-window',[.15,2.7,-1.145]);back.rotation.y=Math.PI;pane(back,new T.CircleGeometry(.37,24),[0,0,.02]);mesh(back,new T.TorusGeometry(.40,.055,6,32),C.edge,[0,0,.05]);box(back,C.wood,[0,0,.06],[.73,.045,.04]);box(back,C.wood,[0,0,.06],[.045,.73,.04]);
 for(const sign of [-1,1]){
  const side=group(h,'side-small-window',[sign*1.81,2.64,-.4]);side.rotation.y=sign*Math.PI/2;side.rotateX(.08);arch(side,[0,0,0],.46,.66);
  box(side,C.edge,[0,-.06,.12],[.72,.11,.25]);bush(side,[0,-.01,.19],.22,sign===1?180:181,8);
  foliage(side,[[-.65,1.18,.04],[-.46,.94,.06],[.17,.9,.06],[.64,.54,.06],[.71,-.12,.06]],sign===1?182:183,18);
  const edge=sign===1?1.96:-1.94;
  for(let y=2.02;y<3.9;y+=.20){let pts=[];for(let i=0;i<=24;i++){const z=-1.12+i/24*2.24,top=houseRoofY(edge,z),opening=y>=2.64&&y<=3.30&&z>=-.65&&z<=-.15;if(opening){if(pts.length>1)tube(h,'#baa58b',pts,.008,pts.length);pts=[];}else if(y<top-.05){const x=edge*(.88+.12*(y-1.82)/(top-1.82))+sign*.012;pts.push([x,y,z]);}}if(pts.length>1)tube(h,'#baa58b',pts,.008,pts.length);}
 }
 for(let y=1.96;y<3.35;y+=.21){const d=Math.abs(y-2.7);if(d<.38){const r=Math.sqrt(.38*.38-d*d);for(const [a,b] of [[-1.79,.15-r],[.15+r,1.79]])box(h,'#c3ac90',[(a+b)/2,y,-1.145],[b-a,.014,.018]);}else box(h,'#c3ac90',[0,y,-1.145],[3.58,.014,.018]);}
 foliage(back,[[-1.65,.70,.08],[-1.3,.84,.08],[-.76,.9,.08],[.15,.9,.08]],82,18);
 foliage(back,[[1.6,.80,.08],[1.35,.46,.08],[1.43,-.3,.08],[1.73,-.95,.08]],32,18);
 for(let i=0;i<7;i++){const a=2.7+i*.27,x=Math.cos(a)*2.2,z=Math.sin(a)*1.5;branch(h,[[x,1.8,z],[x+.025,2.30,z]],.032,.025);}
 const rails=[];for(let i=0;i<24;i++){const a=2.7+i/23*1.62;rails.push([Math.cos(a)*2.2,2.2,Math.sin(a)*1.5]);}tube(h,C.wood,rails,.03,30);
 lantern(h,[1.96,2.86,1.19],.90);lantern(h,[.55,.67,.81],.76);lantern(h,[-2.05,1.97,-.88],.7);clock(h,[-2.12,3.13,1.34]);
 const bellProfile=[[.12,0],[.10,.03],[.075,.13],[.04,.19],[0,.20]].map(p=>new T.Vector2(...p));mesh(h,new T.LatheGeometry(bellProfile,16),C.gold,[-1.36,3.26,1.31]);ball(h,'#765337',[-1.36,3.25,1.31],[.035,.04,.035]);tube(h,C.wood,[[-1.36,3.47,1.31],[-1.36,3.59,1.25],[-1.27,3.62,1.20]],.022,12);
 // Vines grow along the roof and posts, with clustered rather than spaced decorations.
 foliage(h,[[-2.16,3.53,1.59],[-1.37,3.74,1.59],[-.62,4.37,1.59],[.0,5.13,1.59],[.38,5.76,1.58]],70,22);
 foliage(h,[[2.63,3.5,1.59],[1.95,3.84,1.6],[1.35,4.42,1.59],[.79,5.23,1.59],[.38,5.76,1.58]],24,21);
 foliage(h,[[1.69,3.44,1.32],[1.87,2.95,1.25],[1.77,2.3,1.36],[1.98,1.8,1.42],[1.82,1.1,1.15]],72,20);
 foliage(h,[[-2.13,3.40,1.26],[-2.14,2.75,1.27],[-2.10,1.9,1.32],[-1.8,1.5,1.55]],93,17);
 foliage(h,[[-.65,3.53,1.30],[.05,3.44,1.48],[.82,3.47,1.47],[1.59,3.5,1.35]],44,21);
 for(const [x,y,z,r,seed] of [[-.55,1.9,1.53,.32,8],[.43,1.9,1.61,.37,9],[1.49,1.91,1.55,.32,10],[-2,1.86,-.8,.28,11],[1.8,1.86,-1,.32,12],[1.56,.16,1.40,.57,30],[.72,.14,2.13,.50,31],[-.12,.13,2.25,.36,33],[2.15,.10,.4,.32,40],[-1.73,.1,-.4,.4,42]])bush(h,[x,y,z],r,seed,16);
 for(const [x,z] of [[1.14,1.3],[1.95,1.23],[-1.7,1.1]]){
  mesh(h,new T.CylinderGeometry(.045,.06,.23,8),'#dfcfb9',[x,.17,z]);ball(h,'#c998a0',[x,.32,z],[.18,.10,.18]);for(let k=0;k<5;k++){const a=k*Math.PI*.4;ball(h,'#eedfd0',[x+Math.cos(a)*.105,.39,z+Math.sin(a)*.105],[.024,.015,.024]);}
 }
 rabbit(h,[1.18,.22,1.72]);
 bush(h,[.44,.18,.86],.32,101,9);bush(h,[-.40,.14,.86],.26,102,8);bush(h,[-1.05,.12,-.30],.29,103,8);
 foliage(h,[[.35,1.54,.41],[.46,1.12,.49],[.15,.69,.57],[-.10,.23,1.1]],170,22);
 for(const [x,y,z,angle] of [[.30,.76,.53,.35],[-.28,1.25,.38,-.5]]){const knot=mesh(h,new T.TorusGeometry(.085,.012,5,20),'#60432f',[x,y,z],[.72,1.5,1]);knot.rotation.z=angle;}
 for(let i=0;i<3;i++){const stone=mesh(h,new T.CylinderGeometry(.30,.32,.09,7),'#b0a58c',[-.43+i*.27,.055,3.28-i*.05],[1,1,.75]);stone.rotation.y=i*.6;}
 for(const [x,y,z] of [[1.87,.55,1.72],[.69,.60,1.63],[-.25,2.17,1.56]])blossom(h,[x,y,z],.20,'#eae0ce',[-.15,0,.2]);
 houseTrinkets(h);
 h.userData.houseKind='rose_treehouse';h.userData.appearanceOnly=true;finishSurfaces(h);bakeLanternSpill(h);batch(h);h.traverse(o=>{if(o.isMesh&&o.material?.name==='treehouse-clay-916a58')snowSurface(o,.14);});return h;
}
