export const accessories=[{id:'mole',label:'痣'}];
export function accessoryState(state,id){
 state.accessories??={};
 return state.accessories[id]??={enabled:false,x:0,y:0,scale:100};
}
export function drawAccessories(ctx,state){
 for(const {id} of accessories){
  const a=accessoryState(state,id);if(!a.enabled)continue;
  ctx.save();ctx.translate(222+a.x,337+a.y);ctx.scale(a.scale/100,a.scale/100);
  ctx.fillStyle=a.color||'#57443b';ctx.beginPath();ctx.arc(0,0,2.1,0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
}
