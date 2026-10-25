import * as T from 'three';
import {mat, group, mesh as kitMesh, tube as kitTube, roundWindow, finish} from './fairytale-model-kit.mjs';
import {snowSurface} from './fairytale-snow-cover.mjs';

function glowMaterial(color, intensity = .9) {
  const material = mat(color).clone();
  material.emissive.set(color);
  material.emissiveIntensity = 0;
  material.userData.witchNightGlow = true;
  material.userData.nightEmissiveIntensity = intensity;
  return material;
}
function mesh(parent, geometry, color, position = [0,0,0], scale = [1,1,1], glow = false) {
  const object = kitMesh(parent, geometry, glow ? glowMaterial(color) : color, position, scale);
  if (glow) object.userData.witchNightGlow = true;
  return object;
}
function box(parent, color, position, size, glow = false) {
  return mesh(parent, new T.BoxGeometry(...size), color, position, [1,1,1], glow);
}
function ball(parent, color, position, size, glow = false) {
  return mesh(parent, new T.SphereGeometry(1,18,14), color, position, size, glow);
}
function cylinder(parent, color, position, top, bottom, height, segments = 12, glow = false) {
  return mesh(parent, new T.CylinderGeometry(top,bottom,height,segments), color, position, [1,1,1], glow);
}
function tube(parent, color, points, radius = .035, segments = 24) {
  return kitTube(parent,color,points,radius,segments);
}
function shapeMesh(parent, shape, color, z, depth = .035, glow = false) {
  const geometry = new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.009,bevelThickness:.009,bevelSegments:1,curveSegments:24});
  return mesh(parent,geometry,color,[0,0,z],[1,1,1],glow);
}
function ring(parent, color, center, radius, thickness = .045) {
  return mesh(parent,new T.TorusGeometry(radius,thickness,8,40),color,center);
}
const rand = n => { const s=Math.sin(n*127.1+311.7)*43758.5453; return s-Math.floor(s); };

