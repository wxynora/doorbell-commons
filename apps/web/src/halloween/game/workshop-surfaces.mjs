import * as THREE from 'three';
import {paint} from './model-kit-v4.mjs';

// Grain belongs to the material, rather than hundreds of separately drawn specks.
function ironMaterial() {
  const data=new Uint8Array(64*64*4);let seed=17;for(let i=0;i<64*64;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=228+(seed%28);data.set([v,v,v,255],i*4);}
  const grain=new THREE.DataTexture(data,64,64);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(4,2);grain.needsUpdate=true;
  return new THREE.MeshStandardMaterial({color:'#393445',map:grain,bumpMap:grain,bumpScale:.006,roughness:.47,metalness:.48});
}
export function cookwareMaterials() {
  return {
    get iron(){return ironMaterial();},
    brass:paint('#bc9656','metal',{roughness:.35,metalness:.82,clearcoat:0}),
    wood:paint('#b68754','wood',{roughness:.63,bumpScale:.0025}),
    ceramic:paint('#e5dac3','glaze',{roughness:.43,clearcoat:.22}),
    trim:paint('#716b86','glaze',{roughness:.54,clearcoat:.18}),
  };
}

export function syrupMaterial() {
  return new THREE.MeshPhysicalMaterial({color:'#fff0bd',roughness:.16,metalness:0,clearcoat:.7,clearcoatRoughness:.12});
}
