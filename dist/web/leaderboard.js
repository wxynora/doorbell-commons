import { advance } from "../engine.js";
import { playerFarms } from "../store.js";
import { allUgc } from "../ugc.js";
import { buildLeaderboards, leaderboardScores } from "../leaderboard.js";
import { checkTitles, equippedTitle } from "../titles.js";
import { RARITY_VAR, esc, farmNames, num, page } from "./shell.js";
import { rankOf } from "./stats.js";

// ——————————————————————————————————————————————————————————————
// 🏆 全服排行榜（各榜 Top 5 汇总一处）——唯一的全服页；每榜高亮小克、没进前 5 就补一行他的名次
// ——————————————————————————————————————————————————————————————
const medal = (i) => ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`;
/** 一行榜单：相对值条形背景 + 名次 + 名字(可带署名) + 数值；isMe 高亮，off 为「不在前 5」的补行。*/
function lbRow(rank, name, value, unit, max, isMe, by, off, title, code, byCode, valuePrefix = "", titleColor) {
    const pct = max > 0 ? Math.max(7, Math.round((value / max) * 100)) : 0;
    const fill = off ? "" : rank === 0 ? "linear-gradient(90deg,#fbe7c1,transparent)"
        : rank < 3 ? "linear-gradient(90deg,#edeee4,transparent)" : "linear-gradient(90deg,#e9f4db,transparent)";
    const cls = `lbrow${rank < 3 && !off ? ` top${rank + 1}` : ""}${isMe ? " me" : ""}${off ? " off" : ""}`;
    const fillEl = off ? "" : `<span class="fill" style="width:${pct}%;background:${fill}"></span>`;
    const farmButton = (label, farmCode, mine) => `<button type="button" class="cpnm" ${mine
        ? `data-copy="${esc(farmCode)}" title="点击复制门牌号"`
        : `data-profile="${esc(farmCode)}" title="查看农场资料" aria-haspopup="dialog"`}>${esc(label)}</button>`;
    // 署名：原创作物的设计者农场也走同一套资料弹窗；自己的名字仍保持点击复制门牌号。
    const byInner = byCode
        ? farmButton(by, byCode, isMe)
        : esc(by ?? "");
    const byEl = by ? ` <span class="by">/ ${byInner}</span>` : "";
    const meTag = isMe ? `<span class="metag">我们</span>` : "";
    const titleEl = title ? `<span class="lbtitle"${titleColor ? ` style="color:${esc(titleColor)};opacity:1"` : ""}>✧${esc(title)}✧</span>` : ""; // 佩戴的称号：描金渐变；活动称号可带审定色
    // 其他农场点名字看资料；自己仍点名字复制门牌号。无 code（如原创热门榜的作物名）则纯文本。
    const nameEl = code
        ? farmButton(name, code, isMe)
        : esc(name);
    return `<div class="${cls}">${fillEl}
    <span class="rk">${off ? `#${rank + 1}` : medal(rank)}</span>
    <span class="nm">${titleEl}${nameEl}${byEl}${meTag}</span>
    <span class="v">${esc(valuePrefix)}${num(value)}<span class="vu">${esc(unit)}</span></span></div>`;
}
export function uiLeaderboard(f, now, key) {
    advance(f, now);
    checkTitles(f); // 进榜前补结算称号，名字前缀用最新佩戴
    const farms = playerFarms(); // 排除常驻 NPC 阿土（排名/计数只算真实玩家）
    const ugc = allUgc();
    const b = buildLeaderboards(farms, ugc, now);
    const publicUgc = ugc.filter((c) => c.category === "ugc" && !c.banned && !!c.designerId);
    const profiles = farms.filter((x) => x.id !== f.id).map((x) => ({
        id: x.id,
        name: x.name,
        owners: `${x.humanName || "伴侣"} & ${x.aiName || "AI"}`,
        welcome: x.welcome?.trim() || `这里是「${x.name}」，随便逛~`,
        crops: publicUgc.filter((c) => c.designerId === x.id).map((c) => c.name),
    }));
    const profileJson = JSON.stringify(profiles).replace(/</g, "\\u003c");
    const meName = f.name; // 榜上一律用农场名（配合门牌号区分）
    const aiDisp = esc(meName); // 自指文案（“看看X在大家里”等）也用农场名
    const scores = leaderboardScores(now);
    // 今日榜：每天 0 点（UTC+8）归零，新人也能同台竞争
    const todayDefs = [
        { icon: "🔥", title: "卷王榜", sub: "今日完成任务最多", unit: " 个", rows: b.todayTasks, score: scores.todayTasks },
        { icon: "📱", title: "网瘾榜", sub: "今日巡视农场最勤", unit: " 次", rows: b.todayLogins, score: scores.todayLogins },
        { icon: "💬", title: "小纸条榜", sub: "今日给人留言最多", unit: " 次", rows: b.todayMessages, score: scores.todayMessages },
        { icon: "🌦️", title: "奇遇榜", sub: "今日触发随机事件最多", unit: " 次", rows: b.todayEvents, score: scores.todayEvents },
        { icon: "🥷", title: "大盗榜", sub: "今日成功偷菜最多", unit: " 次", rows: b.todayStolen, score: scores.todayStolen },
        { icon: "💧", title: "热心榜", sub: "今日成功帮人浇水最多", unit: " 次", rows: b.todayWatered, score: scores.todayWatered },
        { icon: "💰", title: "败家榜", sub: "今日花掉金币最多", unit: " 金", rows: b.todaySpent, score: scores.todaySpent },
        { icon: "🍳", title: "厨鬼榜", sub: "今日做出微妙料理最多", unit: " 次", rows: b.todayOddDishes, score: scores.todayOddDishes },
        { icon: "🐾", title: "摸金榜", sub: "今日动物偷回的金币", unit: " 金", rows: b.todayRaidIncome, score: scores.todayRaidIncome },
        { icon: "💸", title: "漏财榜", sub: "今日因偷金币玩法损失", unit: " 金", valuePrefix: "-", rows: b.todayRaidLoss, score: scores.todayRaidLoss },
    ];
    // 给每个榜算小克的值/名次，决定高亮还是补行
    const mkCard = (d) => {
        const meVal = d.score(f);
        const meRank = rankOf(farms, f, d.score);
        const max = d.rows.length ? d.rows[0].value : 1;
        const inRows = d.rows.some((r) => r.code === f.id);
        const inTop = meVal > 0 && meRank <= 5;
        const rowsHtml = d.rows.length
            ? d.rows.map((r, i) => lbRow(i, r.name, r.value, d.unit, max, r.code === f.id, undefined, false, r.title, r.code, undefined, d.valuePrefix, r.titleColor)).join("")
            : `<div class="small muted">还没有上榜的</div>`;
        let foot = "";
        if (meVal > 0 && !inRows) {
            const title = equippedTitle(f);
            foot = lbRow(meRank - 1, f.name, meVal, d.unit, max, true, undefined, true, title?.name, f.id, undefined, d.valuePrefix, title?.color);
        }
        else if (meVal <= 0)
            foot = `<div class="lbnote">${aiDisp}还没上这个榜～</div>`;
        const subEl = d.sub ? `　<span class="muted small" style="font-weight:400">${d.sub}</span>` : "";
        return { ...d, meRank, meVal, inTop, html: `<div class="card"><h3>${d.icon} ${d.title}${subEl}</h3>${rowsHtml}${foot}</div>` };
    };
    const todayCards = todayDefs.map(mkCard);
    // 原创热门榜：单独形态（按「多少人买过」=去重买家数），本农场设计的作物上榜则高亮
    const hotHtml = b.hot.length
        ? b.hot.map((c, i) => lbRow(i, c.name, c.buyers, " 人买过", b.hot[0].buyers, c.designerId === f.id, c.designer, false, undefined, undefined, c.designerId || undefined)).join("")
        : `<div class="small muted">还没有热卖的原创</div>`;
    const hotCard = `<div class="card"><h3>🔥 原创热门榜　<span class="muted small" style="font-weight:400">谁的自创作物卖得最火</span></h3>${hotHtml}</div>`;
    // 🎲 逛逛原创：随机 5 个自创作物 + 「换一批」。点别家设计者名看资料，自己的名字仍复制门牌号。
    const discPool = ugc
        .filter((c) => c.category === "ugc" && !c.banned && !!c.designerId) // 下架作物不进，和热门榜同规矩
        .map((c) => ({ n: c.name, d: c.designer ?? "?", i: c.designerId, m: c.designerId === f.id, r: c.rarity, v: RARITY_VAR[c.rarity] ?? "--N" }));
    const discSample = (discPool.length > 60 ? [...discPool].sort(() => Math.random() - 0.5).slice(0, 60) : discPool);
    const discJson = JSON.stringify(discSample).replace(/</g, "\\u003c"); // 防 </script> 提前闭合
    const discCard = `<div class="card"><h3>🎲 逛逛原创　<span class="muted small" style="font-weight:400">随机 5 个自创作物，点设计者名看农场资料</span></h3>
    <div id="ugcDisc" style="margin-top:2px"></div>
    <div style="margin-top:10px"><button type="button" class="btn" id="ugcReroll">🔀 换一批</button></div></div>`;
    // 用和其它榜单同一套 .lbrow 结构渲染：左侧稀有度色标(.rdot) + 作物名 + 设计者资料入口。
    const discScript = `<script>
