import * as THREE from 'three';
import {piece,lathe,ring,pipe,extrude,paint} from './model-kit-v4.mjs';
import {mergeStaticMeshes} from './mesh-batching.mjs';
import {cookwareMaterials,syrupMaterial} from './workshop-surfaces.mjs';

function smoothLathe(profile,material,steps=40,radial=64) {
  const curve=new THREE.SplineCurve(profile.map(point=>new THREE.Vector2(...point)));
  return lathe(curve.getPoints(steps).map(p=>[Math.max(0,p.x),p.y]),material,[0,0,0],radial);
}

export const POT_RIM={radius:1.02,centerY:1.48,tube:.065,inner:.955,outer:1.085,top:1.545};
export function makePot() {
  const root=new THREE.Group(),{iron,brass}=cookwareMaterials();
  const outside=[[0,.28],[.50,.28],[.89,.38],[1.17,.62],[1.25,.88],[1.23,1.10],[1.10,1.30],[1.015,1.45],[1.02,1.48]];
  const shell=smoothLathe([...outside,[.97,1.48],[.96,1.39],[1.05,1.25],[1.14,1.06],[1.16,.86],[1.08,.63],[.83,.46],[.48,.39],[0,.39]],iron,64);root.add(shell);
  // A rolled lip and the narrow shoulder make the silhouette a cauldron.
  root.add(ring(1.02,.065,brass,[0,1.48,0]),ring(1.055,.014,iron,[0,1.435,0]));
  const profile=new THREE.SplineCurve(outside.map(p=>new THREE.Vector2(...p))).getPoints(96);
  const radiusAt=y=>{for(let i=1;i<profile.length;i++){const a=profile[i-1],b=profile[i];if(a.y<=y&&b.y>=y)return THREE.MathUtils.lerp(a.x,b.x,(y-a.y)/(b.y-a.y));}return 1.1;};
  const mounted=(shape,x,y,thickness=.012)=>{const badge=extrude(shape,thickness,brass,[0,0,0],.006),p=badge.geometry.attributes.position;for(let i=0;i<p.count;i++){const vx=p.getX(i)+x,vy=p.getY(i)+y,r=radiusAt(vy);p.setXYZ(i,vx,vy,Math.sqrt(Math.max(0,r*r-vx*vx))+.012+p.getZ(i));}badge.geometry.computeVertexNormals();root.add(badge);};
  for(const side of [-1,1]) {
    const loop=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;loop.push([side*(1.32+.255*Math.cos(a)),1.02+.23*Math.sin(a),.01+.05*Math.cos(a)]);}root.add(pipe(loop,.044,brass,32));
    root.add(piece(new THREE.SphereGeometry(.105,16,12),brass,[side*1.20,1.08,0],[.45,1,1]));
    for(const y of [1.025,1.135])root.add(piece(new THREE.SphereGeometry(.025,12,8),iron,[side*1.245,y,0]));
  }
  for(const angle of [-Math.PI/4,Math.PI/4,Math.PI]) {
    const x=Math.sin(angle),z=Math.cos(angle);
    root.add(pipe([[x*.72,.40,z*.72],[x*.85,.20,z*.85],[x*.92,.065,z*.92]],.085,iron,16));
    const foot=smoothLathe([[0,0],[.10,0],[.125,.025],[.115,.065],[.085,.085],[0,.085]],iron,10,24);foot.position.set(x*.92,.005,z*.92);root.add(foot);
  }
  const moon=new THREE.Shape();moon.moveTo(.08,.23);moon.bezierCurveTo(-.31,.31,-.37,-.23,-.04,-.26);moon.bezierCurveTo(.17,-.30,.30,-.10,.28,.01);moon.bezierCurveTo(.09,-.12,-.13,-.04,-.13,.12);moon.bezierCurveTo(-.10,.25,0,.26,.08,.23);mounted(moon,0,.94);
  for(const [x,y,size] of [[-.46,.88,.075],[.46,.88,.075],[-.7,1.03,.035],[.7,1.03,.035],[.29,1.16,.035],[-.30,1.16,.035]]) {
    const star=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?size*.43:size;i?star.lineTo(Math.cos(a)*r,Math.sin(a)*r):star.moveTo(Math.cos(a)*r,Math.sin(a)*r);}star.closePath();mounted(star,x,y,.008);
  }
  mergeStaticMeshes(root);
  const surface=piece(new THREE.CircleGeometry(1.035,64),syrupMaterial(),[0,1.19,0]);surface.rotation.x=-Math.PI/2;surface.castShadow=false;surface.receiveShadow=false;root.add(surface);
  const bubbles=[];
  for(let i=0;i<9;i++){const a=i*2.4,r=.24+(i%4)*.18,b=piece(new THREE.SphereGeometry(.018+(i%3)*.008,12,6,0,Math.PI*2,0,Math.PI/2),new THREE.MeshPhysicalMaterial({color:'#fff1c8',roughness:.18,clearcoat:.65}),[Math.sin(a)*r,1.2,Math.cos(a)*r],[1,.55,1]);b.castShadow=false;b.receiveShadow=false;root.add(b);bubbles.push(b);}
  return {root,surface,bubbles};
}

