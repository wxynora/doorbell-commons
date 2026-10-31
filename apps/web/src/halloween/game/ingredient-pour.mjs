import * as THREE from 'three';
import {createIngredientPiece,createPourVessel,POUR_LIQUID_COLORS} from './pantry-objects-v5.mjs';
import {paint,disposeOwned} from './model-kit-v4.mjs';
const POWDERS=new Set(['砂糖','红糖','星屑糖粉','幽光岩盐','金南瓜籽']);
const COLORS={'砂糖':'#fff5dc','红糖':'#ab663a','星屑糖粉':'#e6d6ff','幽光岩盐':'#b5e9df','金南瓜籽':'#d8ac49'};
const FLOW_START=.65,FLOW_END=2.25,GRAVITY=4.8;
export class IngredientPour{
 constructor(scene,name,units,onMixed){
  Object.assign(this,{scene,name,units,onMixed,age:0,spawned:0,particles:[],mixed:false,done:false});
  this.liquid=Boolean(POUR_LIQUID_COLORS[name]);this.powder=POWDERS.has(name);this.container=this.liquid||this.powder;
  if(this.container){this.vessel=createPourVessel(name);this.vessel.rotation.x=this.vessel.userData.correctTilt??-.4;this.vessel.position.set(-.9,2.15,.1);scene.add(this.vessel);}
  this.material=paint(POUR_LIQUID_COLORS[name]??COLORS[name]??'#c88642',this.liquid?'jelly':this.powder?'sugar':'fruit',{roughness:this.liquid?.18:.75});
  if(this.liquid){
   this.stream=new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(),new THREE.Vector3(0,1,0)),28,.02,12,false),this.material);this.stream.visible=false;this.stream.frustumCulled=false;scene.add(this.stream);
   this.ripples=Array.from({length:2},()=>{const ripple=new THREE.Mesh(new THREE.RingGeometry(.065,.073,32),new THREE.MeshBasicMaterial({color:'#fff0c6',transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;ripple.visible=false;scene.add(ripple);return ripple;});
  }else{
   const geometry=this.powder?new THREE.BoxGeometry(.018,.021,.018):new THREE.BoxGeometry(.09,.08,.07);
   this.count=this.powder?180:units;this.mesh=new THREE.InstancedMesh(geometry,this.material,this.count);this.mesh.count=0;this.mesh.castShadow=true;this.mesh.frustumCulled=false;scene.add(this.mesh);this.matrix=new THREE.Matrix4();this.quaternion=new THREE.Quaternion();this.scale=new THREE.Vector3(1,1,1);
  }
 }
 mix(){if(!this.mixed){this.mixed=true;this.onMixed();}}
 updateLiquid(source,surfaceY){
  const t=this.age,height=Math.max(.02,source.y-surfaceY),vx=.22,vy=-.16,flight=(vy+Math.sqrt(vy*vy+2*GRAVITY*height))/GRAVITY;
  // Each point is a different parcel of one continuous stream, following the
  // same ballistic path. The leading edge falls before the liquid reaches the pot.
  const youngest=Math.max(0,t-FLOW_END),oldest=Math.min(flight,t-FLOW_START);
  this.stream.visible=oldest>youngest&&oldest>0;
  if(this.stream.visible){
   const positions=this.stream.geometry.attributes.position;
   for(let i=0;i<=28;i++){
    const age=THREE.MathUtils.lerp(youngest,oldest,i/28),emitted=t-age,opening=THREE.MathUtils.smoothstep(emitted,FLOW_START,FLOW_START+.12)*(1-THREE.MathUtils.smoothstep(emitted,FLOW_END-.14,FLOW_END));
    const yVelocity=vy-GRAVITY*age,tangent=new THREE.Vector3(vx,yVelocity,0).normalize(),normal=new THREE.Vector3(-tangent.y,tangent.x,0),center=new THREE.Vector3(source.x+vx*age,source.y+vy*age-.5*GRAVITY*age*age,source.z);
    const radius=(this.name==='牛奶'?.021:.025)*Math.sqrt(.4/Math.max(.4,Math.abs(yVelocity)))*Math.max(.08,opening);
    for(let j=0;j<=12;j++){const a=j/12*Math.PI*2,k=i*13+j;positions.setXYZ(k,center.x+normal.x*Math.cos(a)*radius,center.y+normal.y*Math.cos(a)*radius,center.z+Math.sin(a)*radius);}
   }
   positions.needsUpdate=true;this.stream.geometry.computeVertexNormals();
  }
  const landing=t>=FLOW_START+flight&&t<=FLOW_END+flight;
  if(landing)this.mix();
  this.ripples.forEach((ripple,i)=>{ripple.visible=landing;if(!landing)return;const progress=((t-FLOW_START-flight)*2+i*.5)%1;ripple.position.set(source.x+vx*flight,surfaceY+.006+i*.001,source.z);ripple.scale.setScalar(.6+progress*2.2);ripple.material.opacity=(1-progress)*.24;});
 }
 update(dt,surfaceY){
  if(this.done)return;
  this.age+=dt;const t=this.age,tilt=THREE.MathUtils.smoothstep(t,.15,.65);
  if(this.vessel){this.vessel.rotation.z=-tilt*(this.liquid?1.92:1.1);this.vessel.position.x=THREE.MathUtils.lerp(-.9,-.5,tilt);if(t>2.65){this.vessel.position.x-=(t-2.65)*dt*3;this.vessel.rotation.z*=Math.max(0,1-dt*4);}}
  this.vessel?.updateMatrixWorld(true);const source=this.vessel?this.vessel.localToWorld(new THREE.Vector3(...this.vessel.userData.mouth)):new THREE.Vector3(-.23,1.96,.1);
  if(this.liquid)this.updateLiquid(source,surfaceY);
  else{
   // A single solid starts falling when pouring starts; a late frame must still emit the final piece.
   if(t>FLOW_START){const target=Math.min(this.count,Math.ceil((t-FLOW_START)/(FLOW_END-FLOW_START)*this.count));while(this.spawned<target){const i=this.spawned++,jitter=this.powder?.09:.04,v=new THREE.Vector3(Math.sin(i*7.3)*.1,-.05,Math.cos(i*4.1)*.06),p=source.clone().add(new THREE.Vector3(Math.sin(i*2.4)*jitter,0,Math.cos(i*3.1)*jitter));let model=null;if(!this.container){model=createIngredientPiece(this.name);this.scene.add(model);}this.particles.push({p,v,model,age:0,alive:true});}}
   let visible=0;for(const part of this.particles){if(!part.alive)continue;part.age+=dt;part.v.y-=GRAVITY*dt;part.p.addScaledVector(part.v,dt);if(part.p.y<=surfaceY+.01){part.alive=false;if(part.model){this.scene.remove(part.model);disposeOwned(part.model);}this.mix();continue;}if(part.model){part.model.position.copy(part.p);part.model.rotation.z+=dt*.8;continue;}this.matrix.compose(part.p,this.quaternion,this.scale);this.mesh.setMatrixAt(visible++,this.matrix);}this.mesh.count=visible;this.mesh.instanceMatrix.needsUpdate=true;
  }
  if(t>3.2){this.done=true;this.dispose();}
 }
 dispose(){
  for(const part of this.particles)if(part.model&&part.alive){this.scene.remove(part.model);disposeOwned(part.model);}
  if(this.vessel){this.scene.remove(this.vessel);disposeOwned(this.vessel);}
  if(this.mesh){this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.dispose();}
  if(this.stream){this.scene.remove(this.stream);this.stream.geometry.dispose();}
  for(const ripple of this.ripples??[]){this.scene.remove(ripple);ripple.geometry.dispose();ripple.material.dispose();}
 }
}
