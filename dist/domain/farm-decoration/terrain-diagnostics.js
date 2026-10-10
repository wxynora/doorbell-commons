// Read-only explanation of authoritative terrain geometry. Never replaces placement authority.
import {CELL_SIZE,Z_ORIGIN,boundsRectangle,intersects,touchedCells} from './placement-geometry.js';
import {DEFAULT_HOUSE_POSITION,houseBaseRects} from './house-geometry.js';
import {fieldPlots} from './field-layout.js';
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
    if(Math.abs(cross(v,q))<1e-8&&p[0]>=Math.min(a[0],b[0])-1e-8&&p[0]<=Math.max(a[0],b[0])+1e-8&&p[1]>=Math.min(a[1],b[1])-1e-8&&p[1]<=Math.max(a[1],b[1])+1e-8)return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }
  return yes;
}
// All callers supply convex rectangles. Clip the actual overlap, not their bounding boxes.
export function intersectPolygon(poly,clipper){
  let result=poly;
  for(let i=0;i<clipper.length&&result.length;i++){
    const a=clipper[i],b=clipper[(i+1)%clipper.length],edge=[b[0]-a[0],b[1]-a[1]];
    const side=p=>cross(edge,[p[0]-a[0],p[1]-a[1]]),input=result;result=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],sp=side(p),sq=side(q);
      if(sp>=-1e-10)result.push(p);
      if((sp<0&&sq>0)||(sp>0&&sq<0)){
        const t=sp/(sp-sq);result.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
  }
  return result;
}
export function createPlacementTerrain(plots=[],housePosition=DEFAULT_HOUSE_POSITION,field){
  const fixtures=[
    ...(housePosition===null?[]:houseBaseRects(housePosition).map((rect,index)=>({rect,kind:'house',part:index+1}))),
    {rect:[-.65,bridgeZ-1.15,.75,bridgeZ+1.15],kind:'bridge'},
    ...fieldPlots(plots,field).map((plot,i)=>{
      const {x,z}=plot;
      return {rect:[x-.435,z-.456,x+.435,z+.456],kind:'plot',id:plot.id??i+1};
    })
  ],blockers=fixtures.map(f=>boundsRectangle(f.rect));
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
  function explain(poly,water=false){
    const causes=[];
    for(let i=0;i<blockers.length;i++)if(intersects(poly,blockers[i])){
      const {rect,...blocker}=fixtures[i];
      causes.push({reason:'blocked',blocker,cells:touchedCells(intersectPolygon(poly,blockers[i]))});
    }
    const regions=new Map();
    const classify=p=>{
      if(onTerrain(p,water))return null;
      if(!inside(p,outer))return 'outside_island';
      if(water)return 'requires_water';
      return inside(p,inner)?'outside_buildable_land':'requires_land';
    };
    for(const cell of touchedCells(poly)){
      const [col,row]=cell,x=col*CELL_SIZE,z=Z_ORIGIN+row*CELL_SIZE;
      const part=intersectPolygon(poly,boundsRectangle([x,z,x+CELL_SIZE,z+CELL_SIZE]));
      const samples=[...part,...(water?inner.filter(p=>inside(p,part)):[])];
      for(let i=0;i<part.length;i++){
        const a=part[i],b=part[(i+1)%part.length];
        const ts=[0,1,...[land,outer,inner].flatMap(boundary=>cuts(a,b,boundary))].sort((a,b)=>a-b);
        for(let j=1;j<ts.length;j++)if(ts[j]-ts[j-1]>1e-9){
          const t=(ts[j]+ts[j-1])/2;samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
        }
      }
      for(const reason of new Set(samples.map(classify).filter(Boolean))){
        const cells=regions.get(reason)??[];cells.push(cell);regions.set(reason,cells);
      }
    }
    for(const [reason,cells]of regions)causes.push({reason,cells});
    return causes;
  }
  return {canPlace,clip,cellVisible,explain};
}
