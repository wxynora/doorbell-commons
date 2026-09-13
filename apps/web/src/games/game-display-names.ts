type Row = Record<string, any>;
type Profiles = Readonly<Record<string, {name:string}>>;
const internal = /^(?:resident|human):/;
export function playerDisplayName(id:string,profiles:Profiles,fallback?:string):string {
  const name=profiles[id]?.name??fallback;
  return name && !internal.test(name) && name!==id ? name : '同桌玩家';
}
/** Only display fields are copied. IDs, commands, private cards and source events stay intact. */
export function gameDisplayProjection(value:unknown,profiles:Profiles):unknown {
  if (!value || typeof value!=='object') return value;
  const game=value as Row;
  const players:Row[]=Array.isArray(game.players)?game.players:[];
  const participants:Row[]=Array.isArray(game.participants)?game.participants:[];
  const names=new Map<string,string>();
  for(const p of players)names.set(p.id,playerDisplayName(p.id,profiles,p.name));
  for(const p of participants)names.set(p.player_id,playerDisplayName(p.player_id,profiles,p.display_name));
  const ids=[...names.keys()].filter(id=>typeof id==='string'&&id.length>0).sort((a,b)=>b.length-a.length);
  const pattern=ids.length?new RegExp('(?<![A-Za-z0-9_-])(?:'+ids.map(id=>id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![A-Za-z0-9_-])','g'):null;
  const text=(value:unknown)=>typeof value==='string'&&pattern?value.replace(pattern,id=>names.get(id)!):value;
  const events=(rows:Row[])=>rows.map(e=>({...e,text:text(e.text)}));
  return {...game,
    ...(Array.isArray(game.players)?{players:players.map(p=>({...p,name:names.get(p.id)}))}:{}),
    ...(Array.isArray(game.participants)?{participants:participants.map(p=>({...p,display_name:names.get(p.player_id)}))}:{}),
    ...(Array.isArray(game.recent_events)?{recent_events:events(game.recent_events)}:{}),
    ...(game.pending_card?.card?{pending_card:{...game.pending_card,card:{...game.pending_card.card,text:text(game.pending_card.card.text)}}}:{}),
  };
}
