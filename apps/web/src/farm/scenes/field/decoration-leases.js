export function expiredDecorationIds(data,now=Date.now()) {
  return data?.inventory.filter(item=>item.owned_quantity>0 && item.expires_at && Date.parse(item.expires_at)<=now).map(item=>item.item_id)??[];
}
export function withoutExpiredLeaseData(data,now=Date.now()) {
  const expired=new Set(expiredDecorationIds(data,now));
  if(!expired.size) return data;
  return {...data,inventory:data.inventory.map(item=>expired.has(item.item_id)?{...item,owned_quantity:0,placed_quantity:0,available_quantity:0,unlocked:false}:item),
    layout:{...data.layout,decorations:data.layout.decorations.filter(item=>!expired.has(item.item_id))}};
}
export function decorationLeaseLabel(expiresAt) {
  if(!expiresAt) return "";
  const time=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(expiresAt));
  return `（使用权至${time} 北京时间）`;
}