const hatCenters = [[0,3.54,0],[0,3.76,0],[0,4.12,0],[.04,4.70,0],[.14,5.30,0],[.34,5.88,0],[.65,6.27,0],[.96,6.30,0],[1.17,6.04,0],[1.20,5.80,0],[1.39,5.76,0],[1.48,5.90,0]];
const hatRadii = [2.05,1.65,1.29,.99,.71,.48,.32,.22,.15,.10,.055,0];
const hatCurve = new T.CatmullRomCurve3(hatCenters.map(p=>new T.Vector3(...p)),false,'catmullrom',.3);
function radiusAt(t) {
  const f=t*(hatRadii.length-1),i=Math.min(hatRadii.length-2,Math.floor(f));
  return T.MathUtils.lerp(hatRadii[i],hatRadii[i+1],f-i);
}
function hatPoint(t,a) {
  const center=hatCurve.getPoint(t),direction=hatCurve.getTangent(t),axis=new T.Vector3(direction.y,-direction.x,0).normalize();
  const radius=radiusAt(t)*(1+.018*Math.sin(a*9+t*5));
  const point=center.clone().addScaledVector(axis,Math.cos(a)*radius).add(new T.Vector3(0,0,Math.sin(a)*radius));
  point.y+=(.07*Math.sin(a*5+.4)+.04*Math.cos(a*3))*Math.pow(1-t,12);
  return point;
}
function hatGeometry() {
  const positions=[],indices=[],rows=120,columns=96;
  for(let i=0;i<rows;i++)for(let j=0;j<columns;j++)positions.push(...hatPoint(i/rows,j/columns*Math.PI*2).toArray());
  for(let i=0;i<rows-1;i++)for(let j=0;j<columns;j++){
    const a=i*columns+j,b=i*columns+(j+1)%columns,c=a+columns,d=b+columns;
    indices.push(a,b,c,b,d,c);
  }
  const tip=positions.length/3;positions.push(...hatCurve.getPoint(1).toArray());
  const bottom=positions.length/3;positions.push(0,3.49,0);
  for(let j=0;j<columns;j++){const k=(j+1)%columns;indices.push((rows-1)*columns+j,(rows-1)*columns+k,tip,j,bottom,k);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
function hatTile(parent,t0,t1,a0,a1,seed) {
  const points=[[0,.5],[-.5,0],[0,0],[.5,0],[.49,.65],[.43,.94],[.2,1.04],[-.2,1.04],[-.43,.94],[-.49,.65]],count=points.length,vertices=[],indices=[];
  for(let layer=0;layer<2;layer++)for(const [a,s] of points){
    const t=Math.max(0,T.MathUtils.lerp(t1,t0,s)),position=hatPoint(t,(a0+a1)/2+a*(a1-a0)),out=position.clone().sub(hatCurve.getPoint(t)).normalize();
    position.addScaledVector(out,.026-layer*.025);position.y+=.018*(1-s);vertices.push(...position.toArray());
  }
  for(let i=1;i<count;i++){const j=i===count-1?1:i+1;indices.push(0,j,i,count,count+i,count+j,i,j,count+j,i,count+j,count+i);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  mesh(parent,geometry,['#62507d','#735b8c','#695481','#7a6092','#5b4974'][seed%5]);
}
function pumpkinBody(parent,position,scale,name) {
  const geometry=new T.SphereGeometry(1,96,48),vertices=geometry.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),lobe=1+.055*Math.cos(Math.atan2(z,x)*10);
    vertices.setXYZ(i,x*lobe,y,z*lobe);
  }
  geometry.computeVertexNormals();
  const object=mesh(parent,geometry,'#db7625',position,scale);object.name=name;return object;
}
function stone(parent,position,size,seed=0) {
  const object=mesh(parent,new T.DodecahedronGeometry(1,0),['#636461','#74736d','#585c5a','#818078'][seed%4],position,size);
  object.rotation.set(rand(seed)*.14,rand(seed+1)*.5,rand(seed+2)*.12);return object;
}
function arch(width,height) {
  const shape=new T.Shape();shape.moveTo(-width,0);shape.lineTo(width,0);shape.lineTo(width,height);shape.absarc(0,height,width,0,Math.PI,false);shape.lineTo(-width,0);shape.closePath();return shape;
}
function lantern(parent,position,size=1) {
  const light=group(parent,'warm-lantern',position);light.scale.setScalar(size);
  cylinder(light,'#e9bf57',[0,0,0],.15,.12,.36,6,true);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(light,'#252b29',[[Math.cos(a)*.15,-.19,Math.sin(a)*.15],[Math.cos(a)*.18,.19,Math.sin(a)*.18]],.014,8);}
  cylinder(light,'#313532',[0,-.22,0],.19,.12,.10,6);
  cylinder(light,'#313532',[0,.23,0],.05,.23,.18,6);
  ring(light,'#373c36',[0,.39,0],.065,.013);
  return light;
}
function branch(parent,points,radiusStart,radiusEnd,color='#625044') {
  const curve=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),segments=40,radialSegments=9;
  const geometry=new T.TubeGeometry(curve,segments,1,radialSegments,false),vertices=geometry.attributes.position;
  for(let i=0;i<=segments;i++){
    const center=curve.getPointAt(i/segments),radius=T.MathUtils.lerp(radiusStart,radiusEnd,i/segments);
    for(let j=0;j<=radialSegments;j++){
      const index=i*(radialSegments+1)+j;
      vertices.setXYZ(index,center.x+(vertices.getX(index)-center.x)*radius,center.y+(vertices.getY(index)-center.y)*radius,center.z+(vertices.getZ(index)-center.z)*radius);
    }
  }
  geometry.computeVertexNormals();return mesh(parent,geometry,color);
}
function mushroom(parent,position,size,color) {
  const cap=group(parent,'mushroom',position);cap.scale.setScalar(size);
  cylinder(cap,'#dfdfb2',[0,.28,0],.095,.15,.56,14,true);
  mesh(cap,new T.SphereGeometry(.43,32,16,0,Math.PI*2,0,Math.PI/2),color,[0,.5,0],[1,.74,1]);
  mesh(cap,new T.CircleGeometry(.43,32),'#e3d99d',[0,.498,0],[1,1,1],true).rotation.x=Math.PI/2;
  for(let i=0;i<11;i++){
    const a=i*2.4,r=.12+rand(i+7)*.24,y=.5+.318*Math.sqrt(1-r*r/.1849),spot=ball(cap,'#f1dfbb',[Math.cos(a)*r,y,Math.sin(a)*r],[.045,.016,.039]);
    spot.rotation.z=-Math.cos(a)*r;spot.rotation.x=Math.sin(a)*r;
  }
  return cap;
}
function jack(parent,position,size) {
  const pumpkin=group(parent,'jack-o-lantern',position);pumpkin.scale.setScalar(size);
  pumpkinBody(pumpkin,[0,.31,0],[.4,.32,.36],'small-pumpkin');
  branch(pumpkin,[[0,.58,0],[.03,.73,0],[.12,.77,.01]],.045,.025,'#645b35');
  for(const x of [-.14,.14]){const shape=new T.Shape();shape.moveTo(x-.07,.34);shape.lineTo(x+.07,.34);shape.lineTo(x,.46);shape.closePath();shapeMesh(pumpkin,shape,'#f8c547',.337,.006,true);}
  const mouth=new T.Shape();mouth.moveTo(-.21,.25);mouth.lineTo(-.1,.21);mouth.lineTo(-.06,.26);mouth.lineTo(.02,.18);mouth.lineTo(.12,.23);mouth.lineTo(.22,.25);mouth.quadraticCurveTo(.07,.04,-.18,.13);mouth.closePath();
  shapeMesh(pumpkin,mouth,'#ffca48',.346,.006,true);return pumpkin;
}
function bottle(parent,position,size,color) {
  const flask=group(parent,'potion-bottle',position);flask.scale.setScalar(size);
  ball(flask,color,[0,.16,0],[.12,.17,.12],true);
  cylinder(flask,color,[0,.34,0],.045,.06,.21,12,true);
  cylinder(flask,'#8b7449',[0,.46,0],.049,.049,.07,10);
  return flask;
}

