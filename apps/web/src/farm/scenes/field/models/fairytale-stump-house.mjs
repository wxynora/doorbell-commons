import * as T from 'three';
import {group, mesh, ball, tube, curvedLeaf, lathe, roundWindow, archDoor, steps, flowerPatch, random, finish} from './fairytale-model-kit.mjs';
import {snowSurface,snowLedge} from './fairytale-snow-cover.mjs';

export function createStumpHouse(parent) {
  const h = group(parent, 'fairytale-stump-house');
  const segments = 64, rows = 12, p = [], ix = [];
  const radius = (a, t) => 1.73 + .34 * (1 - t) ** 4 + .08 * Math.sin(a * 9 + .25) + .045 * Math.cos(a * 15 - t);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, t = j / rows;
    p.push(Math.sin(a) * radius(a, t), .16 + t * (3.22 + .11 * Math.sin(a * 3)), Math.cos(a) * radius(a, t) * .89);
    if (j < rows && i < segments) { const k = j * (segments + 1) + i; ix.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1); }
  }
  const bark = new T.BufferGeometry(); bark.setAttribute('position', new T.Float32BufferAttribute(p, 3)); bark.setIndex(ix); bark.computeVertexNormals();
  const wall=mesh(h, bark, '#aa825c');wall.name = 'uneven-stump-bark';wall.userData.windowWall=true;
  // Broad roots merge into the trunk rather than a rectangular foundation.
  for (let i = 0; i < 7; i++) {
    const a = (i + .4) * Math.PI * 2 / 7;
    if (Math.abs(a - Math.PI * 2) < .5 || a < .5) continue;
    const root = ball(h, '#aa825c', [Math.sin(a) * 1.69, .28, Math.cos(a) * 1.48], [.37, .27, .9]); root.rotation.y = a;
  }
  for (let i = 0; i < 25; i++) {
    const a = (i + .4) * Math.PI * 2 / 25, points = [];
    for (let j = 0; j <= 9; j++) {
      const t = j / 9, angle = a + Math.sin(t * 5 + i) * .018, r = radius(angle, t) + .012;
      points.push([Math.sin(angle) * r, .2 + t * (3.11 + .11 * Math.sin(angle * 3)), Math.cos(angle) * r * .89]);
    }
    tube(h, i % 3 ? '#93704f' : '#c7a17a', points, i % 3 ? .016 : .022, 16);
  }
  const cut = mesh(h, new T.CylinderGeometry(1.76, 1.77, .12, 64), '#d6b48a', [0, 3.37, 0], [1, 1, .89]); cut.name = 'cut-wood-top';
  snowSurface(cut,.12);
  for (const r of [.4, .72, 1.06, 1.4, 1.68]) {
    const ring = mesh(h, new T.TorusGeometry(r, .013, 4, 64), '#b99268', [.08, 3.44, .02], [1, .89, 1]); ring.rotation.x = Math.PI / 2;
  }
  // Small leaf roof over the hatch, leaving the cut stump and rings visible.
  const roof = lathe(h, '#8d9e70', [[0, .33], [.3, .39], [.85, .26], [1.18, .08], [1.22, 0]].reverse(), [0, 3.45, -.38]); roof.scale.z = .8;snowSurface(roof,.1);
  ball(h, '#a2ae78', [.1, 3.87, -.37], [.1, .11, .1]);
  const rng = random(143);
  for (let i = 0; i < 28; i++) {
    const a = rng() * Math.PI * 2, r = 1.62 + rng() * .12;
    ball(h, ['#8b9b64', '#9da86e', '#788b56'][i % 3], [Math.sin(a) * r, 3.37 + rng() * .05, Math.cos(a) * r * .89], [.13 + rng() * .17, .07, .16]);
  }
  archDoor(h, [0, .33, 1.79], 1.08, 1.83);
  roundWindow(h, [-1.38, 2.1, 1.12], .4, -.8); roundWindow(h, [1.36, 2.1, 1.12], .4, .8);
  roundWindow(h, [1.79, 1.86, -.28], .32, Math.PI / 2);
  // A clipped side branch becomes a modest chimney with a visible wood cut.
  const chimney = group(h, 'branch-chimney', [-1.22, 2.87, -.43]); chimney.rotation.z = .31;
  mesh(chimney, new T.CylinderGeometry(.26, .32, 1.22, 12), '#aa825c', [0, .61, 0]);
  mesh(chimney, new T.CylinderGeometry(.28, .28, .07, 16), '#d6b48a', [0, 1.24, 0]);
  mesh(chimney, new T.CircleGeometry(.16, 16), '#6f5944', [0, 1.282, 0]).rotation.x = -Math.PI / 2;
  const awning = lathe(h, '#9daa77', [[0, .24], [.47, .18], [.78, 0]].reverse(), [0, 2.35, 1.94], 24); awning.scale.set(1, 1, .53);snowSurface(awning,.09);
  steps(h, 2.42, 1.65);
  flowerPatch(h, [-1.53, .12, 1.8], 21, 12); flowerPatch(h, [1.62, .12, 1.77], 22, 12);
  for (let i = 0; i < 3; i++) {
    const x = 1.88 + i * .15, z = .82 - i * .27;
    mesh(h, new T.CylinderGeometry(.035, .04, .19, 8), '#e6d6b1', [x, .21, z]);
    ball(h, '#ca9481', [x, .32, z], [.13, .07, .13]);
  }
  // A broad hollow branch is a side room, with its own glazed end and roof.
  const wing=group(h,'hollow-branch-room',[1.83,.1,-.18]);
  mesh(wing,new T.CylinderGeometry(.92,1.1,2.21,32),'#aa825c',[0,1.2,0],[1,1,.9]).userData.windowWall=true;
  const top=mesh(wing,new T.CylinderGeometry(.94,.98,.16,32),'#d6b48a',[0,2.35,0],[1,1,.9]);snowSurface(top,.12);
  const leafy=lathe(wing,'#90a16f',[[0,.55],[.44,.47],[1,.1],[1.08,0]].reverse(),[0,2.42,0],32);snowSurface(leafy,.11);
  roundWindow(wing,[.28,1.29,.91],.4,.2,'branch-room-window');roundWindow(wing,[1,1.35,0],.34,Math.PI/2,'branch-room-east-window');
  for(let i=0;i<10;i++){const a=i*Math.PI*2/10;tube(wing,'#987553',[[Math.sin(a)*1.08,.2,Math.cos(a)*.97],[Math.sin(a)*.94,2.28,Math.cos(a)*.85]],.018,3);}
  const landing=mesh(h,new T.CylinderGeometry(1,1,.13,16),'#c8b18a',[.18,.22,1.97],[1.19,1,.51]);snowSurface(landing,.06);
  for(const x of [-.94,1.12]) tube(h,'#94744f',[[x,.22,2.12],[x,1,2.12]],.046,3);
  tube(h,'#b19267',[[-.94,1,2.12],[-.94,1,1.75]],.045,2);tube(h,'#b19267',[[1.12,1,2.12],[1.12,1,1.75]],.045,2);
  roundWindow(h,[0,2.91,1.59],.27,0,'attic-window');
  snowLedge(h,[0,.37,2.12],[1.65,.08,.34]);
  const branches=group(h,'forked-living-branches');
  function branch(points,radius){
    const b=tube(branches,'#aa825c',points,radius,20),p=b.geometry.attributes.position,curve=b.geometry.parameters.path;
    for(let i=0;i<=20;i++){const center=curve.getPointAt(i/20),scale=1-i/20*.8;
      for(let j=0;j<=6;j++){const k=i*7+j;p.setXYZ(k,center.x+(p.getX(k)-center.x)*scale,center.y+(p.getY(k)-center.y)*scale,center.z+(p.getZ(k)-center.z)*scale);}}
    b.geometry.computeVertexNormals();b.name='tapered-living-branch';return b;
  }
  branch([[-1.23,2.6,-.36],[-1.7,3.12,-.39],[-2.04,3.35,-.3],[-2.25,3.43,-.14]],.19);
  branch([[-1.83,3.23,-.35],[-1.76,3.54,-.41],[-1.56,3.67,-.3]],.09);
  branch([[1.17,2.73,-.64],[1.68,3.16,-.65],[2.08,3.38,-.48],[2.36,3.46,-.21]],.18);
  branch([[1.91,3.31,-.56],[1.94,3.61,-.61],[1.79,3.78,-.51]],.085);
  for(const [position,size,direction] of [
    [[-2.24,3.43,-.14],.92,[-1,.16,.18]],
    [[-1.56,3.67,-.3],.86,[.42,.08,.68]],
    [[2.35,3.46,-.21],.92,[1,.12,.17]],
    [[1.79,3.78,-.51],.9,[-.55,.05,.7]],
  ])curvedLeaf(branches,position,size,direction);
  h.scale.setScalar(1.22);h.position.x=-.5;
  return finish(h, 'stump');
}
