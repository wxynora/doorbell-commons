// Accessory masks are tied to the current cropped sprites, not the avatar position.
export function isAccessory(id,x,y,l){
 const n=Number(id.slice(-2));
 if(n===20)return y<100+0.0045*(x-114)**2;
 if(n===7)return x>165&&x<215&&y>100&&y<167&&l<110;
 if(n===8)return x>164&&y>183&&y<245&&l<125;
 if(n===10)return x<65&&y>210&&l<115;
 if(n===12)return x>70&&x<148&&y>90&&y<146&&l>125;
 if(n===13)return x>164&&y>170&&l<106 || x>197&&x<220&&y>168&&y<202&&l>165;
 if(n===16)return x>160&&y>170&&l<120;
 if(n===18)return x>172&&y>178&&l<120;
 return false;
}
export function recolorHair(pixels,width,id,color){
 const out=new Uint8ClampedArray(pixels),hist=new Uint32Array(256);let count=0;
 const lum=i=>pixels[i]*.3+pixels[i+1]*.59+pixels[i+2]*.11;
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<128||isAccessory(id,i/4%width,Math.floor(i/4/width),lum(i)))continue;hist[Math.round(lum(i))]++;count++;}
 let base=0,total=0;for(;base<255;base++){total+=hist[base];if(total>=count/2)break;}
 const rgb=color.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));
 for(let i=0;i<pixels.length;i+=4){
  const l=lum(i);if(!pixels[i+3]||isAccessory(id,i/4%width,Math.floor(i/4/width),l))continue;
  const shade=Math.max(-.55,Math.min(.55,(l-base)/Math.max(40,base)*.65));
  for(let k=0;k<3;k++)out[i+k]=shade<0?rgb[k]*(1+shade):rgb[k]+(255-rgb[k])*shade;
 }
 return out;
}
