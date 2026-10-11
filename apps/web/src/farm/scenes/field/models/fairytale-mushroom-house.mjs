import * as T from 'three';
import {mat, group, mesh, ball, tube, lathe, roundWindow, archDoor, steps, flowerPatch, finish} from './fairytale-model-kit.mjs';
import {snowSurface} from './fairytale-snow-cover.mjs';

export function createMushroomHouse(parent) {
  const h = group(parent, 'fairytale-mushroom-house');
  const body=lathe(h, '#e8d9b8', [[0, .02], [1.58, .02], [1.51, .38], [1.38, 1], [1.24, 1.95], [1.27, 2.66], [1.55, 2.87], [0, 2.87]], [0, 0, 0]);body.name = 'mushroom-stem-home';body.userData.windowWall=true;
  const capProfile = [[0, 4.14], [.32, 4.13], [.7, 4.04], [1.13, 3.84], [1.57, 3.54], [1.96, 3.18], [2.23, 2.94], [2.28, 2.82], [2.12, 2.77], [1.58, 2.85], [0, 2.9]];
  const cap=lathe(h, '#cc9285', [...capProfile].reverse());cap.name = 'broad-mushroom-cap';snowSurface(cap,.14);
  // Warm ivory underside with understated radial gills.
  lathe(h, '#e0c6a5', [[0, 2.87], [1.38, 2.84], [2.15, 2.79], [2.22, 2.81]]);
  for (let i = 0; i < 28; i++) {
    const a = i * Math.PI * 2 / 28;
    tube(h, '#cdb38f', [[Math.sin(a) * 1.34, 2.832, Math.cos(a) * 1.34], [Math.sin(a) * 2.13, 2.785, Math.cos(a) * 2.13]], .014, 2);
  }
  // Spots sit on the dome's tangent plane, not upright balls stuck to the roof.
  for (const [r, a, size] of [[.38, .4, .2], [.85, 2.4, .25], [1.19, .6, .28], [1.62, 1.8, .23], [1.65, 4.7, .28], [1.29, 3.9, .22], [.7, 5.2, .2], [1.99, .15, .18], [1.99, 3.1, .19], [1.96, 5.5, .19]]) {
    let low = capProfile[0], high = capProfile[1];
    for (let j = 1; j < 8; j++) if (r >= capProfile[j - 1][0] && r <= capProfile[j][0]) { low = capProfile[j - 1]; high = capProfile[j]; break; }
    const slope = (high[1] - low[1]) / (high[0] - low[0]), y = low[1] + (r - low[0]) * slope;
    const spot = ball(h, '#f0e2c7', [Math.sin(a) * r, y + .015, Math.cos(a) * r], [size, .035, size * .82]);
    spot.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-slope * Math.sin(a), 1, -slope * Math.cos(a)).normalize());
  }
  archDoor(h, [0, .32, 1.52], 1, 1.72);
  roundWindow(h, [-1.02, 1.91, .91], .37, -.84); roundWindow(h, [1.02, 1.91, .91], .37, .84);
  roundWindow(h, [1.3, 1.75, -.22], .32, Math.PI / 2);
  // A second tiny mushroom is a sheltered entrance, not a pasted-on pergola.
  const porch = lathe(h, '#b8bd91', [[0, .38], [.26, .34], [.63, .17], [.88, -.02], [.86, -.1], [0, -.06]].reverse(), [0, 2.22, 1.68], 32); porch.scale.z = .78;snowSurface(porch,.1);
  for (const x of [-.71, .71]) tube(h, '#d1be98', [[x, .3, 2.1], [x, 1.24, 2.08], [x * .91, 2.15, 2]], .047, 8);
  // Crooked clay chimney offsets the otherwise symmetrical cap.
  const chimney = group(h, 'crooked-clay-chimney', [-.94, 3.64, -.3]); chimney.rotation.z = .12;
  mesh(chimney, new T.CylinderGeometry(.17, .21, .81, 10), '#d6bd97', [0, .4, 0]);
  mesh(chimney, new T.CylinderGeometry(.23, .22, .12, 10), '#c2a67e', [0, .86, 0]);
  mesh(chimney, new T.CircleGeometry(.14, 12), '#76604b', [0, .925, 0]).rotation.x = -Math.PI / 2;
  steps(h, 2.43, 1.55);
  flowerPatch(h, [-1.39, .12, 1.48], 41, 15); flowerPatch(h, [1.38, .12, 1.5], 42, 15);
  for (let i = 0; i < 4; i++) {
    const x = -1.7 - Math.sin(i) * .2, z = .82 - i * .36, height = .18 + i % 2 * .08;
    mesh(h, new T.CylinderGeometry(.035, .045, height, 8), '#e4d3b0', [x, height / 2 + .12, z]);
    ball(h, '#cf9d8e', [x, height + .13, z], [.17, .09, .17]);
  }
  const wing=group(h,'small-mushroom-wing',[2.02,.05,-.28]);wing.scale.setScalar(.66);
  lathe(wing,'#e8d9b8',[[0,.02],[1.42,.02],[1.23,1],[1.16,2.65],[0,2.65]]).userData.windowWall=true;
  const littleCap=lathe(wing,'#c99482',[...capProfile].reverse());snowSurface(littleCap,.16);
  roundWindow(wing,[.28,1.55,1.33],.44,.2,'wing-window');roundWindow(wing,[1.26,1.65,-.1],.36,Math.PI/2,'wing-east-window');
  for(const [x,z] of [[.42,1],[-.8,.3],[1.2,-.5]])ball(wing,'#f0e2c7',[x,3.81,z],[.22,.045,.2]);
  const mushrooms=group(h,'built-in-mushroom-garden');
  for(const [i,x,z,size,lamp] of [[0,-2.05,1.62,.82,true],[1,-2.38,1.18,.53,false],[2,-1.91,2.12,.4,false],[3,2.44,1.16,.72,true],[4,2.76,.86,.43,false],[5,2.29,1.65,.38,false]]) {
    const small=group(mushrooms,lamp?'mushroom-lamp':'little-mushroom',[x,.08,z]);small.scale.setScalar(size);
    mesh(small,new T.CylinderGeometry(.075,.12,.7,12),'#e6d6b1',[0,.35,0]).name='mushroom-lamp-stem';
    const lid=lathe(small,lamp?mat('#e5bb80').clone():i%2?'#c4917c':'#cba08a',[[0,.98],[.15,.97],[.34,.88],[.46,.72],[.47,.65],[0,.65]].reverse(),[0,0,0],24);snowSurface(lid,.085);
    lathe(small,'#ead3a3',[[0,.64],[.43,.64],[.46,.66]],[0,0,0],24);
    if(lamp){lid.name='luminous-mushroom-cap';lid.userData.mushroomGlow=true;}
    for(const [dx,dz] of [[.14,.1],[-.17,-.04],[.08,-.24]])ball(small,'#efe2c7',[dx,.94-(Math.abs(dx)+Math.abs(dz))*.28,dz],[.075,.025,.065]);
  }
  h.scale.setScalar(1.22);h.position.x=-.6;
  return finish(h, 'mushroom');
}
