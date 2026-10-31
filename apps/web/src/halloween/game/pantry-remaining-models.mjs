import * as THREE from 'three';
import {piece,lathe,ring,pipe,bakeModel} from './model-kit-v4.mjs';
import {finish,clearGlass,surface,label,packageBlock} from './pantry-special-models.mjs';
const TAU=Math.PI*2;
const names=new Set(['肉桂','薄荷叶','焦糖','黑巧克力','枫糖浆','香草荚','蝙蝠翼糖片','月光露','幽灵奶霜','魔女紫罗兰花瓣','午夜黑醋栗','骷髅糖霜','南瓜王糖心','月影薄荷']);
const leafMaterials=new Map();
function leafMaterial(moon){
 if(leafMaterials.has(moon))return leafMaterials.get(moon);
 const m=finish(moon?'#8bbfb1':'#6e9f57','fruit',{side:THREE.DoubleSide,roughness:.88}).clone();
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle=moon?'#91bbab':'#6f9d59';c.fillRect(0,0,128,256);
  c.strokeStyle=moon?'#bdd9c5':'#abc480';c.lineWidth=2;c.beginPath();c.moveTo(64,0);c.bezierCurveTo(59,90,69,175,64,256);c.stroke();
  c.lineWidth=1;for(let i=0;i<8;i++)for(const d of[-1,1]){const y=i*29+25;c.beginPath();c.moveTo(64,y);c.quadraticCurveTo(64+d*30,y+10,64+d*65,y+33);c.stroke();}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;m.color.set('#ffffff');m.map=t;
 }
 leafMaterials.set(moon,m);return m;
}
function leaf(length,width,moon){return surface(14,10,(u,v)=>{const edge=Math.sin(Math.PI*v)**.72*(1+.038*Math.sin(v*Math.PI*18)),x=(u-.5)*width*edge;return[x,v*length,.05*Math.sin(v*Math.PI)-.038*(2*u-1)**2*Math.sin(v*Math.PI)];},leafMaterial(moon));}
function mint(moon){
 const g=new THREE.Group(),stem=finish(moon?'#72988c':'#719455','wood');g.add(pipe([[0,.03,0],[.01,.37,0],[-.03,.72,.015]],.012,stem,12));
 for(const [x,y,angle,size]of [[0,.13,1.0,1],[0,.21,-.98,1],[0,.40,.48,.72]]){const l=leaf((moon?.53:.45)*size,(moon?.25:.40)*size,moon);l.position.set(x,y,.014);l.rotation.z=angle;g.add(l);}return g;
}
function cinnamon(){
 const g=new THREE.Group(),bark=finish('#ad7952','wood'),inner=finish('#ce9b69','wood');
 g.add(surface(12,24,(u,v)=>{const a=u*TAU,r=.105+.007*Math.sin(a*5+v*4);return[Math.cos(a)*r+.018*Math.sin(v*3),v*.94,Math.sin(a)*r];},bark));
 for(const y of[.002,.938]){const pts=[];for(let i=0;i<64;i++){const t=i/63,a=t*Math.PI*4.5,r=.098*(1-t)+.013;pts.push([Math.cos(a)*r,y,Math.sin(a)*r]);}g.add(pipe(pts,.008,inner,42));}
 return g;
}
function chocolate(){
 const g=new THREE.Group(),m=finish('#674235','food',{roughness:.48});g.add(packageBlock(.72,.83,.10,m,[0,.44,0],.035));
 for(let i=0;i<6;i++){const x=(i%2-.5)*.33,y=.15+Math.floor(i/2)*.27;g.add(packageBlock(.30,.235,.065,m,[x,y,.07],.025));}return g;
}
function caramel(){
 const g=new THREE.Group(),paper=finish('#eedbb1','paper'),band=finish('#c49d6d','paper');
 g.add(packageBlock(.55,.42,.25,paper,[0,.35,0],.055));
 for(const dir of[-1,1])g.add(surface(7,16,(u,v)=>{const a=u*TAU,r=.027+.10*v,x=dir*(.27+v*.20);return[x,.35+Math.cos(a+v*4)*r,Math.sin(a+v*4)*r*.7];},paper));
 g.add(packageBlock(.19,.435,.267,band,[0,.35,0],.035));return g;
}
function bottle(kind){
 const g=new THREE.Group(),moon=kind==='moon',maple=kind==='maple',r=moon?.34:maple?.29:.11;
 const profile=moon?[[0,.02],[.2,.02],[.31,.10],[.36,.32],[.33,.55],[.15,.71],[.11,.76],[.11,.91],[.09,.91],[.09,.76],[.135,.70],[.30,.54],[.33,.32],[.28,.12],[0,.06]]:maple?[[0,.02],[.23,.02],[.29,.08],[.29,.58],[.24,.69],[.11,.76],[.10,.91],[.08,.91],[.08,.77],[.22,.67],[.26,.57],[.26,.10],[0,.055]]:[[0,.01],[r,.01],[r,1.03],[r-.018,1.03],[r-.018,.04],[0,.04]];
 g.add(lathe(profile,clearGlass(),[0,0,0],moon?32:maple?12:24));
 if(kind==='vanilla'){
  const pod=finish('#584137','wood');for(let i=0;i<2;i++)g.add(pipe([[-.035+i*.05,.07,0],[-.045+i*.05,.37,.015],[.035+i*.025,.74,.01],[.025+i*.025,.93,.0]],.018,pod,16));
 }else{const liquid=finish(moon?'#8bbcd4':'#c58d44','cream',{roughness:.23});g.add(lathe(moon?[[0,.06],[.20,.06],[.29,.14],[.32,.32],[.27,.53],[0,.53]]:[[0,.06],[.21,.06],[.258,.12],[.258,.55],[0,.55]],liquid,[0,0,0],moon?32:12));}
 const cap=finish(kind==='vanilla'?'#b59670':moon?'#8da7b9':'#a27f4b','wood');g.add(lathe([[0,0],[r===.11?.119:.115,0],[r===.11?.12:.12,.08],[0,.08]],cap,[0,kind==='vanilla'?1.01:.9,0],24));
 if(kind!=='vanilla')g.add(surface(10,16,(u,v)=>{const a=(u-.5)*1.35;return[Math.sin(a)*(r+.005),.16+v*.28,Math.cos(a)*(r+.005)];},label(moon?'月光露':'枫糖浆',moon?'#617a91':'#956535',moon?'moon':'maple')));
 return g;
}
function icing(skull){
 const g=new THREE.Group(),body=finish('#eee5d0','paper'),cap=finish(skull?'#ac9bbd':'#acbcc8','metal',{metalness:.18});
 if(skull){g.add(lathe([[0,0],[.23,0],[.26,.07],[.26,.54],[.19,.65],[.095,.72],[0,.72]],body,[0,.02,0],28),lathe([[0,0],[.11,0],[.11,.08],[.075,.14],[.035,.27],[0,.27]],cap,[0,.72,0],24));
  g.add(surface(10,16,(u,v)=>{const a=(u-.5)*1.5;return[Math.sin(a)*.263,.14+v*.34,Math.cos(a)*.263];},label('骷髅糖霜','#816787','skull')));
 }else{
  g.add(surface(18,28,(u,v)=>{const a=u*TAU,r=.038+.24*v*(.90+.1*Math.sin(v*Math.PI));return[Math.cos(a)*r,v*.86,Math.sin(a)*r*.72+.014*Math.sin(a*6)*v];},body));
  g.add(lathe([[0,0],[.035,0],[.055,.12],[0,.12]],cap,[0,-.10,0],16));
  g.add(packageBlock(.43,.045,.08,cap,[0,.855,0],.012));
  g.add(piece(new THREE.PlaneGeometry(.31,.31),label('幽灵奶霜','#6e7d8a','ghost'),[0,.59,.155]));
 }return g;
}
function flowerPacket(){
 const g=new THREE.Group(),paper=finish('#d2bed7','paper');g.add(packageBlock(.66,.80,.13,paper,[0,.43,0],.035));
 const glass=new THREE.MeshPhysicalMaterial({color:'#fff5ed',transparent:true,opacity:.20,depthWrite:false,roughness:.1});glass.userData.pantrySurface='glass';
 g.add(piece(new THREE.PlaneGeometry(.50,.54),glass,[0,.44,.085]));
 const m=finish('#9270a9','fruit',{side:THREE.DoubleSide});for(let i=0;i<5;i++){const p=surface(8,8,(u,v)=>{const x=(u-.5)*.18*Math.sin(v*Math.PI)**.5;return[x,v*.27,.014*Math.sin(v*Math.PI)];},m);p.position.set(Math.sin(i*2.4)*.13,.24+(i%2)*.18,.080);p.rotation.z=(i-2)*.55;g.add(p);}
 g.add(packageBlock(.61,.035,.15,paper,[0,.81,0],.006),packageBlock(.61,.035,.15,paper,[0,.06,0],.006));return g;
}
function currant(){
 const g=new THREE.Group(),stem=finish('#8a805c','wood'),m=finish('#4c3b62','fruit',{roughness:.54});g.add(pipe([[.02,.83,0],[0,.52,0],[-.02,.17,0]],.012,stem,12));
 for(const[x,y]of[[-.13,.63],[.13,.48],[-.11,.30]]){
  g.add(pipe([[0,y+.08,0],[x,y,.01]],.008,stem,5));
  g.add(piece(new THREE.SphereGeometry(.14,16,12),m,[x,y,.06],[1,.92,1]));
  g.add(ring(.022,.005,stem,[x,y+.025,.197],'z'));
 }return g;
}
function batCandy(){
 const pts=[[-.46,.45],[-.14,.31],[-.05,.43],[.05,.43],[.14,.31],[.46,.45],[.37,.19],[.24,.23],[.20,.05],[.09,.14],[0,.02],[-.09,.14],[-.20,.05],[-.24,.23],[-.37,.19]],shape=new THREE.Shape();pts.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const geo=new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:true,bevelSize:.018,bevelThickness:.015,bevelSegments:2,curveSegments:5});geo.translate(0,0,-.04);const g=new THREE.Group();g.add(piece(geo,finish('#9e83b6','food',{roughness:.38})));return g;
}
function pumpkinCandy(){
 const g=new THREE.Group(),m=finish('#db9c4d','fruit',{roughness:.4});g.add(surface(20,36,(u,v)=>{const a=u*TAU,t=v*Math.PI,r=.36*Math.sin(t)*(1+.065*Math.cos(a*7));return[Math.cos(a)*r,.39+.29*Math.cos(t)-.045*Math.max(Math.cos(t),0)**6,Math.sin(a)*r];},m,true));g.add(pipe([[0,.62,0],[.018,.73,.006],[.045,.76,.015]],.035,finish('#95815b','wood'),8));return g;
}
export function remainingPantryObject(name){
 if(!names.has(name))return null;
 if(name==='肉桂')return cinnamon();if(name==='薄荷叶'||name==='月影薄荷')return mint(name==='月影薄荷');
 if(name==='焦糖')return caramel();if(name==='黑巧克力')return chocolate();
 if(name==='枫糖浆')return bottle('maple');if(name==='月光露')return bottle('moon');if(name==='香草荚')return bottle('vanilla');
 if(name==='幽灵奶霜'||name==='骷髅糖霜')return icing(name==='骷髅糖霜');if(name==='魔女紫罗兰花瓣')return flowerPacket();
 if(name==='午夜黑醋栗')return currant();if(name==='蝙蝠翼糖片')return batCandy();return pumpkinCandy();
}
