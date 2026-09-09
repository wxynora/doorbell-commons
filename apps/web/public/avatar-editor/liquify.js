// Raster push brush. Only evaluated while editing; the original sprite is never changed.
export function createLiquifyRenderer(){
 let cache=null;
 return (image,strokes=[])=>{
  const ops=strokes.flatMap(s=>s.ops),w=image.width,h=image.height;
  if(!cache||cache.image!==image||ops.length<cache.count||(cache.count&&ops[cache.count-1]!==cache.last)){
   const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,w/2,h/2);
   const mapX=new Float32Array(w*h*4),mapY=new Float32Array(w*h*4);
   for(let i=0;i<mapX.length;i++){mapX[i]=i%(w*2);mapY[i]=Math.floor(i/(w*2));}
   cache={image,canvas,count:0,source:ctx.getImageData(0,0,w*2,h*2),mapX,mapY};
  }
  const ctx=cache.canvas.getContext('2d');
  for(let i=cache.count;i<ops.length;i++)push(ctx,ops[i],w,h,cache);
  cache.count=ops.length;cache.last=ops.at(-1);return cache.canvas;
 };
}
function push(ctx,op,w,h,cache){
 const width=w*2,height=h*2,src=cache.source,out=ctx.getImageData(0,0,width,height);
 const oldX=cache.mapX.slice(),oldY=cache.mapY.slice();
 const cx=op.x*w+w/2,cy=op.y*h+h/2,r=op.radius*w,dx=op.dx*w*op.strength,dy=op.dy*h*op.strength;
 for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(height,cy+r);y++)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(width,cx+r);x++){
  const d=Math.hypot(x-cx,y-cy)/r;if(d>=1)continue;
  const weight=(1-d*d)**2,mx=x-dx*weight,my=y-dy*weight,mix=Math.floor(mx),miy=Math.floor(my),mfx=mx-mix,mfy=my-miy;
  // Compose coordinates, never resample previously filtered colors.
  let sx=0,sy=0;
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const px=mix+xx,py=miy+yy,wt=(xx?mfx:1-mfx)*(yy?mfy:1-mfy),inside=px>=0&&px<width&&py>=0&&py<height;
   sx+=(inside?oldX[py*width+px]:px)*wt;sy+=(inside?oldY[py*width+px]:py)*wt;
  }
  cache.mapX[y*width+x]=sx;cache.mapY[y*width+x]=sy;
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  const values=[0,0,0,0];
  for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
   const px=ix+xx,py=iy+yy;if(px<0||px>=width||py<0||py>=height)continue;
   const p=(py*width+px)*4,a=src.data[p+3]/255,wt=(xx?fx:1-fx)*(yy?fy:1-fy);
   for(let k=0;k<3;k++)values[k]+=src.data[p+k]*a*wt;values[3]+=a*wt;
  }
  const p=(y*width+x)*4;for(let k=0;k<3;k++)out.data[p+k]=values[3]?values[k]/values[3]:0;out.data[p+3]=values[3]*255;
 }
 ctx.putImageData(out,0,0);
}
export function installLiquify({canvas,container,getContext,getState,draw,status}){
 const panel=document.createElement('div');panel.id='liquify-panel';
 panel.innerHTML='<button type="button" id="liquify-toggle" aria-pressed="false">开启液化</button><label>笔刷大小<input id="liquify-radius" type="number" min="1" max="100" value="18"><span>%</span></label><label>力度<input id="liquify-strength" type="number" min="1" max="100" value="35"><span>%</span></label><button type="button" id="liquify-undo">撤销一笔</button> <button type="button" id="liquify-clear">恢复此款</button><p>开启后拖动头发局部，配饰也会随笔刷移动。改完点击保存。</p>';
 container.append(panel);let enabled=false,active=null;
 const toggle=panel.querySelector('#liquify-toggle');
 const strokes=()=>{const state=getState();state.hairLiquify??={};return state.hairLiquify[state.hair]??=[]};
 const update=()=>{panel.hidden=!getContext();const valid=!!getContext();panel.querySelector('#liquify-undo').disabled=!valid||!strokes().length;panel.querySelector('#liquify-clear').disabled=!valid||!strokes().length;canvas.style.cursor=enabled&&valid?'crosshair':'';};
 toggle.onclick=()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',enabled);toggle.textContent=enabled?'关闭液化':'开启液化';update()};
 panel.querySelector('#liquify-undo').onclick=()=>{strokes().pop();draw();update();status('已撤销一笔 · 尚未保存')};
 panel.querySelector('#liquify-clear').onclick=()=>{strokes().splice(0);draw();update();status('已恢复此款原始轮廓 · 位置大小不变')};
 function point(e,c){const rect=canvas.getBoundingClientRect();let x=(e.clientX-rect.left)*384/rect.width,y=(e.clientY-rect.top)*640/rect.height;if(c.closeup){x=(x+153.6)/1.8;y=(y+135)/1.8}return {x:(x-c.left)/c.width,y:(y-c.top)/c.height};}
 canvas.addEventListener('pointerdown',e=>{
  const c=getContext();if(!enabled||!c)return;e.stopImmediatePropagation();e.preventDefault();
  const radius=Number(panel.querySelector('#liquify-radius').value)/100,strength=Number(panel.querySelector('#liquify-strength').value)/100;
  if(!(radius>0&&radius<=1&&strength>0&&strength<=1))return;
  active={id:e.pointerId,c,previous:point(e,c),stroke:{ops:[]},radius,strength};canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||active.id!==e.pointerId)return;e.stopImmediatePropagation();
  const p=point(e,active.c),a=active.previous;if(p.x===a.x&&p.y===a.y)return;
  if(!active.stroke.ops.length)strokes().push(active.stroke);
  active.stroke.ops.push({x:p.x,y:p.y,dx:p.x-a.x,dy:p.y-a.y,radius:active.radius,strength:active.strength});active.previous=p;draw();update();
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{if(active){active=null;status('液化已更新 · 尚未保存')}});
 return update;
}
