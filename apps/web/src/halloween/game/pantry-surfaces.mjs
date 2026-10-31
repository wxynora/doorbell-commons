import * as THREE from 'three';
// Baked once per surface: no animated noise and no per-frame texture work.
const cache=new Map(),TAU=Math.PI*2;
const hash=(x,y,z=0)=>{const n=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;return n-Math.floor(n);};
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function noise(x,y,z=0){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),a=smooth(x-ix),b=smooth(y-iy),c=smooth(z-iz);return mix(mix(mix(hash(ix,iy,iz),hash(ix+1,iy,iz),a),mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),a),b),mix(mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),a),mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),a),b),c);}
const palette={pomegranate:[[131,41,39],[181,75,54],[210,145,91]],cranberry:[[140,20,41],[190,38,54],[219,96,95]],yam:[[77,34,64],[139,66,101],[167,111,119]],apple:[[149,30,40],[209,70,57],[238,166,87]],berry:[[45,59,100],[96,112,157],[147,159,180]],chestnut:[[67,30,15],[139,74,36],[184,118,66]]};
function texture(data,w,h,srgb=false){const t=new THREE.DataTexture(data,w,h);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;}
export function pantrySurfaceMaps(kind){
 if(cache.has(kind))return cache.get(kind);
 const fruit=!!palette[kind],w=fruit?256:128,h=128,albedo=new Uint8Array(w*h*4),relief=new Uint8Array(w*h*4),rough=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,a=u*TAU,s=Math.sin(v*Math.PI),px=Math.cos(a)*s,py=Math.cos(v*Math.PI),pz=Math.sin(a)*s;
  const n=noise(px*5+7,py*5+9,pz*5+4),fine=noise(px*68+1,py*68+5,pz*68+2),grain=hash(x,y),i=(y*w+x)*4;
  let rgb=[255,255,255],height=.5,roughness=.85;
  if(fruit){
   const [dark,base,light]=palette[kind],large=noise(px*2.3+3,py*2.3+7,pz*2.3+11),shade=.55+n*.45;
   rgb=base.map((c,k)=>mix(dark[k],c,shade));
   if(kind==='cranberry'){
    const blush=Math.max(0,large-.48)*1.45;rgb=rgb.map((c,k)=>mix(c,light[k],blush));
    const lenticel=Math.max(0,fine-.66)*.8;rgb=rgb.map((c,k)=>mix(c,light[k],lenticel));
    // Small recessed blossom scar on the front; UV follows the actual berry.
    const d=v*Math.PI,angle=u*TAU;
    const edge=.070+.012*Math.cos(angle*4);if(d<edge){const rim=smooth(Math.min(1,d/edge));rgb=[48,24,17].map((c,k)=>mix(c,[135,88,56][k],rim));height=.22+.15*rim;}
    else height=.50+(fine-.5)*.08;
    roughness=.42+.16*n+.08*fine;
   }else if(kind==='yam'){
    const stripes=noise(Math.cos(a)*10+20,v*2.4,Math.sin(a)*10+20),patch=noise(Math.cos(a)*15,v*20,Math.sin(a)*15);
    rgb=rgb.map((c,k)=>mix(c,light[k],Math.max(0,stripes-.45)*.28));
    const scuff=Math.max(0,patch-.72)*.7;rgb=rgb.map((c,k)=>mix(c,[202,164,124][k],scuff));
    const wrinkle=Math.sin(v*125+noise(Math.cos(a)*8,v*10,Math.sin(a)*8)*5);
    height=.5+(fine-.5)*.24+Math.max(0,wrinkle-.85)*.26;roughness=.77+.16*n;
    // Root eyes/scars are short, irregular marks, not straight decorative dashes.
    for(const [eu,ev,ew]of [[.21,.24,.013],[.30,.46,.019],[.17,.69,.014],[.45,.34,.01],[.69,.59,.017],[.82,.78,.013]]){
     let du=Math.abs(u-eu);du=Math.min(du,1-du);const e=(du/ew)**2+((v-ev)/.008)**2;
     if(e<1.7){const b=Math.exp(-e*2)*.75;rgb=rgb.map((c,k)=>mix(c,[64,30,36][k],b));height-=b*.24;}
    }
   }else{
    if(kind==='chestnut'&&v>.76+.015*Math.sin(a*7)){rgb=[182,144,91].map(c=>c*(.88+.16*fine));roughness=.9;}
    const speck=kind==='apple'?Math.max(0,fine-.65)*1.5:0;rgb=rgb.map((c,k)=>mix(c,light[k],.1+speck));height=.5+(fine-.5)*.13;roughness=kind==='chestnut'?.39+n*.15:.5+n*.18;
   }
  }else{
   let value=1;
   if(kind==='wood'){const g=Math.sin(x*.12+noise(x*.035,y*.025)*5);value=.88+g*.055; height=.5+g*.15+(grain-.5)*.08;roughness=.72;}
   else if(kind==='paper'){value=.92+grain*.08;height=.5+(grain-.5)*.25;roughness=.91;}
   else if(kind==='food'){value=.92+grain*.08;height=.45+grain*.2;roughness=.80;}
   else if(kind==='cream'){value=.98+grain*.02;height=.5+(grain-.5)*.035;roughness=.70;}
   else if(kind==='metal'){value=.97+grain*.03;height=.5+Math.sin(y*3.5)*.035;roughness=.42;}
   else{value=.98+grain*.02;height=.5+(grain-.5)*.06;roughness=.60;}
   rgb=rgb.map(c=>c*value);
  }
  for(let k=0;k<3;k++){albedo[i+k]=rgb[k];relief[i+k]=Math.max(0,Math.min(255,height*255));rough[i+k]=roughness*255;}albedo[i+3]=relief[i+3]=rough[i+3]=255;
 }
 const maps={map:texture(albedo,w,h,true),bumpMap:texture(relief,w,h),roughnessMap:texture(rough,w,h)};cache.set(kind,maps);return maps;
}
export function detailPantryMaterial(material,kind){
 const maps=pantrySurfaceMaps(kind);material.map??=maps.map;material.bumpMap=maps.bumpMap;material.bumpScale=kind==='cranberry'?.0012:kind==='yam'?.005:kind==='paper'?.003:kind==='wood'?.006:.0035;
 material.roughnessMap=maps.roughnessMap;material.roughness=1;material.userData.pantryDetailed=true;return material;
}
