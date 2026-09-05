export interface NpcGiftImage {
  url: string;
  atlasFrame?: { column: number; columns: number; row: number; rows: number } | undefined;
}

export interface NpcArtwork {
  portraits: Partial<Record<"npc_pupu" | "npc_modian" | "npc_liyuan" | "npc_songmo" | "npc_beiheng", string>>;
  gifts?: Record<string, NpcGiftImage>;
}

const NPC_TALK_ICON = `<svg viewBox="0 0 44 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M12 4h20c5 0 8 3 8 8v10c0 5-3 8-8 8H19l-9 5 1-6c-4-1-7-4-7-8v-9c0-5 3-8 8-8Z" fill="#fff8e8" stroke="#71634d" stroke-width="1.8" stroke-linejoin="round"/>
  <g fill="#758675"><circle cx="14" cy="17" r="1.9"/><circle cx="22" cy="17" r="1.9"/><circle cx="30" cy="17" r="1.9"/></g>
</svg>`;

/** One 1024 × 1536 scene coordinate system, including portraits, speech and hit targets. */
export function npcSceneMarkup(place: string) {
  return `<div class="candidate2-npc-layer" data-npc-place="${place}">
    <div class="candidate2-npc-presence" data-npc-presence></div>
    <img class="candidate2-npc-focus-portrait" data-npc-focus-portrait alt="" draggable="false" hidden>
    <p class="candidate2-npc-read-status" data-npc-read-status aria-live="polite" hidden></p>
    <section class="candidate2-npc-conversation" data-npc-conversation aria-live="polite" hidden>
      <header class="candidate2-npc-nameplate"><h2 data-npc-name></h2><span class="candidate2-npc-affinity-gain" data-npc-affinity-gain role="status" hidden></span></header>
      <p class="candidate2-npc-stage" data-npc-stage></p>
      <button type="button" class="candidate2-npc-close" data-npc-close aria-label="关闭">×</button>
      <button type="button" class="candidate2-npc-advance" data-npc-advance disabled>
        <span class="candidate2-npc-lines" data-npc-lines></span>
        <span class="candidate2-npc-continue" data-npc-continue aria-hidden="true" hidden>▼</span>
      </button>
      <p class="candidate2-npc-receipt" data-npc-receipt hidden></p>
    </section>
    <div class="candidate2-npc-followup" hidden>
      <div class="candidate2-npc-choices" data-npc-choices></div>
    </div>
    <div class="candidate2-npc-gift-overlay" data-npc-gift-overlay hidden>
      <section class="candidate2-npc-gift-card" data-npc-gift-card role="dialog" aria-modal="true" aria-labelledby="npc-gift-title-${place}">
        <h2 id="npc-gift-title-${place}" data-npc-gift-title></h2>
        <div class="candidate2-npc-gift-icon" data-npc-gift-image role="img" hidden></div>
        <p class="candidate2-npc-gift-name" data-npc-gift-name></p>
        <p class="candidate2-npc-gift-note" data-npc-gift-note></p>
        <button type="button" class="candidate2-npc-gift-accept" data-npc-gift-accept>收下</button>
      </section>
    </div>
  </div>`;
}

