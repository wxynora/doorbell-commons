import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createTabletopGames} from './tabletop-games.js';
import {createWindowView} from './window-view.js';
const mats=new Map();function mat(c){if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.82}));return mats.get(c);}
const geometries=new Map();
function geometry(Type,args){const key=Type.name+JSON.stringify(args);if(!geometries.has(key))geometries.set(key,new Type(...args));return geometries.get(key);}
const paintedCream='#fff2d8',paintedSage='#abc78e';
const wood='#b28b5e',trim='#d1b286',cream='#f2e3c9',sage='#aaba91',rose='#e7b49b';
function mesh(g,geo,c,x,y,z){const m=new T.Mesh(geo,typeof c==='string'?mat(c):c);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function box(g,x,y,z,w,h,d,c,r=.025){return mesh(g,r?geometry(RoundedBoxGeometry,[w,h,d,2,Math.min(r,w/3,h/3,d/3)]):geometry(T.BoxGeometry,[w,h,d]),c,x,y,z);}
function ball(g,x,y,z,sx,sy,sz,c){const m=mesh(g,geometry(T.SphereGeometry,[1,12,8]),c,x,y,z);m.scale.set(sx,sy,sz);return m;}
function cyl(g,x,y,z,r,h,c,rt=r){return mesh(g,geometry(T.CylinderGeometry,[rt,r,h,24]),c,x,y,z);}
function group(g,x,y,z,angle=0){const n=new T.Group();n.position.set(x,y,z);n.rotation.y=angle;g.add(n);return n;}
function legs(g,w,d,h){for(const x of[-w/2,w/2])for(const z of[-d/2,d/2])box(g,x,h/2,z,.085,h,.085,wood);}
function book(g,x,y,z,c,w=.16,h=.45,angle=0){const b=group(g,x,y,z,angle);box(b,0,0,0,w,h,.32,c,.008);box(b,0,h*.25,.168,w*.65,.018,.006,cream,0);box(b,0,-h*.25,.168,w*.65,.018,.006,cream,0);return b;}
function cup(g,x,y,z,c=cream){cyl(g,x,y+.09,z,.075,.16,c,.09);cyl(g,x,y+.172,z,.07,.004,'#705335');const h=mesh(g,new T.TorusGeometry(.055,.013,6,12),c,x+.096,y+.1,z);return h;}
function flower(g,x,y,z,c='#f3d9c9',s=1){for(let k=0;k<5;k++){let a=k*Math.PI*2/5;ball(g,x+Math.cos(a)*.055*s,y,z+Math.sin(a)*.055*s,.044*s,.025*s,.045*s,c);}ball(g,x,y+.014,z,.025*s,.019*s,.025*s,'#e2b45f');}
function plant(g,x,y,z,s=1,bloom=false){const p=group(g,x,y,z);p.scale.setScalar(s);cyl(p,0,.16,0,.19,.3,'#c49570',.235);cyl(p,0,.31,0,.208,.02,'#655d3d');for(let i=0;i<20;i++){const a=i*2.3999,h=.36+(i%5)*.11,r=.1+(i%4)*.04;const l=ball(p,Math.cos(a)*r,h,Math.sin(a)*r,.065,.2,.09,['#6f8a4d','#91a568','#b6bb7b'][i%3]);l.rotation.set(Math.sin(a)*.8,0,Math.cos(a)*.8);if(bloom&&i%4===0)flower(p,Math.cos(a)*r,h+.16,Math.sin(a)*r,'#f5dfb5',1.15);}return p;}
function chair(g,x,z,c,angle=0,w=.9){
 const p=group(g,x,0,z,angle);p.userData.poseChair=true;
 const puff=(x,y,z,width,height,depth,r)=>mesh(p,geometry(RoundedBoxGeometry,[width,height,depth,5,r]),c,x,y,z);
 legs(p,w*.72,.66,.34);
 puff(0,.48,0,w,.34,.9,.15);
 puff(0,.99,-.34,w,.98,.3,.145).userData.poseBack=true;
 puff(0,.72,.025,w-.2,.28,.76,.13);
 for(const side of[-1,1])puff(side*(w/2-.1),.78,0,.23,.48,.85,.11).userData.poseArm=true;
 return p;
}
function cloudSofa(g,x,z){
 const p=group(g,x,0,z);p.name='cloud-sofa';p.userData.poseChair=true;
 const puff=(x,y,z,w,h,d,color,r)=>mesh(p,geometry(RoundedBoxGeometry,[w,h,d,5,r]),color,x,y,z);
 for(const side of[-1,1])for(const depth of[-.29,.29])cyl(p,side*.85,.22,depth,.085,.29,wood);
 puff(0,.46,0,2.23,.32,.87,'#edc77e',.145);
 // One continuous scalloped back, so there are no dark seams between cloud lobes.
 const back=new T.Shape();back.moveTo(-1,.56);back.lineTo(1,.56);
 back.quadraticCurveTo(1.09,.66,1.09,1.0);
 back.bezierCurveTo(1.12,1.42,.8,1.68,.48,1.38);
 back.bezierCurveTo(.29,1.72,-.29,1.72,-.48,1.38);
 back.bezierCurveTo(-.8,1.68,-1.12,1.42,-1.09,1.0);
 back.quadraticCurveTo(-1.09,.66,-1,.56);back.closePath();
 mesh(p,new T.ExtrudeGeometry(back,{depth:.14,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:.065,bevelThickness:.065,curveSegments:16}),'#edc77e',0,0,-.4);
 puff(0,.7,.035,1.98,.32,.77,'#f3d395',.15);
 for(const side of[-1,1])puff(side*1.005,.77,0,.34,.62,.86,'#edc77e',.165).userData.poseArm=true;
 const pillow=puff(.6,1.05,-.075,.47,.46,.22,rose,.105);pillow.rotation.z=-.18;
 return p;
}
function table(g,x,z,w,d,h,round=false){const p=group(g,x,0,z);legs(p,w*.74,d*.72,h-.08);if(round)cyl(p,0,h,0,w/2,.12,wood);else box(p,0,h,0,w,.13,d,wood,.1);return p;}
function moneyTree(g,x,z){
 const p=group(g,x,0,z);p.name='corner-money-tree';
 cyl(p,0,.25,0,.29,.5,'#c6ad8b',.35);cyl(p,0,.51,0,.31,.025,'#655b40');
 // Braided slender trunks, with the foliage gathered above the exposed stems.
 for(let stem=0;stem<3;stem++){
  const points=[];for(let i=0;i<=16;i++){const a=stem*Math.PI*2/3+i*.42;points.push(new T.Vector3(Math.cos(a)*.045,.52+i*.071,Math.sin(a)*.045));}
  mesh(p,new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.031,6,false),['#9a7950','#b18b5e','#a58256'][stem],0,0,0);
 }
 const shape=new T.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(.12,.105,.35,0);shape.quadraticCurveTo(.12,-.105,0,0);
 const leafGeometry=new T.ShapeGeometry(shape,8);
 const leafMaterials=['#66834f','#819858','#97aa6d'].map(color=>new T.MeshStandardMaterial({color,roughness:.9,side:T.DoubleSide}));
 for(let crown=0;crown<7;crown++){
  const a=crown*2.4,center=new T.Vector3(Math.cos(a)*.16,1.72+(crown%3)*.18,Math.sin(a)*.16);
  const branch=new T.CatmullRomCurve3([new T.Vector3(0,1.37,0),new T.Vector3(center.x*.6,center.y-.16,center.z*.6),center]);
  mesh(p,new T.TubeGeometry(branch,8,.016,5,false),'#8d9360',0,0,0);
  const palm=group(p,center.x,center.y,center.z,a);palm.rotation.z=(crown%2?1:-1)*.22;
  for(let i=0;i<5;i++){
   const blade=group(palm,0,0,0,i*Math.PI*2/5);
   const leaf=mesh(blade,leafGeometry,leafMaterials[(crown+i)%3],0,0,0);leaf.rotation.x=-Math.PI/2;leaf.userData.noOutline=true;
  }
 }
 return p;
}
function wallClock(g,x,y,z){
 const p=group(g,x,y,z);p.name='decorative-wall-clock';
 const rim=cyl(p,0,0,0,.32,.075,wood);rim.rotation.x=Math.PI/2;
 const face=cyl(p,0,0,.044,.275,.012,'#f7edda');face.rotation.x=Math.PI/2;
 for(let i=0;i<12;i++){
  const a=i*Math.PI/6,tick=box(p,Math.sin(a)*.229,Math.cos(a)*.229,.054,.017,i%3===0?.047:.025,.006,'#a58d70',0);
  tick.rotation.z=-a;tick.userData.noOutline=true;
 }
 const hand=(angle,length,width)=>{const m=box(p,Math.sin(angle)*length/2,Math.cos(angle)*length/2,.065,width,length,.009,'#89745c',0);m.rotation.z=-angle;m.userData.noOutline=true;};
 hand(-Math.PI/3,.145,.024);hand(Math.PI/3,.207,.017);
 const hub=ball(p,0,0,.072,.029,.029,.011,'#a58762');hub.userData.noOutline=true;
 return p;
}
function cookiePlate(g,x,y,z){
 const p=group(g,x,y,z);p.name='tea-table-cookie-plate';
 const kinds=['cookies','macarons','strawberry-cake','donuts','pudding','fruit'];
 const kind=kinds[Math.floor(Math.random()*kinds.length)];p.userData.snackKind=kind;
 cyl(p,0,.019,0,.235,.036,'#f5e7cc');
 const rim=mesh(p,new T.TorusGeometry(.212,.012,6,32),'#d7bd91',0,.04,0);rim.rotation.x=Math.PI/2;rim.userData.noOutline=true;
 if(kind==='cookies')for(let i=0;i<4;i++){
  const a=i*Math.PI/2+.3,cookie=group(p,Math.cos(a)*.097,.057+(i%2)*.013,Math.sin(a)*.097,a);
  cyl(cookie,0,0,0,.079,.034,'#d9ac68');
  for(const [cx,cz] of [[-.025,.026],[.031,.012],[.003,-.034]])ball(cookie,cx,.018,cz,.012,.006,.011,'#94704b');
 }
 if(kind==='macarons')for(let i=0;i<3;i++){
  const a=i*Math.PI*2/3,q=group(p,Math.cos(a)*.105,.075,Math.sin(a)*.105);
  const color=['#e9a9b7','#b7cc8b','#c6b2d9'][i];
  cyl(q,0,0,0,.077,.022,'#fff3d9');ball(q,0,.025,0,.08,.032,.08,color);ball(q,0,-.023,0,.08,.027,.08,color);
 }
 if(kind==='strawberry-cake'){
  cyl(p,0,.095,0,.15,.11,'#efd391');cyl(p,0,.11,0,.153,.025,'#f5bdc4');cyl(p,0,.155,0,.15,.032,'#fff4df');
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.cos(a)*.085,z=Math.sin(a)*.085;ball(p,x,.208,z,.039,.052,.039,'#d97673');ball(p,x,.251,z,.032,.01,.032,'#86a164');}
 }
 if(kind==='donuts')for(let i=0;i<2;i++){
  const q=group(p,(i-.5)*.19,.081,(i-.5)*.07);
  const dough=mesh(q,new T.TorusGeometry(.067,.031,8,24),'#dcb779',0,0,0);dough.rotation.x=Math.PI/2;
  const icing=mesh(q,new T.TorusGeometry(.067,.024,8,24),i?'#986e57':'#efb5c0',0,.02,0);icing.rotation.x=Math.PI/2;
  for(let k=0;k<5;k++){const a=k*Math.PI*2/5;box(q,Math.cos(a)*.067,.041,Math.sin(a)*.067,.017,.008,.008,'#fff0c2',.002);}
 }
 if(kind==='pudding'){
  cyl(p,0,.115,0,.13,.15,'#f3d184',.105);cyl(p,0,.192,0,.105,.018,'#b77e49');ball(p,0,.221,0,.048,.026,.048,'#fff4dc');ball(p,.02,.251,0,.024,.024,.024,'#d37a72');
 }
 if(kind==='fruit'){
  for(let i=0;i<7;i++){const a=i*2.4;ball(p,Math.cos(a)*.1,.065+(i%3)*.025,Math.sin(a)*.1,.038,.035,.038,'#8c719d');}
  for(let i=0;i<3;i++){const q=group(p,.1-i*.07,.07,-.1,.3+i*.4);ball(q,0,0,0,.042,.026,.08,'#f4c36f');ball(q,0,.009,0,.03,.024,.068,'#ffe4a0');}
 }
 // Tiny toppings need no extra outline at this scale.
 p.traverse(o=>{if(o.isMesh)o.userData.noOutline=true;});
 return p;
}
function rug(g,x,z,w,d,c,pattern=false){
 box(g,x,.065,z,w,.035,d,c,.15);
 if(!pattern)return;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle=c;ctx.fillRect(0,0,128,128);
 ctx.fillStyle='#f0e6ce';ctx.globalAlpha=.6;ctx.fillRect(32,0,64,128);ctx.fillRect(0,32,128,64);
 ctx.globalAlpha=.35;ctx.fillStyle='#939b79';
 for(const n of[23,105]){ctx.fillRect(n,0,2,128);ctx.fillRect(0,n,128,2);}
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set((w-.14)/.72,(d-.14)/.72);
 const plaid=mesh(g,new T.PlaneGeometry(w-.14,d-.14),new T.MeshStandardMaterial({map:texture,roughness:1}),x,.084,z);
 plaid.rotation.x=-Math.PI/2;plaid.name='rug-plaid';plaid.userData.noOutline=true;plaid.castShadow=false;
}
function wallArt(g,x,y,z,w,h,kind,angle=0){
 const p=group(g,x,y,z,angle);p.name=`wall-art-${kind}`;
 box(p,0,0,0,w,h,.065,trim,.025);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=320;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#faf1de';ctx.fillRect(0,0,256,320);
 ctx.fillStyle=kind==='landscape'?'#dce5dc':'#ece5d3';ctx.fillRect(24,24,208,272);
 if(kind==='landscape'){
  ctx.fillStyle='#e6be7b';ctx.beginPath();ctx.arc(169,100,28,0,Math.PI*2);ctx.fill();
  for(const [color,points] of [['#b2c2ac',[[24,209],[84,131],[153,211],[196,166],[232,211]]],['#93ad9d',[[24,256],[98,207],[160,246],[232,210]]]]){
   ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(24,296);for(const [px,py] of points)ctx.lineTo(px,py);ctx.lineTo(232,296);ctx.closePath();ctx.fill();
  }
 }else{
  ctx.strokeStyle='#8d9b75';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(128,260);ctx.quadraticCurveTo(119,178,136,91);ctx.stroke();
  for(let i=0;i<5;i++){const side=i%2?1:-1;ctx.fillStyle=i%2?'#9aaa82':'#b4bd93';ctx.beginPath();ctx.ellipse(129+side*21,222-i*27,27,11,side*.55,0,Math.PI*2);ctx.fill();}
  if(kind==='flower'){
   ctx.fillStyle='#dba99b';for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.ellipse(137+Math.cos(a)*23,88+Math.sin(a)*23,19,14,a,0,Math.PI*2);ctx.fill();}
   ctx.fillStyle='#d6b36b';ctx.beginPath();ctx.arc(137,88,13,0,Math.PI*2);ctx.fill();
  }
 }
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const art=mesh(p,new T.PlaneGeometry(w-.1,h-.1),new T.MeshStandardMaterial({map:texture,roughness:1}),0,0,.034);
 art.userData.noOutline=true;art.castShadow=false;return p;
}
function newspaperRack(g){
 const p=group(g,-2.7,0,-3.95,.15);p.name='newspaper-rack';p.userData.newspaperRack=true;p.scale.setScalar(1.6);
 for(const x of[-.36,.36])for(const z of[-.2,.2])box(p,x,.43,z,.06,.86,.06,wood);
 box(p,0,.72,.03,.85,.62,.09,paintedSage,.025);
 for(let row=0;row<2;row++){
  const y=.38+row*.35;box(p,0,y,.16,.86,.08,.3,paintedCream);
  for(let i=0;i<3;i++){
   const paper=box(p,(i-1)*.24,y+.18,.19,.22,.3,.018,'#fff5df',.004);
   for(let line=0;line<4;line++)box(p,(i-1)*.24,y+.24-line*.044,.202,.15,.008,.003,'#b3a48e',0);
  }
  box(p,0,y+.08,.32,.88,.045,.035,wood,.01);
 }
 return p;
}
function readingNotice(g){
 const p=group(g,3.48,0,-1.86,0);p.name='reading-closed-notice';
 box(p,0,.07,0,.72,.12,.42,wood,.04);
 box(p,0,.49,0,.095,.82,.095,wood,.015);
 box(p,0,.99,0,1.03,.56,.09,trim,.06);
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff3d9';ctx.fillRect(0,0,640,320);
 ctx.strokeStyle='#c5ab82';ctx.lineWidth=3;ctx.strokeRect(14,14,612,292);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#8b9b70';
 ctx.font='36px "Yuanti SC",sans-serif';ctx.fillText('阅 读 角',320,85);
 ctx.fillStyle='#72543b';ctx.font='700 112px "Yuanti SC","PingFang SC",sans-serif';ctx.fillText('暂未开放',320,205);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const face=mesh(p,new T.PlaneGeometry(.94,.47),new T.MeshStandardMaterial({map:texture,roughness:1}),0,.99,.047);
 face.userData.noOutline=true;face.castShadow=false;
 return p;
}
function window(g,x,y,z,w,h){
 const p=group(g,x,y,z);p.add(createWindowView(w,h));
 const glass=new T.MeshStandardMaterial({color:'#daeae3',roughness:.2,transparent:true,opacity:.055});
 box(p,0,0,-.04,w,h,.025,glass,0);
 for(const side of[-1,1])box(p,side*w/2,0,0,.09,h+.1,.13,trim);
 box(p,0,-h/2,0,w+.17,.1,.25,trim);box(p,0,h/2,0,w+.17,.1,.13,trim);
 box(p,0,0,.015,.075,h,.09,trim);return p;
}
function chibi(g,x,z){
 const p=group(g,x,.025,z,.38);p.name='chibi-standing-preview';
 const skin='#f0c5a5',hair='#655044',shirt='#a8bda3',pants='#777b83',shoe='#f0e7d7';
 const body=group(p,0,0,0);body.name='chibi-body';body.scale.set(.74,1,.82);
 // Feet sit on the same floor as the furniture. A separate head keeps the silhouette chibi.
 for(const side of[-1,1]){
  box(body,side*.145,.115,.045,.24,.19,.37,shoe,.07);
  box(body,side*.145,.052,.045,.245,.047,.375,'#c5b9a6',.015);
  box(body,side*.145,.36,0,.22,.42,.25,pants,.06);
 }
 box(body,0,.76,0,.61,.56,.35,shirt,.13);
 box(body,0,.52,0,.57,.065,.36,'#92a78c',.02);
 cyl(body,0,1.067,0,.11,.16,skin);
 for(const side of[-1,1]){
  const arm=group(body,side*.32,.96,0,0);arm.rotation.z=side*.16;
  box(arm,0,-.16,0,.19,.36,.26,shirt,.08);
  box(arm,0,-.315,0,.195,.07,.255,'#92a78c',.02);
  ball(arm,0,-.415,.015,.092,.12,.096,skin);
  const collar=box(body,side*.1,1.011,.162,.17,.11,.05,shoe,.016);collar.rotation.z=side*.3;
 }
 for(let i=0;i<3;i++)ball(body,0,.9-i*.12,.186,.018,.018,.014,'#eee3cc');
 box(body,.18,.8,.182,.13,.12,.025,'#bbccad',.014);
 ball(p,0,1.48,0,.405,.4,.345,skin);
 for(const side of[-1,1]){ball(p,side*.39,1.45,0,.075,.105,.07,skin);ball(p,side*.412,1.45,.044,.031,.055,.015,'#dfaa92');}
 const cap=mesh(p,new T.SphereGeometry(1,24,14,0,Math.PI*2,0,Math.PI*.53),hair,0,1.5,-.025);cap.scale.set(.426,.425,.372);
 for(let i=0;i<7;i++){
  const xx=-.29+i*.092,yy=1.72-Math.abs(xx)*.1;
  const lock=ball(p,xx,yy,.23,.095,.19+(i%3)*.016,.11,i%3===0?'#776051':hair);lock.rotation.z=-.25+i*.04;
 }
 for(const side of[-1,1]){
  ball(p,side*.352,1.54,.075,.071,.19,.12,hair);
  ball(p,side*.145,1.455,.319,.043,.063,.024,'#443c36');
  ball(p,side*.135,1.479,.339,.012,.017,.008,'#fff3dc');
  ball(p,side*.253,1.37,.282,.063,.031,.012,'#e7a995');
 }
 ball(p,0,1.373,.342,.028,.028,.027,skin);
 const smile=mesh(p,new T.TorusGeometry(.039,.007,5,14,Math.PI),'#a46e5c',0,1.305,.309);smile.rotation.z=Math.PI;
 return p;
}
function gachaMachine(g){
 const p=group(g,-6.0,0,-1.35,.35);p.name='lounge-gacha-machine';p.userData.gachaMachine=true;
 const pink='#d99c98',ivory='#fff0d9',dark='#80605b',gold='#d5ad65';
 // A compact enamel machine: transparent capsule drum, crank and prize hatch.
 box(p,0,.13,0,1.03,.2,.88,pink,.09);
 box(p,0,.56,0,.86,.78,.76,ivory,.13);
 box(p,0,.94,0,.97,.13,.85,pink,.06);
 cyl(p,0,1.03,0,.41,.09,ivory);
 const glass=new T.MeshStandardMaterial({color:'#fff4dd',transparent:true,opacity:.19,roughness:.18,depthWrite:false});
 const drum=mesh(p,new T.SphereGeometry(.45,24,16),glass,0,1.43,0);drum.scale.y=1.08;drum.castShadow=false;drum.userData.noOutline=true;
 const colors=['#e4a8a5','#b3c89a','#e9c875','#acc9cb'];
 for(let i=0;i<13;i++){
  const a=i*2.4,r=i<8?.26:.17,y=1.16+Math.floor(i/5)*.14;
  const q=group(p,Math.cos(a)*r,y,Math.sin(a)*r);q.rotation.z=i*.7;
  mesh(q,new T.SphereGeometry(.105,12,8,0,Math.PI*2,0,Math.PI/2),colors[i%4],0,0,0);
  mesh(q,new T.SphereGeometry(.105,12,8,0,Math.PI*2,Math.PI/2,Math.PI/2),ivory,0,0,0);
 }
 cyl(p,0,1.91,0,.31,.07,pink,.27);ball(p,0,1.97,0,.08,.04,.08,gold);
 const bezel=cyl(p,0,.72,.399,.16,.036,gold);bezel.rotation.x=Math.PI/2;
 const dial=cyl(p,0,.72,.425,.126,.033,ivory);dial.rotation.x=Math.PI/2;
 box(p,0,.72,.458,.18,.047,.07,dark,.022);
 box(p,.28,.76,.4,.025,.13,.012,dark,.009);
 box(p,0,.34,.399,.43,.23,.05,dark,.07);
 box(p,0,.248,.455,.47,.045,.16,pink,.018);
 const hatch=box(p,0,.41,.44,.39,.065,.02,'#c5ad91',.02);hatch.rotation.x=-.3;
 // Label is drawn at print resolution and belongs to the machine's own coordinates.
 const label=document.createElement('canvas');label.width=512;label.height=128;
 const ctx=label.getContext('2d');ctx.fillStyle=ivory;ctx.fillRect(0,0,512,128);
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=dark;ctx.font='700 66px "Quicksand","Yuanti SC",sans-serif';ctx.fillText('500 金币',256,64);
 const texture=new T.CanvasTexture(label);texture.colorSpace=T.SRGBColorSpace;
 const sign=mesh(p,new T.PlaneGeometry(.65,.16),new T.MeshBasicMaterial({map:texture}),0,.08,.452);sign.userData.noOutline=true;sign.castShadow=false;
 return p;
}
export function buildRoom(){geometries.clear();const root=new T.Group();let room=group(root,0,0,0);room.scale.set(1.25,1,1.25);
 // Cutaway room. All furnishings share this floor coordinate system.
 box(room,0,-.17,.3,12.5,.3,10.7,trim,.18);box(room,0,-.015,.3,12.25,.08,10.45,'#e1c59e',.13);
 for(let row=0;row<17;row++)for(let col=-1;col<4;col++){const start=-6.1+col*3.05+(row%2)*1.525,left=Math.max(-6.1,start),right=Math.min(6.1,start+3.05);if(right-left<.02)continue;const board=box(room,(left+right)/2,.036,-4.57+row*.612,right-left-.018,.017,.594,'#e6ceaa',0);board.userData.noOutline=true;board.castShadow=false;}
 box(room,-2.4625,1.65,-4.87,7.325,3.3,.18,cream);box(room,5.4,1.65,-4.87,1.6,3.3,.18,cream);
 box(room,2.9,.4,-4.87,3.4,.8,.18,cream);box(room,2.9,3.175,-4.87,3.4,.25,.18,cream);
 window(room,2.9,1.925,-4.86,3.4,2.25);
 for(const y of[.16,3.32])box(room,0,y,-4.75,12.4,.12,.13,trim);
 box(room,-6.12,1.27,-2.35,.18,2.54,4.95,cream);box(room,-6.01,.18,-2.35,.12,.14,4.95,trim);box(room,-6.01,2.55,-2.35,.12,.11,4.95,trim);
 wallArt(room,-2.02,2.25,-4.74,.82,1.02,'flower');
 wallArt(room,-.93,2.29,-4.74,.92,.82,'landscape');
 wallArt(room,-6.0,1.62,-1.3,.8,1.05,'leaves',Math.PI/2);
 wallClock(room,.56,2.43,-4.73);
 // Bulletin board, handwritten notes and little pins.
 room=group(root,-1,0,-1.2);
 box(room,-4.0,2.02,-4.65,2.15,1.42,.15,wood);box(room,-4,2.02,-4.55,1.92,1.19,.06,'#c3a277');
 for(let i=0;i<5;i++){const x=-4.65+(i%3)*.61,y=2.32-Math.floor(i/3)*.56;const paper=box(room,x,y,-4.5,.43,.43,.015,['#f4ebcf','#efd2c2','#dce3c5'][i%3]);paper.rotation.z=(i-2)*.04;ball(room,x,y+.16,-4.47,.03,.03,.02,'#b96e54');for(let k=0;k<3;k++)box(room,x,y-.02-k*.07,-4.477,.25,.012,.008,'#c5b79b',0);}
 plant(room,-4.9,0,-3.6,1.3);newspaperRack(room);
 room=group(root,0,0,-1.2);
 const tea=group(room,-.8,0,-4.12);legs(tea,2.3,.65,.2);box(tea,0,.64,0,2.65,1,.82,paintedCream);box(tea,0,1.19,0,2.8,.16,.95,trim);
 for(let i=0;i<3;i++){box(tea,-.86+i*.86,.66,.43,.78,.72,.06,paintedSage);ball(tea,-.65+i*.86,.66,.48,.035,.035,.035,'#806b48');}
 for(let i=0;i<3;i++)cup(tea,-.86+i*.3,1.28,.13,['#b7cac1','#eed9b3','#e7b698'][i]);ball(tea,.3,1.51,0,.2,.21,.19,cream);cyl(tea,.3,1.73,0,.13,.035,cream);ball(tea,.3,1.78,0,.045,.04,.045,wood);const spout=cyl(tea,.49,1.57,0,.055,.23,cream,.038);spout.rotation.z=-.65;plant(tea,1,1.28,0,.65,true);
 room=group(root,.7,0,-1.2);
 box(room,2.77,.48,-4.1,2.8,.55,1.12,paintedCream);box(room,2.77,.83,-4.08,2.75,.22,1.12,'#dedec2',.13);box(room,1.84,1.12,-4.44,.55,.61,.16,rose,.09).rotation.z=.1;box(room,2.4,1.12,-4.44,.52,.6,.16,'#acb9b7',.09);plant(room,3.72,.95,-4.05,.72);
 readingNotice(room);
 // Bookcase and quiet reading nook.
 room=group(root,1.1,0,-1.15);
 const shelf=group(room,5.12,0,-3.5,0);box(shelf,0,1.39,-.22,2.0,2.78,.12,paintedSage);
 for(const x of[-1,1])box(shelf,x,1.38,0,.11,2.8,.6,paintedCream);for(let row=0;row<4;row++){const y=.22+row*.68;box(shelf,0,y,0,2.05,.09,.63,paintedCream);for(let k=0;k<9;k++)book(shelf,-.84+k*.2,y+.27,0,['#edc487','#b4c8bc','#d7b4b6','#a3b7c1','#e8d5b2'][k%5],.16,.42+(k%3)*.05);}
 plant(room,5.5,2.86,-3.1,.68);chair(room,4.24,-2.6,'#b4c3c2',-.35);const rt=table(room,4.95,-1.8,.57,.57,.62,true);plant(rt,0,.7,0,.55,true);
 // Conversation island.
 room=group(root,-.9,0,-.35);
 rug(room,-1.45,.35,5.1,4.25,'#d8d7b6',true);cloudSofa(room,-1.5,-.85);
 chair(room,-3.04,1.0,'#b2bfbb',.85);chair(room,.12,1.02,sage,-.85);const coffee=table(room,-1.48,1.0,1.6,1.05,.51);plant(coffee,-.26,.59,-.16,.47,true);cup(coffee,.49,.59,.15);box(coffee,.22,.62,-.17,.32,.06,.44,'#96b6c4');box(coffee,.2,.67,-.16,.27,.04,.41,cream);
 cookiePlate(coffee,-.24,.58,.24);
 // Four-seat mahjong table; physical tiles, not a flat symbol.
 room=group(root,1.15,0,.15);
 const mah=table(room,3.37,.77,1.8,1.8,.77);box(mah,0,.855,0,1.57,.027,1.57,'#759b83');for(let side=0;side<4;side++)chair(room,3.37+Math.sin(side*Math.PI/2)*1.26,.77+Math.cos(side*Math.PI/2)*1.26,rose,side*Math.PI/2+Math.PI,.7).userData.tableChair=true;
 // Card table and upholstered stools.
 room=group(root,.15,0,1.45);
 const cards=table(room,1.0,3.77,1.9,1.9,.65,true);mah.name='square-game-table';mah.userData.gameTable='square';cards.name='round-game-table';cards.userData.gameTable='round';root.userData.tabletopGames=createTabletopGames(mah,cards);
 for(let i=0;i<4;i++){const a=i*Math.PI/2;const st=group(room,1+Math.cos(a)*1.3,0,3.77+Math.sin(a)*1.3);legs(st,.37,.37,.4);cyl(st,0,.48,0,.36,.17,[sage,'#c8bbcf',cream,'#bac9c7'][i]);}
 // Low dividers, bench and pet corner.
 room=group(root,1.6,0,.7);
 const bench=group(room,5.24,0,3.12,-Math.PI/2);legs(bench,1.85,.54,.36);box(bench,0,.46,0,2.24,.17,.78,wood);box(bench,0,.59,0,2.12,.15,.69,cream,.08);for(let i=0;i<2;i++)box(bench,-.54+i*1.08,.72,0,.67,.17,.57,[rose,'#afc3cc'][i],.06);
 room=group(root,-1,0,1.25);
 const div=group(room,-2.37,0,3.62);box(div,0,.43,0,.55,.82,1.45,wood);box(div,0,.91,0,.68,.1,1.6,trim);plant(div,0,.97,-.37,.82);for(let i=0;i<4;i++)book(div,-.04,.43,-.51+i*.27,['#bdceae','#e1ae9b','#d8cfad','#a4bac0'][i],.17,.43,Math.PI/2);
 rug(room,-4.5,3.53,2.3,2.7,'#d0d4ae',true);cyl(room,-4.84,.16,4.05,.5,.21,'#b4be96');cyl(room,-4.84,.28,4.05,.43,.09,cream);ball(room,-4.84,.4,4.05,.3,.16,.22,'#aaa9a0');ball(room,-5.04,.49,4.1,.14,.14,.13,'#bcbab0');for(const x of[-5.13,-4.96])mesh(room,new T.ConeGeometry(.065,.15,4),'#aaa9a0',x,.63,4.09);for(const x of[-5.1,-4.99])ball(room,x,.5,4.21,.013,.009,.008,'#665d50');
 const dog=group(room,-4.05,0,3.3);ball(dog,0,.25,0,.23,.2,.34,'#d3a777');ball(dog,0,.43,.23,.22,.22,.2,'#e5c295');for(const x of[-.19,.19])ball(dog,x,.41,.24,.09,.16,.1,'#b8895b');ball(dog,0,.37,.42,.12,.07,.08,cream);ball(dog,0,.4,.49,.035,.026,.02,'#645044');for(const x of[-.085,.085])ball(dog,x,.48,.401,.018,.025,.014,'#645044');
 for(let i=0;i<2;i++){cyl(room,-4.97+i*.49,.12,2.48,.21,.12,['#a6c3bb','#d8c69b'][i]);cyl(room,-4.97+i*.49,.184,2.48,.16,.006,i?'#8b7052':'#b0c9ce');}
 moneyTree(root,-7.0,-5.45);gachaMachine(root);
 plant(root,7.1,0,5.6,1.25);plant(root,-7.0,0,.22,1.0,true);geometries.clear();return root;
}
