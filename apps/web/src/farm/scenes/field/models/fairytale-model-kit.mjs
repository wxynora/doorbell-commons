import * as T from 'three';
import {snowLedge} from './fairytale-snow-cover.mjs';

// Same five-band toon shading as the current farm; no new runtime dependency.
const gradient = new T.DataTexture(new Uint8Array([105, 156, 199, 232, 255]), 5, 1, T.RedFormat);
gradient.needsUpdate = true;
const materials = new Map();
export function mat(color) {
  if (!materials.has(color)) materials.set(color, new T.MeshToonMaterial({color, gradientMap: gradient}));
  return materials.get(color);
}
export function group(parent, name, position = [0, 0, 0]) {
  const g = new T.Group(); g.name = name; g.position.set(...position); parent?.add(g); return g;
}
export function mesh(parent, geometry, color, position = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new T.Mesh(geometry, typeof color === 'string' ? mat(color) : color);
  m.position.set(...position); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
export function box(parent, color, position, size) { return mesh(parent, new T.BoxGeometry(...size), color, position); }
export function ball(parent, color, position, size) { return mesh(parent, new T.SphereGeometry(1, 16, 10), color, position, size); }
export function tube(parent, color, points, radius = .04, segments = 24) {
  return mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), segments, radius, 6, false), color);
}
export function lathe(parent, color, profile, position = [0, 0, 0], segments = 48) {
  return mesh(parent, new T.LatheGeometry(profile.map(p => new T.Vector2(...p)), segments), color, position);
}
export function random(seed = 81) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}
export function leaf(parent, position, size = .22, rotation = 0) {
  const shape = new T.Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(-.6, .6, 0, 1.25); shape.quadraticCurveTo(.6, .6, 0, 0);
  const geom = new T.ExtrudeGeometry(shape, {depth: .035, bevelEnabled: false, curveSegments: 5});
  const l = mesh(parent, geom, '#8aa45d', position, [size, size, size]); l.rotation.set(-.4, rotation, -.8); return l;
}
export function curvedLeaf(parent, position, size, direction, pumpkin = false) {
  const shape=new T.Shape();
  if(pumpkin){
    shape.moveTo(0,.12);shape.bezierCurveTo(-.18,-.08,-.5,.05,-.48,.26);
    shape.quadraticCurveTo(-.78,.36,-.49,.54);shape.quadraticCurveTo(-.64,.76,-.32,.82);
    shape.quadraticCurveTo(-.23,1.06,0,1.2);shape.quadraticCurveTo(.23,1.06,.32,.82);
    shape.quadraticCurveTo(.64,.76,.49,.54);shape.quadraticCurveTo(.78,.36,.48,.26);
    shape.bezierCurveTo(.5,.05,.18,-.08,0,.12);
  }else{
    shape.moveTo(0,0);shape.bezierCurveTo(-.43,.12,-.61,.57,-.32,.86);
    shape.quadraticCurveTo(-.12,1.07,0,1.22);shape.quadraticCurveTo(.12,1.07,.32,.86);
    shape.bezierCurveTo(.61,.57,.43,.12,0,0);
  }
  const geometry=new T.ShapeGeometry(shape,12), p=geometry.attributes.position;
  const bend=(x,y)=>.15*Math.sin(y/1.22*Math.PI)-.24*x*x-.1*(y/1.22)**3;
  for(let i=0;i<p.count;i++)p.setZ(i,bend(p.getX(i),p.getY(i)));geometry.computeVertexNormals();
  const g=group(parent,pumpkin?'pumpkin-vine-leaf':'broad-stump-leaf',position);g.scale.setScalar(size);
  const y=new T.Vector3(...direction).normalize(),n=new T.Vector3(0,.6,1);
  n.addScaledVector(y,-n.dot(y)).normalize();const x=new T.Vector3().crossVectors(y,n).normalize();
  g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y)));
  const material=mat(pumpkin?'#8f9e65':'#91a36b').clone();material.side=T.DoubleSide;
  const blade=mesh(g,geometry,material);blade.name='curved-leaf-blade';
  tube(g,'#738b59',[[0,.04,bend(0,.04)+.012],[0,.42,bend(0,.42)+.012],[0,.82,bend(0,.82)+.012],[0,1.14,bend(0,1.14)+.012]],.009,14);
  for(const y0 of [.33,.55,.74])for(const side of [-1,1]){
    const ex=side*(y0>.7?.23:.34),ey=y0+.15;
    tube(g,'#81935f',[[0,y0,bend(0,y0)+.013],[ex*.6,y0+.09,bend(ex*.6,y0+.09)+.013],[ex,ey,bend(ex,ey)+.013]],.005,5);
  }
  return g;
}
export function roundWindow(parent, position, radius = .44, yaw = 0, name = 'window') {
  const g = group(parent, name, position); g.rotation.y = yaw;
  g.userData.surfaceWindow=true;
  const pane = mesh(g, new T.CircleGeometry(radius-.015,32), mat('#a9c7bd').clone(), [0, 0, .014]);
  pane.name = 'window-pane'; pane.userData.windowGlow = true;
  pane.receiveShadow=false;
  const rim = mesh(g, new T.TorusGeometry(radius, .04, 6, 32), '#dec29a', [0, 0, .025]);
  rim.name = 'window-rim';
  box(g,'#c3a477',[0,0,.028],[.035,radius*1.87,.025]);
  box(g,'#c3a477',[0,0,.028],[radius*1.87,.035,.025]);
  snowLedge(g, [0, -radius + .018, .02], [radius * 1.6, .055, .06]);
  return g;
}
export function archDoor(parent, position, width = .98, height = 1.57, yaw = 0) {
  const g = group(parent, 'front-door', position); g.rotation.y = yaw;
  const radius = width / 2, arch = height - radius;
  const shape = new T.Shape(); shape.moveTo(-radius, 0); shape.lineTo(radius, 0); shape.lineTo(radius, arch);
  shape.absarc(0, arch, radius, 0, Math.PI, false); shape.lineTo(-radius, 0);
  mesh(g, new T.ExtrudeGeometry(shape, {depth: .09, bevelEnabled: false, curveSegments: 16}), '#9b7756').userData.windowWall=true;
  const outline = [[-radius - .06, .02, .09], [-radius - .06, arch, .09]];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - i * Math.PI / 16; outline.push([Math.cos(a) * (radius + .06), arch + Math.sin(a) * (radius + .06), .09]);
  }
  outline.push([radius + .06, .02, .09]); tube(g, '#e6cfaa', outline, .067, 40);
  for (const x of [-.3, -.1, .1, .3]) {
    const y = arch + Math.sqrt(Math.max(0, radius * radius - x * x));
    box(g, '#8c694b', [x, y / 2, .097], [.017, y - .06, .018]);
  }
  ball(g, '#d6b66d', [radius * .57, .67, .16], [.06, .06, .055]);
  roundWindow(g, [0, height - .46, .1], .17, 0, 'door-window');
  return g;
}
export function steps(parent, z = 2.15, width = 1.6) {
  const g = group(parent, 'entry-steps');
  for (let i = 0; i < 3; i++) {
    const slab = mesh(g, new T.CylinderGeometry(1, 1, .13, 12), '#c7b798', [0, .065 + i * .115, z - i * .27], [width / 2, 1, .33]);
    slab.rotation.y = .04 * (i - 1);
  }
}
export function flowerPatch(parent, position, seed = 3, count = 16) {
  const g = group(parent, 'garden-flowers', position), r = random(seed);
  for (let i = 0; i < count; i++) {
    const x = (r() - .5) * .8, z = (r() - .5) * .64, y = .12 + r() * .21;
    tube(g, '#77935c', [[x, 0, z], [x + .04, y, z]], .012, 2);
    const color = ['#f2d58e', '#edd5c3', '#dba2a0'][i % 3];
    for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5; ball(g, color, [x + Math.cos(a) * .047, y, z + Math.sin(a) * .047], [.045, .022, .04]);
    }
    ball(g, '#c7a75a', [x, y + .015, z], [.023, .02, .023]);
  }
}
export function setHouseNight(house, night) {
  house.traverse(o => {
    if (o.userData.windowGlow) { o.material.color.set(night ? '#efce90' : '#a9c7bd'); o.material.emissive.set(night ? '#f5bd69' : '#000000'); o.material.emissiveIntensity = night ? .65 : 0; }
    if (o.userData.mushroomGlow) {o.material.emissive.set(night?'#ffc77b':'#000000');o.material.emissiveIntensity=night?.85:0;}
  });
}
export function finish(house, kind) {
  house.userData.houseKind = kind; house.userData.appearanceOnly = false;
  house.updateMatrixWorld(true);
  // Seat the centre on the wall, orient to its surface, then join the narrow
  // frame's rear edge to the curved facade. Glass remains a flat plane.
  const windows=[];house.traverse(o=>{if(o.userData.surfaceWindow)windows.push(o);});
  for(const w of windows){
    const walls=w.parent.children.filter(o=>o.userData.windowWall);
    const ray=new T.Raycaster();
    let normal=new T.Vector3(0,0,1).transformDirection(w.matrixWorld);
    ray.set(new T.Vector3(.003,.002,3).applyMatrix4(w.matrixWorld),normal.clone().negate());
    const centre=ray.intersectObjects(walls,false)[0];
    if(!centre)throw new Error(`${kind} ${w.name}: no facade behind window centre`);
    normal=(centre.normal??centre.face.normal).clone().applyMatrix3(new T.Matrix3().getNormalMatrix(centre.object.matrixWorld)).normalize();
    w.position.copy(w.parent.worldToLocal(centre.point.clone()));
    const localNormal=normal.clone().transformDirection(new T.Matrix4().copy(w.parent.matrixWorld).invert());
    w.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(localNormal,new T.Vector3(),new T.Vector3(0,1,0)));
    w.updateMatrixWorld(true);
    const wallToWindow=new T.Matrix4().copy(w.matrixWorld).invert(),paneRadius=w.getObjectByName('window-pane').geometry.parameters.radius;
    let front=.012;
    // Pumpkin ribs can rise above the smooth centre normal. Keep the flat pane
    // in front of those ridges, while its narrow rear frame still meets the wall.
    for(const fraction of [0,.5,1])for(let i=0;i<32;i++){
      const a=i*Math.PI*2/32,x=Math.cos(a)*paneRadius*fraction+.0001,y=Math.sin(a)*paneRadius*fraction+.0001;
      ray.set(new T.Vector3(x,y,2).applyMatrix4(w.matrixWorld),normal.clone().negate());
      const hit=ray.intersectObjects(walls,false)[0];
      if(hit)front=Math.max(front,hit.point.applyMatrix4(wallToWindow).z+.012);
    }
    w.translateZ(front);w.updateMatrixWorld(true);
    const inverse=new T.Matrix4().copy(w.matrixWorld).invert(),r=w.getObjectByName('window-rim').geometry.parameters.radius+.02;
    const points=[],indices=[];
    for(let i=0;i<=32;i++){
      const a=i*Math.PI*2/32,x=Math.cos(a)*r+.0001,y=Math.sin(a)*r+.0001;
      ray.set(new T.Vector3(x,y,2).applyMatrix4(w.matrixWorld),normal.clone().negate());
      const hit=ray.intersectObjects(walls,false)[0];
      if(!hit)throw new Error(`${kind} ${w.name}: frame edge outside facade`);
      const rear=hit.point.applyMatrix4(inverse);
      points.push(x,y,.015,rear.x,rear.y,rear.z-.012);
      if(i<32){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const wood=mat('#bca079').clone();wood.side=T.DoubleSide;
    mesh(w,geometry,wood).name='window-wall-joint';
    w.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  }
  house.updateMatrixWorld(true);
  return house;
}