export const NPC_SCENE_STYLES = `
  .candidate2-npc-layer { position:absolute; left:0; top:0; width:1024px; height:1536px; transform-origin:top left; pointer-events:none; z-index:6; font-family:'Songti SC','STSong','SimSun',serif; color:#51483f; }
  .candidate2-npc-layer [hidden] { display:none !important; }
  .candidate2-npc-presence { position:absolute; inset:0; pointer-events:none; }
  .candidate2-npc-away-note { position:absolute; left:512px; top:1420px; width:600px; box-sizing:border-box; transform:translate(-50%,-100%); margin:0; padding:14px 20px; border-radius:4px; background:#fff8e9eb; font:inherit; font-size:28px; line-height:1.6; text-align:center; pointer-events:none; }
  .candidate2-npc-map-reminder { position:absolute; width:44px; height:38px; transform:translate(-50%,-50%); pointer-events:none; }
  .candidate2-npc-map-reminder svg { display:block; width:100%; height:100%; }
  .candidate2-npc-read-status { position:absolute; left:48px; bottom:70px; margin:0; padding:12px 20px; font-size:30px; background:#fff8e9; }
  .candidate2-npc-talk { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; font:inherit; font-size:30px; line-height:1.35; min-height:88px; padding:15px 23px; color:#51483f; background:#fff7e5; border:2px solid #947b5a; border-radius:40% 44% 38% 42%; cursor:pointer; }
  .candidate2-npc-presence-portrait { position:absolute; width:360px; height:540px; object-fit:contain; transform:translate(-50%,-100%); pointer-events:none; user-select:none; }
  .candidate2-npc-talk.has-icon { display:flex; align-items:center; gap:10px; min-height:96px; padding:0 12px; border:0; border-radius:0; background:transparent; }
  .candidate2-npc-talk.has-icon svg { display:block; flex:none; width:66px; height:58px; pointer-events:none; }
  .candidate2-npc-talk.has-icon:active svg { transform:translateY(2px); }
  .candidate2-npc-talk:disabled { opacity:.65; cursor:wait; }
  .candidate2-npc-talk:focus-visible, .candidate2-npc-close:focus-visible, .candidate2-npc-choices button:focus-visible, .candidate2-npc-advance:focus-visible { outline:5px solid #b07b32; outline-offset:5px; }
  .candidate2-npc-focus-portrait { position:absolute; left:420px; bottom:120px; width:280px; height:420px; object-fit:contain; pointer-events:none; user-select:none; z-index:0; }
  .candidate2-npc-conversation { position:absolute; left:36px; bottom:36px; width:952px; max-height:680px; display:flex; flex-direction:column; padding:44px 34px 26px; box-sizing:border-box; pointer-events:auto; background:#fff8eaf7; border:4px solid #675944; border-radius:9px; box-shadow:inset 0 0 0 3px #f9efdc,inset 0 0 0 7px #c9b58e,0 8px 18px #493c2726; z-index:1; }
  .candidate2-npc-conversation::before { content:""; position:absolute; inset:14px; border:1px solid #dac9aa; border-radius:3px; pointer-events:none; }
  .candidate2-npc-conversation > * { position:relative; z-index:1; }
  .candidate2-npc-layer[data-npc-place="map"] .candidate2-npc-conversation { bottom:156px; }
  .candidate2-npc-nameplate { position:absolute; left:27px; top:-44px; min-width:188px; height:70px; display:flex; align-items:center; padding:0 28px; box-sizing:border-box; background:#6f8676; color:#fff8e8; border:3px solid #574b3a; border-radius:7px 7px 3px 3px; box-shadow:inset 0 0 0 2px #9caf9e,3px 3px 0 #574b3a2b; }
  .candidate2-npc-conversation h2 { margin:0; font:inherit; font-size:35px; line-height:1; font-weight:400; letter-spacing:.06em; }
  .candidate2-npc-affinity-gain { margin-left:20px; font-size:22px; line-height:1.4; color:#fff4cd; white-space:nowrap; }
  .candidate2-npc-stage { position:absolute; top:12px; right:105px; margin:0; padding:5px 14px 6px; border:1px solid #a99675; border-radius:4px; background:#e6ead8; box-shadow:inset 0 0 0 1px #f7f3e8; font-size:21px; line-height:1.4; color:#625a4b; }
  .candidate2-npc-close { position:absolute; top:7px; right:9px; width:80px; height:70px; padding:0 0 4px; border:0; background:transparent; box-shadow:none; font:inherit; font-size:28px; line-height:1; color:#594b3a; cursor:pointer; }
  .candidate2-npc-close:active { transform:translateY(1px); }
  .candidate2-npc-advance { position:relative; min-height:160px; flex:1 1 auto; display:block; width:100%; padding:10px 44px 18px 12px; box-sizing:border-box; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
  .candidate2-npc-advance:disabled { opacity:1; cursor:default; }
  .candidate2-npc-lines { display:block; font-size:30px; line-height:1.6; overflow-wrap:anywhere; white-space:pre-wrap; }
  .candidate2-npc-lines > span { display:block; }
  .candidate2-npc-continue { position:absolute; right:10px; bottom:8px; width:auto; height:auto; display:block; background:transparent; border:0; box-shadow:none; font-size:24px; line-height:1; color:#916d39; text-shadow:0 1px 0 #fff4da; }
  .candidate2-npc-followup { position:absolute; left:50%; top:50%; width:560px; max-width:calc(100% - 72px); max-height:480px; padding:0; transform:translate(-50%,-50%); overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto; z-index:3; }
  .candidate2-npc-choices { display:flex; flex-direction:column; align-items:stretch; gap:14px; }
  .candidate2-npc-choices button { min-height:80px; padding:12px 30px; border:2px solid #746247; border-radius:6px; background:#eadbbe; box-shadow:inset 0 0 0 2px #fbf1df,0 4px 0 #7d694c; color:#4f4334; font:inherit; font-size:28px; cursor:pointer; }
  @media (hover:hover) { .candidate2-npc-choices button:hover { background:#dfcfaa; } .candidate2-npc-close:hover { color:#916d39; } }
  .candidate2-npc-choices button:active { transform:translateY(3px); box-shadow:inset 0 0 0 2px #fbf1df,0 1px 0 #7d694c; }
  .candidate2-npc-choices button:disabled { opacity:.55; filter:saturate(.5); cursor:wait; transform:none; box-shadow:inset 0 0 0 2px #fbf1df,0 2px 0 #7d694c; }
  .candidate2-npc-receipt { margin:8px 0 0; font-size:25px; line-height:1.4; color:#506539; }
  .candidate2-npc-gift-overlay { position:absolute; inset:0; pointer-events:auto; background:#34403759; z-index:10; }
  .candidate2-npc-gift-card { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:580px; box-sizing:border-box; padding:36px 40px; border:3px solid #817052; border-radius:10px; background:#fff7e7; box-shadow:inset 0 0 0 3px #f4e8d0,inset 0 0 0 5px #d2bd95,0 12px 32px #27342533; text-align:center; overflow-y:auto; }
  .candidate2-npc-gift-card h2 { margin:0; font:inherit; font-size:30px; line-height:1.5; }
  .candidate2-npc-gift-icon { display:block; width:192px; height:192px; margin:14px auto 10px; background-repeat:no-repeat; }
  .candidate2-npc-gift-name { margin:0 0 14px; font-size:34px; line-height:1.5; overflow-wrap:anywhere; }
  .candidate2-npc-gift-note { margin:0 0 26px; color:#6b785d; font-size:24px; line-height:1.5; }
  .candidate2-npc-gift-accept { min-height:80px; min-width:220px; padding:12px 34px; border:2px solid #5e745c; border-radius:6px; background:#7f9979; color:#fff9ea; box-shadow:inset 0 0 0 2px #9eb195,0 3px 0 #546a51; font:inherit; font-size:28px; cursor:pointer; }
  .candidate2-npc-gift-accept:active { transform:translateY(2px); box-shadow:inset 0 0 0 2px #9eb195,0 1px 0 #546a51; }
  .candidate2-npc-gift-accept:focus-visible { outline:4px solid #b07b32; outline-offset:5px; }
`;

