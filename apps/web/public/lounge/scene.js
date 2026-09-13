import * as T from 'three';
import {createRoomOutline} from './outlines.js';
import {buildRoom} from './models.js';
import {optimizeStaticRoom} from './scene-static.js';
import {nextWindowChange} from './window-view.js';
import {createResidents} from './residents.js';
import {WIDTH,HEIGHT,CAMERA_OFFSET} from './view.js';
const frame=document.querySelector('#frame'),renderer=new T.WebGLRenderer({antialias:true,alpha:true});
renderer.setSize(WIDTH,HEIGHT);renderer.setPixelRatio(devicePixelRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;frame.prepend(renderer.domElement);
const scene=new T.Scene(),camera=new T.OrthographicCamera(-11.7,11.7,7.8,-7.8,.1,90);const room=buildRoom();optimizeStaticRoom(room);scene.add(room);const outline=createRoomOutline(room,WIDTH,HEIGHT);scene.add(outline);
scene.add(new T.HemisphereLight('#fff6e3','#b7a68e',1.6));
const sun=new T.DirectionalLight('#ffe7bb',2.2);sun.position.set(-8,16,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:45});sun.shadow.normalBias=.035;scene.add(sun);
const fill=new T.DirectionalLight('#e7efff',.6);fill.position.set(9,7,-3);scene.add(fill);
// Layer 0: furniture color; layer 1: characters; layer 2: character occluders.
const poseChairs=[],depthMaterials=new Set();
room.traverse(object=>{
 if(object.userData.poseChair)poseChairs.push(object);
 if(object.isMesh){object.layers.enable(2);for(const material of Array.isArray(object.material)?object.material:[object.material])depthMaterials.add(material);}
});
for(const chair of poseChairs)chair.traverse(object=>object.layers.disable(2));
room.traverse(object=>{if(object.userData.noPoseOcclusion)object.traverse(part=>part.layers.disable(2));});
const depthPoint=new T.Vector3(),depthDirection=new T.Vector3();
function renderWithChairOcclusion(){
 camera.updateMatrixWorld();camera.getWorldDirection(depthDirection);
 for(const chair of poseChairs){
  let nearest=null,nearestDepth=Infinity;
  for(const arm of chair.children.filter(object=>object.userData.poseArm)){
   arm.layers.disable(2);const depth=arm.getWorldPosition(depthPoint).dot(depthDirection);
   if(depth<nearestDepth){nearest=arm;nearestDepth=depth;}
  }
  nearest?.layers.enable(2);
  if(chair.userData.tableChair){
   const back=chair.children.find(object=>object.userData.poseBack);
   back.layers.disable(2);
   const center=chair.getWorldPosition(new T.Vector3());
   if(back.getWorldPosition(depthPoint).sub(center).setY(0).dot(depthDirection)<0)back.layers.enable(2);
  }
 }
 renderer.autoClear=false;renderer.clear();camera.layers.set(0);renderer.render(scene,camera);
 renderer.clearDepth();
 const writes=new Map([...depthMaterials].map(material=>[material,material.colorWrite]));
 for(const material of depthMaterials)material.colorWrite=false;
 camera.layers.set(2);renderer.render(scene,camera);
 for(const [material,value] of writes)material.colorWrite=value;
 camera.layers.set(1);renderer.render(scene,camera);camera.layers.set(0);renderer.autoClear=true;
}
let state={zoom:1,pan:0},scale=1;const right=new T.Vector3(CAMERA_OFFSET[2],0,-CAMERA_OFFSET[0]).normalize();
function draw(){state.zoom=Math.max(1,state.zoom);const visible=innerWidth/(WIDTH*scale);const limit=7.8*Math.max(0,1-visible/state.zoom);state.pan=Math.max(-limit,Math.min(limit,state.pan));const target=new T.Vector3(0,1,.35).addScaledVector(right,state.pan);camera.position.copy(target).add(new T.Vector3(...CAMERA_OFFSET));camera.lookAt(target);camera.zoom=state.zoom;camera.updateProjectionMatrix();document.querySelector('#zoom').textContent=`${Math.round(state.zoom*100)}%`;renderWithChairOcclusion();}
let pendingDraw=0;
function requestDraw(){if(!pendingDraw)pendingDraw=requestAnimationFrame(()=>{pendingDraw=0;draw();});}
function resize(){scale=innerHeight/HEIGHT;const pixelRatio=scale*devicePixelRatio;if(renderer.getPixelRatio()!==pixelRatio)renderer.setPixelRatio(pixelRatio);frame.style.transform=`translate(${(innerWidth-WIDTH*scale)/2}px,${(innerHeight-HEIGHT*scale)/2}px) scale(${scale})`;requestAnimationFrame(draw);}addEventListener('resize',resize);
document.querySelector('#reset').onclick=()=>{state={zoom:1,pan:0};draw();};
document.querySelector('#more').onclick=()=>{state.zoom*=1.2;draw();};document.querySelector('#less').onclick=()=>{state.zoom/=1.2;draw();};
const pointers=new Map();let lastDistance=0;
renderer.domElement.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);lastDistance=0;});
renderer.domElement.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(lastDistance>0)state.zoom*=d/lastDistance;lastDistance=d;}else if(clickStart&&Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)>5){state.pan-=(e.clientX-old.x)/scale/WIDTH*18/state.zoom;}else return;requestDraw();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(type,e=>{pointers.delete(e.pointerId);lastDistance=0;});
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();state.zoom*=Math.exp(-e.deltaY*.001);requestDraw();},{passive:false});resize();

