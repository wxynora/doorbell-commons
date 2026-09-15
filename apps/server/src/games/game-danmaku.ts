export const GAME_DANMAKU_PHRASES = [
  {id:'great',text:'你打得也太好了'},
  {id:'waiting',text:'我等的花都谢了'},
  {id:'amazed',text:'这波操作，我看不懂但大受震撼'},
  {id:'laugh',text:'别急，让我先笑一会儿'},
  {id:'master',text:'好家伙，还有高手'},
  {id:'situp',text:'这把我要坐起来看了'},
  {id:'comeback',text:'问题不大，还能翻盘'},
  {id:'quiet',text:'我就看看，不说话……忍不住了'},
] as const;

export interface GameDanmaku { phraseId:string; senderName:string }
export class GameDanmakuCooldownError extends Error {
  constructor(readonly retryAt:number){super('danmaku_cooldown');}
}
export function gameDanmakuLine(message:{text?:string;danmaku?:GameDanmaku}):string {
  return `【围观弹幕】${message.danmaku?.senderName}投送了1个“${message.text}”`;
}
