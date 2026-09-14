import * as T from 'three';
// Palette order: sofa, cushion, sage seats, peach seats, blue seats, cabinet,
// cabinet doors, woven rug, rug ground, wall. Wooden framing stays unchanged.
const keys=['edc77e','f3d395','aaba91','e7b49b','b2bfbb','fff2d8','abc78e','rug','d8d7b6','f2e3c9'];
const palettes={
 christmas:['#b96f6d','#f3debf','#88a795','#d8b68e','#acbdb3','#fcf0d8','#8baa93','#e9ddc8','#9eaf99','#efe7d6'],
 halloween:['#b4a0c7','#eadfee','#d6b281','#cba0ae','#a6bbc3','#f4e9df','#bcadca','#e4dbe7','#bca9ca','#ede0dd'],
 'mid-autumn':['#e1adba','#f9e4d2','#d5bd87','#e0c3cc','#bfc5d1','#fff5e5','#ceb8c5','#e8d9d1','#d4b4b8','#f4e5d7'],
 chongyang:['#d9ad60','#f5deb0','#aeba8b','#d9b994','#bec8a0','#fbefd7','#b2bd8c','#e4dcc1','#c6bc94','#f0e6cb'],
 winter:['#aabfd0','#e3edf0','#bdcbd2','#d9b2bc','#d3c6d8','#f7f1ec','#b8cbd6','#dfe5eb','#b9cbd8','#e6e9e7'],
 'new-year':['#bd6d68','#f3d7bf','#d0ad77','#d89995','#cbaab0','#fff0d7','#c8857b','#e9c9b9','#c99183','#f3e0d1'],
 lantern:['#d39ba7','#f8dedc','#c7b9d3','#e3bc9b','#b6c8cc','#fff2e4','#d1afc2','#eadbe6','#c7afcb','#f2e1e4']
};
export function createFestivalPalette(room){
 const originals=new Map();room.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.color&&!originals.has(m))originals.set(m,{color:m.color.clone(),map:m.map,rug:o.name==='rug-plaid'});});
 let current='ordinary',rugTexture=null;
 function apply(kind){if(current===kind)return;current=kind;rugTexture?.dispose();rugTexture=null;const values=palettes[kind],colors=values?Object.fromEntries(keys.map((k,i)=>[k,values[i]])):{};
  for(const [m,original] of originals){m.color.copy(original.color);m.map=original.map;if(values){const color=colors[original.color.getHexString()];if(color)m.color.set(color);if(original.rug){if(!rugTexture){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle=colors.rug;x.fillRect(0,0,128,128);x.strokeStyle='#fff5e7';x.lineWidth=4;x.strokeRect(8,8,112,112);rugTexture=new T.CanvasTexture(c);rugTexture.colorSpace=T.SRGBColorSpace;}m.map=rugTexture;m.color.set('#ffffff');}}m.needsUpdate=true;}
 }
 return {apply,dispose(){apply('ordinary');}};
}