const windowViews=[];room.traverse(object=>{if(object.userData.updateWindow)windowViews.push(object);});
let windowTimer;
function syncWindow(){
 const now=new Date();let changed=false;
 for(const view of windowViews)changed=view.userData.updateWindow(now)||changed;
 if(changed)draw();
 clearTimeout(windowTimer);windowTimer=setTimeout(syncWindow,nextWindowChange(now)-now.getTime());
}
function resumeWindow(){if(document.visibilityState==='visible')syncWindow();}
document.addEventListener('visibilitychange',resumeWindow);addEventListener('focus',resumeWindow);addEventListener('pageshow',resumeWindow);syncWindow();
const residents=createResidents({scene,draw:requestDraw});
let publicTables=[];
let tableAppearance=JSON.stringify([null,null]);
let gamesEnabled=false;
addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='lounge-state')return;document.querySelector("#online-count").textContent=String((event.data.presence||[]).length);residents.update(event.data.presence||[]);gamesEnabled=event.data.gamesEnabled===true;publicTables=event.data.tables||[];if(gameDialog.open)renderGameChoices();const nextAppearance=JSON.stringify(['square','round'].map(id=>publicTables.find(t=>t.tableId===id)?.gameKind??null));if(nextAppearance!==tableAppearance){tableAppearance=nextAppearance;room.userData.tabletopGames.update(publicTables);requestDraw();}});
requestAnimationFrame(()=>{draw();requestAnimationFrame(draw);});
parent.postMessage({type:'lounge-ready'},location.origin);
if(import.meta.hot)import.meta.hot.dispose(()=>{residents.dispose();cancelAnimationFrame(pendingDraw);clearTimeout(windowTimer);document.removeEventListener('visibilitychange',resumeWindow);removeEventListener('focus',resumeWindow);removeEventListener('pageshow',resumeWindow);windowViews.forEach(view=>view.userData.disposeWindow());outline.geometry.dispose();outline.material.dispose();renderer.dispose();});
export {renderer,scene,draw};

document.querySelector('#chat').addEventListener('click',()=>{if(parent!==window)parent.postMessage({type:'lounge-chat-focus'},location.origin);else document.querySelector('#chat-notice').togglePopover();});

