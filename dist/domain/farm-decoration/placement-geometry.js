// Pure placement geometry, mirrored in the Farm authority and scene runtime.
export const CELL_SIZE = .94;
export const Z_ORIGIN = -1.44;
export function snapCells(cells, rotation = 0) {
  const eighth = ((Math.round(rotation / (Math.PI / 4)) % 8) + 8) % 8;
  return Math.floor(eighth / 2) % 2 ? [cells[1], cells[0]] : cells;
}
export const isTreeDecoration = model => ["cherry_tree", "maple_tree", "ginkgo_tree", "birch_tree", "pine_tree", "osmanthus_tree"].includes(model);
export const DECORATION_SUPPORT_BOUNDS = {"scarecrow":[-0.44,-0.27,0.44,0.27],"welcome_sign":[-0.36,-0.24,0.36,0.23],"mushroom_lamp":[-0.34,-0.34,0.34,0.34],"tea_table":[-0.87,-0.46,0.87,0.47],"rattan_chair":[-0.36,-0.32,0.36,0.31],"garden_string_lights":[-1.36,-0.14,1.36,0.14],"garden_mailbox":[-0.33,-0.27,0.33,0.27],"garden_bench":[-0.84,-0.37,0.84,0.29],"witch_cauldron":[-0.71,-0.5,0.54,0.61],"ghost_lamp":[-0.31,-0.3,0.31,0.3],"bat_arch":[-0.93,-0.08,0.93,0.37],"haunted_lantern":[-0.4,-0.34,0.42,0.34],"white_fence":[-0.55,-0.57,0.55,-0.34],"timber_fence":[-0.55,-0.57,0.55,-0.37],"ghost_fence":[-0.55,-0.57,0.55,-0.25]};
export function supportBounds(cells,model){return DECORATION_SUPPORT_BOUNDS[model]??[-cells[0]*CELL_SIZE/2,-cells[1]*CELL_SIZE/2,cells[0]*CELL_SIZE/2,cells[1]*CELL_SIZE/2];}
export function rectangle(pose, cells, model = pose.item_id?.startsWith("farm_decor:") ? pose.item_id.slice(11) : undefined) {
  const tree = isTreeDecoration(model), rotation = tree ? 0 : pose.rotation;
  if (tree) cells = [1, 1];
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const [x1,z1,x2,z2]=supportBounds(cells,model);
  return [[x1,z1],[x2,z1],[x2,z2],[x1,z2]].map(([x,z]) => {
    return [pose.x + c*x + s*z, pose.z - s*x + c*z];
  });
}
export function boundsRectangle([x1,z1,x2,z2]) {
  return [[x1,z1],[x2,z1],[x2,z2],[x1,z2]];
}
// Separating-axis test: touching edges are allowed, overlapping interiors are not.
export function intersects(a, b) {
  return [a,b].every(poly => poly.every((p,i) => {
    const q=poly[(i+1)%poly.length], nx=-(q[1]-p[1]), nz=q[0]-p[0];
    const pa=a.map(v=>v[0]*nx+v[1]*nz), pb=b.map(v=>v[0]*nx+v[1]*nz);
    const tolerance=1e-7*Math.hypot(nx,nz);
    return Math.max(...pa)>Math.min(...pb)+tolerance && Math.max(...pb)>Math.min(...pa)+tolerance;
  }));
}
export function touchedCells(poly) {
  const xs=poly.map(p=>p[0]/CELL_SIZE), zs=poly.map(p=>(p[1]-Z_ORIGIN)/CELL_SIZE);
  const left=Math.floor(Math.min(...xs)+1e-7), right=Math.ceil(Math.max(...xs)-1e-7);
  const top=Math.floor(Math.min(...zs)+1e-7), bottom=Math.ceil(Math.max(...zs)-1e-7);
  if (![left,right,top,bottom].every(Number.isSafeInteger)) return [];
  const result=[];
  for(let col=left;col<right;col++) for(let row=top;row<bottom;row++) {
    const x=col*CELL_SIZE,z=Z_ORIGIN+row*CELL_SIZE;
    if(intersects(poly,boundsRectangle([x,z,x+CELL_SIZE,z+CELL_SIZE])))result.push([col,row]);
  }
  return result;
}