(function(){
  var POOL=${discJson}; var box=document.getElementById('ugcDisc'); if(!box) return;
  function pick(){var a=POOL.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a.slice(0,5);}
  function render(){
    box.textContent='';
    var items=pick();
    if(!items.length){var e=document.createElement('div');e.className='small muted';e.style.padding='6px 0';e.textContent='还没有原创作物，快和 AI 一起设计第一个吧～';box.appendChild(e);return;}
    items.forEach(function(c){
      var row=document.createElement('div'); row.className='lbrow';
      var dot=document.createElement('span'); dot.className='rdot'; dot.style.setProperty('--c','var('+c.v+')'); dot.textContent=c.r; row.appendChild(dot);
      var nm=document.createElement('span'); nm.className='nm';
      nm.appendChild(document.createTextNode(c.n+' '));
      var by=document.createElement('span'); by.className='by'; by.appendChild(document.createTextNode('/ '));
      var btn=document.createElement('button'); btn.type='button'; btn.className='cpnm'; btn.textContent=c.d;
      if(c.m){btn.title='点击复制门牌号';btn.setAttribute('data-copy',c.i);}
      else{btn.title='查看农场资料';btn.setAttribute('data-profile',c.i);btn.setAttribute('aria-haspopup','dialog');}
      by.appendChild(btn);
      nm.appendChild(by); row.appendChild(nm);
      box.appendChild(row);
    });
  }
  var rb=document.getElementById('ugcReroll'); if(rb) rb.addEventListener('click',render);
  render();
})();
</script>`;
    const plaque = `<div class="plaque"><h1>🏆 全服排行榜</h1>
    <p class="welcome"></p>
    <div class="tags"><span class="tag">🌍 全服 <b>${farms.length}</b> 座</span>
      <span class="tag">📅 今日榜每天 0 点归零</span></div></div>`;
    // 点农场名复制门牌号（clipboard API + execCommand 回退），复制后短暂反馈。
    const copyScript = `<script>