// Interactive objects share the scene camera and one selection state.
let clickStart,clickCancelled=false;
const selections=new Map();
for(const name of ['newspaper-rack','square-game-table','round-game-table','lounge-gacha-machine']){
 const object=room.getObjectByName(name),selected=createRoomOutline(object,WIDTH,HEIGHT);
 selected.material.uniforms.ink.value.set('#d6a34d');selected.material.uniforms.thickness.value=3.2;
 selected.name=name+'-selection';selected.visible=false;selected.renderOrder=2;
 scene.add(selected);selections.set(object,selected);
}
if(import.meta.hot)import.meta.hot.dispose(()=>{for(const selected of selections.values()){selected.geometry.dispose();selected.material.dispose();}});
function pickInteractive(e){
 const rect=renderer.domElement.getBoundingClientRect();
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
 const hit=ray.intersectObjects(room.children,true)[0];let object=hit?.object;
 while(object&&!selections.has(object))object=object.parent;
 return object;
}
const gameDialog=document.createElement('dialog');gameDialog.id='table-games';gameDialog.setAttribute('aria-label','选择桌上游戏');
gameDialog.innerHTML='<button class="game-close" aria-label="关闭" type="button">×</button><h2></h2><p>想玩哪一局？</p><div class="game-choices"></div><button class="game-join" type="button" disabled hidden>加入这局</button><button class="game-watch game-join" type="button" hidden>围观</button><p class="game-note">当前为桌面外观预览，正式开局尚未开放。</p>';
document.body.append(gameDialog);
gameDialog.querySelector('.game-close').onclick=()=>gameDialog.close();
let chosenTable;
gameDialog.querySelector('.game-join').onclick=()=>{const table=publicTables.find(t=>t.tableId===chosenTable);if(!gamesEnabled||!table?.roomId)return;parent.postMessage({type:'lounge-game-join',tableId:chosenTable,roomId:table.roomId,revision:table.revision},location.origin);gameDialog.close();};
gameDialog.querySelector('.game-watch').onclick=()=>{const table=publicTables.find(t=>t.tableId===chosenTable);if(!gamesEnabled||table?.phase!=='playing')return;parent.postMessage({type:'lounge-game-watch',tableId:chosenTable,roomId:table.roomId},location.origin);gameDialog.close();};
for(const [kind,label] of [['mahjong','麻将'],['doudizhu','斗地主'],['leaf-game','叶子戏'],['uno','UNO'],['monopoly','大富翁'],['flying-chess','飞行棋']]){
 const button=document.createElement('button');button.type='button';button.textContent=label;
 button.onclick=()=>{if(gamesEnabled){parent.postMessage({type:'lounge-game-create',tableId:chosenTable,kind},location.origin);}else if(parent===window){room.userData.tabletopGames.set(chosenTable,kind);draw();}gameDialog.close();};
 gameDialog.querySelector('.game-choices').append(button);
}
function renderGameChoices(){
 const active=publicTables.find(t=>t.tableId===chosenTable)?.gameKind;
 const names={'mahjong':'麻将','doudizhu':'斗地主','leaf-game':'叶子戏','uno':'UNO','monopoly':'大富翁','flying-chess':'飞行棋'};
 gameDialog.querySelector('h2').textContent=(chosenTable==='square'?'方桌':'圆桌')+(active?' · '+names[active]:' · 选个游戏');
 gameDialog.querySelector('.game-choices').hidden=Boolean(active);
 gameDialog.querySelector('.game-join').hidden=!active||publicTables.find(t=>t.tableId===chosenTable)?.phase==='playing';
 gameDialog.querySelector('.game-watch').hidden=!gamesEnabled||publicTables.find(t=>t.tableId===chosenTable)?.phase!=='playing';
 gameDialog.querySelector('.game-join').disabled=!gamesEnabled;
 gameDialog.querySelectorAll('.game-choices button').forEach(button=>{button.disabled=!gamesEnabled&&parent!==window;});
 gameDialog.querySelector('h2 + p').textContent=active?'这桌已有对局':'想玩哪一局？';
 gameDialog.querySelector('.game-note').textContent=gamesEnabled?'':active?'加入入口尚未开放，暂时不能入座。':'当前为桌面外观预览，正式开局尚未开放。';
}
renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!pointers.size)renderer.domElement.style.cursor=pickInteractive(e)?'pointer':'';if(clickStart&&Math.hypot(e.clientX-clickStart.x,e.clientY-clickStart.y)>5)clickCancelled=true;});
renderer.domElement.addEventListener('pointerleave',()=>{renderer.domElement.style.cursor='';});
renderer.domElement.addEventListener('pointerdown',e=>{if(pointers.size===1){clickStart={pointerId:e.pointerId,x:e.clientX,y:e.clientY};clickCancelled=false;}else clickCancelled=true;});
renderer.domElement.addEventListener('pointercancel',()=>{clickStart=null;clickCancelled=true;});
renderer.domElement.addEventListener('pointerup',e=>{
 const start=clickStart;clickStart=null;
 if(!start||clickCancelled||start.pointerId!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
 const object=pickInteractive(e);
 for(const [target,selected] of selections)selected.visible=target===object;
 requestDraw();if(!object)return;
 if(object.userData.gachaMachine){
  if(parent!==window)parent.postMessage({type:'lounge-gacha-open'},location.origin);
  else import('./gacha-dialog.js').then(module=>module.openGachaDialog({preview:true}));
  return;
 }
 if(object.userData.gameTable){chosenTable=object.userData.gameTable;renderGameChoices();
 gameDialog.showModal();return;}
 if(parent!==window)parent.postMessage({type:'lounge-daily-open'},location.origin);
 else{const notice=document.querySelector('#chat-notice');notice.textContent='今天的日报请在公共休息室完整页面查看。';notice.showPopover();}
});
