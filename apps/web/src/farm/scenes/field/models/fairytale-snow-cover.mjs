import * as T from 'three';

const snow = new T.MeshToonMaterial({color:'#edf3ed'});
export function snowSurface(surface, thickness = .11, minUpNormal = .35) {
  const cover = new T.Group(); cover.name = 'winter-snow-cover'; cover.userData.seasonOnly = 'winter'; cover.visible = false; surface.add(cover);
  const geometry = surface.geometry, pos = geometry.attributes.position, norm = geometry.attributes.normal, index = geometry.index;
  const points = [], triangles = [], edgeCounts = new Map();
  const count = index?.count ?? pos.count;
  const read = i => index ? index.getX(i) : i;
  const key = i => [pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>v.toFixed(5)).join(',');
  for (let i = 0; i < count; i += 3) {
    const ids = [read(i),read(i+1),read(i+2)];
    if (ids.reduce((n,id)=>n+norm.getY(id),0)/3 < minUpNormal) continue;
    const start = points.length / 3;
    for (const id of ids) points.push(pos.getX(id) + norm.getX(id)*thickness*.35,pos.getY(id)+thickness,pos.getZ(id)+norm.getZ(id)*thickness*.35);
    triangles.push(start,start+1,start+2);
    for (let e=0;e<3;e++) {
      const a=ids[e],b=ids[(e+1)%3],k=[key(a),key(b)].sort().join('|');
      const entry=edgeCounts.get(k); if(entry)entry.count++;else edgeCounts.set(k,{count:1,a,b});
    }
  }
  // Close only exposed edges: thick curved snow, never a rectangular roof slab.
  for (const {count,a,b} of edgeCounts.values()) if(count===1) {
    const start=points.length/3;
    for(const [id,top] of [[a,true],[b,true],[a,false],[b,false]]) points.push(pos.getX(id)+(top?norm.getX(id)*thickness*.35:0),pos.getY(id)+(top?thickness:.012),pos.getZ(id)+(top?norm.getZ(id)*thickness*.35:0));
    triangles.push(start,start+2,start+1,start+1,start+2,start+3);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(triangles);g.computeVertexNormals();
  const m = new T.Mesh(g,snow);m.castShadow=true;m.receiveShadow=true;cover.add(m);return cover;
}
export function snowLedge(parent, position, size) {
  const cover = new T.Group();cover.name='winter-snow-ledge';cover.userData.seasonOnly='winter';cover.visible=false;parent.add(cover);
  const slab=new T.Mesh(new T.CapsuleGeometry(1,1,3,12),snow);slab.rotation.z=Math.PI/2;
  // Capsule total axial length is 3; a shallow, rounded strip hugs the sill.
  slab.scale.set(size[1]/2,size[0]/3,size[2]/2);slab.position.set(...position);slab.castShadow=true;cover.add(slab);
  return cover;
}
export function setWinter(house, winter) {house.traverse(o=>{if(o.userData.seasonOnly==='winter')o.visible=winter;});}
