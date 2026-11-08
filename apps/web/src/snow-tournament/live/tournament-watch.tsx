import { useEffect, useState, type ReactNode } from "react";
import { type SnowPixelBattle } from "../../../../../packages/protocol/src/snow-tournament";
import { SnowPixelBattleCanvas } from "./pixel-battle-canvas";
import {watchSnowBattle,type StreamStatus,type BattleStreamUpdate} from "./stream-client";

export function TournamentWatch({ editionId, matchId, overlay, onStatus }: { editionId: string; matchId: string; overlay?:ReactNode; onStatus?(status:StreamStatus):void }) {
  const [battle,setBattle] = useState<SnowPixelBattle | null>(null);
  const [status,setStatus] = useState<StreamStatus>("connecting");
  const [baseline,setBaseline]=useState(0);
  const [replica,setReplica]=useState<BattleStreamUpdate|null>(null);
  useEffect(() => {
    setBattle(null);
    return watchSnowBattle(`/api/snow-tournament/${encodeURIComponent(editionId)}/matches/${encodeURIComponent(matchId)}/stream`,next=>{
      setBattle(next.value);setReplica(next);if(next.reset)setBaseline(value=>value+1);
    },next=>{setStatus(next);onStatus?.(next);});
  }, [editionId,matchId,onStatus]);
  return <section aria-label="雪堡直播">
    {status === "offline" && <p role="status">直播连接中断，正在重连。</p>}
    {status === "invalid" && <p role="status">直播数据未能同步，请重新进入观战。</p>}
    {battle && replica && <SnowPixelBattleCanvas key={`${battle.id}:${baseline}`} battle={battle} replica={replica} paused={status!=="connected"} overlay={overlay} />}
    {!battle && status !== "offline" && status!=="invalid" && <p role="status">{status === "connecting" ? "正在连接直播…" : "战场尚未开放。"}</p>}
  </section>;
}
