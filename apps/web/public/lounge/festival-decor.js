import * as T from 'three';
import {optimizeStaticRoom} from './scene-static.js';
import {createRoomOutline} from './outlines.js';
export const FESTIVALS=Object.freeze({'ordinary':'日常','mid-autumn':'中秋','chongyang':'重阳','winter':'冬至','new-year':'春节','lantern':'元宵','christmas':'圣诞','halloween':'万圣'});
// All ornaments use the existing room's world coordinates and camera.
export function createFestivalDecor(kind,width,height){
 const root=new T.Group();root.name='festival-decor';
 const mats=new Map(),geos=new Set(),textures=new Set();
 function material(color){if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.85}));return mats.get(color);}
 function mesh(g,geo,color,x=0,y=0,z=0){geos.add(geo);const m=new T.Mesh(geo,typeof color==='string'?material(color):color);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
 function group(g,x,y,z){const p=new T.Group();p.position.set(x,y,z);g.add(p);return p;}
 function sphere(g,x,y,z,rx,ry,rz,c){const m=mesh(g,new T.SphereGeometry(1,14,10),c,x,y,z);m.scale.set(rx,ry,rz);return m;}
 function box(g,x,y,z,w,h,d,c){return mesh(g,new T.BoxGeometry(w,h,d),c,x,y,z);}
 function cylinder(g,x,y,z,r,h,c){return mesh(g,new T.CylinderGeometry(r,r,h,24),c,x,y,z);}
 function line(g,points,c,r=.018){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(g,new T.TubeGeometry(curve,Math.max(4,points.length*3),r,5,false),c);}
 function text(g,label,x,y,z,size=.38,c='#785840',background=null){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');if(background){ctx.fillStyle=background;ctx.fillRect(0,0,512,256);}ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 98px serif';ctx.fillStyle=c;ctx.fillText(label,256,136);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;textures.add(tex);const mat=new T.MeshBasicMaterial({map:tex,transparent:!background,side:T.DoubleSide});mats.set('text'+mats.size,mat);const p=mesh(g,new T.PlaneGeometry(size*2,size),mat,x,y,z);p.userData.noOutline=true;return p;}
 const gold='#e9bd6d',ivory='#fff0ce',pink='#e7a4a9',red='#c96358',sage='#98b798',ink='#70583f';
 function tassel(g,x,y,z,c=gold){line(g,[[x,y,z],[x,y-.17,z]],c,.012);for(let i=-2;i<=2;i++)line(g,[[x+i*.017,y-.17,z],[x+i*.023,y-.34,z]],c,.011);}
 function lantern(g,x,y,z,c=red,s=1){const p=group(g,x,y,z);p.scale.setScalar(s);sphere(p,0,0,0,.29,.35,.25,c);for(let i=0;i<8;i++){const a=i*Math.PI/4;line(p,[[Math.cos(a)*.11,.32,Math.sin(a)*.1],[Math.cos(a)*.3,0,Math.sin(a)*.26],[Math.cos(a)*.11,-.32,Math.sin(a)*.1]],ivory,.011);}cylinder(p,0,.34,0,.12,.045,gold);cylinder(p,0,-.34,0,.12,.045,gold);line(p,[[0,.36,0],[0,.65,0]],ink,.013);tassel(p,0,-.38,0);return p;}
 function rabbit(g,x,y,z,s=1){
  const p=group(g,x,y,z);p.scale.setScalar(s);p.rotation.y=.24;
  // Soft toy silhouette: large cheeks, compact body, asymmetric ears.
  sphere(p,0,.24,0,.29,.27,.24,'#fff5e0');
  sphere(p,0,.61,.045,.355,.31,.285,'#fff5e0');
  for(const side of[-1,1]){
   const ear=group(p,side*.16,.86,.025);ear.rotation.z=side===-1?.1:-.38;
   sphere(ear,0,.18,0,.09,.255,.067,'#fff5e0');sphere(ear,0,.19,.059,.044,.174,.018,'#efbdbe');
   sphere(p,side*.12,.64,.305,.025,.032,.013,'#624c45');sphere(p,side*.115,.651,.316,.008,.009,.004,'#fffaf0');
   sphere(p,side*.224,.54,.268,.065,.029,.018,'#efb9b4');sphere(p,side*.17,.065,.17,.135,.085,.16,'#fff5e0');
  }
  sphere(p,0,.565,.329,.021,.014,.012,'#bf8382');
  line(p,[[0,.55,.328],[-.022,.528,.326],[-.047,.537,.323]],'#96756a',.008);line(p,[[0,.55,.328],[.022,.528,.326],[.047,.537,.323]],'#96756a',.008);
  const treat=group(p,0,.29,.275);treat.rotation.x=Math.PI/2;cake(treat,0,0,0,.165);
  for(const side of[-1,1])sphere(p,side*.17,.3,.295,.095,.085,.095,'#fff5e0');
  sphere(p,.27,.17,-.095,.11,.115,.105,'#fff5e0');
  return p;
 }
 function blossom(g,x,y,z,c,s=.12,petals=5){for(let i=0;i<petals;i++){const a=i*Math.PI*2/petals;sphere(g,x+Math.cos(a)*s*.63,y+Math.sin(a)*s*.63,z,s*.52,s*.52,s*.25,c);}sphere(g,x,y,z+s*.2,s*.25,s*.25,s*.23,gold);}
 function branches(g,x,y,z,c=gold,s=1,full=false){const p=group(g,x,y,z);p.scale.setScalar(s);cylinder(p,0,.17,0,.22,.34,sage);for(let i=0;i<5;i++){const a=i*2.4,dx=Math.cos(a)*(.35+i*.05),dy=.7+(i%3)*.21;line(p,[[0,.3,0],[dx*.45,dy*.75,0],[dx,dy,.02]],ink,.018);for(let j=0;j<3;j++){const xx=dx+(j-1)*.13,yy=dy+(j%2)*.13;blossom(p,xx,yy,.05,c,full?.17:.095,full?10:5);}}return p;}
 function plinth(g,x,y,z){const p=group(g,x,y,z);cylinder(p,0,.14,0,.66,.28,sage);cylinder(p,0,.3,0,.71,.055,ivory);return p;}
 function plate(g,x,y,z,c=ivory,r=.39){cylinder(g,x,y,z,r,.05,c);}
 function cake(g,x,y,z,s=.13){cylinder(g,x,y,z,s,.1,'#ce8f47');for(let i=0;i<10;i++){const a=i*Math.PI/5;sphere(g,x+Math.cos(a)*s*.9,y,z+Math.sin(a)*s*.9,s*.23,.05,s*.23,'#e7b96d');}cylinder(g,x,y+.055,z,s*.75,.014,'#f1cc82');box(g,x,y+.069,z,s,.012,.026,'#c38a48');box(g,x,y+.069,z,.026,.012,s,'#c38a48');}
 function banner(label,c=red){box(root,3.55,3.18,-5.63,3.5,.38,.07,c);for(const y of[2.98,3.38])line(root,[[1.77,y,-5.58],[5.33,y,-5.58]],gold,.028);text(root,label,3.55,3.18,-5.57,.76,ivory);tassel(root,1.84,2.97,-5.57);tassel(root,5.26,2.97,-5.57);}
 function garland(colors){line(root,[[-6.7,3.5,-5.9],[-3,3.14,-5.9],[.4,3.53,-5.9]],gold,.018);for(let i=0;i<7;i++)lantern(root,-6.55+i*1.12,2.91+Math.abs(i-3)*.1,-5.8,colors[i%colors.length],.46);}
 function moon(g,x,y,z,r=.7){const p=group(g,x,y,z);const disk=cylinder(p,0,0,0,r,.08,gold);disk.rotation.x=Math.PI/2;sphere(p,-r*.29,r*.2,.055,r*.13,r*.13,.013,'#f3d795');sphere(p,r*.24,-r*.22,.055,r*.19,r*.19,.013,'#f3d795');return p;}
 function bowl(g,x,y,z,type){const p=group(g,x,y,z);sphere(p,0,0,0,.4,.2,.4,sage);cylinder(p,0,.1,0,.36,.045,ivory);for(let i=0;i<6;i++){const a=i*2.4,xx=Math.cos(a)*.2,zz=Math.sin(a)*.2;if(type==='dumpling'){sphere(p,xx,.16,zz,.13,.08,.067,ivory);for(let j=-1;j<=1;j++)sphere(p,xx+j*.047,.225,zz,.02,.025,.025,'#e9d9b7');}else sphere(p,xx,.19,zz,.095,.095,.095,i%3===0?pink:ivory);}return p;}
 if(kind==='mid-autumn'){
  garland([ivory,pink,sage]);banner('花好月圆',sage);
  const p=plinth(root,.6,0,-2.35);moon(p,0,1.36,-.15,.76);rabbit(p,0,.33,.17,.9);branches(root,6.8,0,4.95,gold,1.5);
  plate(root,-.65,1.31,-5.2);for(const [x,z] of[[0,0],[.2,.1],[-.16,.14]])cake(root,-.65+x,1.4,-5.2+z);
  for(let i=0;i<3;i++){moon(root,4.65+i*.65,3.03+(i%2)*.16,-5.93,.16);tassel(root,4.65+i*.65,2.85+(i%2)*.16,-5.9);}
 }else if(kind==='chongyang'){
  banner('岁岁安康',sage);garland([gold,ivory]);
  for(const [x,z,s] of[[.6,-2.35,1.7],[6.8,4.95,1.6],[.2,-5.25,.8]])branches(root,x,x===.2?1.28:0,z,x<0?gold:ivory,s,true);
  const p=plinth(root,-5.9,0,1);for(let i=0;i<3;i++)box(p,0,.4+i*.12,0,.48,.11,.36,i%2?pink:ivory);text(p,'重阳糕',0,.9,.3,.22,ink);
 }else if(kind==='winter'){
  banner('冬至团圆','#849fbd');garland([ivory,'#aec5d5']);branches(root,6.8,0,4.95,pink,1.5);
  const p=plinth(root,.6,0,-2.35);bowl(p,0,.58,0,'dumpling');text(p,'冬至',0,1.03,.1,.34,ink);bowl(root,-.7,1.42,-5.15,'tangyuan');
  for(let i=0;i<5;i++){const x=4.8+i*.42,y=3.35-(i%2)*.22;line(root,[[x,y+.15,-5.88],[x,y-.15,-5.88]],ivory,.02);line(root,[[x-.13,y-.08,-5.88],[x+.13,y+.08,-5.88]],ivory,.02);line(root,[[x-.13,y+.08,-5.88],[x+.13,y-.08,-5.88]],ivory,.02);}
 }else if(kind==='new-year'){
  garland([red,gold]);branches(root,6.8,0,4.95,pink,1.7);branches(root,.6,0,-2.35,pink,1.7);
  const diamond=box(root,-.5,2.75,-5.85,.66,.66,.025,red);diamond.rotation.z=Math.PI/4;text(root,'福',-.5,2.75,-5.8,.55,gold);
  for(const x of[2.55,4.7]){
   const cut=group(root,x,1.94,-5.68),paper=box(cut,0,0,0,.61,.61,.009,'#ce5b51');paper.rotation.z=Math.PI/4;paper.castShadow=false;
   text(cut,'福',0,0,.013,.72,gold);
  }
  const p=plinth(root,-5.9,0,1);for(let i=0;i<7;i++){const a=i*2.4;sphere(p,Math.cos(a)*.31,.42+(i%2)*.13,Math.sin(a)*.23,.13,.13,.13,'#efa049');}
 }else if(kind==='lantern'){
  banner('灯火团圆','#cd8e99');garland([red,pink,gold]);
  const p=plinth(root,.6,0,-2.35);rabbit(p,0,.33,0,1.25);line(p,[[0,.35,-.2],[0,1.65,-.2],[.65,1.65,-.2]],gold,.035);lantern(p,.65,1.15,-.2,pink,.7);
  for(let i=0;i<3;i++){line(root,[[5.2+i*.6,0,4.7],[5.2+i*.6,1.9+i*.25,4.7]],gold,.025);lantern(root,5.2+i*.6,1.48+i*.25,4.7,[pink,sage,gold][i],.8);}
  bowl(root,-.7,1.42,-5.15,'tangyuan');
 }
 if(kind==='christmas'){
  garland([red,gold]);
  const tree=group(root,1.05,0,-1.4);
  cylinder(tree,0,.28,0,.17,.55,ink);cylinder(tree,0,.12,0,.62,.22,'#e2c8a2');
  function foliage(y,r,h,c){
   const positions=[],indices=[],n=48,rows=8;
   for(let j=0;j<=rows;j++)for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,t=j/rows;
    const edge=Math.pow(Math.abs(Math.sin(a*8)),5),radius=r*Math.pow(1-t,.86)*(1+.10*edge*(1-t));
    positions.push(Math.cos(a)*radius,y+h*t-.14*edge*Math.pow(1-t,4),Math.sin(a)*radius);
   }
   for(let j=0;j<rows;j++)for(let i=0;i<n;i++){const v=j*(n+1)+i;indices.push(v,v+n+1,v+1,v+1,v+n+1,v+n+2);}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(tree,geo,c);
  }
  for(const [y,r,h,c] of[[.42,1.17,1.58,'#527d68'],[.95,1.02,1.49,'#5e8a70'],[1.51,.82,1.3,'#659374'],[2.02,.61,1.18,'#719f7d'],[2.56,.37,.92,'#83ae85']])foliage(y,r,h,c);
  const wire=[];for(let i=0;i<=120;i++){const y=.55+i/120*2.7,a=i/120*Math.PI*8,r=1.46-y*.4;wire.push([Math.cos(a)*r,y,Math.sin(a)*r]);}line(tree,wire,'#ae9e63',.009);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const gx=glowCanvas.getContext('2d'),gradient=gx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#fffbdde6');gradient.addColorStop(.2,'#ffe5a599');gradient.addColorStop(1,'#ffd98600');gx.fillStyle=gradient;gx.fillRect(0,0,64,64);const glowMap=new T.CanvasTexture(glowCanvas);glowMap.colorSpace=T.SRGBColorSpace;textures.add(glowMap);
  const glowMat=new T.SpriteMaterial({map:glowMap,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});mats.set('fairy-glow',glowMat);
  const bulbMat=new T.MeshBasicMaterial({color:'#fff4ba',toneMapped:false});mats.set('fairy-bulb',bulbMat);
  function glow(x,y,z,size){const halo=new T.Sprite(glowMat);halo.position.set(x,y,z);halo.scale.set(size,size,1);tree.add(halo);}
  for(let i=0;i<40;i++){const y=.55+i/39*2.7,a=i/39*Math.PI*8,r=1.46-y*.4,x=Math.cos(a)*r,z=Math.sin(a)*r;mesh(tree,new T.SphereGeometry(.032,8,6),bulbMat,x,y,z).castShadow=false;glow(x,y,z,.23);}
  for(let i=0;i<17;i++){const y=.64+(i%6)*.43,a=i*2.399,r=1.43-y*.4;sphere(tree,Math.cos(a)*r,y,Math.sin(a)*r,.069,.081,.069,[red,gold,ivory][i%3]);}
  const star=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.13:.29;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)star.lineTo(x,y);else star.moveTo(x,y);}star.closePath();mesh(tree,new T.ExtrudeGeometry(star,{depth:.07,bevelEnabled:false}),bulbMat,0,3.56,0);glow(0,3.56,.06,.9);
  for(let i=0;i<5;i++){const a=i*1.24,x=Math.cos(a)*.95,z=Math.sin(a)*.95;const gift=group(tree,x,.22,z);gift.rotation.y=a;box(gift,0,0,0,.42,.4,.36,[red,pink,ivory][i%3]);box(gift,0,0,.187,.07,.41,.015,gold);box(gift,0,.207,0,.43,.012,.07,gold);sphere(gift,-.06,.24,0,.07,.045,.035,gold);sphere(gift,.06,.24,0,.07,.045,.035,gold);}
 }else if(kind==='halloween'){
  banner('南瓜奇妙夜','#8d789d');garland(['#e9ad64','#a795b6',ivory]);
  function pumpkin(x,z,s=1,carved=false){const p=group(root,x,0,z);p.scale.setScalar(s);for(let i=0;i<9;i++){const a=i*Math.PI*2/9;sphere(p,Math.cos(a)*.22,.34,Math.sin(a)*.22,.28,.31,.28,'#e4a35d');}const stem=cylinder(p,0,.7,0,.057,.2,sage);stem.rotation.z=-.2;
   if(carved){for(const side of[-1,1]){const eye=new T.Shape();eye.moveTo(side*.18-.075,.42);eye.lineTo(side*.18+.065,.42);eye.lineTo(side*.18,.56);eye.closePath();mesh(p,new T.ShapeGeometry(eye),ink,0,0,.478);}line(p,[[-.19,.27,.48],[-.11,.2,.49],[0,.18,.5],[.11,.2,.49],[.19,.27,.48]],ink,.027);}return p;}
  pumpkin(.6,-2.35,1.5,true);pumpkin(1.38,-2.35,.7);pumpkin(6.75,4.8,1.05,true);pumpkin(6.13,5.26,.62);pumpkin(-5.8,.95,.85,true);
  function candy(g,x,y,z,c,angle=0){const p=group(g,x,y,z);p.rotation.z=angle;sphere(p,0,0,0,.095,.063,.058,c);for(const side of[-1,1]){const wrap=mesh(p,new T.ConeGeometry(.065,.12,4),c,side*.14,0,0);wrap.rotation.z=side*Math.PI/2;}line(p,[[-.035,-.054,.025],[.015,.054,.025]],ivory,.018);}
  const basket=group(root,-.8,1.35,-5.13);sphere(basket,0,.06,0,.43,.21,.32,'#a795bb');line(basket,[[-.37,.08,0],[-.33,.48,0],[0,.66,0],[.33,.48,0],[.37,.08,0]],gold,.025);
  for(let i=0;i<11;i++)candy(basket,Math.cos(i*2.4)*.24,.19+(i%3)*.055,Math.sin(i*2.4)*.18,[pink,gold,sage,'#baa3cd'][i%4],i*.6);
  function ghost(x,y,z,s=1){const p=group(root,x,y,z);p.scale.setScalar(s);sphere(p,0,.29,0,.25,.3,.18,'#fff4e5');for(let i=-2;i<=2;i++)sphere(p,i*.093,.095,0,.074,.087,.18,'#fff4e5');for(const side of[-1,1]){sphere(p,side*.092,.36,.17,.025,.038,.017,'#756578');sphere(p,side*.17,.29,.135,.045,.022,.018,pink);sphere(p,side*.25,.25,0,.095,.057,.07,'#fff4e5');}sphere(p,0,.265,.181,.029,.031,.013,'#ad8e95');return p;}
  ghost(1.5,.35,-2.02,1.05);ghost(-5.35,.5,.93,.9);ghost(6.5,.73,4.75,.9);
  const lolly=group(root,1.4,0,-2.65);line(lolly,[[0,0,0],[0,1.3,0]],ivory,.025);const disc=cylinder(lolly,0,1.47,0,.23,.07,pink);disc.rotation.x=Math.PI/2;const spiral=[];for(let i=0;i<=45;i++){const a=i/45*Math.PI*5,r=i/45*.21;spiral.push([Math.cos(a)*r,1.47+Math.sin(a)*r,.044]);}line(lolly,spiral,ivory,.021);
  line(root,[[-2.7,3.09,-5.66],[-1.6,2.84,-5.66],[-.5,3.1,-5.66]],'#967b9b',.016);for(let i=0;i<5;i++)candy(root,-2.6+i*.5,2.83+Math.abs(i-2)*.07,-5.6,[gold,pink,sage][i%3],i*.28);
  for(let i=0;i<3;i++){const bat=new T.Shape();bat.moveTo(-.33,.04);bat.quadraticCurveTo(-.17,.28,-.05,.11);bat.lineTo(0,.17);bat.lineTo(.05,.11);bat.quadraticCurveTo(.17,.28,.33,.04);bat.quadraticCurveTo(.14,.14,.07,-.09);bat.lineTo(-.07,-.09);bat.quadraticCurveTo(-.14,.14,-.33,.04);mesh(root,new T.ShapeGeometry(bat),'#7e6f86',-2.9+i*1.05,2.94,-5.63);}
 }

 if(kind!=='ordinary'){
  const snack=group(root,-2.62,.58,.89);snack.name='festival-tea-snacks';plate(snack,0,.024,0,ivory,.235);
  if(kind==='mid-autumn'){for(const [x,z] of[[-.09,-.06],[.08,-.06],[0,.105]])cake(snack,x,.09,z,.075);}
  else if(kind==='chongyang'){for(const x of[-.085,.085]){box(snack,x,.065,0,.13,.05,.18,ivory);box(snack,x,.106,0,.13,.035,.18,pink);box(snack,x,.143,0,.13,.04,.18,ivory);sphere(snack,x,.171,0,.018,.012,.018,red);}}
  else if(kind==='winter'||kind==='lantern'){const small=group(snack,0,.08,0);small.scale.setScalar(.55);bowl(small,0,0,0,kind==='winter'?'dumpling':'tangyuan');}
  else if(kind==='new-year'){
   for(let i=0;i<4;i++)sphere(snack,Math.cos(i*2.4)*.12,.087,Math.sin(i*2.4)*.1,.06,.06,.06,'#e8a14f');
   for(let i=0;i<3;i++){const packet=group(root,-2.22+i*.115,.594+i*.006,1.0);packet.rotation.y=-.2+i*.3;box(packet,0,0,0,.13,.012,.24,red);box(packet,0,.009,-.074,.105,.004,.012,gold);const seal=cylinder(packet,0,.01,.023,.026,.004,gold);seal.castShadow=false;}
  }else if(kind==='christmas'){
   for(let i=0;i<3;i++){const biscuit=group(snack,-.115+i*.11,.06,(i%2)*.075-.025);biscuit.rotation.y=i*.6;sphere(biscuit,0,.018,-.07,.037,.018,.037,'#ce975c');box(biscuit,0,.015,0,.055,.03,.075,'#ce975c');for(const side of[-1,1]){sphere(biscuit,side*.036,.014,-.02,.032,.014,.018,'#ce975c');sphere(biscuit,side*.023,.014,.052,.019,.014,.038,'#ce975c');}for(const z of[-.005,.026])sphere(biscuit,0,.034,z,.007,.004,.007,ivory);}
  }else if(kind==='halloween'){
   for(let i=0;i<5;i++){const sweet=group(snack,Math.cos(i*2.4)*.115,.075+(i%2)*.025,Math.sin(i*2.4)*.105);sweet.rotation.y=i*.8;cylinder(sweet,0,0,0,.043,.045,[pink,gold,sage][i%3]);box(sweet,0,.025,0,.07,.007,.014,ivory);}
  }
 }

 let outline=null;
 if(root.children.length){optimizeStaticRoom(root);outline=createRoomOutline(root,width,height);root.add(outline);}
 root.userData.dispose=()=>{root.traverse(o=>{if(o.geometry)geos.add(o.geometry);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());outline?.material.dispose();root.removeFromParent();};
 return root;
}
