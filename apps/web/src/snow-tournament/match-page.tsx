import { useEffect, useState } from "react";
import type { SnowTournamentResponse } from "../../../../packages/protocol/src/snow-tournament";
import { watchSnowEdition, type StreamStatus } from "./live/stream-client";
import { TournamentWatch } from "./live/tournament-watch";
import { TournamentDanmaku, useTournamentDanmaku } from "./live/danmaku";
import { beijingDate, matchStatusNames, matchTeams, stageName, teamName } from "./presentation";
import "./snow-tournament.css";
import "./match-page.css";

export function SnowTournamentMatchPage({editionId,matchId,onBack}:{editionId:string;matchId:string;onBack():void}) {
  const [data,setData]=useState<SnowTournamentResponse|null>(null),[status,setStatus]=useState<StreamStatus>("connecting");
  const [battleStatus,setBattleStatus]=useState<StreamStatus>("connecting");
  const chat=useTournamentDanmaku(editionId,matchId);
  useEffect(()=>watchSnowEdition(editionId,setData,setStatus),[editionId]);
  const edition=data?.edition,match=edition?.matches.find(entry=>entry.id===matchId);
  const current=match?.pairings?.find(pair=>pair.index===match.currentGameIndex);
  const logPlayers=current??match?.pairings?.find(pair=>pair.index===match.roundResults.at(-1)?.index);
  const active=match&&["scheduled","in_progress"].includes(match.status);
  const score=match?.score??(match&&edition?[match.roundResults.filter(round=>round.winnerTeamId===match.teamAId).length,match.roundResults.filter(round=>round.winnerTeamId===match.teamBId).length]:null);
  return <main className="snow-tournament snow-match-page" aria-label="雪堡比赛直播页"><div className="snow-tournament-shell">
    <header className="snow-match-header"><button className="snow-back" type="button" onClick={onBack} aria-label="返回赛事大厅"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6"/></svg></button>
      <h1>雪堡直播</h1><span className={`snow-match-connection ${status==="connected"&&battleStatus==="connected"?"is-live":""}`} role="status">{status==="offline"||battleStatus==="offline"?"连接中断":status==="connected"&&battleStatus==="connected"?"实时直播":"连接中"}</span>
    </header>
    {status==="offline"&&<p className="snow-error" role="status">赛事连接中断，正在重连。</p>}
    {match&&edition?<>
      <p className="snow-match-caption">{stageName(match)} · {beijingDate(match.scheduledAt,true)} · {matchStatusNames[match.status]}</p>
      <section className="snow-match-scoreboard" aria-label="本场比分"><div><strong>{teamName(edition,match.teamAId)}</strong></div><b>{score?.join(" : ")??"VS"}</b><div><strong>{teamName(edition,match.teamBId)}</strong></div></section>
      <div className="snow-match-layout"><section className="snow-match-field" aria-label="战场直播">
        <div className="snow-match-current" aria-label="本局出场者">{current?<><div><small>进攻</small><strong>{current.attack.name}</strong>{current.attack.automated&&!current.attack.npc&&<small>NPC代打</small>}</div>
          <span>第{current.index}局</span><div><small>防守</small><strong>{current.defend.name}</strong>{current.defend.automated&&!current.defend.npc&&<small>NPC代打</small>}</div></>:<p>{match.pairings?.length?"本场已结束":"排阵尚未公开"}</p>}</div>
        <TournamentWatch editionId={editionId} matchId={matchId} overlay={chat.overlay} onStatus={setBattleStatus} players={{attack:logPlayers?.attack.name??'进攻方',defend:logPlayers?.defend.name??'防守方'}} />
      </section><TournamentDanmaku chat={chat}/>
        <section className="snow-match-pairings" aria-label="逐局对阵"><h2>逐局对阵</h2>
          {match.pairings?.length?<ol>{match.pairings.map(pair=>{
            const result=match.roundResults.find(round=>round.index===pair.index);
            return <li key={pair.index} className={active&&pair.index===match.currentGameIndex?"is-current":""}><small>第{pair.index}局</small>
              <span><strong>{pair.attack.name}</strong><small>进攻</small></span><em>{result?`${teamName(edition,result.winnerTeamId)}胜`:pair.index===match.currentGameIndex?"本局":"VS"}</em><span><strong>{pair.defend.name}</strong><small>防守</small></span>
              {result&&<p>剩余耐久 {result.coreHp} · 第{result.endTick}tick · {result.endReason==="core_broken"?"雪堡攻破":result.endReason==="surrender"?"认输":"雪堡守住"}</p>}
            </li>;
          })}</ol>:<p>排阵尚未公开。</p>}
        </section>
      </div>
    </>:<p className="snow-empty-line">{data?"没有找到这场比赛。":"正在读取赛事…"}</p>}
  </div></main>;
}