export function createWitchPumpkinHouse(parent) {
  const root=group(parent,'pumpkin-witch-hat-cottage');
  const base=group(root,'rock-garden-base');
  const ground=cylinder(base,'#414a38',[0,.26,.25],2.9,2.78,.38,48);
  ground.scale.z=.91;snowSurface(ground,.12);
  for(let i=0;i<33;i++){
    const a=i/33*Math.PI*2,rock=stone(base,[Math.cos(a)*2.78,.28,.25+Math.sin(a)*2.55],[.35,.27,.31],i);
    snowSurface(rock,.045);
  }
  for(let i=0;i<110;i++){
    const a=i*2.399,r=1.95+rand(i)*.85,x=Math.cos(a)*r,z=.25+Math.sin(a)*r*.86;
    if(z>1.35&&Math.abs(x)<.75)continue;
    ball(base,['#4a5f35','#607344','#75804c'][i%3],[x,.47,z],[.10+rand(i+5)*.08,.07,.12]).rotation.y=a;
  }

  const house=group(root,'pumpkin-house',[.30,0,-.35]);
  const body=pumpkinBody(house,[0,1.76,0],[1.65,1.63,1.42],'ribbed-pumpkin-house-body');
  body.userData.windowWall=true;snowSurface(body,.09);
  const roof=group(house,'witch-hat-roof',[0,-.30,0]);
  const hat=mesh(roof,hatGeometry(),'#493958');hat.name='closed-hat-skin';
  // The inner lining faces inward; snow must use outward normals above the shingles.
  const snowGeometry=hat.geometry.clone(),snowIndex=snowGeometry.index;
  for(let i=0;i<snowIndex.count;i+=3){const b=snowIndex.getX(i+1);snowIndex.setX(i+1,snowIndex.getX(i+2));snowIndex.setX(i+2,b);}
  snowGeometry.computeVertexNormals();
  const snowSource=new T.Mesh(snowGeometry);
  hat.add(snowSurface(snowSource,.22,.02));
  snowGeometry.dispose();
  const slates=group(roof,'layered-purple-slates');
  for(let row=0;row<30;row++){
    const t0=row/31,t1=Math.min(.986,t0+.044),count=Math.max(5,Math.ceil(radiusAt(t0)*Math.PI*2/.37));
    for(let column=0;column<count;column++){
      const a=(column+(row%2)*.5)/count*Math.PI*2;
      hatTile(slates,t0,t1,a,a+Math.PI*2/count*.97,row*7+column*3);
    }
  }
  tube(roof,'#43332f',Array.from({length:97},(_,i)=>hatPoint(0,i/96*Math.PI*2).add(new T.Vector3(0,-.025,0)).toArray()),.05,96);

  const dormer=group(house,'hat-dormer',[-.36,3.75,1.03]);
  const panel=new T.Shape();panel.moveTo(-.44,0);panel.lineTo(.44,0);panel.lineTo(.44,.63);panel.lineTo(0,1.02);panel.lineTo(-.44,.63);panel.closePath();
  const dormerPanel=shapeMesh(dormer,panel,'#72593e',0,.30);snowSurface(dormerPanel,.045);
  shapeMesh(dormer,arch(.29,.37),'#4e73d0',.32,.015,true);
  box(dormer,'#544030',[0,.31,.36],[.045,.61,.045]);box(dormer,'#544030',[0,.34,.36],[.58,.045,.045]);
  for(const sign of [-1,1]){
    const roofShape=new T.Shape();roofShape.moveTo(0,1.09);roofShape.quadraticCurveTo(sign*.24,.80,sign*.58,.67);roofShape.lineTo(sign*.58,.60);roofShape.quadraticCurveTo(sign*.25,.73,0,1.0);roofShape.closePath();
    const wing=shapeMesh(dormer,roofShape,'#584269',-.35,.86);snowSurface(wing,.035);
    for(let row=0;row<3;row++)for(let column=0;column<3;column++){
      const x=sign*(.12+row*.15),y=1.04-Math.abs(x)*.69,tile=box(dormer,['#725387','#816095','#67507b'][(row+column)%3],[x,y,.43-column*.26],[.18,.055,.29]);
      tile.rotation.z=sign*-.60;
    }
  }
  const sill=box(dormer,'#786a51',[0,-.025,.30],[.92,.11,.34]);snowSurface(sill,.035);

  const chimney=group(house,'stone-chimney',[.97,3.73,-.60]);
  box(chimney,'#444b49',[0,.52,0],[.44,1.25,.46]);
  for(let row=0;row<7;row++)for(let side=0;side<4;side++){
    const a=side*Math.PI/2;
    for(let column=0;column<2;column++){
      const brick=box(chimney,['#646961','#74796e','#535a55'][(row+column)%3],[Math.sin(a)*.245+Math.cos(a)*(column-.5)*.21,row*.18,Math.cos(a)*.245-Math.sin(a)*(column-.5)*.21],[.20,.15,.09]);
      brick.rotation.y=a;
    }
  }
  const cap=box(chimney,'#929385',[0,1.22,0],[.62,.13,.61]);snowSurface(cap,.035);
  box(chimney,'#222b2a',[0,1.291,0],[.30,.008,.30]);

  const entry=group(house,'stone-arched-entry',[-.32,.54,1.49]);entry.scale.set(.82,.82,1);
  shapeMesh(entry,arch(.56,1.19),'#322a26',0,.065);
  for(let i=0;i<6;i++)box(entry,i%2?'#49382f':'#40322c',[-.47+i*.19,.59,.075],[.175,1.16,.03]);
  for(const sign of [-1,1])for(let row=0;row<5;row++)stone(entry,[sign*.65,.14+row*.25,.055],[.16,.15,.18],row+(sign>0?3:0));
  for(let i=0;i<=9;i++){const a=i/9*Math.PI,mortar=stone(entry,[Math.cos(a)*.65,1.22+Math.sin(a)*.65,.055],[.16,.18,.19],i+12);mortar.rotation.z=a-Math.PI/2;}
  ring(entry,'#242824',[.32,.75,.14],.07,.019);box(entry,'#526258',[.32,.75,.10],[.07,.22,.035]);
  lantern(house,[-.32,2.63,1.53],.85);tube(house,'#40392c',[[-.32,2.91,1.18],[-.32,3.04,1.50],[-.32,2.89,1.54]],.028,12);
  const normal=new T.Vector3(.66,.13,.75).normalize(),surface=new T.Vector3();let support=-Infinity;
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    const point=new T.Vector3().fromBufferAttribute(body.geometry.attributes.position,i).multiply(body.scale).add(body.position),distance=point.dot(normal);
    if(distance>support){support=distance;surface.copy(point);}
  }
  const window=roundWindow(house,surface.clone().addScaledVector(normal,.045).toArray(),.36,0,'round-purple-window');
  window.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);

  for(let i=0;i<4;i++){
    const z=2.57-i*.38,y=.43+i*.06,step=box(root,'#73756f',[-.02,y-.06,z],[.94,.16,.43]);
    snowSurface(step,.045);
    for(let j=0;j<3;j++)stone(root,[-.33+j*.31,y+.015,z],[.19,.05,.23],i*3+j);
  }
  const tree=group(root,'crooked-lantern-tree',[-1.92,.45,-.35]);
  branch(tree,[[0,0,0],[-.10,.65,0],[.10,1.25,0],[-.20,1.95,0],[-.26,2.65,0],[-.45,3.26,0]],.24,.045);
  const limbs=[
    [[.03,.85,0],[-.55,1.42,.05],[-.88,1.70,.1],[-1.08,1.97,.08]],
    [[-.14,1.8,0],[-.71,2.17,.07],[-1.08,2.16,.08],[-1.34,2.45,.03]],
    [[-.24,2.35,0],[.20,2.76,-.10],[.34,3.12,-.08]],
    [[-.38,2.93,0],[-.75,3.18,0],[-.88,3.47,.02]],
  ];
  limbs.forEach((points,i)=>branch(tree,points,.10,.019,i%2?'#79614c':'#68503d'));
  branch(tree,[[-.68,2.18,.08],[-.75,2.55,.08],[-.62,2.76,.1]],.05,.012);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    branch(tree,[[0,.25,0],[Math.cos(a)*.3,.07,Math.sin(a)*.3],[Math.cos(a)*.5,0,Math.sin(a)*.5]],.09,.02);
  }
  lantern(tree,[-.74,1.87,.2],1.1);tube(tree,'#31372e',[[-.74,2.40,.2],[-.74,2.25,.2]],.016,8);

  mushroom(root,[-1.91,.45,1.49],1.35,'#b93d35');
  mushroom(root,[-2.34,.45,1.12],.83,'#a93232');
  mushroom(root,[-1.32,.45,1.33],.8,'#c34a3c');
  mushroom(root,[-1.45,.45,2.07],.72,'#9865b6');
  mushroom(root,[.89,.45,1.79],.74,'#9b60b2');
  const bench=group(root,'potion-workbench',[1.63,.46,1.01]);
  box(bench,'#4c382a',[0,.26,0],[.88,.52,.47]);box(bench,'#8b6946',[0,.54,0],[.99,.09,.59]);
  for(const x of [-.42,.42])for(const z of [-.23,.23])box(bench,'#6c4c32',[x,.25,z],[.075,.52,.075]);
  box(bench,'#241f1d',[0,.24,.243],[.63,.28,.012]);bottle(bench,[-.25,.59,0],1,'#c8d844');bottle(bench,[.25,.59,-.10],.72,'#67ce74');
  const cauldron=group(root,'witch-cauldron',[2.13,.46,.15]);
  ball(cauldron,'#252d2e',[0,.31,0],[.35,.32,.35]);ring(cauldron,'#3a4546',[0,.54,0],.30,.045).rotation.x=Math.PI/2;
  mesh(cauldron,new T.CircleGeometry(.27,40),'#688dd7',[0,.54,0],[1,1,1],true).rotation.x=-Math.PI/2;
  for(const x of [-.37,.37])ring(cauldron,'#394443',[x,.36,0],.08,.025).rotation.y=Math.PI/2;
  for(let i=0;i<3;i++){const a=i*2*Math.PI/3;cylinder(cauldron,'#293131',[Math.cos(a)*.22,.06,Math.sin(a)*.22],.05,.065,.14);}
  jack(root,[1.68,.48,2.05],1.15);jack(root,[.93,.48,2.31],.78);

  root.updateMatrixWorld(true);
  root.userData.features=['ribbed-pumpkin-house-body','closed-hat-skin','stone-arched-entry','hat-dormer','crooked-lantern-tree','potion-workbench'];
  return finish(root,'witch_pumpkin');
}
