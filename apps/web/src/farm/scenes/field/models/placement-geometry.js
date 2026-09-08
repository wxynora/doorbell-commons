// Pure placement geometry, mirrored in the Farm authority and scene runtime.
export const CELL_SIZE = .94;
export const Z_ORIGIN = -1.44;
export function snapCells(cells, rotation = 0) {
  const eighth = ((Math.round(rotation / (Math.PI / 4)) % 8) + 8) % 8;
  return Math.floor(eighth / 2) % 2 ? [cells[1], cells[0]] : cells;
}
export function rectangle(pose, cells) {
  const c = Math.cos(pose.rotation), s = Math.sin(pose.rotation);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => {
    x *= cells[0] * CELL_SIZE / 2; z *= cells[1] * CELL_SIZE / 2;
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
