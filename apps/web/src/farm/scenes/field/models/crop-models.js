import * as T from "three";
import { palette, mesh, beam, leafGeometry } from "./primitives.js";

// These are seed-category silhouettes, not invented identities for unrevealed crops.
export function createCropModel(plot) {
  if (plot.state === "empty" || !plot.seed_type) return null;
  const root = new T.Group(), mat = palette(), ripe = plot.state === "ripe";
  root.name = `crop-${plot.seed_type}-${plot.state}`;
  root.userData.plot = plot;
  const green = mat("#699951"), pale = mat("#a3c36b");
  const leaf = (parent, at, angle, size, material = green) => {
    const item = mesh(parent, leafGeometry(), material, at, [size * .65, size, size]);
    item.rotation.set(.9, angle, 0);
  };
  const sphere = (parent, material, at, scale) => mesh(parent, new T.SphereGeometry(1, 12, 8), material, at, scale);
  if (plot.seed_type === "common") {
    // Young broad-leaf clumps become full leafy vegetables with warm fruit clusters.
    for (const [x,z] of [[-.18,-.16],[.18,-.16],[0,.19]]) {
      const h = ripe ? .3 : .14;
      beam(root, green, [x,0,z], [x,h,z], .014);
      for (let i=0;i<(ripe?8:4);i++) leaf(root,[x,h*.35,z],i*Math.PI/2,ripe?.23:.14,i%2?pale:green);
      if (ripe) for (let i=0;i<3;i++) sphere(root,mat(i===0?"#e8b755":"#d96e49"),[x+Math.cos(i*2.1)*.07,h+.03,z+Math.sin(i*2.1)*.07],[.075,.08,.075]);
    }
  } else if (plot.seed_type === "fantasy") {
    // Curled teal shoots open into bell-like, crystalline lavender blooms.
    const teal=mat("#62aaa0"), bloom=mat("#b3a0dd"), pearl=mat("#f6d59c");
    for (let i=0;i<3;i++) {
      const x=(i-1)*.19,z=i%2?.16:-.12,h=ripe?.51:.23;
      beam(root,teal,[x,0,z],[x+.035,h,z],.016);
      for(let j=0;j<4;j++) leaf(root,[x,.07+j*.035,z],j*2.3,ripe?.17:.11,teal);
      const bud=mesh(root,new T.OctahedronGeometry(ripe?.14:.07),bloom,[x+.035,h,z]);
      bud.scale.y=ripe?1.2:1.6;
      if(ripe) {
        for(let j=0;j<5;j++) sphere(root,bloom,[x+.035+Math.cos(j*1.256)*.085,h-.045,z+Math.sin(j*1.256)*.085],[.058,.08,.058]);
        sphere(root,pearl,[x+.035,h+.1,z],[.037,.045,.037]);
      }
    }
  } else if (plot.seed_type === "limited") {
    // Pink folded buds grow into layered golden-centred blossoms on ruby stems.
    const stem=mat("#96845c"), pink=mat("#e88fba"), light=mat("#f5bccc"), gold=mat("#e2b64f");
    for (const [x,z,h] of [[-.17,-.1,.37],[.18,-.06,.47],[0,.2,.3]]) {
      const height=ripe?h:h*.5;
      beam(root,stem,[x,0,z],[x,height,z],.018);
      for(let j=0;j<4;j++) leaf(root,[x,.02+j*.035,z],j*1.9,ripe?.18:.12,pale);
      if (!ripe) sphere(root,pink,[x,height,z],[.06,.09,.06]);
      else {
        for(let ring=0;ring<2;ring++) for(let j=0;j<7;j++) {
          const a=j*Math.PI*2/7+ring*.4,r=ring?.065:.11;
          const petal=sphere(root,ring?light:pink,[x+Math.cos(a)*r,height+ring*.025,z+Math.sin(a)*r],[.08,.035,.055]);
          petal.rotation.y=-a;
        }
        sphere(root,gold,[x,height+.055,z],[.055,.03,.055]);
      }
    }
  }
  root.traverse(o=>{if(o.isMesh)o.userData.plot=plot;});
  return root;
}
