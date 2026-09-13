import * as T from 'three';

// Visual lifetimes only. These never change presence, send messages, or ring bells.
const EVENT_MS=20_000,IDLE_MS=5*60_000;
export function effectFor(person,now){
 const state=person?.effect;
 if(!state)return null;
 const recent=time=>Number.isFinite(time)&&now>=time&&now-time<EVENT_MS;
 if(recent(state.spokeAt))return 'speech';
 if(recent(state.resultAt)&&['win','sad'].includes(state.result))return state.result;
 if(recent(state.petAt))return 'pet';
 if(!state.inGame&&Number.isFinite(state.idleSince)&&now-state.idleSince>=IDLE_MS)return 'sleep';
 return null;
}

function texture(kind){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';
 if(kind==='flower'){x.translate(64,64);for(let i=0;i<5;i++){x.save();x.rotate(i*Math.PI*2/5);x.fillStyle='#ed85a5';x.beginPath();x.ellipse(0,-23,14,23,0,0,Math.PI*2);x.fill();x.restore();}x.fillStyle='#fff0a2';x.beginPath();x.arc(0,0,15,0,Math.PI*2);x.fill();}
 if(kind==='sad'){x.strokeStyle='#7986aa';x.lineWidth=7;for(let i=0;i<5;i++){x.beginPath();x.moveTo(24+i*20,22+(i%2)*8);x.lineTo(24+i*20,68+(i%3)*12);x.stroke();}}
 if(kind==='sleep'){x.font='bold 76px sans-serif';x.textAlign='center';x.strokeStyle='#fff8ed';x.lineWidth=8;x.strokeText('z',64,88);x.fillStyle='#59658e';x.fillText('z',64,88);}
 if(kind==='speech'){x.fillStyle='#fffaf0';x.strokeStyle='#8b715e';x.lineWidth=8;x.beginPath();x.moveTo(36,97);x.bezierCurveTo(0,73,12,15,57,13);x.bezierCurveTo(107,6,127,61,96,91);x.quadraticCurveTo(80,108,57,104);x.quadraticCurveTo(43,117,29,113);x.quadraticCurveTo(35,106,36,97);x.closePath();x.fill();x.stroke();}
 if(kind==='dot'){x.fillStyle='#a99581';x.beginPath();x.arc(64,64,28,0,Math.PI*2);x.fill();}
 return c;}
const maps=Object.fromEntries(['flower','sad','sleep','speech','dot'].map(k=>[k,texture(k)]));

// A transparent layer shares the scene's logical canvas and camera. Animation
// repaints only this small overlay, never the room/shadows/occlusion passes.
export function createResidentEffects({frame,camera,width,height}){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 canvas.style.cssText=`position:absolute;inset:0;width:${width}px;height:${height}px;pointer-events:none`;
 canvas.setAttribute('aria-hidden','true');frame.append(canvas);
 const context=canvas.getContext('2d'),actors=new Map(),point=new T.Vector3(),worldScale=new T.Vector3();
 let animation=0,timer=0,disposed=false,offset=0,lastServerTime=null;
 function clock(serverTime){if(serverTime&&serverTime!==lastServerTime){lastServerTime=serverTime;offset=Date.parse(serverTime)-Date.now();}}
 function project(mesh,x,y){point.set(x,y,0).applyMatrix4(mesh.matrixWorld).project(camera);return [(point.x+1)*width/2,(1-point.y)*height/2];}
 function paint(mesh,kind,x,y,size,opacity=1,rotation=0){
  const center=project(mesh,x,y);
  const pixels=size*mesh.getWorldScale(worldScale).y*height*camera.zoom/(camera.top-camera.bottom);
  context.save();context.globalAlpha=opacity;context.translate(...center);context.rotate(rotation);context.drawImage(maps[kind],-pixels/2,-pixels/2,pixels,pixels);context.restore();
 }
 function render(){
  animation=0;clearTimeout(timer);timer=0;if(disposed)return;
  context.clearRect(0,0,width,height);if(document.hidden)return;
  camera.updateMatrixWorld();const now=Date.now()+offset,time=now/1000;let active=false,next=Infinity;
  for(const {mesh,person} of actors.values()){
   const kind=effectFor(person,now),state=person.effect;
   if(!kind){if(state&&!state.inGame&&Number.isFinite(state.idleSince))next=Math.min(next,state.idleSince+IDLE_MS-now);continue;}
   active=true;mesh.updateWorldMatrix(true,false);if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   const h=mesh.geometry.boundingBox.max.y,w=mesh.geometry.boundingBox.max.x*2;
   if(kind==='speech'){
    paint(mesh,'speech',w*.43,h+.12,.65);
    for(let i=0;i<3;i++)paint(mesh,'dot',w*.43+(i-1)*.115,h+.16+Math.max(0,Math.sin(time*5-i*.8))*.035,.09);
   }else if(kind==='sad')paint(mesh,'sad',0,h+.02-((time%1.8)/1.8)*.12,.56,.55+.25*Math.sin(time*2));
   else if(kind==='win'||kind==='pet'){
    const anchors=[[-.18,.86],[.16,.92]];
    for(let i=0;i<2;i++){const wave=time*(kind==='pet'?1.5:2.1)+i*1.7,bloom=(Math.sin(wave)+1)/2;paint(mesh,'flower',w*anchors[i][0]+Math.sin(wave)*.025,h*anchors[i][1]+Math.cos(wave)*.045,(.43+i*.055)*(.8+.2*bloom),.55+.45*bloom,Math.sin(wave)*.22);}
   }else for(let i=0;i<3;i++){const phase=(time/2.6+i/3)%1;paint(mesh,'sleep',w*.38+phase*.32,h*.92+phase*.72,.42+phase*.5,.65+Math.sin(phase*Math.PI)*.35);}
  }
  if(active)animation=requestAnimationFrame(render);
  else if(Number.isFinite(next))timer=setTimeout(render,Math.max(1,next));
 }
 function redraw(){if(!animation)render();}
 document.addEventListener('visibilitychange',redraw);
 return {clock,redraw,set(id,mesh,person){actors.set(id,{mesh,person});redraw();},remove(id){actors.delete(id);redraw();},dispose(){disposed=true;cancelAnimationFrame(animation);clearTimeout(timer);document.removeEventListener('visibilitychange',redraw);actors.clear();canvas.remove();}};
}
