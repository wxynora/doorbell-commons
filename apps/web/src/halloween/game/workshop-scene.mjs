import {SceneLoop} from './scene-loop.mjs';
import * as THREE from 'three';
import {mixCookingColor} from '../shared/cooking-rules.mjs';
import {paint,piece,studioEnvironment,disposeOwned,ring,ball,mutablePaint} from './model-kit-v4.mjs';
import {makePot,makeSpoon,makePitcher,makeMold} from './workshop-props-v4.mjs';
import {createWorkshopIngredient} from './workshop-ingredients.mjs';
import {IngredientPour} from './ingredient-pour.mjs';
import {placeSpoon} from './workshop-cookware.mjs';
import {SyrupMixing} from './syrup-mixing.mjs';
import {projectKeyboardBounds} from './keyboard-focus.mjs';
const{clamp,lerp}=THREE.MathUtils,UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2;
function syrupGeometry(){const positions=[],uv=[],indices=[],rings=12,segments=64;for(let r=0;r<=rings;r++)for(let i=0;i<=segments;i++){const a=i/segments*TAU,radius=r/rings*1.035;positions.push(Math.cos(a)*radius,Math.sin(a)*radius,0);uv.push(.5+Math.cos(a)*radius/2.07,.5+Math.sin(a)*radius/2.07);if(r<rings&&i<segments){const p=r*(segments+1)+i;indices.push(p,p+segments+1,p+1,p+1,p+segments+1,p+segments+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;}
export class WorkshopScene{
 constructor(canvas,{onProgress,onPourComplete,onReady,onError,onKeyboardFocus,onContextLost,onContextRestored}){
  Object.assign(this,{canvas,onProgress,onPourComplete,onKeyboardFocus,onContextLost,onContextRestored,phase:'ingredients',shapeId:'star',colorId:'amber',stir:0,turns:0,manualTilt:0,buttonPourHeld:false,fills:Array(6).fill(0),cavity:0,additions:[],landedAdditions:[],drops:[],finished:false,disposed:false,loaded:false,contextLost:false});
  this.scene=new THREE.Scene();this.scene.background=null;this.camera=new THREE.PerspectiveCamera(37,1,.1,50);this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.workPlane=new THREE.Plane(UP,-1.23);
  try{this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}catch(e){onError(e);return;}
  this.renderer.setPixelRatio(devicePixelRatio||1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=false;this.shadowsDirty=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
  this.environment=studioEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;this.scene.add(new THREE.HemisphereLight('#fff1d9','#635070',.75));
  const key=new THREE.DirectionalLight('#ffe8c4',3);key.position.set(-3,7,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});key.shadow.normalBias=.012;key.shadow.bias=-.0002;this.scene.add(key);const fill=new THREE.DirectionalLight('#cfc5ff',1.1);fill.position.set(3,4,-3);this.scene.add(fill);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.ShadowMaterial({opacity:.24}));shadow.rotation.x=-Math.PI/2;shadow.receiveShadow=true;this.scene.add(shadow);this.pot=new THREE.Group();this.scene.add(this.pot);
  const pack=makePot();this.surface=pack.surface;this.bubbles=pack.bubbles;this.pot.add(pack.root);
  this.surface.geometry.dispose();this.surface.geometry=syrupGeometry();this.mixing=new SyrupMixing();this.targetColor=this.mixing.target;this.surface.material.color.set('#ffffff');this.surface.material.vertexColors=true;this.surface.geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(this.surface.geometry.attributes.position.count*3),3));this.mixing.paint(this.surface.geometry.attributes.position,this.surface.geometry.attributes.color);
  this.surface.material.roughness=.18;this.surface.material.envMapIntensity=.35;this.surface.material.clearcoat=.85;this.surface.visible=false;this.bubbles.forEach(b=>b.visible=false);
  this.spoon=makeSpoon().root;this.pot.add(this.spoon);const pitcher=makePitcher();this.jug=pitcher.root;this.scene.add(this.jug);this.spout=pitcher.spout;this.jugLiquid=pitcher.liquid;
  this.ingredients=new THREE.Group();this.scene.add(this.ingredients);this.rebuildMold();
  this.stream=piece(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,0)),20,.035,8,false),mutablePaint('#e3bc84','jelly',{roughness:.12}));this.stream.visible=false;this.scene.add(this.stream);
  this.loaded=true;queueMicrotask(()=>{if(!this.disposed)onReady?.();});
  this.targetRing=ring(.38,.012,paint('#f4d189','metal'),[0,.17,0]);this.scene.add(this.targetRing);
  this.pointerDown=e=>{if(!this.loaded||this.contextLost||!['syrup','pour'].includes(this.phase)||this.finished)return;this.setRay(e);if(this.phase==='syrup'&&this.pickIngredient())return;if(this.phase==='pour'&&!this.ray.intersectObject(this.jug,true).length)return;const p=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.workPlane,p))return;if(this.phase==='syrup'&&Math.hypot(p.x,p.z)>1.08)return;this.drag={x:e.clientX,y:e.clientY,angle:Math.atan2(p.z,p.x)};canvas.setPointerCapture(e.pointerId);};
  this.pointerMove=e=>{if(!this.drag)return;this.setRay(e);if(this.phase==='syrup'){const p=new THREE.Vector3();if(!this.ray.ray.intersectPlane(this.workPlane,p)||Math.hypot(p.x,p.z)<.18)return;const a=Math.atan2(p.z,p.x),delta=Math.atan2(Math.sin(a-this.drag.angle),Math.cos(a-this.drag.angle));this.advanceStir(delta);this.drag.angle=a;}else{const r=canvas.getBoundingClientRect();this.loop?.request();this.manualTilt=clamp((e.clientX-this.drag.x-(e.clientY-this.drag.y)*.3)/r.width*3,0,1);}};
  this.pointerUp=()=>{if(this.drag&&this.phase==='pour')this.lockFill();this.drag=null;if(!this.buttonPourHeld)this.manualTilt=0;};
  this.blur=()=>{this.pointerUp();this.clearKeyboardFocus();};
  this.keyDown=e=>{if(!this.loaded||this.finished||this.contextLost)return;if(this.phase==='pour'&&e.key==='ArrowRight'){e.preventDefault();this.manualTilt=.8;this.loop?.request();}if(this.phase==='syrup'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.advanceStir(e.key==='ArrowRight'?.2:-.2);}if(this.phase==='syrup'&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.selectKeyboardIngredient(e.key==='ArrowDown'?1:-1);}if(this.phase==='syrup'&&['Enter',' '].includes(e.key)&&this.keyboardIngredient){e.preventDefault();this.addSelectedIngredient(this.keyboardIngredient);}};
  this.keyUp=e=>{if(this.phase==='pour'&&e.key==='ArrowRight'){this.lockFill();this.manualTilt=this.buttonPourHeld?.72:0;}};
  this.lost=e=>{e.preventDefault();this.contextLost=true;this.buttonPourHeld=false;this.pointerUp();this.clearKeyboardFocus();this.environment?.dispose();this.environment=null;this.scene.environment=null;disposeOwned(this.scene);this.onContextLost?.();};
  this.restored=()=>{this.environment=studioEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.contextLost=false;this.last=performance.now();this.shadowsDirty=true;this.loop?.request();this.onContextRestored?.();};
  for(const[k,fn]of[['pointerdown',this.pointerDown],['pointermove',this.pointerMove],['pointerup',this.pointerUp],['pointercancel',this.pointerUp],['keydown',this.keyDown],['keyup',this.keyUp],['blur',this.blur],['webglcontextlost',this.lost],['webglcontextrestored',this.restored]])canvas.addEventListener(k,fn);
  this.visible=()=>{this.last=performance.now();if(document.hidden){this.buttonPourHeld=false;this.pointerUp();}};document.addEventListener('visibilitychange',this.visible);
  this.onLayout=()=>this.resize();window.addEventListener("halloween:resize",this.onLayout);this.observer=new ResizeObserver(this.onLayout);this.observer.observe(canvas);this.resize();this.last=performance.now();this.configure({phase:'ingredients',shape:'star'});this.loop=new SceneLoop(now=>this.tick(now));this.loop.request();
 }
 reset(){this.stir=0;this.turns=0;this.fills=Array(6).fill(0);this.cavity=0;this.additions=[];this.landedAdditions=[];this.finished=false;this.mixing.reset();this.targetColor=this.mixing.target;this.paintSyrup();for(const d of this.drops)d.dispose();this.drops=[];this.emit();}
 emit(message){this.loop?.request();this.onProgress?.({turns:this.turns,progress:clamp(this.turns/6*100,0,100),additions:[...this.additions],fills:[...this.fills],cavity:this.cavity,pouringIngredients:this.drops.length>0,message});}
 advanceStir(delta){if(this.phase!=='syrup'||!this.landedAdditions.length)return;this.stir+=delta;this.turns+=Math.abs(delta)/TAU;this.mixing.stir(delta);this.paintSyrup();this.emit();}
 addIngredient(name,units=1){if(this.phase!=='syrup'||this.additions.length+units>3||!this.loaded)return false;const at=Math.round(clamp(this.turns/6*100,0,100));for(let i=0;i<units;i++)this.additions.push({material:name,at});this.drops.push(new IngredientPour(this.scene,name,units,()=>{for(let i=0;i<units;i++)this.landedAdditions.push({material:name,at});this.mixing.add(mixCookingColor(this.landedAdditions).hex,mixCookingColor([{material:name,at}]).hex);this.paintSyrup();}));this.emit('慢慢加进锅里。');return true;}
 pickIngredient(){
  const hit=this.ray.intersectObjects(this.ingredients.children.filter(m=>m.visible),true)[0];if(!hit)return false;
  let model=hit.object;while(model.parent!==this.ingredients&&model.parent)model=model.parent;
  return this.addSelectedIngredient(model.userData.ingredient);
 }
 addSelectedIngredient(name){const matching=this.ingredients.children.filter(m=>m.visible&&m.userData.ingredient===name);if(name&&matching.length&&this.addIngredient(name,matching.length)){for(const m of matching)m.visible=false;this.keyboardIngredient=null;this.onKeyboardFocus?.({text:`${name}已投入锅中`});return true;}return false;}
 selectKeyboardIngredient(direction){const names=[...new Set(this.ingredients.children.filter(m=>m.visible).map(m=>m.userData.ingredient).filter(Boolean))];if(!names.length){this.clearKeyboardFocus();return;}const index=names.indexOf(this.keyboardIngredient);this.keyboardIngredient=names[index<0?(direction>0?0:names.length-1):(index+direction+names.length)%names.length];this.updateKeyboardFocus();}
 updateKeyboardFocus(){const model=this.ingredients.children.find(m=>m.visible&&m.userData.ingredient===this.keyboardIngredient);if(!model){this.clearKeyboardFocus();return;}this.scene.updateMatrixWorld(true);this.onKeyboardFocus?.({text:`${this.keyboardIngredient}，按回车投料`,bounds:projectKeyboardBounds(this.camera,new THREE.Box3().setFromObject(model))});}
 clearKeyboardFocus(){this.keyboardIngredient=null;this.onKeyboardFocus?.(null);}
 getProcess(){return{additions:[...this.additions],stirTurns:Math.floor(this.turns),fills:[...this.fills]};}
 setPourHeld(held){const wasHeld=this.buttonPourHeld;this.buttonPourHeld=held;this.loop?.request();this.manualTilt=held?.72:0;if(!held&&wasHeld)this.lockFill();}
 lockFill(){if(this.phase!=='pour'||this.finished)return;if(this.fills.every(amount=>amount>=.8)){this.finished=true;this.emit('这一盘倒好啦！');this.onPourComplete(this.getProcess());}else this.emit('松手就停，再按住接着倒。');}
 setRay(e){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);}
 rebuildMold(){if(this.tray){this.scene.remove(this.tray);disposeOwned(this.tray);}const mold=makeMold(this.shapeId,this.colorId);this.tray=mold.root;this.candies=mold.candies;this.cavities=mold.centers;this.scene.add(this.tray);}
 paintSyrup(){this.mixing.paint(this.surface.geometry.attributes.position,this.surface.geometry.attributes.color);}
 setSelection(selection,catalog){this.shadowsDirty=true;this.loop?.request();disposeOwned(this.ingredients);this.ingredients.clear();Object.entries(selection).flatMap(([name,n])=>Array(n).fill(name)).forEach((name,i)=>{const model=createWorkshopIngredient(name,catalog.find(x=>x.name===name)?.tier);model.rotation.x=-.4;model.position.set(-.75+i*.75,.30,1.6);this.ingredients.add(model);});}
 configure({phase,shape}){this.shadowsDirty=true;this.loop?.request();
  if(!this.renderer)return;const changed=phase!==this.phase,moldChanged=shape!==this.shapeId;this.phase=phase;
  if(this.additions.length){const color=mixCookingColor(this.additions);this.colorId=color.id;}
  if(moldChanged||(phase==='mold'&&changed)){this.shapeId=shape;this.rebuildMold();}
  const atTray=['mold','pour','complete'].includes(phase);this.jug.visible=phase==='pour';this.tray.visible=atTray;this.ingredients.visible=['ingredients','syrup'].includes(phase);this.spoon.visible=phase==='syrup';this.pot.visible=!atTray;this.targetRing.visible=phase==='pour';
  if(changed){this.drag=null;this.manualTilt=0;this.buttonPourHeld=false;this.clearKeyboardFocus();}
  this.tray.position.set(.1,.03,.6);
  this.camera.position.set(0,atTray?6.7:4.3,atTray?4.4:3.7);this.camera.lookAt(0,atTray?.3:.55,atTray?.35:.45);this.camera.zoom=atTray?1:.9;this.camera.updateProjectionMatrix();
  if(phase==='pour'){const target=this.cavities[this.cavity].clone().add(this.tray.position).add(new THREE.Vector3(-.03,1.2,0));this.jug.position.copy(target).sub(this.spout);}
 }
 resize(){if(!this.renderer)return;const {width:w,height:h}=this.canvas.getBoundingClientRect();if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.clearViewOffset();this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.keyboardIngredient)this.updateKeyboardFocus();this.loop?.request();}
 flow(start,end){const control=start.clone().lerp(end,.5);control.x+=.04;const curve=new THREE.QuadraticBezierCurve3(start,control,end),p=this.stream.geometry.attributes.position;for(let i=0;i<=20;i++){const center=curve.getPoint(i/20),r=.035-(i/20)*.009;for(let j=0;j<=8;j++){const a=j/8*TAU;p.setXYZ(i*9+j,center.x+Math.cos(a)*r,center.y,center.z+Math.sin(a)*r);}}p.needsUpdate=true;this.stream.geometry.computeVertexNormals();this.stream.geometry.computeBoundingSphere();}
 tick(now){
  if(this.disposed||this.contextLost)return;const dt=document.hidden?0:Math.min((now-this.last)/1000,.06),t=now/1000;this.last=now;this.stream.visible=false;

  const pendingIngredients=this.drops.length;for(const d of this.drops)d.update(dt,this.surface.position.y);this.drops=this.drops.filter(d=>!d.done);if(this.drops.length!==pendingIngredients)this.emit();
  this.surface.visible=this.landedAdditions.length>0;const previousSurface=this.surface.position.y,targetY=.83+this.landedAdditions.length*.12;this.surface.position.y=Math.abs(targetY-previousSurface)<.0001?targetY:lerp(previousSurface,targetY,Math.min(1,dt*2));this.jugLiquid.material.color.copy(this.mixing.color);this.stream.material.color.copy(this.mixing.color);
  const a=this.stir;if(this.phase==='syrup'&&this.surface.visible){const p=this.surface.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),r=Math.hypot(x,y);p.setZ(i,Math.sin(Math.atan2(y,x)*2+a+r*5)*.012*Math.min(1,r*3)+Math.sin(t*2+r*8)*.003);}p.needsUpdate=true;this.surface.geometry.computeVertexNormals();}
  // The bowl stays inside; the handle rises above the raised rolled rim.
  this.spoon.visible=this.phase==='syrup'&&this.surface.visible;placeSpoon(this.spoon,this.surface.position.y,a);
  this.bubbles.forEach((b,i)=>{b.visible=this.landedAdditions.length>0;b.position.y=this.surface.position.y+.005;b.scale.y=.3+Math.max(0,Math.sin(t*1.6+i))*.5;b.material.color.copy(this.mixing.color).lerp(new THREE.Color('#fff5d8'),.25);});
  if(this.phase==='pour'&&!this.finished){const tilt=this.manualTilt,index=this.cavity,end=this.cavities[index].clone().add(this.tray.position);this.targetRing.position.copy(end).add(new THREE.Vector3(0,.04,0));this.targetRing.scale.setScalar(1+Math.sin(t*3)*.03);this.jug.rotation.z=lerp(this.jug.rotation.z,-tilt*.95,Math.min(1,dt*8));const desired=end.clone().add(new THREE.Vector3(-.03,1.2,0)),offset=this.spout.clone().applyQuaternion(this.jug.quaternion);this.jug.position.lerp(desired.clone().sub(offset),Math.min(1,dt*9));this.jug.updateMatrixWorld(true);const start=this.jug.localToWorld(this.spout.clone());if(tilt>.32&&Math.hypot(start.x-desired.x,start.z-desired.z)<.08&&this.fills[index]<1.25){this.fills[index]=Math.min(index===5?1.04:1,this.fills[index]+dt*(tilt-.2)*2.0);this.stream.visible=true;this.flow(start,end.clone().add(new THREE.Vector3(0,.03,0)));if(now-(this.lastEmit??0)>60){this.emit();this.lastEmit=now;}}if(this.fills[index]>=1&&index<5){this.cavity++;this.emit();}else if(index===5&&this.fills[5]>=1.04)this.lockFill();if(this.wasTilting&&tilt<=.32&&!this.drag&&!this.manualTilt)this.lockFill();this.wasTilting=tilt>.32;}
  this.candies.forEach((c,i)=>{
   const fill=this.phase==='mold'?0:this.phase==='complete'?1:Math.min(this.fills[i],1),fit=c.userData.moldFit;
   c.visible=fill>0;const spread=.78+fill*.22;c.scale.set(fit.fit*spread,fit.fit*spread,Math.max(.001,fill*.22/fit.depth));
   c.position.set(fit.x-fit.center[0]*c.scale.x,.074-fit.minDepth*c.scale.z,fit.z+fit.center[1]*c.scale.y);
   c.children[0].material.color.copy(this.mixing.color);
  });
  this.renderer.shadowMap.needsUpdate=this.shadowsDirty||pendingIngredients>0||(this.phase==='pour'&&!this.finished)||(this.spoon.visible&&(this.lastShadowStir!==this.stir||previousSurface!==this.surface.position.y));this.shadowsDirty=false;this.lastShadowStir=this.stir;
  this.renderer.render(this.scene,this.camera);this.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);return this.drops.length>0||(this.phase==='syrup'&&this.landedAdditions.length>0)||(this.phase==='pour'&&!this.finished);
 }
 dispose(){this.disposed=true;this.loop?.dispose();this.observer?.disconnect();window.removeEventListener("halloween:resize",this.onLayout);for(const[k,fn]of[['pointerdown',this.pointerDown],['pointermove',this.pointerMove],['pointerup',this.pointerUp],['pointercancel',this.pointerUp],['keydown',this.keyDown],['keyup',this.keyUp],['blur',this.blur],['webglcontextlost',this.lost],['webglcontextrestored',this.restored]])this.canvas.removeEventListener(k,fn);document.removeEventListener('visibilitychange',this.visible);for(const d of this.drops)d.dispose();disposeOwned(this.scene);this.environment?.dispose();this.renderer?.dispose();}
}
