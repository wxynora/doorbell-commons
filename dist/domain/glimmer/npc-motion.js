import { selectOutcome } from './random-outcome.js';
import { drawNpcReceiptEntry, npcReceiptKey } from '../../npc/receipt-greeting.js';
import { glimmerContentEditor } from '../../content.js';
import { randomBytes } from 'node:crypto';
import { Rng } from '../../rng.js';
import { grantReward } from '../../glimmer.js';
import { settleEncounterCost } from './encounter-cost.js';

function rewardReceipt(reward, suffix) {
    if (!['coins', 'silver', 'item', 'bait'].includes(reward?.kind)) return suffix;
    const name = reward.kind === 'coins' ? '金币' : reward.kind === 'silver' ? '银币'
        : glimmerContentEditor.catalog[reward.kind].find(item => item.id === reward.id)?.name ?? reward.id;
    return `\n🎁 获得「${name}」×${reward.amount}。`;
}

// Content, chance and matching tools all come from the owner's published entry.
// Return data here; the existing tool boundary owns receipt rendering and persistence.
export function triggerNpcMotions(farm, sourceOp, motions, now, context = {}) {
    if (!sourceOp) return [];
    const rng = new Rng(farm.rngState ?? 1);
    const entry = drawNpcReceiptEntry({residentId: context.residentId ?? farm.id, op: sourceOp,
        args: context.args ?? {}, result: {ok:true,text:''}, npcs: context.npcs ?? [],
        motions:[...motions.values()], roll:context.roll ?? (() => rng.next())});
    let result = [];
    if (entry?.legacy) result = [{entry,text:entry.text}];
    else if (entry?.type === 'choice') {
        const id = randomBytes(9).toString('base64url');
        farm.npcMotions ??= {};
        farm.npcMotions[id] = { entry: structuredClone(entry), createdAt: now };
        result = [{id,entry}];
    } else if (entry) {
        const settlement = settleEncounterCost(farm, entry, true);
        const suffix = rewardReceipt(entry.reward, grantReward(farm, entry.reward, rng, now));
        result = [{entry,text:settlement.text + suffix}];
    }
    farm.rngState = rng.state;
    return result;
}

export function settleNpcMotion(farm, id, option, now) {
    const pending = farm.npcMotions?.[id];
    if (!pending || !Object.hasOwn(pending.entry.options, option)) return null;
    if (pending.result) return { ...pending.result, replay: true };
    const selected = pending.entry.options[option];
    const settlement = settleEncounterCost(farm, selected);
    if (!settlement.ok) return { ok: false, text: settlement.text };
    const rng = new Rng(farm.rngState ?? 1);
    const outcome = selectOutcome(selected, rng);
    const suffix = rewardReceipt(outcome.reward, grantReward(farm, outcome.reward, rng, now));
    farm.rngState = rng.state;
    const result = { ok: true, text: (selected.outcomes ? outcome.text : settlement.text) + suffix };
    pending.result = result;
    pending.selected = option;
    pending.settledAt = now;
    return result;
}

export function isNpcMotionChoice(action, params) {
    return action === 'glimmer' && params.op === 'choose' && typeof params.option === 'string' && params.option.startsWith('motion:');
}
export function npcMotionChoiceReceipt(farm, option, now, { save, view, detail }) {
    const match = /^motion:([A-Za-z0-9_-]{12}):([AB])$/u.exec(option);
    const result = match ? settleNpcMotion(farm, match[1], match[2], now) : null;
    if (!result) return { status: 400, json: { ok: false, text: '现在没有待处理的流光原野选择。' } };
    if (result.ok && !result.replay) save();
    return { status: result.ok ? 200 : 400, json: { ok: result.ok, text: result.text, ...(detail ? {farm: view(farm, now)} : {}) } };
}

export function appendNpcMotionReceipt(farm, out, sourceOp, now, { motions, save, restore, getFarm, view, context = {} }) {
    if (out.json?.ok !== true || out.json.data?.npc_dialogue || !sourceOp || context.disabled) return out;
    if (!sourceOp.startsWith('go.') && ![...motions.values()].some(entry => entry.tools.includes(sourceOp))) return out;
    const original = structuredClone(out);
    try {
        const current = getFarm(farm.id);
        const key = npcReceiptKey(context.residentId ?? farm.id, sourceOp, context.args ?? {});
        let receipt = key ? current.npcMotionReceipts?.[key] : null;
        if (!receipt) {
            const results = triggerNpcMotions(current, sourceOp, motions, now, context);
            const options = [];
            const paragraphs = results.map(({id,entry,text}) => {
                if (entry.legacy) return text;
                const story = `〔${entry.npcName}〕${text ?? entry.text}`;
                if (entry.type !== 'choice') return story;
                return story + '\n' + Object.entries(entry.options).map(([label,choice]) => {
                    const option = `motion:${id}:${label}`;
                    options.push({label:choice.label,option,op:'farm.glimmer.choose'});
                    return `${label}. ${choice.label}\ndoorbell(${JSON.stringify({op:'farm.glimmer.choose',args:{option}})})`;
                }).join('\n');
            });
            receipt = {paragraphs,options};
            if (key) {current.npcMotionReceipts ??= {};current.npcMotionReceipts[key] = receipt;}
            save();
        }
        const updated = out.json.farm?.id ? getFarm(out.json.farm.id) : null;
        return {...out,json:{...out.json,text:[out.json.text,...receipt.paragraphs].join('\n\n'),
            ...(updated?{farm:view(updated,now)}:{}),
            ...(sourceOp.startsWith('go.') && receipt.options.length ? {data:{...out.json.data,npc_motion:{options:receipt.options}}}: {})}};
    } catch (error) {
        restore();
        console.error('[npc-motion] receipt settlement failed');
        return original;
    }
}
