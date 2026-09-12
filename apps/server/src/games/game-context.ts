import type {GameKind} from './types.js';
type Obj=Record<string,any>;
const obj=(v:unknown):Obj=>v&&typeof v==='object'?v as Obj:{};
const list=(v:unknown):Obj[]=>Array.isArray(v)?v.map(obj):[];
const card=(v:unknown):string=>{const c=obj(v);return String(c.label??c.name??(c.hidden?'暗牌':c.rank??'牌'));};
const cards=(v:unknown)=>Array.isArray(v)?v.map(card).join('、')||'无':'无';
/** Input is the authenticated projection, never the engine snapshot. */
export function gameContext(kind:GameKind,value:unknown,names:Record<string,string>):string[]{
 const g=obj(value),p=kind==='mahjong'?obj(g.public):g;
 const name=(id:unknown)=>names[String(id)]??'同桌';
 const lines=['当前局面：'];
 const turn=(kind==='monopoly'?obj(p.pending_debt).player_id:null)??p.current_player_id??p.turn_player_id;
 if(turn)lines.push('当前行动：'+name(turn)+'。');
 if(kind==='mahjong'){
  lines.push(String(p.round_label??'')+'，余牌'+p.wall_remaining+'张。');
  for(const [id,count] of Object.entries(obj(p.hand_counts))){
   lines.push(name(id)+'：手牌'+count+'张；弃牌：'+cards(obj(p.discards)[id])+'；副露：'+(list(obj(p.melds)[id]).map(m=>cards(m.tiles)).join(' / ')||'无')+'。');
  }
 } else {
  for(const player of list(g.players)){
   const status:string[]=[];
   if(typeof player.hand_count==='number')status.push('手牌'+player.hand_count+'张');
   if(kind==='doudizhu')status.push(g.landlord_id===player.id?'地主':g.landlord_id?'农民':'尚未定身份');
   if(kind==='leaf-game')status.push('醉意'+player.drunkenness,'中毒概率'+player.poison_chance+(player.knocked_out?'，已出局':''));
   if(kind==='uno'&&player.uno)status.push('已喊UNO');
   if(kind==='flying-chess')status.push(list(player.pieces).map(piece=>'棋子'+piece.number+'：'+(piece.finished?'已到达':piece.zone==='hangar'?'机场':piece.outer_index!==undefined?'外圈第'+piece.outer_index+'格':piece.home_step!==undefined?'终点航道第'+piece.home_step+'格':'起飞位')).join('；'));
   if(kind==='monopoly')status.push('位置'+player.pos,'现金'+player.cash,player.bankrupt?'已破产':player.in_jail?'在监狱':'');
   lines.push(name(player.id)+'：'+status.filter(Boolean).join('，')+'。');
  }
 }
 if(kind==='uno')lines.push('桌面牌：'+card(g.top_card)+'；颜色：'+g.active_color_name+'；'+g.direction_label+'；牌堆'+g.deck_count+'张。');
 if(kind==='doudizhu'){
  lines.push('底牌：'+cards(g.bottom_cards)+'；叫分'+g.base+'；倍率'+g.multiplier+'。');
  if(g.field)lines.push(name(g.field.by)+'出牌：'+cards(g.field.cards)+'。');
 }
 if(kind==='leaf-game')lines.push('报点：'+(g.declared_rank??'待主家报点')+'；桌上'+g.pile_card_count+'张。');
 if(kind==='monopoly'){
  const board=list(g.board);
   for(const [index,cell] of Object.entries(obj(g.cells))){const c=obj(cell);lines.push((board[Number(index)]?.name??'第'+index+'格')+'：'+(c.owner?name(c.owner):'无主')+'，房屋'+c.houses+'，租金'+c.rent+'。');}
  if(g.pending_card)lines.push(String(g.pending_card.text??g.pending_card.description??g.pending_card.title??''));
  if(g.pending_debt)lines.push(name(g.pending_debt.player_id)+'待支付'+g.pending_debt.amount+'。');
 }
 return lines;
}
/** Explicit public fields only: covered cards and engine command logs never enter text. */
export function gameHistory(kind:GameKind,snapshot:unknown,names:Record<string,string>):string[]{
 const s=obj(snapshot),name=(id:unknown)=>names[String(id)]??'同桌';
 const events=kind==='mahjong'?list(obj(s.state).action_history):list(s.public_events);
 return events.flatMap(e=>{
  if(typeof e.text==='string') {
   let text=e.text;
   for(const player of list(s.players)){if(typeof player.name==='string'&&player.name)text=text.split(player.name).join(name(player.id));}
   return [text];
  }
  if(kind==='mahjong')return [name(e.player_id)+'：'+e.label];
  if(kind==='leaf-game'){
   if(e.type==='cards_played')return [name(e.actor_id)+'盖下'+e.card_count+'张，报'+e.declared_rank+'。'];
   if(e.type==='challenge')return [name(e.challenger_id)+'质疑'+name(e.challenged_id)+'，'+(e.truthful?'质疑失败':'质疑成功')+'。'];
   if(e.type==='concede')return [name(e.winner_id)+'认罚。'];
   if(e.winner_id)return [name(e.winner_id)+'获胜。'];
  }
  return [];
 });
}