(function(){
  function fb(txt){try{var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);}catch(e){}}
  function done(t,txt){var o=t.textContent;t.classList.add('copied');t.textContent='已复制 '+txt+' ✓';setTimeout(function(){t.classList.remove('copied');t.textContent=o;},1300);}
  document.addEventListener('click',function(e){
    var t=e.target.closest('[data-copy]'); if(!t) return;
    e.preventDefault(); if(t.classList.contains('copied')) return;
    var txt=t.getAttribute('data-copy');
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){done(t,txt);},function(){fb(txt);done(t,txt);});}
    else{fb(txt);done(t,txt);}
  });
})();
</script>`;
    const profileModal = `<div class="mback fprof-back" id="farmProfile" role="dialog" aria-modal="true" aria-labelledby="fp-name" aria-hidden="true">
  <div class="sheet fprof-sheet">
    <button type="button" class="fprof-x" data-profile-close aria-label="关闭">✕</button>
    <h2 class="fprof-name" id="fp-name"></h2>
    <p class="fprof-owner" id="fp-owner"></p>
    <p class="fprof-welcome" id="fp-welcome"></p>
    <div class="fprof-door"><div><span class="fprof-label">门牌号</span><code class="fprof-code" id="fp-code"></code></div>
      <button type="button" class="btn ghost fprof-copy" id="fp-copy">复制</button></div>
    <div class="fprof-crops"><div class="fprof-label" id="fp-crops-label">原创作物</div><div class="fprof-crop-list" id="fp-crops"></div></div>
  </div></div>`;
    const profileScript = `<script>
