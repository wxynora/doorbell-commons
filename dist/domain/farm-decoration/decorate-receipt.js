import {projectDecorationGrid} from './decorate-plan.js';

const value=v=>JSON.stringify(v);
const cells=list=>(list??[]).map(c=>typeof c==='string'?c:`(col=${c.col},row=${c.row})`).join('、');
export function decorationViewText(farm,resource){
  const view=projectDecorationGrid(farm,resource);
  return [
    '农场布局｜24列×27行，上北下南',view.grid,
    '图例：空白=岛外，..=空地，~~=水面，TT=田地，HH=农舍，SS=摊位，**=重叠。',
    '朝向：^朝上，>朝右，v朝下，<朝左；NE右上、SE右下、SW左下、NW左上。',
    `农舍｜位置：${view.house.anchor}｜朝向：S`,
    `摊位｜位置：${view.stall.anchor}｜朝向：${view.stall.facing}`,
    '已摆放：',
    ...view.instances.map(o=>`${o.code} ${o.name}｜实例编号：${o.instance}｜位置：${o.anchor}｜朝向：${o.facing}｜占格：${cells(o.cells)}`),
    '仓库可用：',
    ...view.inventory.map(i=>`${i.definition.name}｜代号：${i.definition.model_id}｜占地：${i.definition.cells.join('×')}｜${i.definition.purchase_mode==='unlock'?'已解锁，可重复摆放':`还能摆${i.available_quantity}件`}`),
  ].join('\n');
}
export function decorationSummary(draft){
  return draft.entries.map(({id,change:c})=>`事项 ${id}｜${c.remove?`收回实例${c.remove}`:c.instance?`移动实例${c.instance}至${c.at}${c.facing?`，朝${c.facing}`:''}`:c.fixture?`移动${c.fixture==='house'?'农舍':'摊位'}至${c.at}`:`${c.item}｜${c.at??`${c.from}至${c.to}，${c.shape==='border'?'仅外圈':'填满'}`}｜朝${c.facing??'S'}`}`).join('\n');
}
function causeText(c,name){
  const at=cells(c.cells);
  if(c.reason==='blocked'){
    const b=c.blocker;
    return b.kind==='plot'?`${at}与${b.id}号田地相交。`:b.kind==='bridge'?`${at}与岛屿出入口桥梁相交。`:
      `${at}与农舍${b.kind==='house_extension'?'扩建部分':`本体占地区域${b.part}`}相交。`;
  }
  const reasons={outside_island:`${at}的实际占地超出岛屿外边界。`,requires_land:`${at}的实际占地进入河道；${name}只能放在可摆放陆地内。`,
    requires_water:`${at}的实际占地进入岛内陆地区域；${name}必须完整放在河道内。`,outside_buildable_land:`${at}的实际占地超出陆地可摆放边线，进入岸边预留区域。`};
  if(!Object.hasOwn(reasons,c.reason))throw Error(`Unmapped decoration cause: ${c.reason}`);
  return reasons[c.reason];
}
function inputText(i,name){
  if(i.code==='decoration_not_owned')return `${name}（${i.item}）持有0件，不能用于这项布置。`;
  if(i.code==='unknown_item')return `物品代号“${i.item}”不在当前装饰目录中。`;
  if(i.code==='decoration_quantity_exceeded')return `${name}：持有${i.owned}件；这份草稿保留原有${i.placed}件，另摆${i.requested}件，共需${i.final_placed}件；还可用${i.available}件，缺少${i.missing}件。超出的实例：${i.instance}（${cells(i.cells)}）。`;
  if(i.code==='invalid_cell_or_facing')return i.fields.map(f=>f.field==='facing'?`facing填了“${f.value}”，可用N、NE、E、SE、S、SW、W、NW。`:`字段${f.field}填了“${f.value}”，不在A01至X27内。`).join('\n');
  if(i.code==='invalid_shape')return `shape填了“${i.value}”，可用fill（填满）或border（仅外圈）。`;
  if(i.code==='invalid_range')return `from=${i.from}、to=${i.to}，${i.reversed_axes.map(a=>a==='row'?'行':'列').join('、')}起止顺序反了；请调换对应起止值。`;
  if(i.code==='range_not_tiled')return `${name}朝${i.facing}占${i.cells.join('×')}格；${i.from}至${i.to}为${i.range_cells.join('×')}格${i.shape==='border'?'外圈':''}，无法整铺。问题格：${cells(i.uncovered_cells)}。`;
  if(i.code==='diagonal_range')return `facing=${i.value}是斜向；from/to范围铺设只支持N、E、S、W。单件at仍支持八方向。`;
  if(i.code==='instance_not_found')return `实例“${i.instance}”不在这份布局中；该事项未应用，其他事项仍保留在草稿。`;
  if(i.code==='invalid_change'){
    if(i.field==='fixture')return `fixture填了“${i.value}”，可用house或stall。`;
    if(!i.required_fields)return '这一项没有item、instance、remove或fixture，无法判断要做哪种调整。';
    return [i.missing_fields.length?`这一项缺少字段${i.missing_fields.join('、')}。`:'',i.unexpected_fields.length?`这一项多了字段${i.unexpected_fields.join('、')}。`:'',
      `这类操作必填${i.required_fields.join('、')}，可选${i.optional_fields.join('、')||'无'}。`].filter(Boolean).join('');
  }
  // Unexpected authoritative errors are service faults, never guessed placement explanations.
  throw Error(`Unmapped decoration issue: ${i.code}`);
}
export function decorationIssuesText(draftId,issues,resource){
  const lines=['装修草稿已保留，农场尚未保存。',`草稿编号：${draftId}`,'只需调整以下位置，其他修改不用重发：'];
  for(const i of issues){
    if(i.code==='layout_changed'){
      lines.push(...i.changes.map(c=>`当前布局的${c.field??`实例${c.instance}`}已从${value(c.before)}变为${value(c.after)}，本次没有覆盖。装修草稿仍保留。`));continue;
    }
    const d=resource.catalog.find(d=>d.item_id===i.item||d.model_id===i.item);
    const name=i.fixture?(i.fixture==='house'?'农舍':'摊位'):d?.name??i.item??i.input?.item??'调整';
    const reasons=i.causes?.length?i.causes.map(c=>causeText(c,name)).join('\n'):inputText(i,name);
    lines.push(`事项 ${i.id??'现有布局'}｜${name}${i.cells&&i.code!=='range_not_tiled'?`｜占格：${cells(i.cells)}`:''}｜${reasons}`);
    if(i.instance)lines.push(`实例编号：${i.instance}`);
  }
  return lines.join('\n');
}
