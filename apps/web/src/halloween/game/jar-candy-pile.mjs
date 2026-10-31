import {Body,Box,Material,ContactMaterial,Quaternion,SAPBroadphase,Vec3,World} from '../shared/vendor/cannon-es/dist/cannon-es.mjs';

// Settle separate solid sweets inside the actual jar profile. The resulting poses
// are cached; inspecting a jar never restacks its contents or changes inventory.
const piles=new Map();
export function settleJarCandies({size,center,count,profile,hex=false,flat=false,seed=1}){
 const key=JSON.stringify({size,center,count,profile,hex,flat,seed});
 if(piles.has(key))return piles.get(key);
 let state=seed>>>0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const world=new World({gravity:new Vec3(0,-9.82,0)});world.broadphase=new SAPBroadphase(world);world.solver.iterations=18;world.solver.tolerance=.0001;
 const sugar=new Material('sugar'),jar=new Material('glass');
 world.addContactMaterial(new ContactMaterial(sugar,jar,{friction:.42,restitution:.04}));
 world.addContactMaterial(new ContactMaterial(sugar,sugar,{friction:.55,restitution:.03}));
 const floorY=.125,zScale=flat?.72:1;
 const floor=new Body({mass:0,material:jar,shape:new Box(new Vec3(1,.04,1)),position:new Vec3(0,floorY-.04,0)});world.addBody(floor);
 const walls=new Body({mass:0,material:jar}),segments=hex?6:20;
 // Tangential wall sections follow each tapered part, including the shoulders.
 for(let j=1;j<profile.length-1;j++){
  const [r0,y0]=profile[j],[r1,y1]=profile[j+1];if(y1<=y0)continue;
  for(let i=0;i<segments;i++){
   const a=i*Math.PI*2/segments,radialScale=1/Math.sqrt(Math.cos(a)**2+Math.sin(a)**2/zScale**2),apothem=hex?Math.cos(Math.PI/6):1;
   const low=(r0-.055)*radialScale*apothem,high=(r1-.055)*radialScale*apothem,mid=(low+high)/2,dy=y1-y0,dr=high-low;
   const yaw=new Quaternion().setFromAxisAngle(new Vec3(0,1,0),Math.PI/2-a),slope=new Quaternion().setFromAxisAngle(new Vec3(1,0,0),Math.atan2(dr,dy)),q=yaw.mult(slope);
   walls.addShape(new Box(new Vec3(Math.max(low,high)*Math.tan(Math.PI/segments)+.028,Math.hypot(dy,dr)/2+.015,.028)),new Vec3(Math.cos(a)*(mid+.028),(y0+y1)/2,Math.sin(a)*(mid+.028)),q);
  }
 }
 world.addBody(walls);
 const bodies=[];
 for(let i=0;i<count;i++){
  const body=new Body({mass:.04,material:sugar,shape:new Box(new Vec3(...size.map(n=>n/2+.004))),linearDamping:.3,angularDamping:.48});
  // A candy is a thick flat shape. It tumbles from above, rather than standing
  // in rows facing the camera; gravity and contacts choose its resting pose.
  body.position.set((random()-.5)*.27,1.75,(random()-.5)*.22*zScale);
  body.quaternion.setFromEuler(-Math.PI/2+(random()-.5)*1.0,random()*Math.PI*2,(random()-.5)*.7,'XYZ');
  bodies.push(body);
 }
 for(let i=0;i<count*85+250;i++){if(i%85===0&&i/85<count)world.addBody(bodies[i/85]);world.step(1/90);}
 const poses=bodies.map(body=>{const localCenter=body.quaternion.vmult(new Vec3(...center));return{position:[body.position.x-localCenter.x,body.position.y-localCenter.y,body.position.z-localCenter.z],quaternion:[body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w],bodyPosition:body.position.toArray()};});
 piles.set(key,poses);return poses;
}
