// Mirrored between the scene and Farm authority; grid cells are guides, not collision masks.
import {CELL_SIZE,Z_ORIGIN,boundsRectangle,intersects} from "./placement-geometry.js";
import {DEFAULT_HOUSE_POSITION,houseBaseRects} from "./house-geometry.js";
// Expand by two existing grid cells per side; creek width and scene anchors stay unchanged.
export const LAND={x:7.5+2*CELL_SIZE,z:8.7+2*CELL_SIZE,fenceInset:.3,riverWidth:1.6};
const radius=a=>1+.025*Math.sin(a*5)+.02*Math.cos(a*9);
const outline=extra=>Array.from({length:160},(_,i)=>{
  const a=i/160*Math.PI*2,r=radius(a);
  return [Math.cos(a)*(LAND.x*r+extra),Math.sin(a)*(LAND.z*r+extra)];
});
const land=outline(-LAND.fenceInset-.12),outer=outline(LAND.riverWidth),inner=outline(.05);
const bridgeZ=LAND.z*radius(Math.PI/2)+LAND.riverWidth/2;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function cuts(a,b,poly){
  const v=[b[0]-a[0],b[1]-a[1]],out=[];
  for(let i=0;i<poly.length;i++){
    const c=poly[i],d=poly[(i+1)%poly.length],w=[d[0]-c[0],d[1]-c[1]],den=cross(v,w);
    if(Math.abs(den)<1e-10)continue;
    const q=[c[0]-a[0],c[1]-a[1]],t=cross(q,w)/den,u=cross(q,v)/den;
    if(t>0&&t<1&&u>=0&&u<=1)out.push(t);
  }
  return out;
}
function inside(p,poly){
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i],v=[b[0]-a[0],b[1]-a[1]],q=[p[0]-a[0],p[1]-a[1]];
    if(Math.abs(cross(v,q))<1e-8 && p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
export function createPlacementTerrain(plots=[],housePosition=DEFAULT_HOUSE_POSITION){
  const rects=[
    ...(housePosition===null?[]:houseBaseRects(housePosition)),
    [-.65,bridgeZ-1.15,.75,bridgeZ+1.15],
    ...plots.map((plot,i)=>{
      const index=Number.isInteger(plot.id)&&plot.id>0?plot.id-1:i;
      const x=(index%6-2.5)*CELL_SIZE,z=-.97+Math.floor(index/6)*CELL_SIZE;
      return [x-.435,z-.456,x+.435,z+.456];
    })
  ],blockers=rects.map(boundsRectangle);
  const onTerrain=(p,water)=>water?inside(p,outer)&&!inside(p,inner):inside(p,land);
  function clip(a,b,water=false,obstacles=true){
    const boundaries=water?[outer,inner]:[land];
    const times=[0,1,...boundaries.flatMap(poly=>cuts(a,b,poly)),...(obstacles?blockers.flatMap(poly=>cuts(a,b,poly)):[])].sort((x,y)=>x-y);
    const point=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],segments=[];
    for(let i=1;i<times.length;i++){
      if(times[i]-times[i-1]<1e-9)continue;
      const mid=point((times[i]+times[i-1])/2);
      if(onTerrain(mid,water)&&(!obstacles||!blockers.some(poly=>inside(mid,poly))))segments.push([point(times[i-1]),point(times[i])]);
    }
    return segments;
  }
  function canPlace(poly,water=false){
    if(!poly.every(p=>onTerrain(p,water))||blockers.some(b=>intersects(poly,b)))return false;
    if(water&&inner.some(p=>inside(p,poly)))return false;
    return poly.every((a,i)=>{
      const b=poly[(i+1)%poly.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const covered=clip(a,b,water,false).reduce((sum,[c,d])=>sum+Math.hypot(d[0]-c[0],d[1]-c[1]),0);
      return covered>=length-1e-7;
    });
  }
  function cellVisible(col,row,water=false){
    const x=col*CELL_SIZE,z=Z_ORIGIN+row*CELL_SIZE,poly=boundsRectangle([x,z,x+CELL_SIZE,z+CELL_SIZE]);
    return poly.some((a,i)=>clip(a,poly[(i+1)%4],water).length>0);
  }
  return {canPlace,clip,cellVisible};
}
