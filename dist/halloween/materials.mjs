// Approved material names and tiers from docs/product-plan.md.
export const MATERIALS = Object.freeze({
  N: Object.freeze(['砂糖', '红糖', '蜂蜜', '牛奶', '黄油', '南瓜泥', '苹果', '肉桂', '薄荷叶', '紫薯', '栗子', '玉米粒']),
  R: Object.freeze(['焦糖', '黑巧克力', '夜影莓', '蔓越莓', '枫糖浆', '香草荚', '桂花蜜', '蛛丝棉花糖', '蝙蝠翼糖片']),
  SR: Object.freeze(['月光露', '幽灵奶霜', '星屑糖粉', '魔女紫罗兰花瓣', '午夜黑醋栗', '骷髅糖霜', '幽光岩盐']),
  SSR: Object.freeze(['南瓜王糖心', '血月石榴', '幽灵蜂后蜜', '月影薄荷', '极光糖浆', '黑猫私藏奶油']),
  SP: Object.freeze(['金南瓜籽', '永夜花蜜', '魔女秘制焦糖', '午夜蜂巢糖', '星落糖晶']),
});

const TIERS = Object.keys(MATERIALS);

// A candy's visible flavor comes from the actual recipe. Highest material tier
// wins; within that tier, quantity wins; remaining ties retain catalog order.
export function selectPrimaryMaterial(materials) {
  if (!materials || typeof materials !== 'object' || Array.isArray(materials))
    throw new TypeError('invalid_recipe');
  let selected = null;
  for (const [tierIndex, tier] of TIERS.entries()) {
    for (const name of MATERIALS[tier]) {
      const quantity = materials[name] ?? 0;
      if (!Number.isSafeInteger(quantity) || quantity < 0) throw new TypeError('invalid_recipe');
      if (quantity === 0) continue;
      if (!selected || tierIndex > selected.tierIndex ||
          (tierIndex === selected.tierIndex && quantity > selected.quantity))
        selected = { name, tier, tierIndex, quantity };
    }
  }
  if (!selected) throw new TypeError('invalid_recipe');
  return { name: selected.name, tier: selected.tier, quantity: selected.quantity };
}
