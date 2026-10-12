import * as T from 'three';
import {group, mesh, box, ball, tube, leaf, curvedLeaf, roundWindow, archDoor, steps, flowerPatch, finish} from './fairytale-model-kit.mjs';
import {snowSurface} from './fairytale-snow-cover.mjs';

export function createPumpkinHouse(parent) {
  const h = group(parent, 'fairytale-pumpkin-house');
  // A squat, ten-ribbed pumpkin, not a Halloween face or an orange sphere.
  const width = 64, rows = 28, positions = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    const p = j / rows * Math.PI, y = .02 + (1 - Math.cos(p)) * 1.67;
    for (let i = 0; i <= width; i++) {
      const a = i / width * Math.PI * 2, radius = Math.sin(p) ** .63 * (2.12 + Math.cos(a * 10) * .13);
      positions.push(Math.sin(a) * radius, y, Math.cos(a) * radius * .86);
      if (j < rows && i < width) {
        const k = j * (width + 1) + i; indices.push(k, k + 1, k + width + 1, k + 1, k + width + 2, k + width + 1);
      }
    }
  }
  const skin = new T.BufferGeometry(); skin.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); skin.setIndex(indices); skin.computeVertexNormals();
  const shell = mesh(h, skin, '#d99b58'); shell.name = 'ribbed-pumpkin-shell';shell.userData.windowWall=true; snowSurface(shell,.12);
  // Pale grooves make the ribs readable in the existing farm lighting.
  for (let i = 0; i < 10; i++) {
    const a = (i + .5) * Math.PI * 2 / 10, points = [];
    for (let j = 2; j <= 17; j++) {
      const p = j / 19 * Math.PI, r = Math.sin(p) ** .63 * 2.006;
      points.push([Math.sin(a) * r, .02 + (1 - Math.cos(p)) * 1.67, Math.cos(a) * r * .86]);
    }
    tube(h, '#c98c4d', points, .018, 22);
  }
  tube(h, '#82905a', [[0, 3.25, 0], [.02, 3.55, .02], [.17, 3.81, -.02], [.48, 3.96, -.1]], .18, 18).name = 'curved-pumpkin-stem';
  tube(h, '#688454', [[.13, 3.51, .13], [.7, 3.49, .42], [1.03, 3.12, .53], [.9, 2.87, .55], [.65, 2.99, .56], [.77, 3.15, .55]], .035);
  for (const [x, y, z, r] of [[-.28, 3.28, .22, -.7], [.38, 3.27, -.12, 1.3], [.7, 3.34, .41, -.2]]) leaf(h, [x, y, z], .62, r);
  archDoor(h, [0, .35, 1.82], 1.08, 1.63);
  roundWindow(h, [-1.42, 1.91, 1.27], .4, -.65);
  roundWindow(h, [1.42, 1.91, 1.27], .4, .65);
  roundWindow(h, [2.09, 1.8, -.18], .35, Math.PI / 2);
  // Vine canopy, supported rather than floating over the doorway.
  const canopy = group(h, 'vine-entry-canopy', [0, 2.22, 1.94]);
  const roof = box(canopy, '#a8b47d', [0, .08, .12], [1.62, .09, .85]); roof.rotation.x = .16;
  snowSurface(roof,.1);
  for (const s of [-1, 1]) {
    tube(canopy, '#8a9a66', [[s * .71, -1.86, .44], [s * .77, -.9, .42], [s * .71, .1, .4]], .055, 10);
    tube(canopy, '#728959', [[s * .73, -1.45, .46], [s * .81, -.7, .52], [s * .67, .13, .38], [s * .2, .23, .42]], .025, 20);
    for (let j = 0; j < 6; j++) leaf(canopy, [s * (.7 + Math.sin(j) * .07), -.87 + j * .21, .5], .23, s * j);
  }
  for (let j = 0; j < 7; j++) leaf(canopy, [-.7 + j * .22, .15, .33 + Math.sin(j) * .1], .28, j * .8);
  steps(h, 2.73, 1.7);
  flowerPatch(h, [-1.38, .11, 1.95], 5, 13); flowerPatch(h, [1.45, .11, 1.92], 8, 13);
  // Little clay pot makes the dwelling read as lived-in, without extra scenery.
  mesh(h, new T.CylinderGeometry(.21, .15, .31, 12), '#b78064', [-1, .25, 2.28]);
  ball(h, '#94a56a', [-1, .45, 2.28], [.22, .18, .22]);
  const attic=roundWindow(h, [0, 2.93, 1.62], .29, 0, 'attic-window');attic.rotation.x=-.6;
  const wing = group(h,'pumpkin-side-room',[2.24,0,-.31]);wing.scale.setScalar(.65);
  const wingShell=mesh(wing,skin,'#d5a05f');wingShell.userData.windowWall=true;snowSurface(wingShell,.14);
  tube(wing,'#82905a',[[0,3.23,0],[.03,3.68,0],[.3,3.9,-.1]],.15,12);
  roundWindow(wing,[.47,1.84,1.77],.46,.25,'side-room-window');
  roundWindow(wing,[2.15,1.75,0],.42,Math.PI/2,'side-room-east-window');
  const chimney=group(h,'clay-chimney',[-.95,2.83,-.54]);chimney.rotation.z=-.15;
  mesh(chimney,new T.CylinderGeometry(.17,.21,.94,10),'#d6bd97',[0,.47,0]);
  mesh(chimney,new T.CylinderGeometry(.24,.23,.12,10),'#c2a67e',[0,.99,0]);
  const vines=group(h,'trailing-pumpkin-vines');
  // One main vine follows the left shoulder; the second stays above the door.
  // Derive the surface path from the actual ribbed pumpkin, not an airborne arc.
  const path=[];
  for(let j=0;j<=32;j++){
    const p=.16+j/32*(Math.PI-.34),a=-1.03+Math.sin(j/32*Math.PI)*.08;
    const r=Math.sin(p)**.63*(2.12+Math.cos(a*10)*.13)+.035;
    path.push([Math.sin(a)*r,.02+(1-Math.cos(p))*1.67,Math.cos(a)*r*.86]);
  }
  path.reverse();path.unshift([.05,3.5,.06]);
  const main=tube(vines,'#81945d',path,.022,72);main.name='surface-following-vine';
  tube(vines,'#81945d',[[-.98,3.2,.68],[-.7,2.6,1.69],[-.66,2.42,2.06],[-.33,2.43,2.3],[.12,2.43,2.3],[.59,2.4,2.15]],.018,28).name='canopy-vine';
  tube(vines,'#81945d',[[-.37,.27,.24],[-1.38,.12,.8],[-1.95,.12,1.32],[-2.17,.12,1.8],[-1.94,.12,2.02]],.019,22).name='ground-vine';
  for(const [position,size,direction] of [
    [[-1.06,3.15,.66],.47,[-.7,.15,.4]],
    [[-1.8,2.31,1.15],.45,[-.6,-.18,.45]],
    [[-1.81,1.3,1.16],.43,[-.6,-.2,.46]],
    [[-.54,2.44,2.31],.35,[-.6,.04,.28]],
    [[.38,2.43,2.22],.32,[.7,.04,.16]],
    [[-1.97,.15,1.79],.52,[-.2,.02,.8]],
    [[-1.45,.15,1],.4,[-.7,.02,-.1]],
    [[-.11,3.33,.12],.4,[.5,.12,.5]],
  ]){
    const l=curvedLeaf(vines,position,size,direction,true);
    if(position[1]<.3){l.updateMatrixWorld(true);const b=new T.Box3().setFromObject(l);l.position.y+=Math.max(0,.025-b.min.y);}
  }
  for(const [x,y,z] of [[-1.8,2.4,1.16],[-2.03,.2,1.65]]) {
    const curl=[];for(let i=0;i<=24;i++){const t=i/24,a=t*Math.PI*2.7,r=.095*(1-t*.75);curl.push([x-.06-t*.1+Math.sin(a)*r,y+Math.cos(a)*r,z+.04+t*.04]);}
    tube(vines,'#81945d',curl,.01,26);
  }
  h.scale.setScalar(1.2);h.position.x=-.65;
  return finish(h, 'pumpkin');
}
