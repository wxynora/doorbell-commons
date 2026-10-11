// Mirrored verbatim by the scene. Seasonal scenery, never a layout field/blocker.
import {CELL_SIZE,boundsRectangle,rectangle,intersects} from './placement-geometry.js';
import {DEFAULT_HOUSE_POSITION,houseBaseRects,houseExtensionRects} from './house-geometry.js';
import {createPlacementTerrain} from './placement-terrain.js';

export function winterSnowmanPosition(plots,layout,houseLevel,catalog){
  const house=layout.house??DEFAULT_HOUSE_POSITION;
  const definitions=new Map(catalog.map(d=>[d.item_id,d]));
  const decorations=layout.decorations.map(o=>({id:o.instance_id,x:o.x,z:o.z,rotation:o.rotation,cells:definitions.get(o.item_id).cells}))
    .sort((a,b)=>a.id.localeCompare(b.id));
  // A stable pseudo-random choice survives reloads and is identical for AI/Human.
  const field=layout.field,stall=layout.stall;
  const seed=JSON.stringify([house.x,house.z,houseLevel,field?[field.x,field.z,field.columns,field.rows??null]:null,
    plots.map((p,i)=>p.id??p.plot_id??i+1),[stall.x,stall.z,stall.rotation],decorations.map(o=>[o.id,o.x,o.z,o.rotation,...o.cells])]);
  let hash=2166136261;
  for(let i=0;i<seed.length;i++)hash=Math.imul(hash^seed.charCodeAt(i),16777619)>>>0;
  const size=hash%2===0?.72:1.06;
  // Conservative horizontal bounds include arms and carrot, for either size.
  const bounds=[-.74*size,-.46*size,.74*size,.46*size];
  const houseRects=[...houseBaseRects(house),...houseExtensionRects(house,houseLevel)];
  const left=Math.min(...houseRects.map(r=>r[0])),right=Math.max(...houseRects.map(r=>r[2]));
  const front=Math.max(...houseRects.map(r=>r[3]));
  const terrain=createPlacementTerrain(plots,house,layout.field);
  const fixtures=[rectangle(layout.stall,[2,2]),...decorations.map(o=>rectangle(o,o.cells))];
  // Preserve existing nearby choices; only search farther if all are occupied.
  for(const [columns,rows]of [[3,2],[5,6]]){
    const available=[];
    for(const side of [-1,1])for(let outward=0;outward<columns;outward++)for(let row=0;row<rows;row++){
      const x=side<0?left-bounds[2]-.16-outward*CELL_SIZE:right-bounds[0]+.16+outward*CELL_SIZE;
      const z=front-bounds[1]+.16+row*CELL_SIZE;
      const area=[x+bounds[0],z+bounds[1],x+bounds[2],z+bounds[3]],polygon=boundsRectangle(area);
      if(terrain.canPlace(polygon)&&!houseRects.some(r=>intersects(polygon,boundsRectangle(r)))&&!fixtures.some(r=>intersects(polygon,r)))
        available.push({x,z,size,bounds:area});
    }
    if(available.length)return available[(hash>>>1)%available.length];
  }
  return null;
}
