export const candyEatingHint = "小幽灵把祝福和恶作剧藏进了糖里，吃下才揭晓。谁吃下，效果就落在谁身上。";

export interface CandyEffect { kind: string; value?: number }
export interface CandyEffectReceipt { candyId: string; effect: CandyEffect; expiresAt: number }

export function candyEffectText(effect: CandyEffect) {
  const percent = Math.round(Math.abs(effect.value ?? 0) * 100);
  const descriptions: Record<string, string> = {
    harvest_gold: `下一次收获，作物基础金币多${percent}%。`,
    plant_time: `下一次播种，生长时间缩短${percent}%。`,
    fishing_junk: `下一次钓鱼，杂物概率变成原来的${percent}%。`,
    dog_block_probability_add: '下一次遇到看家狗时，它拦住你的概率增加10个百分点。',
    fishing_junk_add: '下一次钓鱼，钓到杂物的概率增加15个百分点。',
    plant_time_add: '下一次播种，小苗的生长时间延长5%。',
    theft_caught_gold: '下一次偷菜被抓，额外掉落最多200金币，余额不足就掉现有金币。',
    human_harvest_gold: `下一次收菜（包括帮收），这株作物的基础金币多${percent}%。`,
    human_ranch_yield: `下一次收牧场产物，这只动物的产物数量多${percent}%。`,
    human_cook_extra: `下一次成功做出正常料理，额外得到${effect.value ?? 1}份同样的料理。`,
    human_block_harvest: '接下来2小时，暂时不能收菜或帮收。',
    human_block_ranch_collect: '接下来2小时，暂时不能收取牧场产物。',
    human_block_cook: '接下来2小时，暂时不能做饭。',
    human_block_dispatch: '接下来2小时，暂时不能派遣动物。',
  };
  return descriptions[effect.kind] ?? '这颗糖的回执还没读完整，请刷新背包确认。';
}

export function candyEffectStatus(effect: CandyEffect) {
  return effect.kind.startsWith('human_block_') ? 'active' : 'waiting';
}

export function candyEffectStatusText(effect: CandyEffect) {
  return candyEffectStatus(effect) === 'active' ? '正在生效' : '等待下一次适用动作';
}

export function candyEffectExpiry(expiresAt: number) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(expiresAt);
}