export function makeSpoon() {
  const root=new THREE.Group(),{wood}=cookwareMaterials(),positions=[],uvs=[],indices=[],segments=32,rings=7;
  // Two curved skins, joined at the lip: a carved bowl, not a flattened sphere.
  for(let side=0;side<2;side++)for(let r=0;r<=rings;r++)for(let i=0;i<=segments;i++) {
    const f=r/rings,a=i/segments*Math.PI*2,x=Math.cos(a)*.17*f,z=Math.sin(a)*.245*f;
    positions.push(x,-.058*(1-f*f)-(side?.018*(1-.55*f):0),z);uvs.push(.5+x,.5+z);
    if(r<rings&&i<segments){const k=side*(rings+1)*(segments+1)+r*(segments+1)+i,n=k+segments+1;indices.push(...(side?[k,n,k+1,k+1,n,n+1]:[k,k+1,n,k+1,n+1,n]));}
  }
  const offset=(rings+1)*(segments+1);for(let i=0;i<segments;i++){const a=rings*(segments+1)+i,b=a+offset;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const bowl=piece(geometry,wood);root.add(bowl);
  const handle=pipe([[0,.015,-.20],[0,.025,-.48],[0,.025,-1.30],[0,.025,-1.64]],.044,wood,28);root.add(handle);
  mergeStaticMeshes(root);return {root};
}

export function makePitcher() {
  const root=new THREE.Group(),{ceramic,trim,brass}=cookwareMaterials();
  const body=smoothLathe([[0,.03],[.22,.03],[.34,.12],[.38,.34],[.32,.63],[.29,.77],[.275,.79],[.255,.77],[.27,.63],[.33,.34],[.28,.15],[.18,.10],[0,.10]],ceramic,40,64);
  // Pull both sides of the open rim into one pouring beak; no separate solid plug.
  const p=body.geometry.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),angle=Math.atan2(z,x),beak=Math.pow(Math.max(0,Math.cos(angle)),18)*THREE.MathUtils.smoothstep(y,.52,.77);p.setX(i,x+.29*beak);p.setY(i,y-.01*beak);}
  body.geometry.computeVertexNormals();root.add(body);
  const rim=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,beak=Math.pow(Math.max(0,Math.cos(a)),18);rim.push([Math.cos(a)*.275+.29*beak,.782-.01*beak,Math.sin(a)*.275]);}root.add(pipe(rim,.012,trim,64));
  root.add(pipe([[-.28,.66,0],[-.52,.70,0],[-.64,.49,0],[-.57,.23,0],[-.34,.20,0]],.043,trim,24),ring(.30,.012,brass,[0,.16,0]));
  mergeStaticMeshes(root);
  const liquid=piece(new THREE.CircleGeometry(.255,40),syrupMaterial(),[0,.61,0]);liquid.rotation.x=-Math.PI/2;liquid.castShadow=false;root.add(liquid);
  return {root,liquid,spout:new THREE.Vector3(.565,.772,0)};
}

export function placeSpoon(spoon,surfaceY,angle){
  // The bowl dips into the syrup; the straight shaft rests tangent to the rim.
  // Solve the pitch from liquid height instead of lifting the whole spoon.
  const orbit=.22,y=surfaceY+.005,dx=POT_RIM.radius-orbit,dy=POT_RIM.centerY-y;
  const pitch=Math.atan2(dy,dx)+Math.asin((POT_RIM.tube+.044+.007-.025)/Math.hypot(dx,dy));
  spoon.position.set(Math.cos(angle)*orbit,y,Math.sin(angle)*orbit);
  spoon.rotation.set(pitch,-angle-Math.PI/2,0,'YXZ');
}
