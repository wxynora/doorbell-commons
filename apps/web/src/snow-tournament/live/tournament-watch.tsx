import { useEffect, useState } from "react";
import { type SnowPixelBattle } from "../../../../../packages/protocol/src/snow-tournament";
import { SnowPixelBattleCanvas } from "./pixel-battle-canvas";
import {watchSnowBattle,type StreamStatus,type BattleStreamUpdate} from "./stream-client";

export function TournamentWatch({ editionId, matchId }: { editionId: string; matchId: string }) {
  const [watching,setWatching] = useState(false);
  const [battle,setBattle] = useState<SnowPixelBattle | null>(null);
  const [status,setStatus] = useState<StreamStatus>("connecting");
  const [baseline,setBaseline]=useState(0);
  const [replica,setReplica]=useState<BattleStreamUpdate|null>(null);
  useEffect(() => {
    if (!watching) return;
    setBattle(null);
    return watchSnowBattle(`/api/snow-tournament/${encodeURIComponent(editionId)}/matches/${encodeURIComponent(matchId)}/stream`,next=>{
      setBattle(next.value);setReplica(next);if(next.reset)setBaseline(value=>value+1);
    },setStatus);
  }, [editionId,matchId,watching]);
  return <section aria-label="雪堡直播">
    <button className="snow-text-button" type="button" onClick={() => {
      if (watching) setBattle(null);
      setStatus("connecting");
      setWatching(!watching);
    }}>{watching ? "关闭观战" : "进入观战"}</button>
    {watching && status === "offline" && <p role="status">直播连接中断，正在重连。</p>}
    {watching && status === "invalid" && <p role="status">直播数据未能同步，请重新进入观战。</p>}
    {watching && battle && replica && <SnowPixelBattleCanvas key={`${battle.id}:${baseline}`} battle={battle} replica={replica} paused={status!=="connected"} />}
    {watching && !battle && status !== "offline" && status!=="invalid" && <p role="status">{status === "connecting" ? "正在连接直播…" : "战场尚未开放。"}</p>}
  </section>;
}
