import {runBatch,storedBatch} from './gacha-batch.js';
import {rewardLabel} from './gacha-reward-label.js';
import {paintPrizeArt} from './gacha-prize-art.js';
const labels={gold:'金币',silver:'银币',ingredient:'食材',dish:'菜肴',material:'普通熔炼素材',sr_seed:'SR 种子',decor:'未拥有的家具',sp_material:'SP 熔炼素材',sp_seed:'SP 种子',ssr_seed:'SSR 种子'};
const previewProbabilities={gold: 29.1,silver:20,ingredient:18,dish:10,material:16,sr_seed:5.9,decor: 0.4,sp_material: 0.2,sp_seed: 0.1,ssr_seed: 0.3};
const errors={authentication_required:'请先登录。',qq_not_group_member:'当前账号没有社区访问资格。',registration_profile_required:'请先完成社区注册。',onebot_unavailable:'暂时无法核验社区资格。',insufficient_gold:'金币不足 500，攒够再来吧。',quota_exceeded:'今天已经扭满 100 次，明天再来。',prize_pool_empty:'稀有奖品暂不可用，保底进度已保留。',farm_credential_invalid:'农场连接已失效，请在设置中重新连接。',farm_not_found:'没有找到绑定的农场。',farm_doorplate_mismatch:'农场绑定不一致，请检查设置。',idempotency_conflict:'这次请求未能确认，请重新打开查看。',gacha_unavailable:'扭蛋机暂时没连上，请稍后重试。'};
const errorsTen={...errors,insufficient_gold:'金币不足 5000，攒够再来吧。'};
let current=null;
const pendingMemory=new Map();
function pendingKey(plate){return `doorbell:gacha:pending:${plate}`;}
function pending(plate,value){
 const key=pendingKey(plate);
 if(value!==undefined){if(value)pendingMemory.set(key,value);else pendingMemory.delete(key);try{if(value)sessionStorage.setItem(key,value);else sessionStorage.removeItem(key);}catch{}}
 try{return sessionStorage.getItem(key)||pendingMemory.get(key)||null;}catch{return pendingMemory.get(key)||null;}
}
function validStatus(data,price=500){return data?.ok===true&&typeof data.farm_doorplate==='string'&&Number.isSafeInteger(data.gold)&&data.gold>=0&&Number.isSafeInteger(data.count)&&data.count>=0&&data.count<=100&&data.price_gold===price&&data.limit===100&&data.pity?.limit===100&&Number.isSafeInteger(data.pity.misses)&&data.pity.misses>=0&&data.pity.misses<100&&data.pity.remaining===100-data.pity.misses&&data.probabilities&&typeof data.probabilities==='object';}
async function request(path,body,errorMap=errors){
 let response;
 try{response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});}catch{throw {uncertain:true,message:'这次结果还没确认，重试会查询同一扭。'};}
 let data;try{data=await response.json();}catch{throw {uncertain:true,message:'暂未收到完整结果，请重试确认。'};}
 if(!response.ok)throw {uncertain:response.status>=500||response.status===401,code:data?.error?.code,message:errorMap[data?.error?.code]||'暂时没能完成，请稍后重试。'};
 return data;
}
let styleReady=null;
function loadGachaStyle(){
 if(styleReady)return styleReady;
 const existing=document.querySelector('link[data-gacha-style]');
 if(existing?.sheet)return Promise.resolve();
 styleReady=new Promise((resolve,reject)=>{
  const link=existing||document.createElement('link');
  link.addEventListener('load',resolve,{once:true});
  link.addEventListener('error',()=>{link.remove();styleReady=null;reject(new Error('扭蛋机样式加载失败，请重新打开。'));},{once:true});
  if(!existing){link.rel='stylesheet';link.href='/lounge/gacha-dialog.css';link.dataset.gachaStyle='';document.head.append(link);}
 });
 return styleReady;
}
export async function openGachaDialog({preview=false}={}){
 if(current?.isConnected){current.focus();return;}
 await loadGachaStyle();
 if(current?.isConnected){current.focus();return;}
 const dialog=document.createElement('dialog');current=dialog;dialog.className='lounge-gacha';dialog.setAttribute('aria-labelledby','gacha-title');
 dialog.innerHTML=`<button class="gacha-close" type="button" aria-label="关闭扭蛋机">×</button><p class="gacha-kicker">一点点小惊喜</p><h2 id="gacha-title">叮！扭一颗</h2><div class="gacha-machine"><svg viewBox="0 0 300 400" aria-hidden="true"><defs><linearGradient id="gacha-body" x2=".9" y2="1"><stop stop-color="#f7ced0"/><stop offset="1" stop-color="#e6a6ad"/></linearGradient><linearGradient id="gacha-window" x2="1" y2="1"><stop stop-color="#fff9ed"/><stop offset="1" stop-color="#e1eee5"/></linearGradient><clipPath id="gacha-glass"><rect x="56" y="70" width="188" height="153" rx="45"/></clipPath></defs><ellipse cx="150" cy="376" rx="98" ry="10" fill="#dac2ae" opacity=".4"/><g stroke="#956c63" stroke-width="2.6" stroke-linejoin="round"><rect x="71" y="354" width="34" height="22" rx="10" fill="#c99297"/><rect x="195" y="354" width="34" height="22" rx="10" fill="#c99297"/><path d="M64 211H236L246 338Q248 364 222 364H78Q52 364 54 338Z" fill="url(#gacha-body)"/><path d="M67 251Q68 238 81 238H219Q232 238 233 251L238 338Q239 351 224 351H76Q61 351 62 338Z" fill="#fff0d9"/><rect x="48" y="61" width="204" height="172" rx="51" fill="url(#gacha-window)"/><g clip-path="url(#gacha-glass)"><g transform="translate(85 196)"><g class="gacha-ball" style="--i:0;--dx:-17px;--dy:-23px"><circle r="23" fill="#efbad0"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(132 197)"><g class="gacha-ball" style="--i:1;--dx:16px;--dy:-28px"><circle r="23" fill="#f0d082"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(180 198)"><g class="gacha-ball" style="--i:2;--dx:-17px;--dy:-33px"><circle r="23" fill="#b6cca3"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(219 190)"><g class="gacha-ball" style="--i:3;--dx:16px;--dy:-23px"><circle r="23" fill="#a6cbd5"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(105 159)"><g class="gacha-ball" style="--i:4;--dx:-17px;--dy:-28px"><circle r="23" fill="#eaa8a6"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(156 156)"><g class="gacha-ball" style="--i:5;--dx:16px;--dy:-33px"><circle r="23" fill="#c9badc"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(205 151)"><g class="gacha-ball" style="--i:6;--dx:-17px;--dy:-23px"><circle r="23" fill="#f2c795"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g><g transform="translate(150 115)"><g class="gacha-ball" style="--i:7;--dx:16px;--dy:-28px"><circle r="23" fill="#abd0bb"/><path d="M-23 0A23 23 0 0 0 23 0Z" fill="#fff5df"/><path d="M-22 0H22"/><path d="M-12 -12L-7 -15" stroke="#fffdf4" stroke-width="5" stroke-linecap="round"/></g></g></g><path d="M75 119Q75 82 102 82" fill="none" stroke="#fffdf4" stroke-width="8" stroke-linecap="round" opacity=".85"/><path d="M230 101V131" fill="none" stroke="#fffdf4" stroke-width="4" stroke-linecap="round"/><path d="M53 71Q55 39 88 39H212Q245 39 247 71Z" fill="#edb2ba"/><rect x="110" y="29" width="80" height="27" rx="13" fill="#fff0d5"/><path d="m150 35 3 6 7 1-5 4 1 6-6-3-6 3 1-6-5-4 7-1Z" fill="#e9bd6e" stroke="none"/><rect x="49" y="219" width="202" height="19" rx="9" fill="#f3c2c5"/><circle cx="120" cy="273" r="27" fill="#f3d49c"/><circle cx="120" cy="273" r="21" fill="#fff4de"/><g class="gacha-knob"><rect x="98" y="266" width="44" height="14" rx="7" fill="#e9b0b6"/><path d="M105 269H135" stroke="#ffe9e4" stroke-width="2.5" stroke-linecap="round"/><circle cx="120" cy="273" r="5" fill="#f2d08a"/></g><rect x="179" y="259" width="34" height="12" rx="6" fill="#94746b"/><path d="M185 263H207" stroke="#664e47" stroke-width="3" stroke-linecap="round"/><path d="M105 321Q105 311 117 311H183Q195 311 195 321V344H105Z" fill="#81625a"/><path d="M111 335H189V344H111Z" fill="#b4917d"/><path d="M101 345H199" stroke="#e5b4b1" stroke-width="5" stroke-linecap="round"/><path d="M73 301h8m-4-4v8M217 295h8m-4-4v8" stroke="#d8af81" stroke-width="2" stroke-linecap="round"/></g></svg><button class="gacha-open" type="button" aria-label="打开扭蛋，揭晓奖励" hidden><span class="gacha-egg"><i></i></span></button></div><p class="gacha-result" role="status" aria-live="polite">今天会掉出什么呢？</p><section class="gacha-prize" aria-label="获得的奖品" hidden><p class="gacha-prize-heading">小惊喜，是你的啦</p><div class="gacha-prize-art" aria-hidden="true"></div><h3 class="gacha-prize-name"></h3><p class="gacha-prize-amount"></p><button class="gacha-again" type="button">再扭一次</button></section><p class="gacha-wallet"></p><button class="gacha-draw" type="button" disabled>投币 · 500 金币</button><p class="gacha-count"></p><p class="gacha-pity"></p><p class="gacha-error" role="alert" hidden></p><button class="gacha-reload" type="button" hidden>重新连接</button><details><summary>里面装了什么</summary><dl class="gacha-probabilities"></dl><p class="gacha-rules">银币 1～5 枚，金币 50～1000 枚，物品每次 1 件。家具只抽未拥有的。北京时间每日 0 点重置每日次数。100 抽内必出稀有，保底进度跨天保留，抽到任意稀有后重新计数。</p><p class="gacha-fallback">普通抽取时，空奖池概率转为金币；保底抽取只在可获得的稀有奖品中选择。</p></details>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),button=$('.gacha-draw'),errorLine=$('.gacha-error');
 let status=null,busy=false,closed=false,reward=null,revealed=false,batch=null,orphanBlocked=false;
 const ten=document.createElement('button');ten.type='button';ten.className='gacha-draw gacha-ten';ten.textContent='十连 · 5000 金币';button.after(ten);
 const peek=document.createElement('button');peek.type='button';peek.className='gacha-batch-peek';peek.hidden=true;ten.after(peek);
 const grid=document.createElement('div');grid.className='gacha-batch-grid';grid.hidden=true;$('.gacha-prize').insertBefore(grid,$('.gacha-again'));
 function checked(result,id,plate){
  if(!validStatus(result)||result.request_id!==id||result.farm_doorplate!==plate||!result.reward||!(typeof result.reward.name==='string'||['gold','silver'].includes(result.reward.category))||!Number.isSafeInteger(result.reward.amount??result.reward.quantity))throw {uncertain:true,message:'结果尚未确认，请重试查询同一扭。'};
  return result;
 }
 function showBatch(){
  if(!batch?.results.length)return;
  grid.replaceChildren();grid.hidden=false;
  for(const item of batch.results){const prize=item.reward,card=document.createElement('div'),art=document.createElement('div'),name=document.createElement('strong'),amount=document.createElement('span');card.className='gacha-batch-card';art.className='gacha-batch-art';
   if(!paintPrizeArt(art,prize)){art.textContent=prize.category==='gold'?'金币':prize.category==='silver'?'银币':'礼物';art.classList.add('gacha-prize-token');}
   name.textContent=rewardLabel(prize,labels[prize.category]);amount.textContent='× '+(prize.amount??prize.quantity);card.append(art,name,amount);grid.append(card);}
  $('.gacha-prize-art').hidden=true;$('.gacha-prize-name').textContent=`已获得 ${batch.results.length} 份奖励`;$('.gacha-prize-amount').textContent='';$('.gacha-prize-heading').textContent=preview?'预览奖品 · 不会实际发放':'本轮十连奖励';
  if(batch.results.length===10){if(!preview)storedBatch(status.farm_doorplate,null);batch=null;}
  reward=null;revealed=true;render();$('.gacha-again').focus();
}
peek.onclick=showBatch;
 function turn(){const knob=$('.gacha-knob');if(!knob.animate||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();return knob.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:1400,easing:'cubic-bezier(.3,0,.2,1)'}).finished.catch(()=>{});}
 function probabilities(values){const dl=$('.gacha-probabilities');dl.replaceChildren();for(const [key,label] of Object.entries(labels)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=`${Number(values[key]??0)}%`;dl.append(dt,dd);}}
 function render(){
  if(status&&!preview&&!batch){batch=storedBatch(status.farm_doorplate);if(batch?.mode==='atomic'&&batch.results.length===10){reward=batch.results;$('.gacha-result').textContent='十颗到齐啦！点扭蛋查看奖励';}}
  probabilities(status?.probabilities??previewProbabilities);
  const id=status&&!preview?pending(status.farm_doorplate):null;
  const emptyPity=status?.pity.remaining===1&&Object.values(status.probabilities).every(value=>value===0);
  button.disabled=busy||orphanBlocked||!!reward||!!batch||!status||(!id&&(status.gold<500||status.count>=100||emptyPity));
  button.textContent=busy?'咕噜咕噜……':reward?'点扭蛋，看看里面':id?'确认上一扭 · 不重复扣款':emptyPity?'奖池暂不可用':'投币 · 500 金币';
  ten.disabled=busy||orphanBlocked||!!reward||!status||(!!id&&!(batch?.mode==='atomic'&&batch.id===id))||(!batch&&(status.gold<5000||status.count>90||emptyPity));
  ten.textContent=busy&&batch?`十连进行中 · ${batch.results.length}/10`:batch?`继续十连 · ${batch.results.length}/10`:'十连 · 5000 金币';
  ten.hidden=revealed;peek.hidden=revealed||busy||!batch?.results.length;peek.textContent=`查看已获得的 ${batch?.results.length??0} 份奖励`;
  $('.gacha-wallet').textContent=preview?'外观预览，不扣金币':status?`我的金币 ${status.gold.toLocaleString('zh-CN')}`:'正在连接农场……';
  $('.gacha-count').textContent=status?`今日已扭 ${status.count} / 100 次`:'每天最多 100 次';
  const guaranteed=status?.pity.remaining===1;
  $('.gacha-pity').textContent=status?(emptyPity?'保底进度已保留 · 稀有奖品暂不可用':guaranteed?'下一抽必出稀有 ✦':`再扭 ${status.pity.remaining} 次内必出稀有`):'100 抽内必出稀有 · 进度跨天保留';
  $('.gacha-pity').classList.toggle('is-guaranteed',guaranteed);
  $('summary').textContent=guaranteed?'下一抽的保底奖池':'里面装了什么';
  dialog.classList.toggle('is-turning',busy);
  $('.gacha-open').hidden=!reward;
  $('.gacha-machine').hidden=revealed;$('.gacha-prize').hidden=!revealed;button.hidden=revealed;$('.gacha-result').hidden=revealed;
 }
 function showError(message){errorLine.hidden=!message;errorLine.textContent=message;}
 async function load(){
  $('.gacha-reload').hidden=true;showError('');
  try{
   const result=await request('/api/lounge/gacha');
   if(!validStatus(result))throw {message:'扭蛋机状态没有确认，请重新连接。'};
   if(closed)return;
   status=result;
   const plate=status.farm_doorplate,id=pending(plate);
   if(id&&!storedBatch(plate)){
    orphanBlocked=true;render();
    try{
     const lookup=await request(`/api/lounge/gacha/receipt?requestId=${encodeURIComponent(id)}`);
     if(closed)return;
     if(lookup?.ok!==true||lookup.request_id!==id||lookup.farm_doorplate!==plate)throw {message:'上一笔回执无法核对，请重新连接。'};
     if(!lookup.found){showError('上一笔尚无结算回执，暂不能区分单抽或十连。请联系管理员确认。');$('.gacha-reload').hidden=false;return;}
     if(lookup.kind==='ten'){
      const settled=lookup.result;
      if(!validStatus(settled,5000)||settled.request_id!==id||settled.draw_count!==10||!Array.isArray(settled.rewards)||settled.rewards.length!==10)throw {message:'十连回执无法核对，请重新连接。'};
      status=settled;batch={mode:'atomic',id,results:settled.rewards.map(entry=>({reward:entry}))};storedBatch(plate,batch);reward=batch.results;
      $('.gacha-result').textContent='十颗到齐啦！点扭蛋查看奖励';
     }else if(lookup.kind==='single'){
      const settled=checked(lookup.result,id,plate);
      status=settled;reward=settled.reward;$('.gacha-result').textContent='掉出来啦！点开这颗小扭蛋';
     }else throw {message:'上一笔回执无法核对，请重新连接。'};
     pending(plate,'');orphanBlocked=false;render();return;
    }catch(error){if(closed)return;showError(error.message||'上一笔回执未确认，请重新连接。');$('.gacha-reload').hidden=false;return;}
   }
   orphanBlocked=false;render();
  }
  catch(error){if(closed)return;showError(error.message||'暂时连不上扭蛋机。');$('.gacha-wallet').textContent='暂未连接';$('.gacha-reload').hidden=false;}
 }
 button.onclick=async()=>{
  if(busy||reward||batch||!status)return;
  const plate=status.farm_doorplate,id=preview?'preview':pending(plate)||crypto.randomUUID();
  if(!preview)pending(plate,id);busy=true;showError('');dialog.classList.remove('has-rare');$('.gacha-result').textContent='小惊喜正在路上……';render();
  const motion=turn();
  try{
   const result=preview?{...status,count:status.count+1,request_id:id,reward:{category:'silver',amount:3}}:await request('/api/lounge/gacha/draw',{requestId:id});
   checked(result,id,plate);
   await motion;if(closed)return;status=result;reward=result.reward;
   $('.gacha-result').textContent='掉出来啦！点开这颗小扭蛋';
  }catch(error){await motion;if(!preview&&!error.uncertain)pending(plate,'');if(!closed){$('.gacha-result').textContent='这颗小惊喜等一下再来';showError(error.message||'暂时没能完成。');if(error.code==='quota_exceeded'||error.code==='insufficient_gold')void load();}}
  finally{busy=false;if(!closed)render();}
 };
 ten.onclick=async()=>{
  if(busy||reward||!status||(!preview&&pending(status.farm_doorplate)&&!(batch?.mode==='atomic'&&batch.id===pending(status.farm_doorplate))))return;
  if(!batch&&(status.gold<5000||status.count>90))return;
  if(!batch&&preview){batch={mode:'legacy',ids:Array.from({length:10},(unused,index)=>'preview-'+index),results:[]};}
  if(!batch){const id=crypto.randomUUID();batch={mode:'atomic',id:id,results:[]};storedBatch(status.farm_doorplate,batch);pending(status.farm_doorplate,id);}
  const plate=status.farm_doorplate;
  busy=true;showError('');render();const motion=turn();
  try{
   if(batch.mode==='legacy'){
    await runBatch(batch,{save:value=>{if(!preview)storedBatch(plate,value);},isClosed:()=>closed,draw:async id=>checked(await request('/api/lounge/gacha/draw',{requestId:id}),id,plate),onResult:result=>{status=result;if(!closed)render();}});
    await motion;if(closed)return;
    if(batch.results.length===10){reward=batch.results;$('.gacha-result').textContent='十颗到齐啦！点扭蛋查看奖励';}
   }else{
    const result=preview?{...status,gold:status.gold-5000,count:status.count+10,request_id:batch.id,draw_count:10,rewards:Array.from({length:10},()=>({category:'silver',amount:3}))}:await request('/api/lounge/gacha/draw-ten',{requestId:batch.id},errorsTen);
    if(!validStatus(result,5000)||result.request_id!==batch.id||result.farm_doorplate!==plate||result.draw_count!==10||!Array.isArray(result.rewards)||result.rewards.length!==10)throw {uncertain:true,message:'结果尚未确认，请重试查询同一扭。'};
    await motion;if(closed)return;
    batch.results=result.rewards.map(entry=>({reward:entry}));status=result;
    if(batch.results.length===10){storedBatch(plate,batch);reward=batch.results;$('.gacha-result').textContent='十颗到齐啦！点扭蛋查看奖励';pending(plate,'');}
   }
  }catch(error){await motion;if(!closed){showError(`十连没有完成。${error.message||'稍后继续本轮，不会重复扣款。'}`);}}
  finally{busy=false;if(!closed)render();}
 };
 $('.gacha-open').onclick=()=>{
  if(!reward||busy)return;
  if(Array.isArray(reward)){showBatch();return;}
  grid.hidden=true;$('.gacha-prize-art').hidden=false;
  const amount=reward.amount??reward.quantity;$('.gacha-result').textContent=`${preview?'预览：':'扭到了 '}${rewardLabel(reward,labels[reward.category])} × ${amount}`;
  dialog.classList.toggle('has-rare',String(reward.category).startsWith('sp_')||reward.category==='decor'||reward.category==='ssr_seed');
  const name=rewardLabel(reward,labels[reward.category]);
  $('.gacha-prize-name').textContent=name;$('.gacha-prize-amount').textContent=`× ${amount}`;
  $('.gacha-prize-heading').textContent=preview?'预览奖品 · 不会实际发放':'小惊喜，是你的啦';
  const category=reward.category;
  const shape=category==='gold'||category==='silver'?`<circle cx="60" cy="60" r="34" fill="${category==='gold'?'#edc575':'#c8d6d5'}"/><circle cx="60" cy="60" r="25" fill="none"/><path d="m60 42 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z" fill="#fff3cb"/>`:category.includes('seed')?'<path d="M35 58H85L90 99H30Z" fill="#ecd3a2"/><path d="M60 76V38M60 51Q32 52 40 28Q61 28 60 51M60 43Q84 42 82 22Q61 21 60 43" fill="#a8bc8d"/>':category==='decor'?'<path d="M28 52Q28 38 40 38H80Q92 38 92 52V83H28Z" fill="#deb0a4"/><path d="M24 63H96V88H24ZM32 88V99M88 88V99M60 49V78" fill="#f2c8b6"/>':category==='dish'?'<ellipse cx="60" cy="82" rx="43" ry="13" fill="#f2ddbb"/><path d="M27 78A33 33 0 0 1 93 78Z" fill="#b6c7aa"/><path d="M55 39H65M60 39V45"/>':category==='ingredient'?'<path d="M60 41Q35 24 30 54Q24 91 60 94Q96 91 90 54Q85 24 60 41" fill="#db9e89"/><path d="M60 41V25Q73 13 84 24Q77 39 60 33" fill="#a8bd91"/>':'<path d="m60 24 30 24-11 43H41L30 48Z" fill="#bdb0cd"/><path d="m60 24-9 29 9 38 10-38ZM30 48l21 5 19 0 20-5" fill="none"/>';
  $('.gacha-prize-art').innerHTML=`<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="#f6e7c5"/><g stroke="#866550" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${shape}</g></svg>`;
  paintPrizeArt($('.gacha-prize-art'),reward);
  if(!preview)pending(status.farm_doorplate,'');reward=null;revealed=true;render();$('.gacha-again').focus();
 };

 $('.gacha-again').onclick=()=>{revealed=false;$('.gacha-result').textContent='今天还会掉出什么呢？';render();button.focus();};
 function close(){closed=true;dialog.remove();if(current===dialog)current=null;}
 dialog.addEventListener('close',close);$('.gacha-close').onclick=()=>dialog.close();$('.gacha-reload').onclick=load;
 if(preview)status={ok:true,farm_doorplate:'preview',gold:5000,count:0,price_gold:500,limit:100,pity:{limit:100,misses:0,remaining:100},probabilities:previewProbabilities};
 dialog.showModal();render();if(!preview)void load();
}
