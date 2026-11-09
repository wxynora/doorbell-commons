const number = new Intl.NumberFormat('zh-CN');
const pendingKey = 'doorbell:lounge-scratchcard:pending';
const confirmedDeclines = new Set(['quota_exceeded', 'insufficient_gold', 'spend_limit_exceeded']);
let activeDialog;
let pendingInMemory = null;
let styleReady;

function pendingTicket() {
  try {
    return JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null') ?? pendingInMemory;
  } catch {
    return pendingInMemory;
  }
}

function rememberTicket(pending) {
  pendingInMemory = pending;
  try {
    if (pending) sessionStorage.setItem(pendingKey, JSON.stringify(pending));
    else sessionStorage.removeItem(pendingKey);
  } catch {
    // The current page can still recover the request if storage is disabled.
  }
}

function loadStyle() {
  if (styleReady) return styleReady;
  styleReady = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./scratchcard-dialog.css', import.meta.url).href;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      link.remove();
      styleReady = undefined;
      reject(new Error('刮刮乐机样式加载失败。'));
    }, { once: true });
    document.head.append(link);
  });
  return styleReady;
}

async function request(path, body) {
  const response = await fetch(path, body ? {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } : { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? '暂时无法连接刮刮乐机。');
    error.code = data?.error?.code;
    throw error;
  }
  if (data?.ok !== true || !data.status) throw new Error('购票回执暂未确认。');
  return data;
}

function coat(canvas, label) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.globalCompositeOperation = 'source-over';
  const sheen = ctx.createLinearGradient(0, 0, width, height);
  sheen.addColorStop(0, '#8f9299');
  sheen.addColorStop(.38, '#dbdde1');
  sheen.addColorStop(.60, '#b8bdc3');
  sheen.addColorStop(1, '#8a919a');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#f5f2e32b';
  ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = '#fff9e7a8';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = '#414750';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 42px "PingFang SC", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(label, width / 2, height / 2);
}

function connectScratch(canvas, reveal) {
  const ctx = canvas.getContext('2d');
  let pointer;
  let previous;
  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height,
    };
  }
  function erase(from, to) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 64;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + .01, to.y);
    ctx.stroke();
  }
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || canvas.dataset.scratchable !== 'true') return;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    previous = position(event);
    erase(previous, previous);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    const next = position(event);
    erase(previous, next);
    previous = next;
  });
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let erased = 0;
    for (let index = 3; index < pixels.length; index += 16) {
      if (pixels[index] === 0) erased += 1;
    }
    if (erased >= pixels.length / 16 * .45) reveal();
  });
  canvas.addEventListener('pointercancel', () => { pointer = undefined; });
  canvas.addEventListener('lostpointercapture', () => { pointer = undefined; });
}

function dispenseFromScene(sceneFrame, dialog) {
  const { port1, port2 } = new MessageChannel();
  return new Promise(resolve => {
    function finish() {
      clearTimeout(deadline);
      port1.close();
      sceneFrame.removeEventListener('load', finish);
      dialog.removeEventListener('close', finish);
      resolve();
    }
    // A reloaded scene can miss the visual message. The paid ticket stays available.
    const deadline = setTimeout(finish, 2500);
    sceneFrame.addEventListener('load', finish, { once: true });
    dialog.addEventListener('close', finish, { once: true });
    port1.onmessage = event => {
      if (event.data === 'printing') clearTimeout(deadline);
      if (event.data === 'done') finish();
    };
    try {
      sceneFrame.contentWindow.postMessage({ type: 'lounge-scratchcard-dispense' }, location.origin, [port2]);
    } catch {
      port2.close();
      finish();
    }
  });
}

