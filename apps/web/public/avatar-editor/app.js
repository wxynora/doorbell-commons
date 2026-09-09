import {recolorEyelashes} from './eyelash-color.js';
import {accessories,accessoryState,drawAccessories} from './accessories.js';
import {recolorHair} from './hair-color.js';
import {createLiquifyRenderer,installLiquify} from './liquify.js';
const liquifiedHair=createLiquifyRenderer();let updateLiquify=()=>{};
const $=s=>document.querySelector(s),canvas=$('#avatar'),ctx=canvas.getContext('2d');
const hairs=await(await fetch('hairs.json')).json();
const clothes=await(await fetch('clothes.json')).json();
const liquifiedClothes=createLiquifyRenderer();
const mouths=await(await fetch('mouths.json')).json();
const bodies=await(await fetch('bodies.json')).json();
const eyes=Array.from({length:9},(_,i)=>({id:'eyes-'+String(i+1).padStart(2,'0'),label:'眼型 '+(Math.floor(i/3)+1)+' · '+['微弯','上挑','下垂'][i%3],src:'eyes/eyes-'+String(i+1).padStart(2,'0')+'.webp'}));
const images=new Map();await Promise.all([...hairs.map(i=>i.src),...clothes.map(i=>i.src),...bodies.flatMap(i=>Object.values(i.variants)),...eyes.map(i=>i.src),...mouths.map(i=>i.src)].map(src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images.set(src,im);resolve()};im.onerror=reject;im.src=src})));
const eyeType2Defaults=()=>({iris:{x:0,y:16,scale:110},highlight:{x:-3,y:-6,scale:200}});
const eyeType1Defaults=()=>({iris:{spacing:-4,x:0,y:9,scale:100},highlight:{spacing:-11,x:-3,y:-6,scale:200}});
const eyeType3Defaults=()=>({iris:{spacing:-3,x:0,y:2,scale:110},highlight:{spacing:-13,x:-4,y:-7,scale:200}});
const preset=await(await fetch('preset.json')).json();
const defaults=()=>structuredClone(preset);
let state=defaults(),category='mouth',editTarget='iris',closeup=false;
const portrait=new URLSearchParams(location.search).get('mode')==='portrait';
let revision=0,residentId=null,loadFailed=false;
function applyManifest(m){state=defaults();if(!m)return;Object.assign(state,{skin:m.skin,hair:m.hair,eyes:m.eyes,mouth:m.mouth,clothes:m.clothes,color:m.hair_color,irisColor:m.iris_color,eyelashColor:m.eyelash_color});state.accessories={mole:{...m.mole}};}
function manifest(){const mole=accessoryState(state,'mole');return {version:1,catalog_version:1,skin:state.skin,hair:state.hair,eyes:state.eyes,mouth:state.mouth,clothes:state.clothes,color:undefined,hair_color:state.color||null,iris_color:state.irisColor,eyelash_color:state.eyelashColor||null,mole:{enabled:mole.enabled,x:mole.x,y:mole.y,scale:mole.scale,color:mole.color||'#57443b'}};}
try{
 const requested=new URLSearchParams(location.search).get('resident');
 const response=await fetch(requested?'/api/residents/'+encodeURIComponent(requested)+'/avatar':'/api/resident-avatar',{credentials:'same-origin',cache:'no-store'});
 const saved=await response.json();if(!response.ok)throw Error(saved.error?.message||'形象暂时无法读取');
 residentId=saved.resident_id;revision=saved.revision;applyManifest(saved.manifest);
 if(portrait&&!saved.manifest)document.body.dataset.empty='true';
}catch(error){loadFailed=true;document.querySelector('#status').textContent=error.message;}
if(portrait)document.body.classList.add('portrait-only');
state.body='base-blank';if(state.eyes===undefined)state.eyes='eyes-01';state.adjust.eyes??={spacing:-3,x:0,y:-18,scale:90};
state.adjust.iris??={x:0,y:0,scale:100};state.adjust.highlight??={x:0,y:0,scale:100};
if(state.mouth===undefined)state.mouth='mouth-01';state.adjust.mouth??={x:0,y:0,scale:80};
if(state.mouth&&!mouths.some(m=>m.id===state.mouth))state.mouth='mouth-01';
if(state.faceFitVersion!==1){
 state.adjust.eyes={...state.adjust.eyes,spacing:-3,x:0,y:-18,scale:90};
 state.adjust.mouth.scale=80;
 for(const adjustment of Object.values(state.mouthAdjustments||{}))adjustment.scale=80;
 state.faceFitVersion=1;
}
state.irisColor??='#d9aa68';
state.clothes??=null;
if(state.clothes&&!clothes.some(c=>c.id===state.clothes))state.clothes=null;
if(state.liquifyResetVersion!==1){
 state.hairLiquify={};state.liquifyResetVersion=1;

}
if(state.hair&&!hairs.some(h=>h.id===state.hair))state.hair=null;
const irisSources=await Promise.all(eyes.map(async e=>[e.id,await(await fetch('iris/'+e.id+'.svg')).text()]));
const irisShapes=new Map(irisSources.map(([id,svg])=>{
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
 const clips=[...doc.querySelectorAll('clipPath path')];
 const groups=[...doc.documentElement.children].filter(n=>n.localName==='g');
 return [id,groups.map((g,i)=>({
  clip:new Path2D(clips[i].getAttribute('d')),
  circles:[...g.querySelectorAll('circle')].map(c=>({x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy')),r:Number(c.getAttribute('r'))}))
 }))];
}));
function adjustmentFor(target){
 if(accessories.some(a=>a.id===target))return accessoryState(state,target);
 if(target==='clothes'){
  state.clothesAdjustments??={};
  const id=state.clothes||'none';
  const a=state.clothesAdjustments[id]??={x:0,y:0,scale:100,width:100,height:93};
  state.clothesLengthVersions??={};
  if(state.clothesLengthVersions[id]!==1){a.height=93;state.clothesLengthVersions[id]=1;}
  return a;
 }
 if(target==='hair'&&state.hair){
  state.hairAdjustments??={};
  const confirmed={
   'hair1-02':{x:-3,y:-48,scale:110,width:110,height:96},
   'hair1-05':{x:0,y:-52,scale:110,width:107,height:95},
   'hair1-07':{x:-3,y:-30,scale:98,width:111,height:100},
   'hair1-08':{x:4,y:-37,scale:105,width:101,height:100},
   'hair1-09':{x:0,y:-25,scale:104,width:115,height:93},
   'hair1-10':{x:0,y:-71,scale:103,width:112,height:100},
   'hair1-11':{x:-7,y:-29,scale:103,width:112,height:96},
   'hair1-12':{x:0,y:-26,scale:101,width:112,height:92},
   'hair1-15':{x:-3,y:-19,scale:101,width:109,height:93},
   'hair1-17':{x:0,y:-15,scale:100,width:107,height:100}
  };
  if(confirmed[state.hair]){
   state.hairFitVersions??={};
   const version=state.hair==='hair1-09'?2:1;
   if(state.hairFitVersions[state.hair]!==version){state.hairAdjustments[state.hair]=state.hair==='hair1-09'&&state.hairFitVersions[state.hair]===1?{...state.hairAdjustments[state.hair],width:115}:{...confirmed[state.hair]};state.hairFitVersions[state.hair]=version;}
  }
  const preset={'hair1-01':{x:2,y:-45,scale:105,width:110,height:100},'hair1-04':{x:2,y:-56,scale:103,width:109,height:106}};
  if(state.hair==='hair1-01'&&state.hair1FitVersion!==2){
   state.hairAdjustments[state.hair]=state.hair1FitVersion===1?{...state.hairAdjustments[state.hair],width:110}:{...preset[state.hair]};state.hair1FitVersion=2;
  }
  if(state.hair==='hair1-04'&&state.hair4FitVersion!==2){state.hairAdjustments[state.hair]=state.hair4FitVersion===1?{...state.hairAdjustments[state.hair],y:-56}:{...preset[state.hair]};state.hair4FitVersion=2;}
  return state.hairAdjustments[state.hair]??={...(preset[state.hair]||state.adjust.hair)};
 }
 if(target==='mouth'&&state.mouth){
  state.mouthAdjustments??={};
  const n=Number(state.mouth.slice(-2));
  return state.mouthAdjustments[state.mouth]??=(n===6?{...state.adjust.mouth}:{x:n===5||n===24?3:(n>=7&&n<=9)||(n>=13&&n<=19)?2:0,y:n===5?0:4,scale:80});
 }
 if((target==='iris'||target==='highlight')&&['eyes-07','eyes-08','eyes-09'].includes(state.eyes)){
  state.eyeType3??=eyeType3Defaults();return state.eyeType3[target];
 }
 if((target==='iris'||target==='highlight')&&['eyes-01','eyes-02','eyes-03'].includes(state.eyes)){
  state.eyeType1??=eyeType1Defaults();return state.eyeType1[target];
 }
 if((target==='iris'||target==='highlight')&&['eyes-04','eyes-05','eyes-06'].includes(state.eyes)){
  state.eyeType2??=eyeType2Defaults();return state.eyeType2[target];
 }
 return state.adjust[target];
}
function activeTarget(){return category==='body'?'mole':category==='eyes'?editTarget:category}
function drawIris(half){const shape=irisShapes.get(state.eyes)[half],direction=half===0?-1:1;ctx.save();ctx.clip(shape.clip);for(const [i,target] of ['iris','highlight'].entries()){const circle=shape.circles[i],a=adjustmentFor(target);ctx.beginPath();ctx.arc(circle.x+a.x+direction*(a.spacing||0)/2,circle.y+a.y,circle.r*a.scale/100,0,Math.PI*2);ctx.fillStyle=i?'#ffffff':state.irisColor;ctx.fill()}ctx.restore()}

const categories={body:'素体',eyes:'眼睛',mouth:'嘴巴',hair:'发型',clothes:'衣服'};
const colors=[null,'#3d3743','#665448','#a69583','#d7d1cb','#b98483','#a79bb4','#879cac','#768770'];
const tinted=new Map();
function hairImage(image){if(!state.color)return image;const key=image.src+state.color;if(tinted.has(key))return tinted.get(key);const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const t=c.getContext('2d');t.drawImage(image,0,0);const d=t.getImageData(0,0,c.width,c.height);d.data.set(recolorHair(d.data,c.width,state.hair,state.color));t.putImageData(d,0,0);tinted.set(key,c);return c;}
function eyelashImage(image){
 if(!state.eyelashColor)return image;
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
 const t=c.getContext('2d');t.drawImage(image,0,0);
 const pixels=t.getImageData(0,0,c.width,c.height);
 pixels.data.set(recolorEyelashes(pixels.data,c.width,state.eyes,state.eyelashColor));t.putImageData(pixels,0,0);return c;
}
function layer(cat,draw){const a=adjustmentFor(cat);ctx.save();ctx.translate(a.x,a.y);draw(a.scale/100);ctx.restore()}
function hairRect(){if(category!=='hair'||!state.hair)return null;const a=adjustmentFor('hair'),im=images.get(hairs.find(i=>i.id===state.hair).src),width=330*a.scale/100*(a.width??100)/100,height=330*a.scale/100*im.height/im.width*(a.height??100)/100;return {left:192-width/2+a.x,top:90+a.y,width,height,closeup};}
function clothesRect(){if(!state.clothes)return null;const a=adjustmentFor('clothes'),width=180*a.scale/100*a.width/100,height=210*a.scale/100*a.height/100;return {left:192-width/2+a.x,top:365+a.y,width,height,closeup};}
function draw(){ctx.clearRect(0,0,384,640);ctx.save();if(closeup){ctx.translate(-153.6,-135);ctx.scale(1.8,1.8)}const body=bodies.find(i=>i.id===state.body);const bodyHeight=state.clothes?390:body.box.height;ctx.drawImage(images.get(body.variants[state.skin]),0,0,body.box.width,bodyHeight,42,125,300,300*bodyHeight/body.box.width);
 if(state.clothes){const rect=clothesRect(),im=images.get(clothes.find(c=>c.id===state.clothes).src);ctx.drawImage(liquifiedClothes(im,state.clothesLiquify?.[state.clothes]),rect.left-rect.width/2,rect.top-rect.height/2,rect.width*2,rect.height*2);}
 // The current mannequin narrows to the neck at source row 272.
 if(state.clothes)ctx.drawImage(images.get(body.variants[state.skin]),0,0,body.box.width,273,42,125,300,273*300/body.box.width);
 if(state.eyes)layer('eyes',s=>{const im=eyelashImage(images.get(eyes.find(i=>i.id===state.eyes).src));ctx.save();ctx.translate(192-120*s,320-67.5*s);ctx.scale(s,s);for(let half=0;half<2;half++){ctx.save();ctx.translate((half===0?-1:1)*(state.adjust.eyes.spacing||0)/2,0);ctx.drawImage(im,half*120,0,120,135,half*120,0,120,135);drawIris(half);ctx.restore()}ctx.restore()});
 if(state.mouth)layer('mouth',s=>{const im=images.get(mouths.find(i=>i.id===state.mouth).src),w=60*s,h=w*105/128;ctx.drawImage(im,192-w/2,356-h/2,w,h)});
 drawAccessories(ctx,state);
 if(state.hair)layer('hair',s=>{const im=hairImage(images.get(hairs.find(i=>i.id===state.hair).src)),w=330*s*(adjustmentFor('hair').width??100)/100,h=330*s*im.height/im.width*(adjustmentFor('hair').height??100)/100;ctx.drawImage(liquifiedHair(im,state.hairLiquify?.[state.hair]),192-w,90-h/2,w*2,h*2)});ctx.restore();}
function status(t){$('#status').textContent=t}
function render(){
 $('#tabs').replaceChildren(...Object.entries(categories).map(([id,label])=>{const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-selected',category===id);b.onclick=()=>{category=id;render()};return b}));

 const options=(category==='eyes'||category==='mouth'||category==='clothes')?[]:category==='body'?[['original','原肤色','#ffe7d4'],['light','浅肤色','#fff4e8'],['wheat','浅麦色','#eccaae']]:colors.map(c=>[c,c?'发色 '+c:'原始发色',c]);
 $('#palette').className=category;$('#palette').replaceChildren(...options.map(([id,label,color])=>{const b=document.createElement('button');b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',(category==='body'?state.skin:category==='eyes'?state.irisColor:state.color)===id);if(category==='body'){const sw=document.createElement('i');sw.style.background=color;b.append(sw,document.createTextNode(label))}else if(color)b.style.background=color;else b.textContent='原色';b.onclick=async()=>{if(category==='body')state.skin=id;else if(category==='eyes'){state.irisColor=id;}else state.color=id;render();status('搭配已更新 · 尚未保存')};return b}));
 if(category==='hair'){
  const picker=document.createElement('input');picker.type='color';picker.id='hair-color';picker.value=state.color||'#a69583';picker.setAttribute('aria-label','自定义发色色盘');
  picker.oninput=()=>{state.color=picker.value;draw();status('发色已更新 · 尚未保存')};
  $('#palette').append(picker);
 }
 if(category==='eyes'){
  const picker=document.createElement('input');picker.type='color';picker.id='iris-color';picker.value=state.irisColor;picker.setAttribute('aria-label','自定义瞳色色盘');
  const hex=document.createElement('input');hex.type='text';hex.id='iris-hex';hex.value=state.irisColor;hex.placeholder='#RRGGBB';hex.spellcheck=false;hex.setAttribute('aria-label','瞳色HEX色值');
  const apply=color=>{state.irisColor=color;picker.value=color;hex.removeAttribute('aria-invalid');draw();status('瞳色已更新 · 尚未保存')};
  picker.oninput=()=>{hex.value=picker.value;apply(picker.value)};
  hex.oninput=()=>{const value=hex.value.trim();if(/^#?[0-9a-f]{6}$/i.test(value)){apply('#'+value.replace('#','').toLowerCase())}else{hex.setAttribute('aria-invalid','true')}};
  hex.onblur=()=>{if(hex.getAttribute('aria-invalid')==='true'){hex.value=state.irisColor;hex.removeAttribute('aria-invalid');status('色值需为6位十六进制，已保留上次颜色。')}else hex.value=state.irisColor};
  $('#palette').append(picker,hex);
  const lashRow=document.createElement('div');lashRow.className='lash-colors';
  const label=document.createElement('span');label.textContent='睫毛';
  const lash=document.createElement('input');lash.type='color';lash.id='eyelash-color';lash.value=state.eyelashColor||'#303039';lash.setAttribute('aria-label','睫毛颜色');
  const lashHex=document.createElement('input');lashHex.type='text';lashHex.id='eyelash-hex';lashHex.value=state.eyelashColor||'';lashHex.placeholder='原色 / #RRGGBB';lashHex.setAttribute('aria-label','睫毛HEX色值');
  const applyLash=value=>{state.eyelashColor=value;lash.value=value;lashHex.value=value;lashHex.removeAttribute('aria-invalid');draw();status('睫毛颜色已更新 · 尚未保存')};
  lash.oninput=()=>applyLash(lash.value);
  lashHex.oninput=()=>{const value=lashHex.value.trim();if(/^#?[0-9a-f]{6}$/i.test(value))applyLash('#'+value.replace('#','').toLowerCase());else lashHex.setAttribute('aria-invalid','true')};
  lashHex.onblur=()=>{lashHex.value=state.eyelashColor||'';lashHex.removeAttribute('aria-invalid')};
  const original=document.createElement('button');original.textContent='睫毛原色';original.onclick=()=>{delete state.eyelashColor;render();status('睫毛已恢复原色 · 尚未保存')};
  lashRow.append(label,lash,lashHex,original);$('#palette').append(lashRow);
 }
 const list=category==='body'?bodies:category==='eyes'?[{id:null,label:'不使用眼睛'},...eyes]:category==='mouth'?[{id:null,label:'不使用嘴巴'},...mouths]:category==='clothes'?[{id:null,label:'不穿衣服'},...clothes]:[{id:null,label:'不戴头发'},...hairs];$('#section-title').textContent=category==='body'?'肤色与小细节':category==='eyes'?'选择眼睛':category==='mouth'?'选个小表情':category==='clothes'?'挑一套衣服':'选择发型';$('#count').textContent=category==='body'?'3 档肤色':category==='eyes'?'9 组':category==='mouth'?mouths.length+' 款':(category==='clothes'?clothes:hairs).length+' 款';
 $('#choices').className=category;$('#choices').replaceChildren(...list.map(item=>{const b=document.createElement('button');b.setAttribute('aria-label',item.label);b.setAttribute('aria-pressed',state[category]===item.id);const src=category==='body'?item.variants[state.skin]:item.src;if(src){const img=new Image();img.src=src;img.alt='';b.append(img)}b.append(document.createTextNode(item.label));b.onclick=()=>{state[category]=item.id;render();status('搭配已更新 · 尚未保存')};return b}));
 if(category==='body'){
  const mole=accessoryState(state,'mole'),toggle=document.createElement('button');
  toggle.textContent=mole.enabled?'去掉痣':'添加痣';toggle.setAttribute('aria-pressed',mole.enabled);
  toggle.onclick=()=>{mole.enabled=!mole.enabled;render();status('痣已更新 · 尚未保存')};$('#palette').append(toggle);
  if(mole.enabled){const color=document.createElement('input');color.type='color';color.value=mole.color||'#57443b';color.setAttribute('aria-label','痣的颜色');color.oninput=()=>{mole.color=color.value;draw();status('痣的颜色已更新 · 尚未保存')};$('#palette').append(color);}
 }
 $('#adjust').hidden=category!=='body'||!accessoryState(state,'mole').enabled;if(!$('#adjust').hidden)$('#adjust').open=true;
 $('#adjust p').textContent=category==='mouth'?'可直接拖动嘴巴，或填写左右、上下和大小。':'先选对象，再拖动预览或修改数值。间距正数分开，负数靠拢。';
 $('#edit-targets').hidden=category!=='eyes';
 $('#edit-targets').replaceChildren(...Object.entries({eyes:'整组眼睛',iris:'虹膜',highlight:'高光'}).map(([id,label])=>{const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-pressed',editTarget===id);button.onclick=()=>{editTarget=id;render()};return button}));
 const adjustment=adjustmentFor(activeTarget())||state.adjust.hair;
 $('#hair-stretch').hidden=!['hair','clothes'].includes(category);
 if(category==='body')$('#adjust p').textContent='拖动预览调整痣的位置，也可填写左右、上下和大小；颜色在肤色旁调整。';
 if(category==='clothes')$('#adjust p').textContent='分别调整位置、整体大小和宽高；开启液化后可拖动衣服局部。';
 $('.note').textContent='选好搭配后，点击保存或导出图片。';
 for(const key of ['width','height']){$('#'+key).value=adjustment[key]??100;$('#'+key+'-value').textContent=(adjustment[key]??100)+'%'}
 $('#spacing-row').style.display=category==='eyes'?'flex':'none';$('#spacing').value=adjustment.spacing||0;$('#spacing-value').textContent=adjustment.spacing||0;
 for(const key of ['x','y','scale']){const input=$('#'+key);input.type='number';input.removeAttribute('min');input.removeAttribute('max');input.step='1';input.value=adjustment[key];$('#'+key+'-value').textContent=adjustment[key]+(key==='scale'?'%':'')}

 updateLiquify();draw();
 $('#liquify-panel p').textContent='开启后拖动当前素材局部，配饰也会随笔刷移动。改完点击保存。';
}
for(const key of ['x','y','scale','spacing'])$('#'+key).oninput=e=>{const value=Number(e.target.value);if(e.target.value===''||!Number.isFinite(value)||(key==='scale'&&value<=0))return;adjustmentFor(activeTarget())[key]=value;$('#'+key+'-value').textContent=e.target.value+(key==='scale'?'%':'');draw()};
for(const key of ['width','height'])$('#'+key).oninput=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<=0)return;adjustmentFor(activeTarget())[key]=value;$('#'+key+'-value').textContent=value+'%';draw();status('比例已更新 · 尚未保存')};
$('#view').onclick=()=>{closeup=!closeup;$('#view').textContent=closeup?'查看全身':'放大五官';draw()};
$('#reset').onclick=async()=>{state=defaults();render();status('已恢复初始搭配，保存后更新业主档案。')};
$('#save').onclick=async()=>{
 if(loadFailed){location.reload();return;}
 const button=$('#save');button.disabled=true;status('正在保存…');
 try{const response=await fetch('/api/resident-avatar',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({resident_id:residentId,expected_revision:revision,manifest:manifest()})});const saved=await response.json();if(!response.ok){if(response.status===409){loadFailed=true;button.textContent='重新加载';}throw Error(saved.error?.message||'保存未完成');}revision=saved.revision;status('已保存到业主档案 ✓');parent.postMessage({type:'resident-avatar-saved',residentId,revision},location.origin);}catch(error){status(error.message||'网络异常，尚未保存');}finally{button.disabled=false;}
};
$('#export').onclick=()=>{const previous=closeup;closeup=false;draw();const a=document.createElement('a');a.download='我的小机.png';a.href=canvas.toDataURL('image/png');a.click();closeup=previous;draw();status('已导出透明 PNG')};
let drag=null;canvas.style.touchAction='none';
updateLiquify=installLiquify({canvas,container:$('#hair-stretch'),getContext:()=>category==='clothes'?clothesRect():hairRect(),getState:()=>category==='clothes'?{hair:state.clothes,hairLiquify:state.clothesLiquify??={}}:state,draw,status});
canvas.addEventListener('pointerdown',e=>{if(category!=='body'||!accessoryState(state,'mole').enabled)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,target:activeTarget(),origin:{...adjustmentFor(activeTarget())}};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const r=canvas.getBoundingClientRect(),z=(closeup?1.8:1)*(['iris','highlight'].includes(drag.target)?state.adjust.eyes.scale/100:1),a=adjustmentFor(drag.target);a.x=Math.round(drag.origin.x+(e.clientX-drag.x)*384/r.width/z);a.y=Math.round(drag.origin.y+(e.clientY-drag.y)*640/r.height/z);for(const k of ['x','y']){$('#'+k).value=a[k];$('#'+k+'-value').textContent=a[k]}draw();status('当前部件位置已更新 · 尚未保存')});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null});
render();

const back=document.createElement('button');back.textContent='‹';back.className='avatar-back';back.setAttribute('aria-label','返回业主档案');back.onclick=()=>parent.postMessage({type:'resident-avatar-close'},location.origin);document.querySelector('header').prepend(back);
if(loadFailed){$('#save').textContent='重新加载';$('.editor').hidden=true;canvas.hidden=true;}
if(portrait){$('#status').textContent=loadFailed?'形象暂不可用':document.body.dataset.empty?'尚未设置形象':'';}

if(portrait){const headshot=document.createElement('canvas');headshot.width=300;headshot.height=393;headshot.getContext('2d').drawImage(canvas,42,65,300,393,0,0,300,393);parent.postMessage({type:'resident-avatar-portrait',residentId,image:loadFailed||document.body.dataset.empty?null:headshot.toDataURL('image/png')},location.origin);}
