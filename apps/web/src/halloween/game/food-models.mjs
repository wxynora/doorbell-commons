import * as THREE from 'three';
import {retainModelResources} from './model-kit-v4.mjs';
import { material, mesh, sphere, cylinder, softBox, createCandy } from './three-models.mjs';

const templates = new Map();
function texture(base, seed = 1, grain = .14, stripes = 0) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(256, 128), color = new THREE.Color(base);
  const rgb = [color.r, color.g, color.b].map(value => THREE.ColorManagement.workingToColorSpace(new THREE.Color().setRGB(value, value, value), THREE.SRGBColorSpace).r * 255);
  let state = seed;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const variation = 1 + ((state / 4294967296) - .5) * grain + Math.sin(x * .14 + Math.sin(y * .12) * 2) * stripes;
    const index = (y * 256 + x) * 4;
    for (let i = 0; i < 3; i++) pixels.data[index + i] = Math.min(255, rgb[i] * variation);
    pixels.data[index + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0); const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace; return result;
}
const foodMaterial = (color, seed = 1, extra = {}) => new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: texture(color, seed, .2, .02), roughness: .36, clearcoat: .25, clearcoatRoughness: .3, ...extra });
function lathe(points, mat, segments = 48) { return mesh(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), segments), mat); }
function tube(points, radius, mat, segments = 16) { return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), segments, radius, 8, false), mat); }
function bowl(color = '#a56735') {
  const group = new THREE.Group();
  group.add(lathe([[0,0],[.19,0],[.28,.035],[.43,.26],[.45,.34],[.435,.36],[.411,.335],[.39,.27],[.25,.08],[0,.065]], foodMaterial(color, 12, { roughness:.62 })));
  const rim = mesh(new THREE.TorusGeometry(.43,.024,8,48),material('#dcb37a'),[0,.34,0]);rim.rotation.x=Math.PI/2;group.add(rim);
  const band=mesh(new THREE.TorusGeometry(.29,.014,6,40),material('#715037'),[0,.11,0]);band.rotation.x=Math.PI/2;group.add(band);return group;
}
function leaf(color = '#477a36', length = .5) {
  const shape = new THREE.Shape(); shape.moveTo(0,0);shape.bezierCurveTo(-.19,.15,-.22,.32,0,.6);shape.bezierCurveTo(.22,.32,.19,.15,0,0);
  const geometry=new THREE.ShapeGeometry(shape,14);const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getY(i)/.6*Math.PI)*.045+Math.abs(p.getX(i))*.1);
  geometry.computeVertexNormals();const group=new THREE.Group();group.add(mesh(geometry,foodMaterial(color,33,{side:THREE.DoubleSide,roughness:.65})));
  group.add(tube([[0,0,.007],[0,.25,.052],[0,.6,.008]],.006,material('#9cac63'),12));group.scale.setScalar(length/.6);return group;
}
function apple(color = '#b93125', pumpkin = false) {
  const group=new THREE.Group(),geometry=new THREE.SphereGeometry(.42,48,32),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),angle=Math.atan2(z,x),top=Math.max(0,y/.42);
    const lobes=pumpkin?1+Math.cos(angle*8)*.075:1+Math.cos(angle*5)*.026;
    positions.setXYZ(i,x*lobes,y*.9-top**8*.08,z*lobes);
  }
  geometry.computeVertexNormals();group.add(mesh(geometry,foodMaterial(color,81,{clearcoat:.5,roughness:.27}),[0,.39,0]));
  group.add(tube([[0,.71,0],[.015,.82,.01],[.045,.88,-.015]],.025,foodMaterial('#6e4930',4,{roughness:.8})));
  const l=leaf(pumpkin?'#668044':'#548238',.3);l.position.set(.03,.8,.02);l.rotation.set(-.8,0,-.8);group.add(l);return group;
}
function berries(name){
  const group=bowl(name==='夜影莓'?'#564263':'#a16a3d'),red=name==='蔓越莓';
  const mat=foodMaterial(red?'#b62830':name==='午夜黑醋栗'?'#352d49':'#41416b',17,{roughness:.25,clearcoat:.6});
  for(let i=0;i<9;i++){
    const a=i*2.399,r=i<6?.22:.12,y=.39+Math.floor(i/6)*.13;
    const fruit=sphere(.128,mat,[Math.sin(a)*r,y,Math.cos(a)*r]);group.add(fruit);
    const crown=mesh(new THREE.CircleGeometry(.027,5),material('#332b31'),[Math.sin(a)*r,y+.128,Math.cos(a)*r]);crown.rotation.x=-Math.PI/2;group.add(crown);
  }
  const l=leaf('#628342',.28);l.rotation.x=-1.2;l.rotation.z=.8;l.position.set(.15,.48,-.15);group.add(l);return group;
}
function whipped(color='#fff0d4', ghost=false){
  const group=bowl('#ba895e'); const points=[];
  for(let i=0;i<=100;i++){const t=i/100,r=.29*(1-t)**.7;points.push([Math.cos(t*Math.PI*7)*r,.32+t*.48,Math.sin(t*Math.PI*7)*r]);}
  group.add(tube(points,.075,foodMaterial(color,19,{roughness:.42}),100));
  if(ghost)for(const x of[-.07,.07])group.add(sphere(.025,material('#44303b'),[x,.61,.17],[1,1.3,.5]));return group;
}
function honeycomb(){
  const group=new THREE.Group(),gold=foodMaterial('#c88a25',47,{clearcoat:.6,roughness:.24});
  const shape=new THREE.Shape();for(let i=0;i<6;i++){const a=i*Math.PI/3; i?shape.lineTo(Math.cos(a)*.115,Math.sin(a)*.115):shape.moveTo(Math.cos(a)*.115,Math.sin(a)*.115);}shape.closePath();
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const piece=mesh(new THREE.ExtrudeGeometry(shape,{depth:.17,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1}),gold,[(col-1.5)*.18,.07,(row-1)*.2+(col%2)*.1]);piece.rotation.x=-Math.PI/2;group.add(piece);
    const rim=mesh(new THREE.TorusGeometry(.086,.015,5,6),material('#e2b25b'),[piece.position.x,.25,piece.position.z]);rim.rotation.x=Math.PI/2;group.add(rim);
  }return group;
}
function bottle(name){
  const flask=name.includes('月光')||name.includes('极光')||name.includes('永夜');
  const milk=name==='牛奶', purple=name.includes('永夜'),violet=name.includes('极光');
  const content=milk?'#eee5c8':purple?'#66397d':violet?'#7a9eb2':name.includes('月光')?'#a9ccd2':'#c58627';
  const glass=new THREE.MeshPhysicalMaterial({color:'#f8e4b7',transparent:true,opacity:.27,roughness:.08,clearcoat:1,depthWrite:false});
  const group=new THREE.Group();
  const profile=flask?[[0,0],[.22,0],[.38,.15],[.39,.39],[.3,.6],[.11,.7],[.11,.9],[.14,.92],[.14,.97],[.09,.97],[.09,.72],[.28,.59],[.36,.38],[.35,.17],[.2,.04],[0,.04]]:[[0,0],[.28,0],[.33,.06],[.33,.57],[.3,.65],[.22,.72],[.2,.83],[.24,.85],[.24,.9],[.17,.9],[.17,.75],[.27,.66],[.3,.55],[.3,.08],[.25,.035],[0,.035]];
  const liquid=lathe(profile.slice(0,flask?6:5).concat([[0,flask?.68:.63]]),foodMaterial(content,99,{roughness:milk?.48:.18,clearcoat:.7}));liquid.scale.setScalar(.91);liquid.position.y=.025;group.add(liquid);group.add(lathe(profile,glass));
  const neckY=flask?.98:.92;group.add(cylinder(flask?.095:.18,flask?.1:.19,.13,foodMaterial('#b18a54',6,{roughness:.9}),[0,neckY,0],24));
  const string=mesh(new THREE.TorusGeometry(flask?.135:.23,.013,6,40),material('#ac8c5b'),[0,neckY-.12,0]);string.rotation.x=Math.PI/2;group.add(string);
  const charm=createCandy(name.includes('月')?'ghost':name.includes('猫')?'heart':'star',name.includes('永夜')?'plum':'amber',.085);charm.position.set(.06,.53,flask?.38:.34);group.add(charm);
  if(name.includes('蜂')||name.includes('桂花')){
    for(let i=0;i<4;i++){const a=i*2.4;const flower=sphere(.036,material('#f1cf5e'),[Math.cos(a)*.2,.25+i*.075,Math.sin(a)*.2]);group.add(flower);}
  }return group;
}
// Large structural features stay readable when a physical item turns over.
function badge(group,shape,color,size,y,radius){for(let i=0;i<3;i++){const a=i*Math.PI*2/3,mark=createCandy(shape,color,size);mark.position.set(Math.sin(a)*radius,y,Math.cos(a)*radius);mark.rotation.y=a;group.add(mark);}}
function sack(color,star=false){const g=new THREE.Group(),body=sphere(.34,foodMaterial(color,12,{roughness:.9}),[0,.32,0],[1.2,1,.85]);g.add(body);const neck=cylinder(.15,.23,.2,foodMaterial(color,12,{roughness:.9}),[0,.66,0],12);g.add(neck);const tie=mesh(new THREE.TorusGeometry(.175,.025,8,32),material(star?'#dda73e':'#b23445'),[0,.58,0]);tie.rotation.x=Math.PI/2;g.add(tie);if(star)badge(g,'star','amber',.17,.32,.32);else for(const [x,z]of[[-.11,.02],[.1,.07]])g.add(softBox(.18,.16,.18,'#fffaf0',[x,.77,z],.025));return g;}
function honey(name){const queen=name.includes('蜂后'),flower=name==='桂花蜜',g=new THREE.Group();g.add(lathe([[0,0],[.3,0],[.4,.12],[.39,.53],[.29,.67],[.3,.73],[0,.73]],foodMaterial(queen?'#b56ce0':flower?'#ffb929':'#e99915',6,{roughness:.23,clearcoat:.7})));for(const y of[.1,.25,.4,.55]){const ring=mesh(new THREE.TorusGeometry(.39-(y>.5?.03:0),.025,8,36),material('#b66b22'),[0,y,0]);ring.rotation.x=Math.PI/2;g.add(ring);}g.add(cylinder(.31,.31,.08,material('#e1b75f'),[0,.74,0],32));const dip=new THREE.Group();dip.add(cylinder(.023,.023,.86,material('#9c5b29'),[0,.3,0],12));for(let i=0;i<4;i++)dip.add(cylinder(.12,.12,.035,material('#b87a35'),[0,-.08+i*.06,0],24));dip.rotation.z=-.46;dip.position.set(.36,.5,.12);g.add(dip);if(queen){badge(g,'ghost','cream',.17,.43,.4);for(const a of[-1,1])g.add(sphere(.2,material('#e9def4',{transparent:true,opacity:.8}),[a*.52,.49,0],[.7,.3,1.3]));}if(flower){for(let i=0;i<5;i++){const a=i*1.25;g.add(sphere(.07,material('#fff0a5'),[Math.cos(a)*.3,.66,Math.sin(a)*.3]));}}return g;}
function milk(){const g=new THREE.Group();g.add(lathe([[0,0],[.23,0],[.29,.07],[.29,.76],[.15,.91],[.14,1.09],[0,1.09]],foodMaterial('#fff9e9',7,{roughness:.38})));g.add(cylinder(.18,.18,.12,material('#3a83b8'),[0,1.1,0],24));for(let i=0;i<5;i++){const a=i*2.4,patch=sphere(.1,material('#315982'),[Math.cos(a)*.282,.24+i*.1,Math.sin(a)*.282],[1,.85,.25]);patch.rotation.y=Math.PI/2-a;g.add(patch);}return g;}
function berryCluster(name){const g=new THREE.Group(),red=name==='蔓越莓',currant=name==='午夜黑醋栗',mat=foodMaterial(red?'#ee334b':currant?'#6c2a9b':'#3532a1',29,{roughness:.27,clearcoat:.6});const count=currant?10:red?7:5;for(let i=0;i<count;i++){const a=i*2.4,r=currant?.19:.24;g.add(sphere(red?.145:currant?.13:.18,mat,[Math.sin(a)*r,.2+Math.floor(i/(currant?3:4))*.16,Math.cos(a)*r],red?[1,.75,1]:[1,1,1]));}g.add(tube([[0,.45,0],[.08,.7,.03],[.2,.75,0]],.022,material('#518141'),12));const l=leaf('#4c9547',currant?.34:.5);l.rotation.x=-.8;l.position.set(.08,.55,0);g.add(l);return g;}
function flowerPetals(){const g=new THREE.Group();for(let i=0;i<5;i++){const a=i*Math.PI*2/5,p=sphere(.23,foodMaterial(i%2?'#8e3ad0':'#bb64e6',31,{roughness:.42}),[Math.cos(a)*.2,.12,Math.sin(a)*.2],[1,.25,1.4]);p.rotation.y=-a;g.add(p);}g.add(sphere(.105,material('#efbd37'),[0,.19,0],[1,.55,1]));return g;}
function moonFlask(name){const g=new THREE.Group(),night=name==='永夜花蜜',aurora=name==='极光糖浆';g.add(sphere(.36,foodMaterial(night?'#6c1c8c':aurora?'#31c4b7':'#3263d2',10,{roughness:.15,clearcoat:1}),[0,.38,0],[1,1.08,.8]));g.add(cylinder(.1,.15,.33,material('#a4c7ee',{roughness:.15,metalness:.2}),[0,.85,0],24));g.add(createCandy('star',night?'plum':'amber',.14));g.children[g.children.length-1].position.set(0,1.08,0);if(aurora){for(let i=0;i<3;i++){const pts=[];for(let j=0;j<30;j++){const a=j/30*Math.PI*2+i*2.1;pts.push([Math.cos(a)*.37,.21+j/30*.4,Math.sin(a)*.3]);}g.add(tube(pts,.027,material(['#cc78d0','#78e7dc','#ffcf6c'][i]),30));}}else if(night){const f=flowerPetals();f.scale.setScalar(.55);f.position.y=.78;g.add(f);badge(g,'star','rose',.11,.4,.32);}else{for(const z of[-.3,.3]){const crescent=mesh(new THREE.TorusGeometry(.23,.065,10,36,Math.PI*1.5),material('#f9e4a0',{metalness:.15}),[0,.4,z]);crescent.rotation.z=-Math.PI/4;g.add(crescent);}}return g;}
function ghostCream(name){const g=new THREE.Group(),cat=name.includes('黑猫'),skull=name.includes('骷髅'),mat=foodMaterial('#fff7df',11,{roughness:.43});if(cat){g.add(sphere(.32,material('#2c2639'),[0,.24,0],[1.15,.7,1]));for(const x of[-.25,.25]){const ear=mesh(new THREE.ConeGeometry(.13,.24,3),material('#302337'),[x,.49,.08]);g.add(ear);}const cream=whipped('#fff6e6');cream.scale.setScalar(.68);cream.position.y=.25;g.add(cream);for(const x of[-.13,.13])g.add(sphere(.035,material('#e8c94c'),[x,.31,.285]));}else if(skull){g.add(sphere(.34,mat,[0,.4,0],[1,.95,.85]));g.add(softBox(.4,.19,.37,mat,[0,.12,.06],.07));for(const x of[-.12,.12])g.add(sphere(.085,material('#583342'),[x,.46,.25],[1,1.15,.55]));for(const x of[-.12,0,.12])g.add(softBox(.07,.13,.065,'#e5c5a7',[x,.11,.24],.015));for(const dir of[-1,1]){const bone=cylinder(.065,.065,.93,mat,[0,.18,-.16],12);bone.rotation.z=dir*.8;g.add(bone);}}else{g.add(sphere(.29,mat,[0,.47,0],[1,1.35,.9]));for(let i=0;i<5;i++){const a=i*Math.PI*2/5;g.add(sphere(.13,mat,[Math.sin(a)*.2,.17,Math.cos(a)*.2],[1,.6,1]));}for(const x of[-.09,.09])g.add(sphere(.035,material('#543343'),[x,.57,.24],[1,1.3,.55]));for(const x of[-.3,.3])g.add(sphere(.105,mat,[x,.4,0],[1.2,.7,.8]));}return g;}
function distinctIngredient(name){
 if(name==='砂糖')return sack('#eee0bb');if(name==='星屑糖粉')return sack('#8d61af',true);if(name==='牛奶')return milk();if(['蜂蜜','桂花蜜','幽灵蜂后蜜'].includes(name))return honey(name);if(['月光露','永夜花蜜','极光糖浆'].includes(name))return moonFlask(name);if(['夜影莓','蔓越莓','午夜黑醋栗'].includes(name))return berryCluster(name);if(name==='魔女紫罗兰花瓣')return flowerPetals();if(['幽灵奶霜','黑猫私藏奶油','骷髅糖霜'].includes(name))return ghostCream(name);
 const g=new THREE.Group();
 if(name==='黄油'){g.add(softBox(.83,.3,.49,foodMaterial('#ffe15d',8,{roughness:.3}),[0,.19,0],.045));const pat=softBox(.32,.1,.4,'#fff09a',[.04,.4,.03],.035);pat.rotation.y=.2;g.add(pat);return g;}
 if(name==='南瓜泥'){const shell=apple('#ee761b',true);shell.scale.set(.94,.6,.94);g.add(shell);const cream=whipped('#ff9d2d');cream.scale.setScalar(.75);cream.position.y=.21;g.add(cream);return g;}
 if(name==='血月石榴'){g.add(apple('#c6244a'));const cut=sphere(.29,material('#fff0cb'),[.28,.33,.19],[.2,1,1]);cut.rotation.y=-.6;g.add(cut);for(let i=0;i<12;i++){const a=i*2.4,r=Math.sqrt(i/12)*.23;g.add(sphere(.045,material('#ec1746',{roughness:.2}),[.36+Math.cos(a)*r*.3,.33+Math.sin(a)*r,.22+Math.cos(a)*r]));}return g;}
 if(name==='幽光岩盐'){const mat=material('#76e2e8',{roughness:.17,metalness:.06});for(let i=0;i<6;i++){const c=mesh(new THREE.CylinderGeometry(.06,.12,.35+i%3*.1,6),mat,[Math.sin(i*2.4)*.24,.21,Math.cos(i*2.4)*.24]);c.rotation.z=(i-3)*.14;g.add(c);}return g;}
 if(name==='星落糖晶'){const star=createCandy('star','plum',.4);star.rotation.x=-.55;star.position.y=.34;g.add(star);for(let i=0;i<3;i++)g.add(mesh(new THREE.OctahedronGeometry(.1),material('#e6acdd',{metalness:.18,roughness:.17}),[Math.sin(i*2.1)*.35,.16,Math.cos(i*2.1)*.3]));return g;}
 if(name==='魔女秘制焦糖'){g.add(cylinder(.32,.26,.28,material('#9b5e24',{metalness:.25}),[0,.16,0],32));g.add(cylinder(.32,.32,.03,material('#dc8525',{roughness:.15}),[0,.32,0],32));const hat=mesh(new THREE.ConeGeometry(.24,.46,32),material('#b35d21',{roughness:.2}),[0,.57,0]);hat.rotation.z=.17;g.add(hat);const rim=cylinder(.34,.34,.05,material('#e8a548'),[0,.37,0],32);g.add(rim);return g;}
 if(name==='枫糖浆'){const leafShape=new THREE.Shape();const pts=[[-.13,-.4],[-.12,-.1],[-.4,-.12],[-.28,.07],[-.44,.3],[-.17,.26],[0,.52],[.17,.26],[.44,.3],[.28,.07],[.4,-.12],[.12,-.1],[.13,-.4]];pts.forEach(([x,y],i)=>i?leafShape.lineTo(x,y):leafShape.moveTo(x,y));leafShape.closePath();const body=mesh(new THREE.ExtrudeGeometry(leafShape,{depth:.22,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:3,steps:1}),material('#ca5e19',{roughness:.23}),[0,.46,-.11]);g.add(body);g.add(cylinder(.09,.09,.15,material('#7c442b'),[0,1.02,0],16));return g;}
 return null;
}
function build(name,tier){
  const distinctive=distinctIngredient(name);if(distinctive)return distinctive;
  if(name==='苹果')return apple();
  if(name==='血月石榴')return apple('#8e2439');
  if(name==='南瓜王糖心')return apple('#d9751d',true);
  if(['夜影莓','蔓越莓','午夜黑醋栗'].includes(name))return berries(name);
  if(name==='南瓜泥')return whipped('#df8d2f');
  if(name.includes('奶霜')||name.includes('奶油')||name.includes('糖霜'))return whipped('#fff2dc',name.includes('幽灵'));
  if(name==='午夜蜂巢糖')return honeycomb();
  const group=new THREE.Group();
  if(name.includes('薄荷')||name.includes('花瓣')){
    const petals=name.includes('花瓣');
    for(let i=0;i<7;i++){const l=leaf(petals?'#80519b':name==='月影薄荷'?'#529891':'#4b8135',.53+(i%3)*.06);l.position.set(0,.1+i*.018,0);l.rotation.order='YXZ';l.rotation.set(-Math.PI/2+(i%2)*.12,i*.898,(i%3)*.05);group.add(l);}return group;
  }
  if(name==='肉桂'||name==='香草荚'){
    const vanilla=name==='香草荚',mat=foodMaterial(vanilla?'#3b241d':'#985731',5,{roughness:.86});
    for(let i=0;i<4;i++){const stick=tube([[-.35,.08+i%2*.1,(i-1.5)*.09],[0,.1+i%2*.1,(i-1.5)*.09],[.4,.12+i%2*.1,(i-1.5)*.08]],vanilla?.026:.055,mat,14);group.add(stick);}
    const ribbon=mesh(new THREE.TorusGeometry(.17,.015,6,32),material('#b6a27d'),[0,.14,0]);ribbon.rotation.y=Math.PI/2;group.add(ribbon);
    if(vanilla){for(let i=0;i<5;i++){const l=leaf('#f2e5bb',.28);l.rotation.order='YXZ';l.rotation.set(-Math.PI/2,i*Math.PI*2/5,0);l.position.set(.14,.17,.1);group.add(l);}group.add(sphere(.045,material('#d0a75a'),[.14,.17,.12]));}return group;
  }
  if(name==='黑巧克力'||name==='黄油'||name==='焦糖'||name==='魔女秘制焦糖'){
    const chocolate=name==='黑巧克力', butter=name==='黄油',color=chocolate?'#4f2e24':butter?'#eac66e':name.includes('魔女')?'#a85c2e':'#c4853e';
    const mat=foodMaterial(color,54,{roughness:chocolate?.4:.26,clearcoat:chocolate?.1:.6});
    const base=softBox(.85,.13,.55,mat,[0,.1,0],.035);group.add(base);
    for(let x=0;x<3;x++)for(let z=0;z<2;z++)group.add(softBox(.24,.095,.235,mat,[(x-1)*.266,.21,(z-.5)*.265],.025));return group;
  }
  if(name==='栗子'){
    const geometry=new THREE.SphereGeometry(.38,32,24),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const y=p.getY(i);p.setXYZ(i,p.getX(i)*(1-y*.3),y*.9+Math.max(0,y)**3*.6,p.getZ(i)*.86);}geometry.computeVertexNormals();group.add(mesh(geometry,foodMaterial('#854326',18,{clearcoat:.5,roughness:.28}),[0,.34,0]));
    group.add(sphere(.25,foodMaterial('#c9aa76',9,{roughness:.8}),[0,.1,.15],[1,.3,.65]));return group;
  }
  if(name==='紫薯'){
    const yam=sphere(.39,foodMaterial('#8a506d',8,{roughness:.72}),[0,.27,0],[1.25,.65,.65]);yam.rotation.y=.4;group.add(yam);
    for(let i=0;i<6;i++)group.add(tube([[-.3+i*.11,.32,.2],[-.27+i*.1,.29,.24]],.009,material('#b98694'),4));return group;
  }
  if(name==='玉米粒'||name==='金南瓜籽'){
    const seed=name==='金南瓜籽',mat=foodMaterial(seed?'#d9b048':'#e9b62e',26,{clearcoat:.5,roughness:.25});
    for(let i=0;i<(seed?5:15);i++){const a=i*2.399,r=.12+Math.sqrt(i)*.045;const kernel=sphere(seed?.16:.095,mat,[Math.cos(a)*r,.08+(i%3)*.055,Math.sin(a)*r],seed?[.65,.22,1.4]:[.8,1,.85]);kernel.rotation.y=a;group.add(kernel);}return group;
  }
  if(name==='砂糖'||name==='红糖'||name.includes('糖粉')||name.includes('岩盐')){
    const color=name==='红糖'?'#9f6d40':name.includes('岩盐')?'#b1c8bd':'#f5ead4';
    if(name==='红糖'){for(let i=0;i<3;i++)group.add(softBox(.32,.3,.31,foodMaterial(color,45,{roughness:.95}),[(i-1)*.25,.2+(i%2)*.18,0],.025));}
    else {group.add(bowl());group.add(sphere(.34,foodMaterial(color,12,{roughness:1}),[0,.32,0],[1,.35,1]));for(let i=0;i<20;i++){const a=i*2.399,r=Math.sqrt(i/20)*.31;group.add(mesh(new THREE.OctahedronGeometry(.026+(i%3)*.007),material(color,{roughness:.8}),[Math.cos(a)*r,.37+Math.cos(r*3)*.055,Math.sin(a)*r]));}}return group;
  }
  if(name==='蛛丝棉花糖'){
    const mat=foodMaterial('#f0d7dd',71,{roughness:1});for(let i=0;i<7;i++){const a=i*2.399;group.add(sphere(.2,mat,[Math.sin(a)*.15,.23+(i%3)*.13,Math.cos(a)*.13],[1,.9,1]));}return group;
  }
  if(name==='蝙蝠翼糖片'){
    const s=new THREE.Shape();s.moveTo(-.48,.2);s.lineTo(-.2,.38);s.lineTo(-.05,.16);s.lineTo(.05,.16);s.lineTo(.2,.38);s.lineTo(.48,.2);s.quadraticCurveTo(.26,.15,.38,-.13);s.quadraticCurveTo(.15,.02,.08,-.2);s.lineTo(-.08,-.2);s.quadraticCurveTo(-.15,.02,-.38,-.13);s.quadraticCurveTo(-.26,.15,-.48,.2);
    const candy=mesh(new THREE.ExtrudeGeometry(s,{depth:.08,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:3,steps:1}),foodMaterial('#644575',73,{clearcoat:.8,roughness:.2}),[0,.08,0]);candy.rotation.x=-Math.PI/2;group.add(candy);return group;
  }
  if(name==='星落糖晶'){
    const mat=new THREE.MeshPhysicalMaterial({color:'#c69ce6',roughness:.16,metalness:.12,clearcoat:1});for(let i=0;i<5;i++){const crystal=mesh(new THREE.OctahedronGeometry(.22,0),mat,[Math.sin(i*2.4)*.23,.22+Math.cos(i)*.08,Math.cos(i*2.4)*.23],[.7,1.4,.7]);crystal.rotation.z=i*.3;group.add(crystal);}return group;
  }
  return bottle(name);
}
export function createFoodModel(name,tier='N',size=null){
  const key=`${tier}:${name}`;
  if(!templates.has(key)){
    const object=build(name,tier);const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());object.position.sub(center);const root=new THREE.Group();root.add(object);templates.set(key,retainModelResources(root));
  }
  const model=templates.get(key).clone(true);
  if(size){const bounds=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.setScalar(Math.min(size[0]/bounds.x,size[1]/bounds.y,size[2]/bounds.z));}
  model.userData.ingredient=name;return model;
}

const TOP_READABLE = new Set(['黄油','焦糖','黑巧克力','肉桂','香草荚','薄荷叶','月影薄荷','玉米粒','金南瓜籽','魔女紫罗兰花瓣','蝙蝠翼糖片','午夜蜂巢糖']);
export function createPileFoodModel(name,tier='N',size=null){
  const model=createFoodModel(name,tier),root=new THREE.Group();
  if(!TOP_READABLE.has(name))model.rotation.x=-Math.PI/2;
  root.add(model);root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3());model.position.sub(center);root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const scale=size?Math.min((size[0]-.01)/bounds.x,(size[1]-.01)/bounds.y,(size[2]-.01)/bounds.z):1.12/Math.max(bounds.x,bounds.z);
  root.scale.setScalar(scale);root.userData.ingredient=name;return root;
}