export async function openScratchcardDialog({ preview = false, sceneFrame } = {}) {
  if (activeDialog?.open) return activeDialog.focus();
  await loadStyle();
  if (activeDialog?.open) return activeDialog.focus();
  const dialog = document.createElement('dialog');
  activeDialog = dialog;
  dialog.className = 'lounge-scratchcard';
  dialog.setAttribute('aria-label', '购买刮刮乐');
  dialog.innerHTML = `
    <button class="scratchcard-close" type="button" aria-label="关闭刮刮乐">×</button>
    <section class="scratchcard-purchase">
      <p class="scratchcard-kicker">公共休息室</p>
      <h2>购买刮刮乐</h2>
      <div class="scratchcard-offer">
        <p><strong class="scratchcard-price">5,000</strong> 金币 / 张</p>
        <p>头奖 <strong class="scratchcard-top-gold">1,000,000</strong> 金币</p>
      </div>
      <div class="scratchcard-account">
        <span>可用金币 <strong class="scratchcard-gold">—</strong></span>
        <span>今日 <strong class="scratchcard-quota">—</strong></span>
      </div>
      <p class="scratchcard-purchase-notice" role="status"></p>
      <button class="scratchcard-buy" type="button" disabled>买一张 · 5,000 金币</button>
      <p class="scratchcard-error" role="alert" hidden></p>
      <button class="scratchcard-refresh" type="button" hidden>重新查看</button>
      <details hidden><summary>奖项与概率</summary><p class="scratchcard-odds-note"></p><dl></dl></details>
    </section>
    <section class="scratchcard-ticket-view" hidden>
      <div class="scratchcard-paper">
        <img alt="铃野刮刮乐纸票，面额 5,000 金币，最高奖金 1,000,000 金币">
        <div class="scratchcard-zone">
          <div class="scratchcard-face" aria-hidden="true"><p>本票奖金</p><strong></strong><span></span></div>
          <canvas width="704" height="212" aria-hidden="true" data-scratchable="false"></canvas>
        </div>
        <span class="scratchcard-serial"></span>
      </div>
      <p class="scratchcard-ticket-notice" role="status"></p>
      <button class="scratchcard-reveal" type="button">直接揭晓</button>
      <button class="scratchcard-return" type="button" hidden>返回购票</button>
    </section>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const purchaseView = find('.scratchcard-purchase');
  const ticketView = find('.scratchcard-ticket-view');
  const art = find('.scratchcard-paper img');
  const face = find('.scratchcard-face');
  const canvas = find('canvas');
  const buy = find('.scratchcard-buy');
  const reveal = find('.scratchcard-reveal');
  const returnToPurchase = find('.scratchcard-return');
  const refresh = find('.scratchcard-refresh');
  const purchaseNotice = find('.scratchcard-purchase-notice');
  const ticketNotice = find('.scratchcard-ticket-notice');
  const errorLine = find('.scratchcard-error');
  let status;
  let ticket;
  let pending;
  let recovered;
  let busy = false;
  let sealed = false;

  function showError(message = '') {
    errorLine.textContent = message;
    errorLine.hidden = !message;
  }

  function showOdds() {
    const list = find('dl');
    list.replaceChildren();
    let winningWeight = 0;
    let itemWeight = 0;
    let payoutWeight = 0;
    let topPrize = 0;
    for (const prize of status.prizes) {
      const name = document.createElement('dt');
      const probability = document.createElement('dd');
      if (prize.item) name.textContent = `${prize.item.name} × ${prize.item.quantity}`;
      else name.textContent = prize.gold === 0 ? '未中奖' : `${number.format(prize.gold)} 金币${prize.gold === status.price_gold ? '（回本）' : ''}`;
      if (prize.title) name.textContent += ` ＋ 称号「${prize.title.name}」`;
      probability.textContent = `${number.format(prize.weight / status.total_weight * 100)}%`;
      list.append(name, probability);
      if (prize.gold > 0) winningWeight += prize.weight;
      if (prize.item) itemWeight += prize.weight;
      payoutWeight += prize.gold * prize.weight;
      topPrize = Math.max(topPrize, prize.gold);
    }
    find('.scratchcard-top-gold').textContent = number.format(topPrize);
    find('.scratchcard-odds-note').textContent = `每张独立开奖。金币奖 ${number.format(winningWeight / status.total_weight * 100)}%（含回本），杂物奖 ${number.format(itemWeight / status.total_weight * 100)}%，金币理论返奖率 ${number.format(payoutWeight / status.total_weight / status.price_gold * 100)}%。`;
    find('details').hidden = false;
  }

  function render(view = ticket ? 'ticket' : 'purchase') {
    if (dialog.dataset.view !== view) dialog.scrollTop = 0;
    dialog.dataset.view = view;
    dialog.setAttribute('aria-label', { purchase: '购买刮刮乐', dispensing: '刮刮乐出票中', ticket: '刮刮乐票面' }[view]);
    purchaseView.hidden = view !== 'purchase';
    ticketView.hidden = view !== 'ticket';
    const price = number.format(status?.price_gold ?? 5000);
    buy.disabled = preview || busy || !status || (!pending && (status.remaining_today === 0 || status.gold < status.price_gold));
    if (busy) buy.textContent = '正在核对购票…';
    else if (recovered) buy.textContent = '刮开已买的票';
    else if (pending) buy.textContent = '确认上一张购票';
    else buy.textContent = `买一张 · ${price} 金币`;
    reveal.hidden = !sealed;
    returnToPurchase.hidden = sealed;
    canvas.hidden = !sealed;
    canvas.dataset.scratchable = String(sealed);
    find('.scratchcard-price').textContent = price;
    find('.scratchcard-gold').textContent = status ? number.format(status.gold) : '—';
    find('.scratchcard-quota').textContent = status ? `${status.count}/${status.limit} 张` : '—';
  }

  function showPurchaseNotice() {
    if (recovered) purchaseNotice.textContent = '上一张已购票，可以继续刮开。';
    else if (pending) purchaseNotice.textContent = '上一张购票结果待确认。';
    else if (status.remaining_today === 0) purchaseNotice.textContent = '今天的 100 张已买完。';
    else if (status.gold < status.price_gold) purchaseNotice.textContent = '可用金币不足，买一张需要 5,000 金币。';
    else purchaseNotice.textContent = '';
  }

  function settle(ticketResult) {
    ticket = ticketResult;
    recovered = undefined;
    sealed = true;
    if (!art.hasAttribute('src')) art.src = new URL('./scratchcard-ticket.svg', import.meta.url).href;
    face.setAttribute('aria-hidden', 'true');
    const item = ticket.prize_item;
    find('.scratchcard-face p').textContent = item ? '本票奖品' : '本票奖金';
    find('.scratchcard-face strong').textContent = item ? item.name : ticket.prize_gold ? number.format(ticket.prize_gold) : '未中奖';
    find('.scratchcard-face span').textContent = item ? `× ${item.quantity}` : ticket.prize_gold ? '金币' : '';
    find('.scratchcard-serial').textContent = `票号 · ${ticket.request_id.slice(0, 8).toUpperCase()}`;
    coat(canvas, '刮开见奖');
    ticketNotice.textContent = '拖动刮开银层';
  }

  function revealTicket() {
    if (!sealed) return;
    const { prize_gold: prize, prize_item: item, prize_title: title, cost_gold: cost } = ticket;
    if (item) ticketNotice.textContent = `刮到 ${item.name} × ${item.quantity}，已放入背包。`;
    else ticketNotice.textContent = prize === 0 ? '本张未中奖。' : prize === cost ? '刮中 5,000 金币，本张回本。' : `刮中 ${number.format(prize)} 金币，已到账。`;
    if (title) ticketNotice.textContent += ` 称号「${title.name}」已解锁，可在农场设置佩戴。`;
    face.removeAttribute('aria-hidden');
    sealed = false;
    pending = undefined;
    rememberTicket(null);
    render();
    returnToPurchase.focus();
  }

  async function load() {
    busy = true;
    refresh.hidden = true;
    showError();
    render();
    try {
      const saved = pendingTicket();
      const query = saved?.requestId ? `?requestId=${encodeURIComponent(saved.requestId)}` : '';
      const response = await request(`/api/lounge/scratchcard${query}`);
      if (!dialog.open) return;
      status = response.status;
      pending = saved?.farmDoorplate === status.farm_doorplate ? saved : undefined;
      recovered = pending ? response.ticket ?? undefined : undefined;
      showOdds();
      showPurchaseNotice();
    } catch (error) {
      if (!dialog.open) return;
      status = undefined;
      showError(error.message);
      refresh.hidden = false;
    } finally {
      busy = false;
      if (dialog.open) render();
    }
  }

  buy.addEventListener('click', async () => {
    if (busy || !status || ticket) return;
    if (recovered) {
      settle(recovered);
      render();
      reveal.focus();
      return;
    }
    pending ??= { requestId: crypto.randomUUID(), farmDoorplate: status.farm_doorplate };
    rememberTicket(pending);
    busy = true;
    showError();
    render();
    try {
      const response = await request('/api/lounge/scratchcard/buy', {
        requestId: pending.requestId, expectedFarmDoorplate: pending.farmDoorplate,
      });
      if (!dialog.open) return;
      status = response.status;
      const target = sceneFrame?.isConnected ? sceneFrame.contentWindow : null;
      if (target && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        render('dispensing');
        await dispenseFromScene(sceneFrame, dialog);
      }
      if (dialog.open) settle(response.ticket);
    } catch (error) {
      if (!dialog.open) return;
      if (confirmedDeclines.has(error.code)) {
        rememberTicket(null);
        pending = undefined;
        showError(error.message);
        status = undefined;
        refresh.hidden = false;
      } else {
        showError('这次购票结果待确认，可确认同一张票。');
        if (error.code === 'binding_unavailable') refresh.hidden = false;
      }
    } finally {
      busy = false;
      if (dialog.open) {
        render();
        if (sealed) reveal.focus();
      }
    }
  });

  connectScratch(canvas, revealTicket);
  reveal.addEventListener('click', revealTicket);
  returnToPurchase.addEventListener('click', () => {
    ticket = undefined;
    showPurchaseNotice();
    render();
    if (!buy.disabled) buy.focus();
  });
  refresh.addEventListener('click', load);
  find('.scratchcard-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (activeDialog === dialog) activeDialog = undefined;
  }, { once: true });
  dialog.showModal();
  if (preview) {
    purchaseNotice.textContent = '请在公共休息室完整页面购买。';
    render();
  } else {
    purchaseNotice.textContent = '正在查看今天的购票额度…';
    void load();
  }
}
