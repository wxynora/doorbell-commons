import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export class ContentEditorError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = message => { throw new ContentEditorError(400, message); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, label) => typeof value === 'string' && value.trim() ? value : reject(`请填写${label}。`);
const number = (value, label) => Number.isSafeInteger(value) && value > 0 ? value : reject(`${label}须为正整数。`);
function fields(value, keys) {
  if (!record(value) || Object.keys(value).some(k => !keys.includes(k))) reject('内容字段不正确，请重新打开工作台。');
}
export function validateContent(value, catalog, draft = false) {
  const text = (v, label) => typeof v === "string" && (draft || v.trim()) ? v : reject(`请填写${label}。`);
  const number = (v, label) => draft && typeof v === "number" && Number.isFinite(v) ? v : Number.isSafeInteger(v) && v > 0 ? v : reject(`${label}须为正整数。`);
  fields(value, ['category', 'npcName', 'name', 'type', 'text', 'reward', 'cost', 'options', 'tools', 'probability']);
  if (!['encounter', 'npc'].includes(value.category)) reject('请选择内容类别。');
  if (draft && value.category === 'npc' && value.tools === undefined) value = {...value, tools: []};
  const result = { category: value.category, npcName: value.category === 'npc' ? text(value.npcName, 'NPC名字') : '', name: text(value.name, '标题'), type: value.type, text: text(value.text, '剧情') };
  if (value.category === 'npc') {
    if (!Array.isArray(value.tools) || (!draft && !value.tools.length) || value.tools.some(op => typeof op !== 'string' || !/^(farm|go)\.[a-z][a-z0-9_.-]*$/u.test(op)) || new Set(value.tools).size !== value.tools.length) reject('请选择触发工具。');
    result.tools = [...value.tools];
  } else if (value.tools !== undefined || value.probability !== undefined) reject('奇遇不使用工具触发设置。');
  const reward = value => {
    fields(value, ['kind', 'amount', 'id']);
    const kind = value.kind;
    if (['none', 'dish', 'ingredient', 'egg', 'favorite'].includes(kind)) { if (Object.keys(value).length !== 1) reject('此奖励不需要数量或物品。'); return { kind }; }
    if (['coins', 'silver'].includes(kind)) { fields(value, ['kind', 'amount']); return { kind, amount: number(value.amount, '奖励数量') }; }
    if (['item', 'bait'].includes(kind)) {
      if (typeof value.id !== 'string' || (!draft && !catalog[kind].some(item => item.id === value.id))) reject('奖励物品不存在。');
      return { kind, id: value.id, amount: number(value.amount, '奖励数量') };
    }
    reject('请选择有效奖励。');
  };
  const outcome = value => {
    const out = { reward: reward(value.reward) };
    if (value.outcomes !== undefined) {
      if (value.reward.kind !== 'none' || !Array.isArray(value.outcomes) || !value.outcomes.length) reject('随机出货须填写结果表，固定奖励选择无奖励。');
      out.outcomes = value.outcomes.map(item => {
        fields(item, ['weight', 'text', 'reward']);
        if (typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight < 0 || (!draft && item.weight === 0)) reject('每项出货概率须大于0。');
        return { weight: item.weight, text: text(item.text, '出货剧情'), reward: reward(item.reward) };
      });
      if (!draft && Math.abs(out.outcomes.reduce((sum, item) => sum + item.weight, 0) - 100) > 1e-8) reject('出货概率合计须为100%。');
    }
    if (value.cost !== undefined) {
      fields(value.cost, ['kind', 'amount']);
      if (!['coins', 'silver'].includes(value.cost.kind)) reject('扣款只支持金币或银币。');
      out.cost = { kind: value.cost.kind, amount: number(value.cost.amount, '扣款数量') };
    }
    return out;
  };
  if (value.type === 'instant') {
    if (value.options !== undefined) reject('直接触发不需要选项。');
    Object.assign(result, outcome(value));
  } else if (value.type === 'choice') {
    if (value.reward !== undefined || value.cost !== undefined) reject('请在各选项中设置奖励和扣款。');
    fields(value.options, ['A', 'B']); result.options = {};
    for (const key of ['A', 'B']) {
      const option = value.options[key]; fields(option, ['label', 'text', 'reward', 'cost', 'outcomes']);
      result.options[key] = { label: text(option.label, `选项${key}`), text: option.outcomes && option.text === '' ? '' : text(option.text, `选项${key}结果`), ...outcome(option) };
    }
  } else reject('请选择触发方式。');
  return result;
}
export class GlimmerContentEditor {
  constructor({ file, encounters, encounterById, catalog }) {
    this.file = file; this.encounters = encounters; this.encounterById = encounterById; this.catalog = catalog;
    this.motions = new Map();
    this.state = { entries: [] };
    try { this.state = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!Array.isArray(this.state.entries)) throw new Error('Invalid glimmer editor data');
    const seen = new Set();
    for (const row of this.state.entries) {
      if (typeof row.id !== 'string' || seen.has(row.id) || encounterById.has(row.id)) throw new Error('Duplicate glimmer editor ID');
      seen.add(row.id); validateContent(row.content, catalog, row.status === 'draft');
      if (row.status !== 'draft') this.activate(row);
      if (row.status === 'withdrawn') this.deactivate(row);
    }
  }
  activate(row) {
    if (row.content.category === 'npc') { this.motions.set(row.id, { id: row.id, ...structuredClone(row.content) }); return; }
    if (this.encounters.some(event => event.id === row.id)) return;
    const { category, npcName, ...content } = row.content;
    const event = { id: row.id, ...structuredClone(content), text: category === "npc" ? `〔${npcName}〕${content.text}` : content.text };
    this.encounters.push(event); this.encounterById.set(row.id, event);
  }
  deactivate(row) {
    this.motions.delete(row.id);
    const index = this.encounters.findIndex(event => event.id === row.id);
    if (index >= 0) this.encounters.splice(index, 1);
    // Keep the immutable index for already-issued encounter choices, including after restart.
  }
  review({ id, version }) {
    const row = this.state.entries.find(row => row.id === id);
    if (!row) throw new ContentEditorError(404, '内容不存在。');
    if (row.version !== version) throw new ContentEditorError(409, '内容已更新，请重新打开。');
    validateContent(row.content, this.catalog);
    return structuredClone(row);
  }
  withdraw({ id, version }) {
    const old = this.review({ id, version });
    if (old.status !== 'published') throw new ContentEditorError(409, '只有已发布内容可以撤下。');
    const row = { ...old, status: 'withdrawn', version: old.version + 1, updatedAt: Date.now() };
    this.commit({ entries: this.state.entries.map(item => item.id === id ? row : item) });
    this.deactivate(row); return structuredClone(row);
  }
  commit(state) {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(state), { mode: 0o600 }); renameSync(temp, this.file); this.state = state;
  }
  list() { return { entries: structuredClone(this.state.entries), catalog: this.catalog }; }
  save({ id, version, content }) {
    const clean = validateContent(content, this.catalog, true);
    const old = id ? this.state.entries.find(row => row.id === id) : null;
    if (id && !old) throw new ContentEditorError(404, '草稿不存在。');
    if ((old?.version ?? 0) !== version) throw new ContentEditorError(409, '草稿已在其他页面更新，请重新打开后修改。');
    if (old && old.status !== 'draft') throw new ContentEditorError(409, '此条已发布。需要新内容时请复制新建。');
    const row = { id: old?.id ?? `editor_${randomUUID()}`, version: version + 1, status: 'draft', content: clean, updatedAt: Date.now() };
    this.commit({ entries: old ? this.state.entries.map(item => item.id === row.id ? row : item) : [...this.state.entries, row] });
    return structuredClone(row);
  }
  publish({ id, version }) {
    const old = this.state.entries.find(row => row.id === id);
    if (!old) throw new ContentEditorError(404, '草稿不存在。');
    if (old.status === 'published') { if (version !== old.version && version !== old.version - 1) throw new ContentEditorError(409, '版本已更新，请重新打开。'); return structuredClone(old); }
    if (old.version !== version) throw new ContentEditorError(409, '草稿已更新，请重新预览后发布。');
    validateContent(old.content, this.catalog);
    const row = { ...old, status: 'published', version: old.version + 1, publishedAt: Date.now() };
    this.commit({ entries: this.state.entries.map(item => item.id === id ? row : item) });
    this.activate(row); return structuredClone(row);
  }
}
