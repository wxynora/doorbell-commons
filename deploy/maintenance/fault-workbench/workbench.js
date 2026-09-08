const $ = id => document.getElementById(id);
const sourceNames = { http: '接口异常', mcp: '工具异常', manual: '补充反馈' };
const stamp = time => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(time);
let records = [], current, expiryTimer, busy = false, refreshing = false, generation = 0;
function notice(text) { $('notice').textContent = text; }
function setBusy(value) {
  busy = value;
  $('generate').disabled = value;
  $('manual-form').querySelector('button').disabled = value;
}
async function request(path, body) {
  const started = Date.now();
  const response = await fetch(path, { cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '暂时读不到记录。');
  const attach = record => ({ ...record, localDeadline: started + record.expiresAt - result.now });
  if (result.records) result.records = result.records.map(attach);
  if (result.record) result.record = attach(result.record);
  return result;
}
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const deadlines = records.map(record => record.localDeadline);
  if (current) deadlines.push(current.localDeadline);
  if (deadlines.length) expiryTimer = setTimeout(expire, Math.max(0, Math.min(...deadlines) - Date.now()));
}
function expire() {
  const now = Date.now();
  records = records.filter(record => record.localDeadline > now);
  if (current && current.localDeadline <= now) { current = undefined; generation++; notice('这条记录和报告已到期删除。'); }
  renderList(); renderDetail(); scheduleExpiry();
}
function renderList() {
  const list = $('records'); list.replaceChildren();
  $('count').textContent = String(records.length);
  if (!records.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '最近 24 小时没有已记录的故障。'; list.append(empty); }
  for (const record of records) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'record'; button.setAttribute('aria-pressed', String(current?.id === record.id));
    const title = document.createElement('strong'); title.textContent = record.feature;
    const meta = document.createElement('span'); meta.textContent = `${stamp(record.occurredAt)} · ${sourceNames[record.source]}`;
    button.append(title, meta); button.addEventListener('click', () => { current = record; generation++; notice(''); expire(); }); list.append(button);
  }
}
function renderDetail() {
  $('placeholder').hidden = !!current; $('selected').hidden = !current;
  $('report').textContent = ''; $('report-section').hidden = true;
  $('facts').replaceChildren(); $('feature').textContent = ''; $('source').textContent = ''; $('expiry').textContent = '';
  if (!current) return;
  $('source').textContent = sourceNames[current.source]; $('feature').textContent = current.feature;
  const facts = [['发生时间', stamp(current.occurredAt)], ['失败阶段', current.stage], ['错误类别', current.code]];
  if (current.route) facts.push(['接口入口', `${current.method} ${current.route}`]);
  facts.push([current.source === 'manual' ? '补录时版本' : '发生时版本', current.version ? current.version.slice(0, 12) : '未取得版本标记']);
  for (const [label, value] of facts) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; $('facts').append(dt, dd); }
  $('expiry').textContent = `${stamp(current.expiresAt)} 自动删除，整理不会延长留存。`;
  if (current.report) { $('report').textContent = current.report; $('report-section').hidden = false; }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true; $('refresh').disabled = true; $('records').setAttribute('aria-busy', 'true');
  try {
    const result = await request('/api/faults'); records = result.records;
    if (current) { const fresh = records.find(record => record.id === current.id); current = fresh ? { ...fresh, report: current.report } : undefined; }
    notice(''); expire();
  } catch (error) { notice(error.message); if (!records.length) { $('records').replaceChildren(); const message = document.createElement('p'); message.className = 'empty'; message.textContent = '记录暂不可读取。'; $('records').append(message); $('count').textContent = '—'; } }
  finally { refreshing = false; $('refresh').disabled = false; $('records').setAttribute('aria-busy', 'false'); }
}
$('refresh').addEventListener('click', refresh);
$('generate').addEventListener('click', async () => {
  if (!current || busy) return;
  const selectedId = current.id, startedGeneration = generation; setBusy(true); notice('');
  try {
    const result = await request('/api/report', { id: selectedId });
    if (generation !== startedGeneration || current?.id !== selectedId) return;
    current = result.record; records = records.map(record => record.id === selectedId ? current : record); expire();
    if (current) notice('材料已整理好。');
  } catch (error) { notice(error.message); expire(); }
  finally { setBusy(false); }
});
$('manual-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; setBusy(true); notice('');
  try {
    const result = await request('/api/manual', { page: $('page').value, occurredAt: new Date($('time').value).getTime() });
    current = result.record; generation++; records.unshift(current); $('manual-form').reset(); $('manual-details').open = false; expire(); notice('反馈已补充，可以整理材料了。');
  } catch (error) { notice(error.message); }
  finally { setBusy(false); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) expire(); });
window.addEventListener('pagehide', () => { records = []; current = undefined; generation++; renderList(); renderDetail(); clearTimeout(expiryTimer); });
window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
refresh();
