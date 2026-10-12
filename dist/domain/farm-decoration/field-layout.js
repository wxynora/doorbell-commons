// Mirrored by Farm authority and the scene; IDs remain gameplay identities.
import { CELL_SIZE, boundsRectangle, intersects } from "./placement-geometry.js";

const plotIndex = (plot, index) => (plot.id ?? plot.plot_id ?? index + 1) - 1;
const slots = plots => plots.reduce((end, plot, index) => Math.max(end, plotIndex(plot, index) + 1), 0);
export function defaultFieldLayout(plots = []) {
  const rows = Math.ceil(slots(plots) / 6);
  return { x: 0, z: -.97 + Math.max(0, rows - 1) * CELL_SIZE / 2, columns: 6 };
}
function singleFieldPlots(plots, field, dense = false) {
  const rows = field.rows ?? Math.ceil((dense?plots.length:slots(plots)) / field.columns);
  return plots.map((plot, index) => {
    const i = dense ? index : plotIndex(plot, index);
    return { ...plot,
      x: field.x + ((field.rows ? Math.floor(i / rows) : i % field.columns) - (field.columns - 1) / 2) * CELL_SIZE,
      z: field.z + ((field.rows ? i % rows : Math.floor(i / field.columns)) - (rows - 1) / 2) * CELL_SIZE,
    };
  });
}
export function fieldGroups(plots, field = defaultFieldLayout(plots)) {
  if (!field.groups) return [{...field,plot_ids:plots.map((p,i)=>plotIndex(p,i)+1)}];
  return field.groups.map(group=>({...group,x:field.x+group.x,z:field.z+group.z}));
}
export function fieldPlots(plots = [], field = defaultFieldLayout(plots)) {
  if (!field.groups) return singleFieldPlots(plots,field);
  const positions=new Map();
  for(const group of fieldGroups(plots,field)){
    const members=group.plot_ids.map(id=>plots.find((p,i)=>plotIndex(p,i)+1===id)).filter(Boolean);
    for(const plot of singleFieldPlots(members,group,true))positions.set(plot.id??plot.plot_id,plot);
  }
  return plots.map((p,i)=>positions.get(p.id??p.plot_id??i+1)??p);
}
// Land expansion appends only new IDs; existing groups and their centers stay intact.
export function normalizeFieldLayout(field, plots) {
  if(!field?.groups?.length)return field?structuredClone(field):field;
  const next=structuredClone(field),ids=next.groups.flatMap(g=>g.plot_ids);
  if(next.rows)next.columns=Math.ceil(slots(plots)/next.rows);
  if(!ids.every(Number.isSafeInteger))return next;
  const maximum=Math.max(0,...ids),extra=plots.map((p,i)=>plotIndex(p,i)+1).filter(id=>id>maximum);
  if(extra.length){
    const snapped=snapFieldPosition(next.x,next.z,plots),dx=next.x-snapped.x,dz=next.z-snapped.z;
    for(const group of next.groups){group.x+=dx;group.z+=dz;}
    Object.assign(next,snapped);
    const last=next.groups.at(-1);last.plot_ids.push(...extra);if(last.rows)last.columns=Math.ceil(last.plot_ids.length/last.rows);
  }
  return next;
}
export function snapFieldPosition(x, z, plots) {
  const origin = defaultFieldLayout(plots);
  return { x: Math.round(x / CELL_SIZE) * CELL_SIZE,
    z: origin.z + Math.round((z - origin.z) / CELL_SIZE) * CELL_SIZE };
}
const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).length===keys.length&&keys.every(k=>Object.hasOwn(object,k));
export function validFieldLayout(field, plots) {
  if(!exact(field,['x','z','columns',...(Object.hasOwn(field??{},'rows')?['rows']:[]),...(Object.hasOwn(field??{},'groups')?['groups']:[])]))return false;
  if (!field || ![field.x, field.z].every(Number.isFinite) ||
      !Number.isSafeInteger(field.columns) || field.columns < 1 ||
      field.columns > Math.max(6, slots(plots))) return false;
  if (field.rows !== undefined && (!Number.isSafeInteger(field.rows) || field.rows < 1 ||
      field.rows > slots(plots) || field.columns !== Math.ceil(slots(plots) / field.rows))) return false;
  const snapped = snapFieldPosition(field.x, field.z, plots);
  if(Math.abs(field.x - snapped.x)>=1e-7||Math.abs(field.z-snapped.z)>=1e-7)return false;
  if(!Object.hasOwn(field,'groups'))return true;
  if(!Array.isArray(field.groups)||!field.groups.length)return false;
  const ids=new Set(plots.map((p,i)=>plotIndex(p,i)+1)),seen=new Set();
  for(const group of field.groups){
    if(!exact(group,['x','z','columns','plot_ids',...(Object.hasOwn(group??{},'rows')?['rows']:[])])||
       ![group.x,group.z].every(v=>Number.isFinite(v)&&Math.abs(v/(CELL_SIZE/2)-Math.round(v/(CELL_SIZE/2)))<1e-7)||
       !Array.isArray(group.plot_ids)||!group.plot_ids.length||!Number.isSafeInteger(group.columns)||group.columns<1||group.columns>Math.max(6,group.plot_ids.length))return false;
    if(group.rows!==undefined&&(!Number.isSafeInteger(group.rows)||group.rows<1||group.rows>group.plot_ids.length||group.columns!==Math.ceil(group.plot_ids.length/group.rows)))return false;
    for(const id of group.plot_ids){if(!Number.isSafeInteger(id)||!ids.has(id)||seen.has(id))return false;seen.add(id);}
  }
  return seen.size===ids.size;
}
export const fieldRects = (plots, field) => fieldPlots(plots, field)
  .map(p => [p.x - .435, p.z - .456, p.x + .435, p.z + .456]);
export function canPlaceField(field, plots, terrain, fixtures = []) {
  if (!validFieldLayout(field, plots)) return false;
  const polygons=fieldRects(plots,field).map(boundsRectangle);
  return polygons.every((polygon,i)=>terrain.canPlace(polygon)&&!fixtures.some(other=>intersects(polygon,other))&&
    !polygons.slice(0,i).some(other=>intersects(polygon,other)));
}
