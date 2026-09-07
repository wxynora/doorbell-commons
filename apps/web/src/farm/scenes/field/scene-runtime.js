import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWorld } from "./models/world.js";
import { createFarmCamera, resizeFarmCamera, CAMERA_TARGET, MIN_ZOOM, MAX_ZOOM } from "./models/camera.js";
import { createEnvironment, createSeasonController, createNightLighting } from "./models/environment.js";
import { createPlacement, CELL_SIZE } from "./models/placement.js";
import { setRoofColor } from "./models/cottage.js";
import { createDecoration, disposeDecoration, updateDecorationLights, updateDecorationMotion } from "./models/decorations.js";
import { createNatureEffects } from "./models/nature-effects.js";

export function createFieldRuntime(host, options) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .99;
  host.append(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "农场三维场景，拖动转动视角，编辑时拖动摆件，R旋转，方向键移动，Esc取消");
  const scene = new T.Scene(), camera = createFarmCamera();
  const hemi = new T.HemisphereLight("#eef5ff", "#b7af9c", .94);
  const sun = new T.DirectionalLight("#fff0cc", 1.85);
  sun.position.set(-7,14,7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11});
  sun.shadow.normalBias=.035;
  sun.shadow.bias=-.00015;
  scene.add(hemi,sun);
  const definitions = options.plots.map(p=>{const i=p.plot_id-1;return {...p,id:p.plot_id,x:((i%6)-2.5)*.94,z:-.97+Math.floor(i/6)*.94};});
  const world=createWorld(definitions);
  world.decorations=[];
  const natureEffects=createNatureEffects(world.root,definitions);
  scene.add(world.root);
  const environment=createEnvironment(world.root), setSeason=createSeasonController(world.root), setNightLighting=createNightLighting(world);
  let nature=options.environment, data=null, placement=null, committed=null, pendingData=null;
  let editing=false, saving=false, disposed=false, light=nature.night, roof="mint";
  const controls=new OrbitControls(camera,canvas);
  controls.target.copy(CAMERA_TARGET);
  controls.enableDamping=true; controls.dampingFactor=.08;
  controls.minPolarAngle=.2; controls.maxPolarAngle=Math.PI*.46;
  controls.minZoom=MIN_ZOOM; controls.maxZoom=MAX_ZOOM; controls.enablePan=false;
  controls.update(); controls.saveState();
  const listeners=[];
  const listen=(name,fn)=>{canvas.addEventListener(name,fn);listeners.push([name,fn]);};
  const resize=()=>{const {width,height}=host.getBoundingClientRect();if(width&&height){resizeFarmCamera(camera,width,height);renderer.setSize(width,height);}};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),-.25);
  const pose=o=>({x:o.position.x,z:o.position.z,rotation:o.rotation.y});
  const capture=()=>({roof,stall:pose(world.root.getObjectByName("market-stall")),decorations:world.decorations.map(o=>({instance_id:o.userData.instanceId,item_id:o.userData.itemId,...pose(o)}))});
  const definition=id=>data?.catalog.find(d=>d.item_id===id);
  const inventory=id=>data?.inventory.find(d=>d.item_id===id);
  function remaining(id) {
    const def=definition(id), owned=inventory(id);
    if(!def||!owned) return false;
    if(def.purchase_mode==="unlock") return owned.unlocked;
    return world.decorations.filter(o=>o.userData.itemId===id).length<owned.owned_quantity;
  }
  function emit(message="") {
    const object=placement?.object,id=object?.userData.itemId;
    options.onEditState({editing,valid:!saving&&(!placement?.active||placement.valid),title:object?.userData.label||"布置农场",canAdd:!saving&&!!id&&remaining(id),canRemove:!saving&&!!id,message});
  }
  function applyLayout(layout) {
    placement?.cancel();
    for(const object of [...world.decorations])disposeDecoration(object);
    world.decorations.length=0;
    const stall=world.root.getObjectByName("market-stall");
    stall.position.x=layout.stall.x;stall.position.z=layout.stall.z;stall.rotation.y=layout.stall.rotation;
    roof=layout.roof;setRoofColor(world.house,roof);
    for(const item of layout.decorations) {
      const def=definition(item.item_id);
      if(!def)throw new Error("装饰目录尚未包含已保存的物品，请重新读取");
      const object=createDecoration(def.model_id);
      object.userData.instanceId=item.instance_id;object.userData.itemId=item.item_id;
      object.position.set(item.x,.25,item.z);object.rotation.y=item.rotation;
      world.root.add(object);world.decorations.push(object);
    }
    // Old edit grid uses its own resources and must not accumulate on each refresh.
    const oldGrid=world.root.getObjectByName("placement-grid");
    if(oldGrid)disposeDecoration(oldGrid);
    placement=createPlacement(world,data.grid);
  }
  function setDecorations(value) {
    if(editing){pendingData=value;return;}
    data=value;committed=structuredClone(value.layout);applyLayout(committed);
  }
  function finish() {
    editing=false;controls.enabled=true;emit();options.onFinishEditing();
    if(pendingData){const next=pendingData;pendingData=null;setDecorations(next);}
  }
  function begin(object,adding=false) {
    if(saving)return;
    if(placement.active&&!placement.confirm()){emit("先把当前装饰移到可放置的绿色格子");return;}
    editing=true;controls.enabled=false;world.selector.visible=false;
    placement.begin(object,adding);emit();canvas.focus();
  }
  function startPlacement(id) {
    if(!data||!placement||saving)return;
    const def=definition(id);
    if(!def||!remaining(id)){emit("背包里没有可用的这件装饰");return;}
    if(placement.active&&!placement.valid){emit("先摆好当前装饰，再追加下一件");return;}
    const object=createDecoration(def.model_id),free=placement.findFree(object);
    if(!free){disposeDecoration(object);emit("没有合适的空位，请先调整或收起其他装饰");return;}
    object.userData.instanceId=crypto.randomUUID();object.userData.itemId=id;
    object.position.set(free.x,.25,free.z);
    world.root.add(object);world.decorations.push(object);begin(object,true);
  }
  function cancel() {if(!editing||saving)return;applyLayout(committed);finish();}
  async function save() {
    if(!editing||saving)return;
    if(placement.active&&!placement.confirm()){emit("红色位置不能保存，请移到绿色格子");return;}
    saving=true;emit("正在保存布置…");
    try {
      const layout=capture();await options.onSaveLayout(layout);
      if(disposed)return;
      committed=structuredClone(layout);saving=false;finish();
    } catch(error) {saving=false;emit(error instanceof Error?error.message:"保存未完成，布置还在编辑中");}
  }
  function rotate(){if(saving||!placement?.active)return;placement.rotate();emit();}
  function addOne(){const id=placement?.object?.userData.itemId;if(id)startPlacement(id);}
  function remove(){if(!saving&&placement?.remove())emit("已收起，点击保存完成布置");}
  function pointerRay(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);}
  function move(e){pointerRay(e);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(p){placement.move(p.x,p.z);emit();}}
  let down=null,moved=false;
  listen("pointerdown",e=>{down=[e.clientX,e.clientY];moved=false;if(editing)canvas.setPointerCapture(e.pointerId);});
  listen("pointermove",e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])>7)moved=true;if(down&&placement?.active&&!saving)move(e);});
  listen("pointercancel",()=>{down=null;});
  listen("pointerup",e=>{
    if(saving){down=null;return;}
    if(placement?.active){move(e);down=null;return;}
    if(!down||moved){down=null;return;}down=null;pointerRay(e);
    const hit=ray.intersectObject(world.root,true).find(h=>h.object.isMesh);
    if(hit?.object.userData.decoration&&placement)begin(hit.object.userData.decoration);
    else if(hit?.object.userData.stall&&placement)begin(placement.stall);
    else if(hit?.object.userData.plot&&!editing)options.onSelectPlot(hit.object.userData.plot.id);
    else if(hit?.object===world.water)world.waterMaterial.uniforms.ripple.value.set(hit.point.x,hit.point.z,time);
  });
  listen("keydown",e=>{
    if(!editing)return;
    if(e.key==="Escape")cancel();
    else if(e.key==="Enter")void save();
    else if(e.key.toLowerCase()==="r")rotate();
    else if(e.key.startsWith("Arrow")&&placement.active&&!saving){
      e.preventDefault();const {x,z}=placement.object.position;
      placement.move(x+(e.key==="ArrowRight"?CELL_SIZE:e.key==="ArrowLeft"?-CELL_SIZE:0),z+(e.key==="ArrowDown"?CELL_SIZE:e.key==="ArrowUp"?-CELL_SIZE:0));emit();
    }
  });
  function selectPlot(id){const plot=definitions.find(p=>p.id===id);world.selector.visible=!!plot;if(plot){world.selector.position.set(plot.x,.46,plot.z);world.selector.scale.setScalar(.5);}}
  function setEnvironment(value){
    nature=value;setSeason(value.season);
    natureEffects.setEvent(value.disaster);
    environment.setWeather(["light_snow","blizzard"].includes(value.weather)?"snow":["light_rain","heavy_rain","thunderstorm"].includes(value.weather)?"rain":"clear");
    scene.fog=value.weather==="fog"?new T.FogExp2("#b8c9c8",.025):null;
  }
  setEnvironment(nature);
  const reduce=matchMedia("(prefers-reduced-motion: reduce)");
  let time=0,last=performance.now(),frame;
  function animate(now){
    const dt=document.hidden?0:Math.min((now-last)/1000,.08);last=now;if(!reduce.matches)time+=dt;
    light=T.MathUtils.damp(light,nature.night,3,dt);
    const overcast=["cloudy","fog","heavy_rain","thunderstorm","blizzard"].includes(nature.weather);
    sun.color.set(nature.weather==="hot"?"#ffedc0":"#fff0cc").lerp(new T.Color("#acc4e4"),light);
    sun.intensity=T.MathUtils.lerp(1.85,.12,light)*(overcast?.62:1);
    sun.position.set(-7-light*7,14-light*8,7);
    hemi.color.set("#eef5ff").lerp(new T.Color("#f4f1d6"),light);
    hemi.groundColor.set("#b7af9c").lerp(new T.Color("#819474"),light);hemi.intensity=T.MathUtils.lerp(.94,.32,light);
    renderer.toneMappingExposure=T.MathUtils.lerp(.99,.93,light);
    setNightLighting(light);updateDecorationLights(world.decorations,light);updateDecorationMotion(world.decorations,time);
    world.update(time,light);natureEffects.update(time);environment.update(time,light,scene,camera);controls.update();renderer.render(scene,camera);
    frame=requestAnimationFrame(animate);
  }
  frame=requestAnimationFrame(animate);
  return {setEnvironment,setDecorations,selectPlot,startPlacement,rotate,addOne,remove,cancel,save,
    zoom(factor){camera.zoom=T.MathUtils.clamp(camera.zoom*factor,MIN_ZOOM,MAX_ZOOM);camera.updateProjectionMatrix();},
    resetView(){controls.reset();},
    dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();for(const [name,fn] of listeners)canvas.removeEventListener(name,fn);controls.dispose();environment.dispose();world.dispose();renderer.dispose();canvas.remove();}
  };
}
