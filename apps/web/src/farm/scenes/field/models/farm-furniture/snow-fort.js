import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Approved activity reward furniture. +Z is the front; inventory is server-owned.
export function createSnowFort(){
 const root=new T.Group();root.name='snow-fort';
 const colors={snow:'#f5f0de',ice:'#bdcdd9',edge:'#d6e1df',shadow:'#91abb8',wood:'#a48c71',gold:'#e7ba68',red:'#bd7773',blue:'#819eaf',ink:'#535354'};
 const materials=new Map();
 const material=c=>{if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.95}));return materials.get(c);};
 function mesh(parent,geo,c,p=[0,0,0],s=[1,1,1],name=''){
  const o=new T.Mesh(geo,typeof c==='string'?material(c):c);o.position.set(...p);o.scale.set(...s);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 }
 const ball=(g,c,p,s,name='')=>mesh(g,new T.SphereGeometry(1,16,12),c,p,s,name);
 const block=(g,c,p,s,r=.04,name='')=>mesh(g,new RoundedBoxGeometry(...s,2,r),c,p,[1,1,1],name);
 const cyl=(g,c,p,r,h,name='')=>mesh(g,new T.CylinderGeometry(r,r*1.015,h,24),c,p,[1,1,1],name);
 function rod(g,c,a,b,r=.025){const av=new T.Vector3(...a),bv=new T.Vector3(...b),o=mesh(g,new T.CylinderGeometry(r,r,av.distanceTo(bv),10),c,av.clone().add(bv).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bv.sub(av).normalize());return o;}
 function group(name,p=[0,0,0]){const g=new T.Group();g.name=name;g.position.set(...p);root.add(g);return g;}
 function star(g,p,size=.1,c=colors.gold){
  const shape=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?size*.46:size;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
  return mesh(g,new T.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1,curveSegments:6}),c,p);
 }
 // Low drifts are part of the snow sculpture, not a display pedestal.
 const drifts=group('snow-drifts');
 for(const [x,z,sx,sz]of [[-.7,-.2,.60,.58],[.6,-.2,.60,.6],[0,.05,.94,.59],[-.8,.58,.35,.36],[.5,.72,.4,.28]])ball(drifts,colors.snow,[x,.045,z],[sx,.09,sz]);
 const wall=group('arched-front-wall');
 const shape=new T.Shape();shape.moveTo(-.79,.08);shape.lineTo(-.79,.89);shape.quadraticCurveTo(0,.97,.79,.89);shape.lineTo(.79,.08);shape.lineTo(.26,.08);shape.lineTo(.26,.47);shape.absarc(0,.47,.26,0,Math.PI,false);shape.lineTo(-.26,.08);shape.closePath();
 mesh(wall,new T.ExtrudeGeometry(shape,{depth:.25,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,curveSegments:16}),colors.snow,[0,0,.18],[1,1,1],'real-open-arch');
 // Small blue ice-bricks trace the opening; the centre stays empty all the way through.
 for(const x of [-.3,.3])for(const y of [.19,.38])block(wall,colors.ice,[x,y,.465],[.09,.16,.07],.025);
 for(let i=0;i<7;i++){const a=i*Math.PI/6,o=block(wall,colors.ice,[Math.cos(a)*.303,.47+Math.sin(a)*.303,.465],[.115,.10,.07],.027);o.rotation.z=a-Math.PI/2;}
 for(const [x,y,w]of [[-.57,.34,.25],[.56,.36,.23],[-.48,.66,.16],[.52,.67,.23]])block(wall,colors.edge,[x,y,.451],[w,.027,.018],.01);
 for(const x of [-.6,-.3,0,.3,.6])block(wall,colors.snow,[x,1.002,.30],[.19,.22,.29],.055);
 const back=group('courtyard-back');
 block(back,colors.ice,[0,.36,-.67],[1.58,.63,.20],.075);
 for(const x of [-.55,-.18,.18,.55])block(back,colors.snow,[x,.73,-.67],[.23,.23,.27],.06);
 for(const x of [-.72,.72])block(back,colors.snow,[x,.34,-.27],[.2,.57,.66],.075);
 const lamps=[];
 for(const [index,x,h,z]of [[0,-.78,1.48,-.24],[1,.78,1.18,-.24]]){
  const tower=group('rounded-turret-'+index,[x,0,z]);
  cyl(tower,colors.ice,[0,h*.49,0],.32,h*.92);
  cyl(tower,colors.snow,[0,h*.47,.012],.315,h*.88);
  cyl(tower,colors.edge,[0,h-.13,0],.355,.14);
  cyl(tower,colors.snow,[0,h-.065,0],.36,.16);
  cyl(tower,colors.shadow,[0,h+.018,0],.24,.025,'turret-well');
  for(let j=0;j<5;j++){const a=j*Math.PI*2/5;const o=block(tower,colors.snow,[Math.cos(a)*.29,h+.09,Math.sin(a)*.29],[.20,.25,.19],.06);o.rotation.y=-a;}
  // Recessed lit window with an attached frame, not an extra floating seat.
  const window=ball(tower,colors.shadow,[0,h*.57,.305],[.12,.16,.023],'window-frame');
  const glow=material('#f0d4a0').clone();glow.emissive.set('#ffcf7b');glow.emissiveIntensity=0;
  ball(tower,glow,[0,h*.57,.326],[.087,.125,.012],'warm-window');lamps.push(glow);
  block(tower,colors.snow,[0,h*.57,.343],[.017,.25,.025],.006);
 }
 const flag=group('blue-pennant',[-.78,1.58,-.24]);
 rod(flag,colors.wood,[0,0,0],[0,.65,0],.018);ball(flag,colors.gold,[0,.69,0],[.045,.045,.045]);
 const cloth=new T.Shape();cloth.moveTo(.025,.59);cloth.bezierCurveTo(.16,.62,.26,.51,.43,.56);cloth.lineTo(.36,.40);cloth.lineTo(.43,.25);cloth.bezierCurveTo(.25,.22,.16,.36,.025,.32);cloth.closePath();
 mesh(flag,new T.ExtrudeGeometry(cloth,{depth:.018,bevelEnabled:false,curveSegments:10}),colors.blue,[0,0,0]);
 star(flag,[.19,.46,.024],.067);
 const crest=group('front-star-crest');star(crest,[0,.91,.49],.11);
 // A small snow guardian, slightly turned toward the open gate.
 const guard=group('snow-guardian',[.59,.09,.70]);guard.rotation.y=-.12;
 ball(guard,colors.snow,[0,.20,0],[.23,.25,.21]);ball(guard,colors.snow,[0,.51,.015],[.215,.205,.195],'guardian-head');
 for(const x of [-.068,.068]){ball(guard,colors.ink,[x,.535,.195],[.015,.025,.012]);ball(guard,'#f0baaa',[x*1.63,.48,.177],[.034,.016,.012]);}
 ball(guard,'#d0a16e',[0,.50,.215],[.045,.025,.054]);
 const scarf=mesh(guard,new T.TorusGeometry(.16,.04,6,24),colors.red,[0,.352,0]);scarf.rotation.x=Math.PI/2;
 block(guard,colors.red,[.105,.235,.19],[.08,.22,.055],.022).rotation.z=-.12;
 for(const y of [.16,.24])ball(guard,colors.wood,[0,y,.207],[.018,.019,.012]);
 ball(guard,colors.snow,[-.16,.045,.13],[.115,.06,.12]);ball(guard,colors.snow,[.16,.045,.13],[.115,.06,.12]);
 ball(guard,colors.snow,[-.25,.30,.04],[.08,.10,.085]);ball(guard,colors.snow,[.25,.30,.04],[.08,.10,.085]);
 const hat=group('guardian-knit-cap',[.59,.09,.70]);hat.rotation.y=-.12;
 ball(hat,colors.blue,[.015,.675,.015],[.211,.085,.19]);ball(hat,colors.blue,[.04,.728,.005],[.17,.105,.16]);ball(hat,colors.snow,[.085,.834,.02],[.063,.063,.063]);
 const rim=mesh(hat,new T.TorusGeometry(.184,.027,6,24),colors.blue,[.005,.673,.015]);rim.rotation.x=Math.PI/2;
 star(guard,[.29,.29,.123],.09);
 const snowballs=group('spare-snowballs',[-.73,.09,.69]);
 for(const [x,y,z]of [[-.10,.02,.05],[.12,.02,.03],[0,.18,.035]])ball(snowballs,colors.snow,[x,y+.10,z],[.12,.12,.12]);
 const lantern=group('courtyard-lantern',[0,.11,-.42]);
 block(lantern,colors.wood,[0,.07,0],[.22,.05,.2],.02);
 const warm=material('#f1d3a2').clone();warm.emissive.set('#ffbe63');warm.emissiveIntensity=0;lamps.push(warm);
 block(lantern,warm,[0,.23,0],[.16,.27,.15],.04);
 block(lantern,colors.wood,[0,.39,0],[.22,.055,.21],.02);
 for(const x of [-.085,.085])for(const z of [-.08,.08])rod(lantern,colors.wood,[x,.08,z],[x,.39,z],.012);
 for(const m of lamps){m.userData.decorationGlow=true;m.userData.nightIntensity=2.4;}
 root.userData.front='+Z';
 root.userData.setNight=night=>{for(const m of lamps)m.emissiveIntensity=night?2.4:0;};
 root.updateMatrixWorld(true);return root;
}
