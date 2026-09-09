// Masks for the current 240 × 135 eye sheets: eyebrows are above row 45,
// upper lashes end at row 80 (types 1/2) or 90 (type 3). Iris starts at RGB 68+.
export function recolorEyelashes(source,width,id,color){
 const result=new Uint8ClampedArray(source);
 const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16));
 const bottom=Number(id.slice(-2))>=7?90:80;
 for(let y=45;y<bottom;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;
  if(!source[i+3]||Math.max(source[i],source[i+1],source[i+2])>=68)continue;
  for(let c=0;c<3;c++)result[i+c]=rgb[c];
 }
 return result;
}
