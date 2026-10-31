import * as THREE from 'three';
import {candyShape} from './three-models.mjs';
import {paint,piece,extrude} from './model-kit-v4.mjs';
import {CHIIKAWA_HEADS,chiikawaHead,addChiikawaFace} from './chiikawa-heads.mjs';
// Small embossed details need smooth silhouettes, not full-size fruit geometry.
function ball(r,mat,position,scale){return piece(new THREE.SphereGeometry(r,12,8),mat,position,scale);}
function pipe(points,r,mat,segments=12){return piece(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,r,6,false),mat);}
function petal(length,width,color){const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-width,length*.3,-width*.65,length*.75,0,length);shape.bezierCurveTo(width*.65,length*.75,width,length*.3,0,0);const leaf=piece(new THREE.ShapeGeometry(shape,8),paint(color,'glaze',{roughness:.5,side:THREE.DoubleSide}));return leaf;}
const FRUIT=new Set(['apple','strawberry','orange','lemon','grape','peach','cherry','watermelon','banana','pear','pineapple','kiwi']);
export const candyBevel = id => FRUIT.has(id)||CHIIKAWA_HEADS.has(id)||['kuromi','cinnamoroll','pompompurin','pochacco','keroppi'].includes(id) ? .065 : .17;
const CHARACTERS=new Set(['chiikawa','hachiware','usagi','momonga','kurimanju','shisa','rakko','hello_kitty','my_melody','kuromi','cinnamoroll','pompompurin','pochacco','keroppi','badtz_maru','tuxedosam','hangyodon']);
function path(commands,size){const s=new THREE.Shape();for(const[c,...p]of commands)s[c](...p.map(v=>v*size));s.closePath();return s;}
function outline(points,size,rounding=.12){
 const s=new THREE.Shape(),vertices=points.map(p=>new THREE.Vector2(...p).multiplyScalar(size));
 vertices.forEach((p,i)=>{const before=vertices[(i+vertices.length-1)%vertices.length],after=vertices[(i+1)%vertices.length],r=Math.min(rounding*size,p.distanceTo(before)*.24,p.distanceTo(after)*.24),a=p.clone().lerp(before,r/p.distanceTo(before)),b=p.clone().lerp(after,r/p.distanceTo(after));if(!i)s.moveTo(a.x,a.y);else s.lineTo(a.x,a.y);s.quadraticCurveTo(p.x,p.y,b.x,b.y);});s.closePath();return s;
}
function roundHead(size,ears='round'){
 const e=ears==='rabbit'?[['bezierCurveTo',-.72,.83,-.66,1.6,-.4,1.51],['bezierCurveTo',-.22,1.48,-.3,.79,-.27,.72],['bezierCurveTo',-.1,.77,.09,.77,.24,.72],['bezierCurveTo',.25,1.22,.32,1.62,.53,1.48],['bezierCurveTo',.73,1.34,.52,.83,.62,.63]]:
 ears==='long'?[['bezierCurveTo',-1.01,.75,-1.49,.44,-1.33,-.12],['bezierCurveTo',-1.12,-.45,-.81,-.16,-.68,.14],['bezierCurveTo',-.52,.76,.45,.82,.67,.15],['bezierCurveTo',.82,-.2,1.17,-.46,1.35,-.13],['bezierCurveTo',1.47,.38,1.06,.75,.62,.63]]:
 ears==='cat'?[['lineTo',-.63,1.03],['quadraticCurveTo',-.6,1.14,-.23,.75],['quadraticCurveTo',0,.86,.27,.75],['lineTo',.64,1.03],['quadraticCurveTo',.76,1.08,.64,.5]]:
 ears==='dog'?[['bezierCurveTo',-.96,.91,-1.09,.4,-.87,-.15],['quadraticCurveTo',-.71,-.35,-.61,.05],['bezierCurveTo',-.39,.84,.41,.87,.62,.49],['bezierCurveTo',.7,.02,.94,-.27,1.03,.02],['bezierCurveTo',1.15,.54,.91,.91,.6,.61]]:
 [['bezierCurveTo',-.89,.82,-.65,1.03,-.41,.81],['quadraticCurveTo',-.22,.69,-.25,.66],['quadraticCurveTo',0,.81,.29,.66],['bezierCurveTo',.22,1,.71,1.04,.71,.62]];
 return path([['moveTo',-.7,.52],...e,['bezierCurveTo',1.05,-.24,.63,-.72,.04,-.72],['bezierCurveTo',-.61,-.74,-1.02,-.23,-.7,.52]],size*.72);
}
const REDESIGNED_HEADS=new Set(['kuromi','cinnamoroll','pompompurin','pochacco','keroppi']);
function sanrioHead(id,size){
 const shapes={
 kuromi:[['moveTo',-.66,.36],['lineTo',-.93,.48],['quadraticCurveTo',-1.04,.86,-1.02,1.26],['quadraticCurveTo',-.97,1.38,-.90,1.25],['lineTo',-.31,.68],['quadraticCurveTo',0,.84,.31,.68],['lineTo',.90,1.25],['quadraticCurveTo',.97,1.38,1.02,1.26],['quadraticCurveTo',1.04,.86,.93,.48],['lineTo',.66,.36],['bezierCurveTo',.96,-.06,.62,-.64,0,-.64],['bezierCurveTo',-.62,-.64,-.96,-.06,-.66,.36]],
 cinnamoroll:[['moveTo',-.61,.37],['bezierCurveTo',-.95,.48,-1.30,.24,-1.62,.35],['bezierCurveTo',-1.90,.47,-1.89,-.07,-1.59,-.12],['bezierCurveTo',-1.23,-.20,-.91,-.06,-.69,.04],['bezierCurveTo',-.58,-.50,.56,-.50,.69,.04],['bezierCurveTo',.91,-.06,1.23,-.20,1.59,-.12],['bezierCurveTo',1.89,-.07,1.90,.47,1.62,.35],['bezierCurveTo',1.30,.24,.95,.48,.61,.37],['bezierCurveTo',.35,.70,-.35,.70,-.61,.37]],
 pompompurin:[['moveTo',-.58,.43],['bezierCurveTo',-.83,.39,-1.03,.19,-1.04,-.08],['bezierCurveTo',-1.02,-.39,-.78,-.42,-.67,-.11],['bezierCurveTo',-.71,-.63,.69,-.63,.67,-.11],['bezierCurveTo',.78,-.42,1.02,-.39,1.04,-.08],['bezierCurveTo',1.03,.19,.83,.39,.58,.43],['quadraticCurveTo',.50,.59,.40,.60],['bezierCurveTo',.49,.84,.19,.87,.04,.88],['quadraticCurveTo',.01,1.02,-.05,.91],['bezierCurveTo',-.31,.92,-.54,.78,-.40,.60],['quadraticCurveTo',-.50,.59,-.58,.43]],
 pochacco:[['moveTo',-.50,.55],['bezierCurveTo',-.91,.91,-1.02,.44,-.86,-.19],['quadraticCurveTo',-.78,-.39,-.64,-.18],['bezierCurveTo',-.72,-.69,.70,-.69,.64,-.18],['quadraticCurveTo',.78,-.39,.86,-.19],['bezierCurveTo',1.02,.44,.91,.91,.50,.55],['quadraticCurveTo',.31,.77,.19,.74],['quadraticCurveTo',.23,.92,.11,.86],['quadraticCurveTo',.07,.76,.03,.76],['quadraticCurveTo',-.02,.98,-.10,.89],['quadraticCurveTo',-.10,.79,-.14,.74],['quadraticCurveTo',-.36,.77,-.50,.55]],
 keroppi:[['moveTo',-.72,.08],['bezierCurveTo',-1.04,.56,-.72,1.10,-.32,1.02],['quadraticCurveTo',-.05,.98,0,.71],['quadraticCurveTo',.05,.98,.32,1.02],['bezierCurveTo',.72,1.10,1.04,.56,.72,.08],['bezierCurveTo',1.05,-.56,-1.05,-.56,-.72,.08]],
 };
 return path(shapes[id],size*.72);
}
function addSanrioHead(root,id,size,z){
 // Surface icing must not appear again inside the sugar transmission buffer.
 const icing=(color,roughness)=>paint(color,'glaze',{roughness,transparent:true,opacity:1,depthWrite:true});
 const s=size*.72,dark=icing('#473140',.45),white=icing('#fff8e9',.35),pink=icing('#efb4c4',.4),blue=icing('#72b8d2',.35),brown=icing('#714532',.5);
 const ellipse=(x,y,rx,ry,mat,layer=0)=>{const shape=new THREE.Shape();shape.absellipse(x*s,y*s,rx*s,ry*s,0,Math.PI*2);root.add(extrude(shape,size*.018,mat,[0,0,z+layer],size*.006));};
 const stroke=(points,r=.022,mat=dark,layer=.018)=>root.add(pipe(points.map(([x,y])=>[x*s,y*s,z+layer]),r*s,mat,14));
 const patch=(commands,mat,layer=0)=>root.add(extrude(path(commands,s),size*.018,mat,[0,0,z+layer],size*.006));
 if(id==='kuromi'){
  root.add(extrude(sanrioHead(id,size*.96),size*.018,icing('#403443',.52),[0,0,z-size*.02],size*.008));
  for(const side of[-1,1])ellipse(side*.97,1.26,.09,.09,dark,.008);
  patch([['moveTo',-.58,.07],['quadraticCurveTo',-.49,.27,-.32,.20],['lineTo',0,.06],['lineTo',.32,.20],['quadraticCurveTo',.49,.27,.58,.07],['bezierCurveTo',.65,-.48,-.65,-.48,-.58,.07]],white,.012);
  for(const side of[-1,1]){ellipse(side*.30,-.05,.075,.125,dark,.04);stroke([[side*.22,.055],[side*.36,.12]],.035,dark,.045);}
  ellipse(0,-.21,.047,.034,pink,.04);stroke([[-.075,-.29],[0,-.35],[.075,-.29]],.022,dark,.04);
  ellipse(0,.49,.18,.19,pink,.02);for(const side of[-1,1])ellipse(side*.07,.49,.032,.052,dark,.04);
  patch([['moveTo',-.10,.35],['lineTo',-.10,.26],['lineTo',-.04,.26],['lineTo',-.04,.33],['lineTo',.04,.33],['lineTo',.04,.26],['lineTo',.10,.26],['lineTo',.10,.35]],pink,.025);
 }else if(id==='cinnamoroll'){
  for(const side of[-1,1]){ellipse(side*.36,.13,.045,.088,blue,.018);ellipse(side*.53,-.04,.09,.05,pink);}
  stroke([[-.10,-.02],[-.08,-.09],[-.025,-.10],[0,-.05],[.025,-.10],[.08,-.09],[.10,-.02]],.018,blue);
 }else if(id==='pompompurin'){
  patch([['moveTo',-.43,.60],['bezierCurveTo',-.60,.81,-.22,.91,.03,.85],['bezierCurveTo',.33,.88,.55,.76,.42,.61],['quadraticCurveTo',0,.48,-.43,.60]],brown,.015);
  stroke([[0,.83],[-.025,.93]],.025,brown,.025);
  for(const side of[-1,1])ellipse(side*.29,.16,.032,.038,brown,.02);
  patch([['moveTo',-.055,.04],['quadraticCurveTo',0,.07,.055,.04],['quadraticCurveTo',.05,-.03,0,-.045],['quadraticCurveTo',-.05,-.03,-.055,.04]],brown,.02);
  stroke([[0,-.04],[0,-.12],[-.055,-.17],[-.125,-.14],[-.14,-.10]],.018,brown);stroke([[0,-.12],[.055,-.17],[.125,-.14],[.14,-.10]],.018,brown);
  for(const side of[-1,1])stroke([[side*.67,.18],[side*.63,.04],[side*.65,-.12]],.018,brown);
 }else if(id==='pochacco'){
  for(const side of[-1,1]){patch([['moveTo',side*.50,.53],['bezierCurveTo',side*.88,.85,side*.95,.39,side*.80,-.17],['quadraticCurveTo',side*.68,-.31,side*.65,-.08],['quadraticCurveTo',side*.67,.28,side*.50,.53]],dark);ellipse(side*.27,-.03,.043,.070,dark,.02);}
  ellipse(0,-.19,.064,.046,dark,.02);
  for(const [x,y,dx,dy]of[[-.13,.69,-.18,.81],[0,.73,-.02,.88],[.12,.70,.16,.82]])stroke([[x,y],[dx,dy]],.021,dark,.01);
 }else if(id==='keroppi'){
  for(const side of[-1,1]){ellipse(side*.36,.59,.31,.34,white);ellipse(side*.30,.57,.10,.12,dark,.028);ellipse(side*.53,-.09,.085,.065,pink,.012);}
  stroke([[-.16,-.12],[0,-.27],[.16,-.12]],.027,dark,.018);
 }
}
export function candyOutline(id,size=1){
 if(CHIIKAWA_HEADS.has(id))return chiikawaHead(id,size);
 if(id==='star')return outline(Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,r=i%2?.48:1;return[Math.cos(a)*r,Math.sin(a)*r];}),size,.14);
 if(['heart','pumpkin','ghost'].includes(id))return candyShape(id,size);
 if(REDESIGNED_HEADS.has(id))return sanrioHead(id,size);
 if(CHARACTERS.has(id))return roundHead(size,['usagi','my_melody'].includes(id)?'rabbit':id==='cinnamoroll'?'long':['hello_kitty','hachiware','kuromi','badtz_maru'].includes(id)?'cat':['pochacco','pompompurin'].includes(id)?'dog':'round');
 if(id==='apple')return path([['moveTo',0,.59],['bezierCurveTo',-.65,1.04,-1,.28,-.62,-.36],['bezierCurveTo',-.37,-.89,-.15,-.72,0,-.7],['bezierCurveTo',.23,-.77,.44,-.82,.68,-.34],['bezierCurveTo',1,.3,.62,1,0,.59]],size);
 if(id==='peach')return path([['moveTo',0,.55],['bezierCurveTo',-.4,.94,-.91,.59,-.76,.04],['bezierCurveTo',-.64,-.44,-.22,-.71,0,-.87],['bezierCurveTo',.23,-.68,.7,-.4,.78,.08],['bezierCurveTo',.9,.65,.36,.9,0,.55]],size);
 if(id==='strawberry')return path([['moveTo',0,-.85],['bezierCurveTo',-.24,-.8,-.92,.11,-.7,.52],['bezierCurveTo',-.5,.95,.53,.95,.72,.5],['bezierCurveTo',.92,.08,.25,-.8,0,-.85]],size);
 if(id==='banana')return path([['moveTo',-.84,.55],['quadraticCurveTo',-.78,.66,-.7,.52],['bezierCurveTo',-.45,-.19,.24,-.32,.78,.39],['quadraticCurveTo',.86,.52,.92,.4],['bezierCurveTo',.69,-.56,-.35,-.96,-.79,-.12],['quadraticCurveTo',-.9,.13,-.84,.55]],size);
 if(id==='pear')return path([['moveTo',0,.89],['bezierCurveTo',-.4,.9,-.23,.38,-.59,.08],['bezierCurveTo',-1,-.57,-.49,-.84,0,-.81],['bezierCurveTo',.7,-.83,.94,-.4,.5,.18],['bezierCurveTo',.24,.52,.33,.86,0,.89]],size);
 if(id==='watermelon')return path([['moveTo',0,.86],['lineTo',-.88,-.47],['quadraticCurveTo',0,-1,.88,-.47]],size);
 if(id==='pineapple')return path([['moveTo',-.4,.5],['lineTo',-.55,1.09],['lineTo',-.17,.84],['lineTo',0,1.3],['lineTo',.17,.83],['lineTo',.54,1.07],['lineTo',.4,.51],['bezierCurveTo',1,-.09,.62,-.83,0,-.8],['bezierCurveTo',-.65,-.86,-1,-.08,-.4,.5]],size*.82);
 if(id==='grape')return path([['moveTo',0,.66],['bezierCurveTo',-.25,1,-.69,.82,-.62,.48],['bezierCurveTo',-.96,.4,-.91,-.03,-.64,-.12],['bezierCurveTo',-.76,-.46,-.39,-.65,-.23,-.53],['bezierCurveTo',-.22,-.93,.26,-.93,.28,-.54],['bezierCurveTo',.62,-.67,.8,-.31,.63,-.12],['bezierCurveTo',.99,.01,.89,.45,.62,.48],['bezierCurveTo',.71,.84,.25,1,0,.66]],size*.92);
 if(id==='cherry')return path([['moveTo',0,.72],['quadraticCurveTo',-.44,.76,-.46,.08],['bezierCurveTo',-1.12,.2,-.99,-.77,-.46,-.76],['quadraticCurveTo',-.08,-.82,.04,-.45],['bezierCurveTo',.24,-.88,.96,-.79,.91,-.22],['quadraticCurveTo',.92,.24,.39,.14],['quadraticCurveTo',.4,.7,0,.72]],size);
 const s=new THREE.Shape();s.absellipse(0,0,size*(id==='lemon'?.94:.77),size*(id==='lemon'?.62:.77),0,Math.PI*2);return s;
}
export function addMoldDetails(root,id,size,depth,hex){
 const z=depth*.5+size*(candyBevel(id)+.025),dark=paint('#473140','glaze',{roughness:.42}),cream=paint('#fff1d7','glaze',{roughness:.3});
 if(CHIIKAWA_HEADS.has(id)){addChiikawaFace(root,id,size,z);return;}
 const dot=(x,y,r=.07,mat=dark)=>root.add(ball(size*r,mat,[size*x,size*y,z],[1,1,.42]));
 const line=(points,r=.016,mat=dark)=>root.add(pipe(points.map(([x,y])=>[x*size,y*size,z]),size*r,mat,12));
 if(REDESIGNED_HEADS.has(id)){addSanrioHead(root,id,size,z);return;}
 if(CHARACTERS.has(id)){
  if(['hello_kitty','hachiware','kuromi','my_melody','pompompurin','badtz_maru','tuxedosam','hangyodon'].includes(id)){
   const face=new THREE.Shape();face.absellipse(0,-size*.035,size*.46,size*.36,0,Math.PI*2);root.add(extrude(face,size*.035,cream,[0,0,z-size*.04],size*.012));
  }
  const eyesY=id==='usagi'?.05:.02;
  for(const x of[-.23,.23]){dot(x,eyesY,.047);dot(x-.012,eyesY+.016,.012,paint('#ffffff'));}
  if(id==='hello_kitty'){dot(0,-.12,.044,paint('#e9bd5d'));for(const d of[-1,1])for(let j=0;j<3;j++)line([[d*.4,-.06-j*.09],[d*.62,-.02-j*.12]],.012);}
  else if(id==='keroppi'){for(const d of[-1,1]){dot(d*.25,.38,.17,cream);dot(d*.25,.38,.07);}line([[-.15,-.17],[0,-.24],[.15,-.17]],.018);}
  else if(id==='hangyodon'){const lips=ball(size*.15,paint('#ec9e8e'),[0,-size*.19,z],[1.7,.6,.45]);root.add(lips);}
  else if(id==='cinnamoroll'){line([[-.12,-.13],[-.06,-.2],[0,-.14],[.06,-.2],[.12,-.13]],.015);}
  else{dot(0,-.12,.027);line([[-.09,-.16],[0,-.22],[.09,-.16]],.014);}
  for(const x of[-.39,.39])root.add(ball(size*.07,paint('#efa6ab'),[x*size,-size*.1,z],[1,.55,.3]));
  if(['hello_kitty','my_melody'].includes(id)){for(const d of[-1,1])root.add(ball(size*.11,paint('#d57794'),[(.39+d*.065)*size,size*.48,z],[1,.7,.4]));dot(.39,.48,.047,paint('#f4bed0'));}
  if(id==='hachiware')line([[-.44,.47],[0,.25],[.44,.47]],.035,paint('#7ab3d0'));
  if(id==='kuromi'){dot(0,.39,.095,paint('#f2a8c6'));for(const x of[-.026,.026])dot(x,.4,.017);}
  if(id==='pompompurin'){root.add(ball(size*.24,paint('#8a563c'),[0,size*.48,z],[1.22,.38,.5]));}
  if(id==='rakko')line([[-.33,.26],[-.15,.18]],.025);
  if(id==='shisa'){for(const d of[-1,1])line([[d*.45,.4],[d*.58,.27],[d*.5,.12]],.045,paint('#b37e56'));}
  if(id==='kurimanju'){root.add(ball(size*.2,paint('#ab8054'),[0,size*.37,z],[1.7,.7,.3]));}
  if(id==='momonga')for(const d of[-1,1])line([[d*.29,.54],[d*.42,.5],[d*.35,.4]],.03,paint('#8aa3bd'));
 }
 if(FRUIT.has(id)){
  const leaf=()=>{const l=petal(size*.34,size*.13,'#5a9d64');l.position.set(size*.03,size*.57,z);l.rotation.z=-.8;root.add(l);};
  if(['apple','pear','peach','orange','cherry'].includes(id)){line([[0,.57],[.03,.86]],.027,paint('#96744b'));leaf();}
  if(id==='strawberry'){for(let i=0;i<16;i++){const y=-.57+(i%4)*.34,x=(Math.floor(i/4)-1.5)*.28*(1-Math.max(0,-y)*.65);root.add(ball(size*.025,cream,[x*size,y*size,z],[.6,1.1,.3]));}for(let i=0;i<5;i++){const l=petal(size*.32,size*.09,'#5a9d64');l.position.set(0,size*.65,z);l.rotation.z=-1.7+i*.85;root.add(l);}}
  if(['orange','lemon','kiwi'].includes(id)){const c=paint(id==='kiwi'?'#e8dfaa':'#fff0b3');for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[Math.cos(a)*.14,Math.sin(a)*.14],[Math.cos(a)*.61,Math.sin(a)*.61]],.012,c);if(id==='kiwi')dot(Math.cos(a)*.33,Math.sin(a)*.33,.027);}dot(0,0,.14,c);}
  if(id==='watermelon'){line([[-.78,-.45],[0,-.76],[.78,-.45]],.055,paint('#75a46b'));for(let i=0;i<5;i++)dot((i%3-1)*.27,-.23+Math.floor(i/3)*.3,.027);}
  if(id==='grape')for(const [x,y] of [[-.3,.52],[.3,.52],[-.49,.12],[0,.12],[.49,.12],[-.25,-.28],[.25,-.28],[0,-.62]]){const points=Array.from({length:17},(_,i)=>{const a=i/16*Math.PI*1.65;return[x+Math.cos(a)*.18,y+Math.sin(a)*.18];});line(points,.012,paint(hex,'jelly',{roughness:.22}));}
  if(id==='banana')line([[-.68,.23],[-.41,-.25],[.08,-.38],[.54,-.12]],.012,paint(hex,'jelly',{roughness:.25}));
  if(id==='pineapple')for(const d of[-1,1])for(let j=0;j<4;j++)line([[d*-.42,-.45+j*.2],[d*.42,-.12+j*.2]],.018,cream);
  if(id==='peach')line([[0,.46],[-.06,.08],[0,-.54]],.02,paint('#d38b9c'));
 }
}
