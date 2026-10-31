import {SceneLoop} from './scene-loop.mjs';
import * as THREE from 'three';
import {paint,piece,lathe,cyl,ring,ball,pipe,studioEnvironment,disposeOwned} from './model-kit-v4.mjs';
import {createSweet} from './candy-models-v2.mjs';
import {mergeStaticMeshes} from './mesh-batching.mjs';
import {JarPileClient} from './jar-pile-client.mjs';
const RIBBONS=['#8d4cac','#473568','#d57637','#8c52af','#76529c','#4b315c','#d15d81','#543362','#9255c1'];
function makeJar(group,index,pileClient,onReady,onError){
 const root=new THREE.Group(),variant=index%9,hex=[1,5,8].includes(variant),pumpkin=variant===2,heart=variant===6,tall=[3,5,7].includes(variant);
 const gold=paint('#b58a48','metal',{metalness:1,roughness:.24}),glass=new THREE.MeshPhysicalMaterial({color:'#e9f7f1',transparent:true,opacity:1,depthWrite:false,roughness:.08,metalness:0,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:.85});
 // Glass is composited over the painted shelves. Transmission's opaque screen
 // buffer cannot see the DOM behind this transparent, scissored WebGL canvas.
 glass.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float edgeGlass = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
 diffuseColor.a = 0.035 + edgeGlass * 0.48;
 #include <opaque_fragment>`);};
 const profile=tall?[[.05,.05],[.47,.05],[.55,.13],[.55,1.18],[.48,1.35],[.43,1.4]]:hex?[[.05,.05],[.48,.05],[.79,.55],[.65,1.09],[.44,1.29],[.43,1.4]]:[[.05,.05],[.42,.05],[.69,.19],[.79,.62],[.72,1.02],[.56,1.24],[.43,1.32],[.43,1.4]];
 const curve=new THREE.SplineCurve(profile.map(p=>new THREE.Vector2(...p))),points=hex?profile:curve.getPoints(24).map(p=>[p.x,p.y]);
 const innerPoints=[...points].reverse().map(([r,y])=>[Math.max(.02,r-.045),Math.max(.1,y)]);const body=lathe([...points,...innerPoints,points[0]],glass,[0,0,0],hex?6:48);
 if(hex)body.material.flatShading=true;
 if(pumpkin||heart){const p=body.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i),a=Math.atan2(z,x);const f=pumpkin?1+Math.cos(a*10)*.065:1+Math.sin(y/1.4*Math.PI)*.12;p.setX(i,x*f);p.setZ(i,z*(heart?.72:f));}body.geometry.computeVertexNormals();}
 body.renderOrder=3;body.castShadow=false;body.receiveShadow=false;root.add(body);
 const glint=paint('#fff3cb','glaze',{transparent:true,opacity:.55,roughness:.12,depthWrite:false,envMapIntensity:1.7});
 root.add(ring(tall?.49:.45,.025,glint,[0,.09,0]),ring(.445,.026,glint,[0,1.38,0]));
 const foot=lathe([[.35,.035],[.49,.035],[.5,.06],[.43,.095]],glint);foot.renderOrder=4;root.add(foot);
 root.add(cyl(.46,.46,.11,gold,[0,1.46,0],48),ring(.466,.019,paint('#f0d89d','metal'),[0,1.42,0]));
 root.add(lathe([[0,0],[.36,0],[.42,.03],[.3,.09],[.08,.12],[0,.12]],gold,[0,1.51,0]));root.add(ball(.055,gold,[0,1.67,0]));
 const ribbon=paint(RIBBONS[variant]);root.add(ring(.444,.033,ribbon,[0,1.36,0]));
 for(const dir of[-1,1])root.add(pipe([[0,1.36,.44],[dir*.2,1.46,.46],[dir*.3,1.38,.44],[dir*.2,1.3,.46],[0,1.36,.44]],.022,ribbon,24));
 root.add(ball(.044,ribbon,[0,1.36,.47]));
 const charm=createSweet(['ghost','star','pumpkin','star','star','ghost','heart','star','star'][variant],'amber',.11);charm.position.set(.13,1.12,.59);root.add(charm,pipe([[.06,1.36,.47],[.13,1.16,.59]],.009,gold,10));
 // Only real stock supplies visible pieces. Empty decorative jars stay empty.
 const contactParts=new Set([body]);
 root.traverse(part=>{if(part.material?.transparent){part.castShadow=false;part.receiveShadow=false;contactParts.add(part);}});
 mergeStaticMeshes(root,contactParts);
 const count=Math.min(group.candies.length,8);
 if(count){
  const template=createSweet(group.appearance.shape,group.appearance.color,.16,group.appearance.colorHex);
  const sugar=template.children[0].material;
  if(sugar.transmission){
   // The DOM shelf is outside Three's refraction buffer. Composite the actual
   // candy mesh as tinted crystal instead of sampling an opaque empty buffer.
   sugar.color.copy(sugar.attenuationColor).lerp(new THREE.Color('#ffffff'),.08);
   sugar.transmission=0;sugar.transparent=true;sugar.depthWrite=false;sugar.opacity=.8;
   sugar.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float sugarEdge=pow(1.0-abs(dot(normal,normalize(vViewPosition))),1.6);
 diffuseColor.a=0.58+sugarEdge*0.36;
 #include <opaque_fragment>`);};
  }
  const sweets=Array.from({length:count},(_,i)=>i?template.clone(true):template);
  const bounds=new THREE.Box3().setFromObject(sweets[0]),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const seed=[...group.appearance.shape].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),index+17);
  sweets.forEach(sweet=>{sweet.visible=false;root.add(sweet);});
  root.userData.ready=pileClient.settle({size:size.toArray(),center:center.toArray(),count,profile,hex,flat:heart,seed}).then(poses=>{
   if(!poses||root.userData.cancelled)return;
   sweets.forEach((sweet,i)=>{sweet.position.fromArray(poses[i].position);sweet.quaternion.fromArray(poses[i].quaternion);sweet.visible=true;});onReady();
  }).catch(error=>{if(!root.userData.cancelled)onError(error);});
  const contact=new THREE.Mesh(new THREE.CircleGeometry(.48,40),new THREE.ShadowMaterial({opacity:.24}));contact.rotation.x=-Math.PI/2;contact.position.y=.128;contact.receiveShadow=true;root.add(contact);
 }

 return root;
}
export class CandyJarsScene{
 constructor(canvas,container,onError){
  Object.assign(this,{canvas,container,onError,items:[],compilations:new Set(),dirty:true,disposed:false});try{this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});}catch(e){onError(e);return;}
  this.pileClient=new JarPileClient();this.renderer.setPixelRatio(devicePixelRatio||1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.autoClear=false;this.renderer.setClearColor(0x000000,0);
  this.composite=new THREE.Scene();this.quadGeometry=new THREE.PlaneGeometry(1,1);this.compositeCamera=new THREE.OrthographicCamera();
  this.environment=studioEnvironment(this.renderer);this.camera=new THREE.PerspectiveCamera(32,1,.1,20);this.camera.position.set(0,1.6,3.35);this.camera.lookAt(0,.82,0);
  this.down=e=>{this.suppressClick=false;const button=e.target.closest('.candy-pile-button');if(!button)return;const index=[...container.querySelectorAll('.candy-pile-button')].indexOf(button);if(index<0)return;this.drag={index,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};button.setPointerCapture(e.pointerId);};
  this.move=e=>{if(!this.drag)return;const d=this.drag,item=this.items[d.index];if(!item)return;const scale=container.getBoundingClientRect().width/container.clientWidth;const dx=(e.clientX-d.x)/scale,dy=(e.clientY-d.y)/scale;d.moved||=Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>5;if(d.moved){item.root.rotation.y+=dx*.018;item.root.rotation.x=THREE.MathUtils.clamp(item.root.rotation.x+dy*.009,-.28,.28);item.dirty=true;this.dirty=true;this.loop?.request();}d.x=e.clientX;d.y=e.clientY;};
  this.up=()=>{if(this.drag?.moved)this.suppressClick=true;this.drag=null;};this.blockClick=e=>{if(this.suppressClick){e.preventDefault();e.stopImmediatePropagation();this.suppressClick=false;}};
  for(const[name,fn]of[['pointerdown',this.down],['pointermove',this.move],['pointerup',this.up],['pointercancel',this.up],['click',this.blockClick]])container.addEventListener(name,fn,true);
  this.onLayout=()=>{this.dirty=true;this.loop?.request();};window.addEventListener("halloween:resize",this.onLayout);this.observer=new ResizeObserver(()=>{this.dirty=true;this.loop?.request();});this.observer.observe(container);this.loop=new SceneLoop(()=>this.tick());this.loop.request();
 }
 update(groups){
  if(!this.renderer)return;
  const previous=this.items;
  this.items=groups.map((group,index)=>{
   const signature=JSON.stringify([index,group.appearance,Math.min(group.candies.length,8)]),existing=previous[index];
   if(existing?.signature===signature)return existing;
   if(existing)this.disposeItem(existing);
   const scene=new THREE.Scene();scene.environment=this.environment.texture;scene.environmentIntensity=.75;
   scene.add(new THREE.HemisphereLight('#ffeacc','#625379',1.1));
   const key=new THREE.DirectionalLight('#ffe7b5',3);key.position.set(-3,5,5);key.castShadow=true;key.shadow.mapSize.set(256,256);Object.assign(key.shadow.camera,{left:-1.4,right:1.4,top:2,bottom:-1,near:.1,far:12});key.shadow.bias=-.0002;key.shadow.normalBias=.003;scene.add(key);
   const fill=new THREE.DirectionalLight('#d2c5ff',1);fill.position.set(4,2,-2);scene.add(fill);
   let item;const root=makeJar(group,index,this.pileClient,()=>{if(!this.disposed){item.dirty=true;this.dirty=true;this.loop?.request();}},this.onError);root.rotation.y=existing?.root.rotation.y??-.14;root.rotation.x=existing?.root.rotation.x??0;scene.add(root);
   const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
   const quad=new THREE.Mesh(this.quadGeometry,new THREE.MeshBasicMaterial({map:target.texture,transparent:true,depthTest:false,depthWrite:false}));quad.position.z=-1;this.composite.add(quad);
   item={scene,root,signature,target,quad,dirty:true,compiled:false};
   const previousTarget=this.renderer.getRenderTarget();this.renderer.setRenderTarget(target);const compilation=this.renderer.compileAsync(scene,this.camera);this.renderer.setRenderTarget(previousTarget);
   item.compilation=compilation.then(()=>{if(root.userData.cancelled||this.disposed)return;item.compiled=true;item.dirty=true;this.dirty=true;this.loop?.request();}).catch(error=>{if(!root.userData.cancelled&&!this.disposed)this.onError(error);}).finally(()=>{item.compileFinished=true;if(root.userData.cancelled)this.releaseItem(item);this.compilations.delete(item.compilation);});
   this.compilations.add(item.compilation);
   return item;
  });
  for(const item of previous.slice(groups.length))this.disposeItem(item);
  this.ready=Promise.all(this.items.flatMap(item=>[item.root.userData.ready,item.compilation]));
  this.dirty=true;this.loop?.request();
 }
 disposeItem(item){item.root.userData.cancelled=true;item.quad?.removeFromParent();if(item.compileFinished)this.releaseItem(item);}
 releaseItem(item){if(item.released)return;item.released=true;disposeOwned(item.scene);item.target?.dispose();item.quad?.material.dispose();}
 tick(){
  if(this.disposed||!this.dirty||!this.renderer)return false;
  const base=this.canvas.getBoundingClientRect(),w=base.width,h=base.height;if(!w||!h)return false;
  if(this.width!==w||this.height!==h){this.renderer.setSize(w,h,false);this.width=w;this.height=h;}
  this.renderer.setScissorTest(false);
  const slots=this.container.querySelectorAll('.candy-jar-art'),pixelRatio=this.renderer.getPixelRatio();
  this.items.forEach((item,i)=>{
   const r=slots[i]?.getBoundingClientRect();item.quad.visible=Boolean(r?.width)&&item.compiled;if(!r?.width)return;
   const width=r.width,height=r.height,tw=Math.ceil(width*pixelRatio),th=Math.ceil(height*pixelRatio);
   if(item.target.width!==tw||item.target.height!==th){item.target.setSize(tw,th);item.dirty=true;}
   if(item.dirty&&item.compiled){
    this.renderer.setRenderTarget(item.target);this.renderer.clear();
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.render(item.scene,this.camera);item.dirty=false;
   }
   item.quad.scale.set(width,height,1);item.quad.position.set(r.left-base.left+width/2,base.bottom-r.bottom+height/2,-1);
  });
  // Only changed jars re-render their 3D scene; the shelves are composited in one pass.
  this.renderer.setRenderTarget(null);this.renderer.setViewport(0,0,w,h);this.renderer.clear();
  Object.assign(this.compositeCamera,{left:0,right:w,top:h,bottom:0,near:.1,far:10});this.compositeCamera.updateProjectionMatrix();
  this.renderer.render(this.composite,this.compositeCamera);this.dirty=false;return false;
 }
 dispose(){if(this.disposed)return this.disposal;for(const[name,fn]of[['pointerdown',this.down],['pointermove',this.move],['pointerup',this.up],['pointercancel',this.up],['click',this.blockClick]])this.container.removeEventListener(name,fn,true);this.disposed=true;this.loop?.dispose();this.observer?.disconnect();window.removeEventListener("halloween:resize",this.onLayout);for(const item of this.items)this.disposeItem(item);this.quadGeometry?.dispose();this.pileClient?.dispose();this.disposal=Promise.allSettled([...this.compilations]).then(()=>{this.environment?.dispose();this.renderer?.dispose();});return this.disposal;}
}