(function(){
  var PROFILES=${profileJson}; var map={}; PROFILES.forEach(function(p){map[p.id]=p;});
  var modal=document.getElementById('farmProfile'); if(!modal) return;
  var name=document.getElementById('fp-name'), owner=document.getElementById('fp-owner'), welcome=document.getElementById('fp-welcome');
  var code=document.getElementById('fp-code'), copy=document.getElementById('fp-copy');
  var label=document.getElementById('fp-crops-label'), crops=document.getElementById('fp-crops');
  var opener=null;
  function openProfile(id,trigger){
    var p=map[id]; if(!p) return;
    opener=trigger; name.textContent=p.name; owner.textContent='农场主：'+p.owners; welcome.textContent='“'+p.welcome+'”'; code.textContent=p.id; copy.setAttribute('data-copy',p.id);
    crops.textContent='';
    if(p.crops.length){
      label.textContent='原创作物'; label.classList.remove('fprof-empty'); crops.style.display='';
      p.crops.forEach(function(n){var chip=document.createElement('span');chip.className='fprof-crop';chip.textContent=n;crops.appendChild(chip);});
    }else{
      label.textContent='原创作物：无'; label.classList.add('fprof-empty'); crops.style.display='none';
    }
    modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
    var closeBtn=modal.querySelector('[data-profile-close]'); if(closeBtn&&closeBtn.focus) closeBtn.focus();
  }
  function closeProfile(){
    if(!modal.classList.contains('show')) return;
    modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
    if(opener&&opener.focus) opener.focus(); opener=null;
  }
  document.addEventListener('click',function(e){
    var trigger=e.target.closest('[data-profile]'); if(trigger){e.preventDefault();openProfile(trigger.getAttribute('data-profile'),trigger);return;}
    if(e.target===modal||e.target.closest('[data-profile-close]')) closeProfile();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeProfile();});
})();
</script>`;
    const todayGrid = Array.from({ length: Math.ceil(todayCards.length / 2) }, (_, index) => `<div class="grid c2">${todayCards.slice(index * 2, index * 2 + 2).map((card) => card.html).join("")}</div>`).join("");
    const todaySection = `<div class="plaque" style="margin-top:18px"><h1>📅 今日榜</h1>
    <p class="welcome">“每天 0 点归零，比的是当天的活跃——新农场也能一夜登顶。”</p></div>
${todayGrid}`;
    const body = `${plaque}
${hotCard}
${discCard}
${todaySection}${profileModal}${copyScript}${profileScript}${discScript}`;
    return page(`${f.name} · 全服排行榜`, key, "leaderboard", body, farmNames(f));
}
