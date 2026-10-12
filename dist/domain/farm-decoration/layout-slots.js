// Human layout snapshots share the existing farm document and replaceFarm write.
// They never own furniture, coins or crop state.
export const isLayoutSlot = value => Number.isInteger(value) && value >= 1 && value <= 3;
export function savedLayoutSlots(farm) {
  const slots=farm.farmDecorationLayouts??[];
  if(!Array.isArray(slots)||slots.length>3||new Set(slots.map(s=>s?.slot)).size!==slots.length||
     slots.some(s=>!s||!isLayoutSlot(s.slot)||!s.layout||Object.keys(s).some(k=>!['slot','layout','name'].includes(k))||(s.name!==undefined&&typeof s.name!=='string')))throw new Error('Invalid saved layout slots');
  return structuredClone(slots).sort((a,b)=>a.slot-b.slot);
}
export function layoutSlotSummaries(farm) {
  return savedLayoutSlots(farm).map(({slot,layout,name})=>({slot,decoration_count:layout.decorations.length,...(name?{name}:{})}));
}
export function saveLayoutSlot(farm,slot,layout,name) {
  const slots=savedLayoutSlots(farm),normalized=(name??slots.find(s=>s.slot===slot)?.name??'').trim();
  farm.farmDecorationLayouts=[...slots.filter(s=>s.slot!==slot),{slot,layout:structuredClone(layout),...(normalized?{name:normalized}:{})}].sort((a,b)=>a.slot-b.slot);
}
export function renameLayoutSlot(farm,slot,name) {
  farm.farmDecorationLayouts=savedLayoutSlots(farm).map(saved=>{
    if(saved.slot!==slot)return saved;
    const {name:previous,...rest}=saved,normalized=name.trim();
    return {...rest,...(normalized?{name:normalized}:{})};
  });
}