export function npcSceneScript(
  locations: readonly (readonly [string, string, number, number, number])[],
  initialArtwork: NpcArtwork = { portraits: {} },
) {
  const positions = Object.fromEntries(locations.map(([id, , x, y]) => [id, { x: x * 10.24, y: (y + 4.5) * 15.36 }]));
  return `
  (() => {
    const positions = ${JSON.stringify(positions)};
    const locationNames = ${JSON.stringify(Object.fromEntries(locations.map(([id,name])=>[id,name])))};
    const homePlaces = { farm:'farm-ranch',animal_hospital:'animal-hospital',lingye_daily:'lingye-daily',bank:'bank',vocational_school:'vocational-school',public_security:'lingye-public-security-office' };
    const stages = {new:'初识',known:'熟面',familiar:'熟络',close:'亲近',trusted:'信赖'};
    const talkIcon = ${JSON.stringify(NPC_TALK_ICON)};
    const placements = {
      npc_pupu: { x:580, footY:1120, width:310, foot:.878 },
      npc_liyuan: { x:580, footY:1200, width:290, foot:.849 },
      npc_modian: { x:610, footY:1170, width:300, foot:.864 },
      npc_songmo: { x:590, footY:1170, width:300, foot:.861 },
      npc_beiheng: { x:630, footY:1230, width:315, foot:.869 },
    };
    const portraitIds = ['npc_pupu','npc_modian','npc_liyuan','npc_songmo','npc_beiheng'];
    let artwork = ${JSON.stringify(initialArtwork)};
    let requestId = 0;
    let activePlace = null;
    let selectedNpc = null;
    let currentRequest = null;
    let npcs = [];
    let currentDialogue = null;
    let dialogueLineIndex = 0;
    const shownGiftReceipts = new Set();
    const layers = Array.from(document.querySelectorAll('[data-npc-place]'));
    function layerFor(place) { return layers.find(layer => layer.dataset.npcPlace === place); }
    function fit(layer) {
      const width=layer.parentElement.getBoundingClientRect().width;
      if(width<=0)return;
      const scale=width/1024;layer.style.transform='scale('+scale+')';
      const viewport=layer.parentElement.parentElement;
      const layerBounds=layer.getBoundingClientRect();
      const viewportBounds=viewport.getBoundingClientRect();
      const clipLeft=Math.max(layerBounds.left,viewportBounds.left,0);
      const clipRight=Math.min(layerBounds.right,viewportBounds.right,window.innerWidth);
      const clipTop=Math.max(layerBounds.top,viewportBounds.top,0);
      const clipBottom=Math.min(layerBounds.bottom,viewportBounds.bottom,window.innerHeight);
      const visibleWidth=Math.max(0,(clipRight-clipLeft)/scale);
      if(visibleWidth>72){
        const visibleHeight=Math.max(0,(clipBottom-clipTop)/scale);
        const originX=(clipLeft-layerBounds.left)/scale;
        const originY=(clipTop-layerBounds.top)/scale;
        const presence=layer.querySelector('[data-npc-presence]');
        const awayNote=presence.querySelector('.candidate2-npc-away-note');
        if(awayNote){
          awayNote.style.left=(originX+visibleWidth/2)+'px';awayNote.style.top=(originY+visibleHeight-72)+'px';
          awayNote.style.width=Math.min(600,visibleWidth-72)+'px';
        }
        presence.querySelectorAll('[data-npc-portrait-id]').forEach(image=>{
          const bubble=presence.querySelector('[data-npc-id="'+image.dataset.npcPortraitId+'"]');
          const bubbleX=Number(image.dataset.bubbleX);
          const x=Math.min(Number(image.dataset.anchorX),originX+visibleWidth-bubbleX-48);
          image.style.left=x+'px';
          bubble.style.left=(x+bubbleX)+'px';
        });
        const panel=layer.querySelector('[data-npc-conversation]');
        const panelWidth=Math.min(952,visibleWidth-72);
        const panelHeight=Math.min(680,Math.max(260,visibleHeight/5));
        const panelBottom=layer.dataset.npcPlace==='map'?156:36;
        panel.style.left=(originX+36)+'px';
        panel.style.width=panelWidth+'px';
        panel.style.height=panelHeight+'px';
        const portrait=layer.querySelector('[data-npc-focus-portrait]');
        portrait.style.left=(originX+panelWidth-264)+'px';
        portrait.style.bottom=Math.max(120,panelBottom+panelHeight-120)+'px';
        const followup=layer.querySelector('.candidate2-npc-followup');
        followup.style.left=(originX+visibleWidth/2)+'px';
        followup.style.top=(originY+visibleHeight/2)+'px';
        followup.style.width=Math.min(560,visibleWidth-72)+'px';
        const giftCard=layer.querySelector('[data-npc-gift-card]');
        giftCard.style.left=(originX+visibleWidth/2)+'px';
        giftCard.style.top=(originY+visibleHeight/2)+'px';
        giftCard.style.width=Math.min(580,visibleWidth-96)+'px';
        giftCard.style.maxHeight=Math.max(0,visibleHeight-96)+'px';
      }
    }
    if(typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(()=>layers.forEach(fit));
      layers.forEach(layer=>observer.observe(layer.parentElement));
    }
    function unloadImage(image){image.removeAttribute('src');image.hidden=true;}
    function clearConversation(layer){
      layer.querySelector('[data-npc-gift-overlay]').hidden=true;
      applyGiftArtwork(layer);
      layer.querySelector('[data-npc-conversation]').inert=false;
      layer.querySelector('[data-npc-conversation]').hidden=true;
      layer.querySelector('[data-npc-lines]').replaceChildren();
      layer.querySelector('[data-npc-choices]').replaceChildren();
      layer.querySelector('[data-npc-receipt]').hidden=true;
      layer.querySelector('[data-npc-affinity-gain]').hidden=true;
      layer.querySelector('.candidate2-npc-followup').hidden=true;
      const advance=layer.querySelector('[data-npc-advance]');advance.disabled=true;
      layer.querySelector('[data-npc-continue]').hidden=true;
      unloadImage(layer.querySelector('[data-npc-focus-portrait]'));
    }
    function showLine(layer,text){
      const area=layer.querySelector('[data-npc-lines]');area.replaceChildren();
      const line=document.createElement('span');line.textContent=text;area.append(line);
      layer.querySelector('[data-npc-advance]').scrollTop=0;
    }
    function renderDialogueLine(layer){
      if(!currentDialogue)return;
      const line=currentDialogue.lines[dialogueLineIndex]||'';showLine(layer,line);
      const hasNext=dialogueLineIndex+1<currentDialogue.lines.length;
      const hasGift=hasUnseenGift();
      const advance=layer.querySelector('[data-npc-advance]');
      advance.disabled=!hasNext&&!hasGift;
      layer.querySelector('[data-npc-continue]').hidden=!hasNext&&!hasGift;
      layer.querySelector('.candidate2-npc-followup').hidden=hasNext||currentDialogue.options.length===0;
      fit(layer);
    }
    function hasUnseenGift(){
      const gift=currentDialogue?.gift;
      return currentDialogue?.status==='completed'&&!!gift?.receipt_id&&!shownGiftReceipts.has(gift.receipt_id);
    }
    function applyGiftArtwork(layer){
      const image=layer.querySelector('[data-npc-gift-image]');
      const gift=currentDialogue?.gift;
      const entry=gift&&artwork.gifts?.[gift.name];
      if(!entry||layer.querySelector('[data-npc-gift-overlay]').hidden){
        image.hidden=true;image.style.removeProperty('background-image');return;
      }
      const frame=entry.atlasFrame||{columns:1,rows:1,column:0,row:0};
      image.setAttribute('aria-label',gift.name);
      image.style.backgroundImage='url('+JSON.stringify(entry.url)+')';
      image.style.backgroundSize=(frame.columns*100)+'% '+(frame.rows*100)+'%';
      image.style.backgroundPosition=(frame.columns>1?frame.column*100/(frame.columns-1):0)+'% '+(frame.rows>1?frame.row*100/(frame.rows-1):0)+'%';
      image.hidden=false;
    }
    function showGift(layer){
      if(!hasUnseenGift())return;
      const gift=currentDialogue.gift;
      shownGiftReceipts.add(gift.receipt_id);
      layer.querySelector('[data-npc-gift-overlay]').hidden=false;
      applyGiftArtwork(layer);
      layer.querySelector('[data-npc-conversation]').inert=true;
      layer.querySelector('[data-npc-continue]').hidden=true;
      fit(layer);
      layer.querySelector('[data-npc-gift-accept]').focus({preventScroll:true});
    }
    function closeGift(layer){
      layer.querySelector('[data-npc-gift-overlay]').hidden=true;
      applyGiftArtwork(layer);
      layer.querySelector('[data-npc-conversation]').inert=false;
      layer.querySelector('[data-npc-receipt]').hidden=!currentDialogue?.gift;
      renderDialogueLine(layer);
      layer.querySelector('[data-npc-close]').focus({preventScroll:true});
    }
    function applyConversationArtwork(layer){
      if(!selectedNpc || layer.dataset.npcPlace!==activePlace)return;
      const image=layer.querySelector('[data-npc-focus-portrait]');
      const portrait=artwork.portraits[selectedNpc];
      if(portrait){image.src=portrait;image.hidden=false;}
      else unloadImage(image);
    }
    function renderPresence(){
      for(const layer of layers){
        const presence=layer.querySelector('[data-npc-presence]');presence.replaceChildren();
        if(layer.dataset.npcPlace!==activePlace)continue;
        const offShift=npc=>['npc_pupu','npc_beiheng'].includes(npc.npc_id)&&npc.work_status!=='on_duty';
        const current=npcs.filter(npc=>!offShift(npc)&&(activePlace==='map'||npc.location_id===activePlace));
        presence.hidden=selectedNpc!==null;
        if(selectedNpc!==null){applyConversationArtwork(layer);fit(layer);continue;}
        const host=npcs.find(npc=>homePlaces[npc.institution_id]===activePlace);
        if(host&&(host.location_id!==activePlace||offShift(host))){
          const note=document.createElement('p');note.className='candidate2-npc-away-note';note.setAttribute('role','status');
          const status=host.work_status==='off_duty'?'下班了':host.work_status==='away'?'暂时离开了':'暂时不在这里';
          const destination=locationNames[host.location_id];
          note.textContent=host.name+status+(destination?'，现在在'+destination+'。':'。');presence.append(note);
        }
        const counts={};
        current.forEach((npc,localIndex)=>{
          const location=positions[npc.location_id];if(activePlace==='map'&&!location)return;
          if(activePlace==='map'){
            if(!npc.talk_option||counts[npc.location_id])return;
            counts[npc.location_id]=1;
            const reminder=document.createElement('span');reminder.className='candidate2-npc-map-reminder';
            reminder.setAttribute('role','img');reminder.setAttribute('aria-label','这里有NPC可以闲聊');
            reminder.innerHTML=talkIcon;reminder.style.left=location.x+'px';reminder.style.top=location.y+'px';
            presence.append(reminder);return;
          }
          const index=counts[npc.location_id]||0;counts[npc.location_id]=index+1;
          const placement=placements[npc.npc_id]||{x:620,footY:1160,width:320,foot:.9};
          const imageHeight=placement.width*1.5;
          const x=activePlace==='map'?location.x:Math.min(830,Math.max(210,placement.x+(localIndex-(current.length-1)/2)*270));
          const y=activePlace==='map'?location.y+index*94:placement.footY+imageHeight*(1-placement.foot);
          const bubbleX=placement.width*.38;
          const button=document.createElement('button');button.type='button';button.className='candidate2-npc-talk';
          button.setAttribute('aria-label','和'+npc.name+'聊聊');button.dataset.npcId=npc.npc_id;
          button.disabled=!npc.talk_option || selectedNpc!==null;
          const portrait=activePlace==='map'?null:artwork.portraits[npc.npc_id];
          if(portrait){
            button.classList.add('has-icon');button.innerHTML=talkIcon;
            const image=document.createElement('img');image.className='candidate2-npc-presence-portrait';image.src=portrait;image.alt=npc.name;image.draggable=false;
            image.dataset.npcPortraitId=npc.npc_id;image.dataset.anchorX=String(x);
            image.dataset.bubbleX=String(bubbleX);
            image.style.width=placement.width+'px';image.style.height=imageHeight+'px';
            image.style.left=x+'px';image.style.top=y+'px';presence.append(image);
          }else button.textContent='和'+npc.name+'聊聊';
          button.style.left=(portrait?x+bubbleX:x)+'px';
          button.style.top=(portrait?y-imageHeight*.65:y)+'px';
          if(npc.talk_option){button.onclick=()=>interact(layer,npc,npc.talk_option);presence.append(button);}
        });
        applyConversationArtwork(layer);fit(layer);
      }
    }
    function send(payload){
      currentRequest=++requestId;window.parent.postMessage({...payload,request_id:currentRequest},'*');
    }
    function interact(layer,npc,option){
      if(!option||currentRequest!==null)return;
      activePlace=layer.dataset.npcPlace;selectedNpc=npc.npc_id;
      currentDialogue=null;dialogueLineIndex=0;
      layer.querySelector('[data-npc-gift-overlay]').hidden=true;
      layer.querySelector('[data-npc-conversation]').inert=false;
      layer.querySelector('[data-npc-affinity-gain]').hidden=true;
      layer.querySelector('[data-npc-conversation]').hidden=false;
      layer.querySelector('[data-npc-name]').textContent=npc.name;
      layer.querySelector('[data-npc-stage]').textContent='熟悉程度：'+stages[npc.affinity_stage];
      layer.querySelector('[data-npc-choices]').replaceChildren();layer.querySelector('[data-npc-receipt]').hidden=true;
      layer.querySelector('.candidate2-npc-followup').hidden=true;
      showLine(layer,'正在读取……');renderPresence();
      send({type:'doorbell-npc:interact',npc_id:npc.npc_id,option});
    }
    function renderDialogue(layer,data){
      const npc=data.npc;const dialogue=data.dialogue;
      if(npc.npc_id!==selectedNpc||dialogue.npc_id!==selectedNpc)return;
      const previous=npcs.findIndex(item=>item.npc_id===npc.npc_id);
      const knownRevision=previous>=0?npcs[previous].affinity_revision:npc.affinity_revision;
      if(previous>=0)npcs[previous]=npc;
      renderPresence();
      layer.querySelector('[data-npc-name]').textContent=npc.name;
      layer.querySelector('[data-npc-stage]').textContent='熟悉程度：'+stages[npc.affinity_stage];
      const gain=layer.querySelector('[data-npc-affinity-gain]');
      const change=dialogue.affinity_change;
      gain.hidden=!(change&&change.delta>0&&change.revision>knownRevision);
      gain.textContent=gain.hidden?'':'好感 +'+change.delta;
      const choices=layer.querySelector('[data-npc-choices]');choices.replaceChildren();
      dialogue.options.forEach(choice=>{
        const button=document.createElement('button');button.type='button';button.textContent=choice.label;
        button.onclick=()=>{if(currentRequest!==null)return;choices.querySelectorAll('button').forEach(item=>item.disabled=true);interact(layer,npc,choice.option);};
        choices.append(button);
      });
      const receipt=layer.querySelector('[data-npc-receipt]');receipt.hidden=!dialogue.gift||!shownGiftReceipts.has(dialogue.gift.receipt_id);
      receipt.textContent=dialogue.gift?'已到账：'+dialogue.gift.name+' × '+dialogue.gift.quantity+dialogue.gift.unit:'';
      layer.querySelector('[data-npc-gift-title]').textContent='来自'+npc.name+'的礼物';
      layer.querySelector('[data-npc-gift-name]').textContent=dialogue.gift?dialogue.gift.name+' × '+dialogue.gift.quantity+dialogue.gift.unit:'';
      layer.querySelector('[data-npc-gift-note]').textContent=dialogue.gift?.unit==='金币'?'金币已到账':'已放入厨房库存';
      currentDialogue=dialogue;dialogueLineIndex=0;renderDialogueLine(layer);
      layer.querySelector('.candidate2-npc-followup').scrollTop=0;
    }
    function invalidatePending(){currentRequest=null;requestId+=1;}
    function leave(){
      invalidatePending();activePlace=null;selectedNpc=null;npcs=[];currentDialogue=null;dialogueLineIndex=0;
      layers.forEach(layer=>{clearConversation(layer);layer.querySelector('[data-npc-read-status]').hidden=true;});renderPresence();
    }
    layers.forEach(layer=>{
      layer.querySelector('[data-npc-close]').onclick=()=>{invalidatePending();selectedNpc=null;currentDialogue=null;dialogueLineIndex=0;clearConversation(layer);renderPresence();};
      const advance=layer.querySelector('[data-npc-advance]');
      advance.onclick=()=>{if(!currentDialogue)return;if(dialogueLineIndex+1<currentDialogue.lines.length){dialogueLineIndex+=1;renderDialogueLine(layer);}else showGift(layer);};
      layer.querySelector('[data-npc-gift-accept]').onclick=()=>closeGift(layer);
      layer.querySelector('[data-npc-gift-overlay]').onkeydown=event=>{
        if(event.key==='Escape'){event.preventDefault();closeGift(layer);}
        else if(event.key==='Tab'){event.preventDefault();layer.querySelector('[data-npc-gift-accept]').focus({preventScroll:true});}
      };
      layer.addEventListener('pointerdown',event=>{if(event.target.closest('button,[data-npc-conversation]'))event.stopPropagation();});
      layer.parentElement.parentElement.addEventListener('scroll',()=>fit(layer),{passive:true});
    });
    window.addEventListener('resize',()=>layers.forEach(fit),{passive:true});
    window.addEventListener('message',event=>{
      if(event.source!==window.parent||!event.data)return;
      if(event.data.type==='doorbell-npc:artwork'){
        const value=event.data.artwork;
        if(!value||!value.portraits)return;
        const portraits={};portraitIds.forEach(id=>{if(typeof value.portraits[id]==='string')portraits[id]=value.portraits[id];});
        artwork={portraits,gifts:value.gifts||{}};renderPresence();layers.forEach(applyGiftArtwork);return;
      }
      if(event.data.type==='doorbell-npc:reset'){shownGiftReceipts.clear();leave();return;}
      if(event.data.type!=='doorbell-npc:result'||event.data.request_id!==currentRequest)return;
      currentRequest=null;
      const result=event.data.result;const layer=layerFor(activePlace);if(!layer)return;
      const status=layer.querySelector('[data-npc-read-status]');
      if(!result||!result.ok){
        if(selectedNpc)showLine(layer,'暂无法读取');else{status.hidden=false;status.textContent='暂无法读取';}
        return;
      }
      if(Array.isArray(result.data.npcs)){status.hidden=true;npcs=result.data.npcs;renderPresence();}
      else if(selectedNpc)renderDialogue(layer,result.data);
    });
    window.doorbellNpc={leave,open(place){
      leave();if(window.__doorbellCandidateDemo||!layerFor(place))return;
      activePlace=place;layers.forEach(fit);
      const status=layerFor(place).querySelector('[data-npc-read-status]');status.hidden=false;status.textContent='正在读取……';
      send({type:'doorbell-npc:read'});
    }};
  })();`;
}
