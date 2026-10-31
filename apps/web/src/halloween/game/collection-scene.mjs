import visibilityProfiles from './pantry-visibility.json' with {type:'json'};
import {visiblePileTiles} from './pile-visibility.mjs';
import {SceneLoop} from './scene-loop.mjs';
import * as THREE from 'three';
import {createFoodModel,createPileFoodModel as legacyPile} from './food-models.mjs';
import {createPileFoodModel as currentPile} from './pantry-objects-v5.mjs';
import {studioEnvironment,disposeOwned} from './model-kit-v4.mjs';
import {projectKeyboardBounds} from './keyboard-focus.mjs';
export class CollectionScene{
 constructor(canvas,{onPick,onError,onReady,onKeyboardFocus,onContextLost,onContextRestored}){
  Object.assign(this,{canvas,onPick,onReady,onKeyboardFocus,onContextLost,onContextRestored,groups:new Map(),entries:new Map(),visibilityShapes:new Map(),visibilityWorld:new Map(),disposed:false,contextLost:false});
  this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-3.5,3.5,3.5,-3.5,.1,50);this.camera.position.set(0,18,0);this.camera.up.set(0,0,-1);this.camera.lookAt(0,0,0);
  try{this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}catch(e){onError(e);return;}
  this.renderer.setPixelRatio(devicePixelRatio||1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.environment=studioEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.65;
  this.scene.add(new THREE.HemisphereLight('#fff4e1','#716077',.75));const sun=new THREE.DirectionalLight('#fff3d9',2.4);sun.position.set(-3,10,5);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.5,far:24});sun.shadow.bias=-.0003;sun.shadow.normalBias=.018;sun.shadow.radius=3;this.scene.add(sun);
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.ShadowMaterial({opacity:.24}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=.015;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.matrix=new THREE.Matrix4();this.scale=new THREE.Vector3(1,1,1);
  this.click=e=>{if(this.busy||this.contextLost)return;const r=canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects([...this.groups.values()].flatMap(g=>g.meshes),false)[0];if(hit){const tile=hit.object.userData.batch.tiles[hit.instanceId];if(tile)this.onPick(tile);}};
  this.keyDown=e=>{if(this.busy||this.contextLost)return;if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();this.selectKeyboardTile(['ArrowRight','ArrowDown'].includes(e.key)?1:-1);}else if(['Enter',' '].includes(e.key)&&this.keyboardTileId){const tile=this.keyboardTiles().find(t=>t.id===this.keyboardTileId);if(tile){e.preventDefault();this.onPick(tile);}}};
  this.blur=()=>this.clearKeyboardFocus();
  this.lost=e=>{e.preventDefault();this.contextLost=true;this.clearKeyboardFocus();this.environment?.dispose();this.environment=null;this.scene.environment=null;for(const batch of this.groups.values())for(const mesh of batch.meshes)mesh.dispose();disposeOwned(this.scene);this.onContextLost?.();};
  this.restored=()=>{this.environment=studioEnvironment(this.renderer);this.scene.environment=this.environment.texture;this.contextLost=false;this.last=performance.now();this.loop?.request();this.onContextRestored?.();};
  for(const[k,fn]of[['click',this.click],['keydown',this.keyDown],['blur',this.blur],['webglcontextlost',this.lost],['webglcontextrestored',this.restored]])canvas.addEventListener(k,fn);this.onLayout=()=>this.resize();window.addEventListener("halloween:resize",this.onLayout);this.observer=new ResizeObserver(this.onLayout);this.observer.observe(canvas);this.resize();this.last=performance.now();this.loop=new SceneLoop(now=>this.tick(now));this.loop.request();
 }
 keyboardTiles(){return [...this.groups.values()].flatMap(batch=>batch.tiles).filter(tile=>tile.selectable!==false);}
 selectKeyboardTile(direction){const tiles=this.keyboardTiles();if(!tiles.length){this.clearKeyboardFocus();return;}const index=tiles.findIndex(tile=>tile.id===this.keyboardTileId),next=index<0?(direction>0?0:tiles.length-1):(index+direction+tiles.length)%tiles.length;this.keyboardTileId=tiles[next].id;this.updateKeyboardFocus();}
 updateKeyboardFocus(){const tile=this.keyboardTiles().find(item=>item.id===this.keyboardTileId),entry=tile&&this.entries.get(tile.id);if(!tile||!entry){this.clearKeyboardFocus();return;}const half=new THREE.Vector3().fromArray(tile.size).multiplyScalar(.5),bounds=new THREE.Box3(half.clone().negate(),half).applyMatrix4(new THREE.Matrix4().compose(entry.position,entry.quaternion,this.scale));this.onKeyboardFocus?.({text:`${tile.name}，按回车拿取`,bounds:projectKeyboardBounds(this.camera,bounds)});}
 clearKeyboardFocus(){this.keyboardTileId=null;this.onKeyboardFocus?.(null);}
 clear(){for(const batch of this.groups.values())for(const m of batch.meshes){this.scene.remove(m);m.geometry.dispose();m.dispose();}this.groups.clear();this.entries.clear();this.visibilityShapes.clear();this.visibilityWorld?.clear();}
 makeBatch(key,tiles,version,capacity=tiles.length){
  const tile=tiles[0],factory=version>=2?currentPile:createFoodModel,root=factory(tile.name,tile.tier,tile.size);root.updateMatrixWorld(true);
  const batch={tiles,meshes:[],capacity};root.traverse(part=>{if(!part.isMesh)return;const geometry=part.geometry.clone().applyMatrix4(part.matrixWorld),m=new THREE.InstancedMesh(geometry,part.material,capacity);m.castShadow=!part.userData.poolOutline;m.receiveShadow=!part.userData.poolOutline;if(part.userData.poolOutline)m.raycast=()=>{};m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.userData.batch=batch;if(part.material.transparent)m.renderOrder=2;this.scene.add(m);batch.meshes.push(m);});disposeOwned(root);this.groups.set(key,batch);return batch;
 }
 previewPick(tileId){this.pendingTileId=tileId;this.update(this.run,true);}
 update(run,busy){
  if(!this.renderer)return;this.busy=busy;if(!busy||run!==this.run)this.pendingTileId=null;this.run=run;
  const version=run?.pile.modelVersion??1,level=`${run?.session.id}:${run?.stage}:${version}`;
  if(level!==this.level){this.clear();this.clearKeyboardFocus();this.level=level;this.pendingReady=true;}
  const counts=new Map();for(const tile of run?.tiles??[]){if(!tile.size)continue;const key=`${tile.name}:${tile.size.join(',')}`;counts.set(key,(counts.get(key)??0)+1);}
  const candidates=(run?.tiles??[]).filter(tile=>tile.id!==this.pendingTileId&&tile.position&&tile.quaternion&&tile.size);
  const visible=version<2?candidates:visiblePileTiles(candidates,tile=>{
   const key=`${version}:${tile.name}:${tile.size.join(',')}`;
   if(!this.visibilityShapes.has(key)){const profile=visibilityProfiles[tile.name],scale=Math.min(...tile.size.map((n,i)=>(n-.01)/(profile.max[i]-profile.min[i])));this.visibilityShapes.set(key,{bounds:new THREE.Box3(new THREE.Vector3().fromArray(profile.min).multiplyScalar(scale),new THREE.Vector3().fromArray(profile.max).multiplyScalar(scale)),outline:profile.outline.map(p=>p.map(n=>n*scale)),faces:profile.faces.map(polygon=>polygon.map(ring=>ring.map(p=>p.map(n=>n*scale))))});}
   return this.visibilityShapes.get(key);
  },this.visibilityWorld);
  const alive=new Set(),byName=new Map();for(const tile of visible){alive.add(tile.id);let entry=this.entries.get(tile.id);if(!entry){entry={position:new THREE.Vector3().fromArray(tile.position),quaternion:new THREE.Quaternion().fromArray(tile.quaternion),target:new THREE.Vector3(),rotation:new THREE.Quaternion()};this.entries.set(tile.id,entry);}entry.target.fromArray(tile.position);entry.rotation.fromArray(tile.quaternion);const key=`${tile.name}:${tile.size.join(',')}`;if(!byName.has(key))byName.set(key,[]);byName.get(key).push(tile);}
  for(const id of this.entries.keys())if(!alive.has(id))this.entries.delete(id);
  for(const [key,batch]of this.groups)batch.tiles=byName.get(key)??[];
  for(const [key,tiles]of byName){const batch=this.groups.get(key)??this.makeBatch(key,tiles,version,counts.get(key));batch.tiles=tiles;}
  for(const batch of this.groups.values())for(const m of batch.meshes)m.count=batch.tiles.length;if(this.keyboardTileId)this.updateKeyboardFocus();if(this.loop?.frame===null)this.last=performance.now();this.loop?.request();
 }
 resize(){if(!this.renderer)return;const {width:w,height:h}=this.canvas.getBoundingClientRect();if(!w||!h)return;this.renderer.setSize(w,h,false);const a=w/h,r=3.42/Math.min(1,a);Object.assign(this.camera,{left:-r*a,right:r*a,top:r,bottom:-r});this.camera.updateProjectionMatrix();if(this.keyboardTileId)this.updateKeyboardFocus();this.loop?.request();}
 tick(now){
  if(this.disposed||this.contextLost)return;const mix=1-Math.exp(-(now-this.last)/1000*9);this.last=now;
  let moving=false;for(const e of this.entries.values()){e.position.lerp(e.target,mix);e.quaternion.slerp(e.rotation,mix);if(e.position.distanceToSquared(e.target)>1e-12||1-Math.abs(e.quaternion.dot(e.rotation))>1e-12)moving=true;else{e.position.copy(e.target);e.quaternion.copy(e.rotation);}}
  for(const batch of this.groups.values()){for(let i=0;i<batch.tiles.length;i++){const e=this.entries.get(batch.tiles[i].id);this.matrix.compose(e.position,e.quaternion,this.scale);for(const m of batch.meshes)m.setMatrixAt(i,this.matrix);}for(const m of batch.meshes){m.instanceMatrix.needsUpdate=true;m.boundingSphere=null;}}
  this.renderer.render(this.scene,this.camera);if(moving&&this.keyboardTileId)this.updateKeyboardFocus();if(this.pendingReady){this.pendingReady=false;this.onReady?.(this.level);}this.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);this.canvas.dataset.renderedItems=String([...this.groups.values()].reduce((n,b)=>n+b.tiles.length,0));return moving;
 }
 dispose(){this.disposed=true;this.loop?.dispose();for(const[k,fn]of[['click',this.click],['keydown',this.keyDown],['blur',this.blur],['webglcontextlost',this.lost],['webglcontextrestored',this.restored]])this.canvas.removeEventListener(k,fn);this.observer?.disconnect();window.removeEventListener("halloween:resize",this.onLayout);this.clear();disposeOwned(this.scene);this.environment?.dispose();this.renderer?.dispose();}
}
