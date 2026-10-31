import {sculptPantryObject} from './pantry-sculpted-v6.mjs';
import {finishPoolModel} from './pool-style.mjs';
import * as THREE from 'three';
import {paint,piece,lathe,ring,ball,extrude,bakeModel,block,pipe,petal,retainModelResources} from './model-kit-v4.mjs';
export const POUR_LIQUID_COLORS=Object.freeze({'蜂蜜':'#eab336','牛奶':'#fff6de','枫糖浆':'#cb8032','桂花蜜':'#f0c14d','月光露':'#93c9ed','永夜花蜜':'#9872cc','幽灵蜂后蜜':'#bd85e1','极光糖浆':'#82d5c8'});
const templates=new Map();
function realPantryObject(name,open=false,liquidColor=null){
 const g=new THREE.Group();
 if(name==='蜂蜜'||name==='牛奶'){
  const milk=name==='牛奶',brass=paint('#b28a47','metal',{metalness:1}),profile=milk?[[0,.03],[.2,.03],[.24,.1],[.24,.68],[.17,.81],[.12,.86],[.12,.99],[.10,.99],[.1,.86],[.15,.79],[.215,.67],[.215,.12],[0,.08]]:[[0,.04],[.25,.04],[.36,.13],[.4,.3],[.38,.58],[.28,.72],[.26,.8],[.23,.8],[.23,.72],[.34,.57],[.36,.3],[.33,.15],[.23,.1],[0,.1]];
  const glass=new THREE.MeshPhysicalMaterial({color:'#f2e9d7',transparent:true,opacity:.24,depthWrite:false,roughness:.08,ior:1.47,clearcoat:1,envMapIntensity:1.5});g.add(lathe(profile,glass));
  const contents=milk?[[0,.09],[.2,.09],[.21,.65],[.14,.78],[0,.78]]:[[0,.12],[.25,.12],[.34,.21],[.35,.55],[.29,.66],[0,.66]];g.add(lathe(contents,paint(liquidColor??(milk?'#f3ead4':'#c98b24'),milk?'glaze':'jelly',{roughness:milk?.46:.15,clearcoat:milk?.12:.8})));
  const y=milk?1.01:.82;if(!open)g.add(lathe([[0,0],[milk?.13:.27,0],[milk?.14:.28,.04],[milk?.13:.27,.08],[0,.08]],milk?paint('#7695b6','glaze',{roughness:.5}):brass,[0,y,0]),ring(milk?.13:.27,.012,brass,[0,y+.015,0]));return g;
 }
 return g;
}
function sugarCanister(open=false,name='白砂糖',contents='#f6f0d7'){
 const g=new THREE.Group(),gold=paint('#b38a4a','metal',{metalness:1,roughness:.28}),purple=paint('#593449','glaze',{roughness:.33,clearcoat:.4});
 const profile=[[0,.04],[.24,.04],[.37,.1],[.42,.2],[.42,.64],[.35,.74],[.32,.76],[.32,.81],[.29,.81],[.29,.75],[.32,.71],[.38,.62],[.38,.21],[.34,.14],[.22,.1],[0,.1]];
 const glass=new THREE.MeshPhysicalMaterial({color:'#efe9dd',roughness:.1,transparent:true,opacity:.24,depthWrite:false,ior:1.47,clearcoat:1,envMapIntensity:1.4});g.add(lathe(profile,glass,[0,0,0],8));
 g.add(lathe([[0,.11],[.25,.11],[.36,.17],[.37,.54],[0,.54]],paint(contents,'sugar',{roughness:.94}),[0,0,0],8));
 for(let i=0;i<55;i++){const a=i*2.399,r=.33*Math.sqrt((i+.5)/55),crystal=piece(new THREE.OctahedronGeometry(.014+(i%3)*.004),paint(i%3?'#fff9e7':'#ded5bf','sugar'),[Math.cos(a)*r,.548+Math.sin(i*3)*.005,Math.sin(a)*r]);crystal.rotation.set(i*.5,i*.7,i*.2);g.add(crystal);}
 if(!open)g.add(ring(.326,.02,gold,[0,.79,0]),lathe([[0,.8],[.33,.8],[.37,.83],[.36,.87],[.27,.93],[0,.95]],purple,[0,0,0],48),ring(.348,.018,gold,[0,.84,0]),ball(.065,gold,[0,.99,0],[1,.6,1]));
 const plate=new THREE.Shape();plate.absellipse(0,0,.255,.132,0,Math.PI*2);const label=extrude(plate,.014,paint('#ead7ad'),[0,.37,.407],.008);g.add(label);const rim=ring(.252,.01,gold,[0,.37,.422],'z');rim.scale.y=.53;g.add(rim);
 const mat=paint('#745235');if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,256);ctx.font='bold 100px "Songti SC",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#65412d';ctx.fillText(name,256,133);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const face=new THREE.Mesh(new THREE.PlaneGeometry(.43,.21),new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.8,depthWrite:false}));face.position.set(0,.37,.425);g.add(face);}
 return g;
}
function template(name){if(templates.has(name))return templates.get(name);const g=sculptPantryObject(name);if(!g)throw new Error(`Unknown pantry material: ${name}`);g.rotation.x=.4;const baked=bakeModel(g),center=new THREE.Box3().setFromObject(baked).getCenter(new THREE.Vector3());for(const p of baked.children)p.geometry.translate(-center.x,-center.y,-center.z);retainModelResources(baked);templates.set(name,baked);return baked;}
export function createFoodModel(name,tier='N',size=null){const model=template(name).clone(true);if(size){const b=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.scale.setScalar(Math.min(size[0]/b.x,size[1]/b.y,size[2]/b.z));}model.userData.ingredient=name;return model;}
// Matching-game objects and the cooking desk share the same sculpted inventory.
const pileTemplates=new Map();
function poolModel(name,tier){
 if(pileTemplates.has(name))return pileTemplates.get(name).clone(true);
 const sculpted=sculptPantryObject(name);
 if(!sculpted)throw new Error(`Unknown pantry material: ${name}`);
 const model=sculpted;model.rotation.x=.4;pileTemplates.set(name,retainModelResources(bakeModel(model)));
 return pileTemplates.get(name).clone(true);
}

