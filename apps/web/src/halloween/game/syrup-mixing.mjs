import {Color,MathUtils} from 'three';
// Mixing is driven by spoon travel. Rendering or waiting never advances it.
export class SyrupMixing {
 constructor(){this.reset();}
 reset(){this.color=new Color('#e3bc84');this.target=this.color.clone();this.patches=[];this.rotation=0;}
 add(targetHex,ingredientHex){this.target.set(targetHex);this.patches.push({color:new Color(ingredientHex),travel:0});}
 stir(radians){const travel=Math.abs(radians);if(!travel)return;this.rotation+=radians;this.color.lerp(this.target,1-Math.exp(-travel*.55));for(const patch of this.patches)patch.travel+=travel;this.patches=this.patches.filter(p=>p.travel<Math.PI*3);}
 paint(positions,colors){
  const color=new Color();
  for(let i=0;i<positions.count;i++){
   const x=positions.getX(i),z=-positions.getY(i),r=Math.hypot(x,z),a=Math.atan2(z,x);color.copy(this.color);
   for(const patch of this.patches){
    const progress=1-Math.exp(-patch.travel*.5),angle=a-this.rotation*(.3+r*.3),px=Math.cos(angle)*r,pz=Math.sin(angle)*r;
    const radius=.29+progress*.53,distance=Math.hypot(px+.20,pz-.10);
    const feather=1-MathUtils.smoothstep(distance,radius*.25,radius);
    color.lerp(patch.color,feather*(1-progress)*.9);
   }
   colors.setXYZ(i,color.r,color.g,color.b);
  }
  colors.needsUpdate=true;
 }
}
