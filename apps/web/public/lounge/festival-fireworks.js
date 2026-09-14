import * as T from 'three';
// A window-only overlay avoids redrawing the complete WebGL room every frame.
export function createFestivalFireworks({frame,camera,room,width,height}){
 const view=room.getObjectByName('season-window-view'),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});frame.append(canvas);
 const ctx=canvas.getContext('2d');let enabled=false,animation=0;
 function projected(x,y){const v=new T.Vector3(x,y,0).applyMatrix4(view.matrixWorld).project(camera);return [(v.x+1)*width/2,(1-v.y)*height/2];}
 function point(x,y,z){const v=new T.Vector3(x,y,z).project(camera);return [(v.x+1)*width/2,(1-v.y)*height/2];}
 function polygon(points){points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
 function draw(time=0){animation=0;ctx.clearRect(0,0,width,height);if(!enabled||document.hidden||!view)return;
  room.updateMatrixWorld(true);camera.updateMatrixWorld();ctx.save();ctx.beginPath();
  for(const [l,r] of[[-1.53,-.08],[.08,1.53]])polygon([[l,.13],[r,.13],[r,1.02],[l,1.02]].map(([x,y])=>projected(x,y)));
  ctx.clip();ctx.beginPath();ctx.rect(0,0,width,height);
  // The two physical red paper squares remain in front of the sky.
  for(const x of[2.55,4.7])polygon([[x,2.4,-5.66],[x+.46,1.94,-5.66],[x,1.48,-5.66],[x-.46,1.94,-5.66]].map(p=>point(...p)));
  ctx.clip('evenodd');
  const reduce=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  for(let b=0;b<3;b++){
   const phase=reduce?.55:((time/1000+b*1.31)%4.6)/4.6;if(phase>.78)continue;
   const x=[-.9,.67,1.2][b],y=[.67,.77,.4][b],radius=.04+Math.sin(Math.min(phase/.72,1)*Math.PI/2)*[.5,.43,.3][b],alpha=Math.min(1,phase*9)*(1-phase/.8);
   ctx.strokeStyle=['#ffe4a1','#f7b6c3','#fff4d9'][b];ctx.fillStyle=ctx.strokeStyle;ctx.globalAlpha=Math.max(0,alpha);ctx.lineWidth=1.7;ctx.lineCap='round';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=7;
   for(let i=0;i<18;i++){const a=i*Math.PI*2/18,outer=projected(x+Math.cos(a)*radius,y+Math.sin(a)*radius-phase*phase*.19),inner=projected(x+Math.cos(a)*radius*.64,y+Math.sin(a)*radius*.64-phase*phase*.19);ctx.beginPath();ctx.moveTo(...inner);ctx.lineTo(...outer);ctx.stroke();ctx.beginPath();ctx.arc(...outer,1.5,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();if(!reduce)animation=requestAnimationFrame(draw);
 }
 function redraw(){cancelAnimationFrame(animation);draw(performance.now());}
 function resume(){if(enabled)redraw();}
 document.addEventListener('visibilitychange',resume);
 return {set(kind){enabled=kind==='new-year';redraw();},redraw,dispose(){cancelAnimationFrame(animation);document.removeEventListener('visibilitychange',resume);canvas.remove();}};
}