export function createPileFoodModel(name,tier='N',size=null){const m=poolModel(name,tier),g=new THREE.Group();m.rotation.x=-Math.PI/2;g.add(m);g.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(g),center=b.getCenter(new THREE.Vector3());m.position.sub(center);g.updateMatrixWorld(true);const dimensions=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());g.scale.setScalar(size?Math.min((size[0]-.01)/dimensions.x,(size[1]-.01)/dimensions.y,(size[2]-.01)/dimensions.z):1.12/Math.max(dimensions.x,dimensions.z));g.userData.ingredient=name;return finishPoolModel(g);}

// Contents are separate meshes: paper, glass, lids and labels stay on the desk.
export function createIngredientPiece(name){
 const root=new THREE.Group();
 if(['黄油','焦糖','魔女秘制焦糖','黑巧克力'].includes(name))root.add(block(.27,.18,.18,paint(name==='黄油'?'#efd48b':name==='黑巧克力'?'#704633':'#c79257',name==='黄油'?'sugar':'jelly',{roughness:.65}),[0,0,0],.025));
 else if(['南瓜泥','幽灵奶霜','骷髅糖霜','黑猫私藏奶油'].includes(name))root.add(ball(.14,paint(name==='南瓜泥'?'#dd7b20':'#f5e6cc','sugar',{roughness:.82}),[0,0,0],[1.1,.6,.75]));
 else if(name==='香草荚')root.add(pipe([[-.1,-.15,0],[-.01,-.04,.006],[.015,.09,0],[.09,.15,.01]],.017,paint('#665142','wood'),12));
 else if(name==='玉米粒')root.add(ball(.1,paint('#eacb70','fruit',{roughness:.7}),[0,0,0],[.8,1,.65]));
 else if(name==='魔女紫罗兰花瓣'){const leaf=petal(.25,.1,'#a080b5');leaf.position.y=-.12;root.add(leaf);}
 else{const food=createFoodModel(name,'N',[.28,.28,.28]);food.rotation.x=-.4;root.add(food);}
 root.userData.ingredient=name;return root;
}
export function createPourVessel(name){
 const liquidColor=POUR_LIQUID_COLORS[name],powderColor={'砂糖':'#fff5dc','红糖':'#ab663a','星屑糖粉':'#e6d6ff','幽光岩盐':'#b5e9df','金南瓜籽':'#d8ac49'}[name];
 const bottle=liquidColor&&!['蜂蜜','枫糖浆','桂花蜜','永夜花蜜','幽灵蜂后蜜'].includes(name),root=powderColor?sugarCanister(true,name,powderColor):realPantryObject(bottle?'牛奶':'蜂蜜',true,liquidColor);
 root.position.y=-.4;const g=new THREE.Group();g.add(root);g.scale.setScalar(.7);g.userData.mouth=powderColor?[0,.4,0]:[bottle?.085:.2,bottle?.59:.4,0];g.userData.correctTilt=0;return g;
}
