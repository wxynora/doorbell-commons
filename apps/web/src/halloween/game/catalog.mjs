export const SHAPES = Object.freeze([
  { id: 'star', name: '星星' }, { id: 'heart', name: '爱心' },
  { id: 'pumpkin', name: '南瓜' }, { id: 'ghost', name: '幽灵' },
]);
export const COLORS = Object.freeze([
  { id: 'amber', name: '琥珀金', hex: '#F4A941' },
  { id: 'rose', name: '莓果粉', hex: '#D16B87' },
  { id: 'plum', name: '葡萄紫', hex: '#9972B8' },
  { id: 'cream', name: '奶油白', hex: '#F5E5BB' },
  { id: 'mint', name: '薄荷绿', hex: '#79B8A3' },
  { id: 'blue', name: '晴空蓝', hex: '#84B7D6' },
]);
export const ART_ROOT = '/halloween/';
export const RARITY_NAMES = { ordinary: '普通', rare: '稀有', precious: '珍奇', legendary: '传说' };
export function ingredientArtwork(catalog, name) {
  const index = catalog.findIndex(item => item.name === name);
  return index < 0 ? null : `${ART_ROOT}ingredients/${name==='砂糖'?'v4':'v3'}/m${index}.png`;
}
