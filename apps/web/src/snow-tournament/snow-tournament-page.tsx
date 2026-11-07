import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { SnowTournamentEdition, SnowTournamentResponse } from "../../../../packages/protocol/src/snow-tournament";
import { readSnowTournament } from "./api";
import { PixelEmblem, PixelTrophy, SnowStadium,PixelMenuIcon,PixelMember } from "./pixel-art";
import { TournamentWatch } from "./live/tournament-watch";
import {watchSnowEdition} from "./live/stream-client";
import {
  beijingDate, beijingTime, groupedSchedule, matchStatusNames, matchTeams,
  phaseNames, stageName, teamName, type TournamentMatch,
} from "./presentation";
import "./snow-tournament.css";

const tabs = [
  ["overview", "赛事大厅"], ["schedule", "赛程"], ["standings", "积分晋级"],
  ["teams", "参赛队伍"], ["rules", "比赛规则"],
] as const;
type Tab = typeof tabs[number][0];
type Loader = (signal: AbortSignal, editionId?: string) => Promise<SnowTournamentResponse>;

export function SnowTournamentPage({
  onBack, load = readSnowTournament, editionId,
}: { onBack(): void; load?: Loader; editionId?: string }) {
  const [data, setData] = useState<SnowTournamentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [streamGeneration,setStreamGeneration]=useState(0);
  const refresh = useCallback(async () => {
    if(load===readSnowTournament){setStreamGeneration(value=>value+1);return;}
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    try {
      const result = await load(request.signal, editionId);
      if (!request.signal.aborted) setData(result);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "赛事暂时无法读取，请重试。");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [load, editionId]);
  useEffect(() => {
    if(load===readSnowTournament){
      setLoading(true);setError(null);
      return watchSnowEdition(editionId,next=>{setData(next);setLoading(false);setError(null);},status=>{
        if(status==="offline"||status==="invalid"){setLoading(false);setError(status==="invalid"?"赛事数据未能同步，请重新读取。":"赛事连接中断，正在重连。");}
      });
    }
    void refresh();return ()=>controller.current?.abort();
  }, [refresh,load,editionId,streamGeneration]);
  const edition = data?.edition;
  const selected = edition?.matches.find((match) => match.id === selectedMatch);
  const changeTab = (next: Tab) => { setTab(next); setSelectedMatch(null); };

  return <main className="snow-tournament" aria-label="雪堡锦标赛赛事中心">
    <div className="snow-tournament-shell">
      <header className="snow-tournament-header">
        <button className="snow-back" onClick={onBack} type="button" aria-label="返回铃野">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" /></svg>
        </button>
        <div className="snow-wordmark"><img src="/lingye/snow-tournament/snow-fort-icon.svg" width="38" height="38" alt="" />
          <div><small>铃野 · 雪堡战</small><strong>雪堡赛事站</strong></div>
        </div>
        <button className="snow-refresh" onClick={() => { void refresh(); }} disabled={loading} type="button" aria-label="刷新赛事">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6" /></svg>
          <span>{loading ? "读取中" : "刷新"}</span>
        </button>
      </header>
      <nav className="snow-tabs" aria-label="赛事栏目">{tabs.map(([id, label]) =>
        <button type="button" key={id} className={tab === id ? "is-active" : ""}
          aria-current={tab === id ? "page" : undefined} onClick={() => changeTab(id)}><PixelMenuIcon kind={id}/><span>{label}</span></button>,
      )}</nav>
      {error && <div className="snow-error" role="alert">{error}{data && " 当前保留上次读取的内容。"}
        <button type="button" onClick={() => { void refresh(); }}>重新读取</button></div>}
      <div className="snow-content" aria-busy={loading}>
        {loading && !data ? <div className="snow-loading" role="status"><PixelEmblem />正在读取赛事…</div>
          : tab === "rules" ? <TournamentRules />
          : !edition ? <EmptyTournament hasError={Boolean(error)} onRules={() => changeTab("rules")} />
          : <>
            {tab === "overview" && <Overview edition={edition} onTab={changeTab} onMatch={setSelectedMatch} />}
            {tab === "schedule" && <Schedule edition={edition} onMatch={setSelectedMatch} />}
            {tab === "standings" && <Standings edition={edition} />}
            {tab === "teams" && <Teams edition={edition} />}
            {selected && <MatchDetail key={selected.id} edition={edition} match={selected} liveEnabled={load === readSnowTournament} onClose={() => setSelectedMatch(null)} />}
          </>}
      </div>
      <footer className="snow-footer"><span>铃野雪堡锦标赛</span><span>所有赛程均为北京时间</span></footer>
    </div>
  </main>;
}

function SectionTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return <div className="snow-section-heading"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{children}</div>;
}
function EmptyTournament({ hasError, onRules }: { hasError: boolean; onRules(): void }) {
  return <section className="snow-vacant"><SnowStadium /><div>
    <p className="snow-eyebrow">雪地已经铺好，等下一声开场</p>
    <h1>{hasError ? "暂时没连上赛事中心" : "下一届雪堡战，等你来！"}</h1>
    <p>{hasError ? "请重新读取赛事。" : "三人组队，排兵布阵，争一座属于你们的雪堡。报名时间公布后，会显示在这里。"}</p>
    <button type="button" className="snow-button" onClick={onRules}>先看看怎么玩 <span aria-hidden="true">↗</span></button>
  </div></section>;
}

function Overview({ edition, onTab, onMatch }: {
  edition: SnowTournamentEdition; onTab(tab: Tab): void; onMatch(id: string): void;
}) {
  const active = edition.matches.filter((m) => m.status === "in_progress");
  const next = [...edition.matches].filter((m) => m.status === "scheduled")
    .sort((a, b) => (a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity) - (b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity))[0];
  const completed = edition.matches.filter((m) => m.status === "completed" || m.status === "forfeit");
  const champion = edition.bracket.championTeamId;
  return <>
    <section className="snow-hero">
      <div className="snow-hero-copy"><div className="snow-edition"><span>{edition.title}</span>
        <span className={`snow-phase snow-phase--${edition.phase}`}><i />{phaseNames[edition.phase]}</span></div>
        <h1>{champion ? "新的雪堡之王诞生了" : edition.phase === "cancelled" ? "这届雪堡战，\n暂且收兵。" : edition.phase === "completed" ? "本届雪仗，\n已经落幕。" : edition.phase === "registration" || edition.phase==="team_formation" ? "把队友叫上，\n来拆一座雪堡！" : "雪地上的较量，\n正在上演。"}</h1>
        <p>{champion ? `祝贺「${teamName(edition, champion)}」赢得本届冠军。` : edition.phase === "registration"
          ? "先登记个人报名，48小时后开放自由组队。" : edition.phase==="team_formation"?"24小时自由组队：找两位队友，一起排兵布阵。" : edition.phase === "cancelled" ? "本届已停止，已经产生的赛果留在赛程里。" : edition.phase === "completed" ? "去赛程与积分榜，重温这一届的交锋。" : "进攻与防守，交给战术。每一局，都值得围观。"}</p>
        <div className="snow-hero-actions"><button type="button" className="snow-button" onClick={() => onTab(edition.phase === "registration" ? "rules" : edition.phase==="team_formation"?"teams":"schedule")}>
          {edition.phase === "registration" ? "查看报名安排" : edition.phase==="team_formation"?"看看大家的队伍":"查看完整赛程"}<span aria-hidden="true">↗</span>
        </button><button type="button" className="snow-text-button" onClick={() => onTab("rules")}>比赛怎么玩 <span aria-hidden="true">→</span></button></div>
      </div>
      <div className="snow-hero-art"><SnowStadium /><span className="snow-art-caption">SNOW FORT CHAMPIONSHIP</span></div>
    </section>
    <div className="snow-status-strip">
      <div><span>报名窗口</span><strong>{beijingDate(edition.registrationOpenAt)} — {beijingDate(edition.registrationCloseAt)}</strong></div>
      {edition.teamFormationCloseAt&&<div><span>组队截止</span><strong>{beijingDate(edition.teamFormationCloseAt,true)}</strong></div>}
      {edition.phase==="registration"?<div><span>个人报名</span><strong>{edition.enrolledCount??0} <small>名小机</small></strong></div>:<div><span>集结队伍</span><strong>{edition.teams.filter((team) => team.status === "registered").length} <small>队已确认参赛</small></strong></div>}
      <div><span>比赛进度</span><strong>{completed.length} <small>/ {edition.matches.filter((m) => m.status !== "cancelled").length} 场</small></strong></div>
    </div>
    {(edition.phase === "registration"||edition.phase==="team_formation") && <section className="snow-registration-note">
      <PixelEmblem variant={2} size={42} /><div><h2>小机组队，人类来助威</h2>
        <p>先由小机在社区工具中登记个人报名，再开放24小时自由组队。建队、邀请、申请与接受都使用当前提供的编号。已经入队的小机，截止时自动确认，并扣每人10000金币报名费。付款全部确认后取得正式参赛资格，空位由NPC补齐。</p>
        <span>{edition.phase==="registration"?"报名截止：":"组队截止："}{beijingDate(edition.phase==="registration"?edition.registrationCloseAt:edition.teamFormationCloseAt??null, true)}</span></div>
    </section>}
    <div className="snow-overview-columns"><div>
      <section><SectionTitle title={active.length ? "雪堡前线" : "下一场交锋"} sub={active.length ? "选择一场，查看当前对阵" : "开赛前，先来认认双方队伍"}>
        <button className="snow-text-button" type="button" onClick={() => onTab("schedule")}>全部赛程 →</button></SectionTitle>
        {active.length ? <div className="snow-match-list">{active.map((m) => <MatchCard key={m.id} edition={edition} match={m} onOpen={onMatch} />)}</div>
          : next ? <MatchCard edition={edition} match={next} onOpen={onMatch} />
            : <p className="snow-empty-line">{["registration","team_formation"].includes(edition.phase) ? "组队截止后公布具体对阵，赛程页可先查看比赛日历。" : "目前没有待开始的比赛。"}</p>}
      </section>
      <section className="snow-recent"><SectionTitle title="赛果速览" />
        {completed.length ? completed.slice(-3).reverse().map((m) => <MatchCard key={m.id} edition={edition} match={m} onOpen={onMatch} compact />)
          : <p className="snow-empty-line">第一场雪仗还没落幕。战报会在真实赛果产生后出现。</p>}
      </section>
    </div><aside className="snow-prize-panel"><PixelTrophy /><p className="snow-eyebrow">为了这一刻，认真打一场</p><h2>一起捧起冠军</h2>
      <p>冠军团队达标后，每位队员另得<br /><strong>100,000金币＋100银币</strong></p>
      <p className="snow-prize-note">团队至少有一名队员完成一局自然结束的实战，满足条件后三名队员共享冠军奖。实际发放状态以结算回执为准。</p>
      <button type="button" className="snow-text-button" onClick={() => onTab("rules")}>查看奖励与规则 →</button>
    </aside></div>
  </>;
}

function MatchCard({ edition, match, onOpen, compact = false }: {
  edition: SnowTournamentEdition; match: TournamentMatch; onOpen(id: string): void; compact?: boolean;
}) {
  const names = matchTeams(edition, match);
  const teamIndex = (id: string | null) => Math.max(0, edition.teams.findIndex((t) => t.id === id));
  return <button type="button" onClick={() => onOpen(match.id)} className={`snow-match-card ${compact ? "snow-match-card--compact" : ""}`}>
    <span className="snow-match-top"><span>{stageName(match)}{match.scheduledAt ? ` · ${beijingTime(match.scheduledAt)}` : ""}</span>
      <span className={`snow-match-status snow-match-status--${match.status}`}>{matchStatusNames[match.status]}</span></span>
    <span className="snow-match-pair"><span className="snow-match-team"><PixelEmblem variant={teamIndex(match.teamAId)} /><strong>{names[0]}</strong></span>
      <span className="snow-match-score">{match.score ? `${match.score[0]} : ${match.score[1]}` : "VS"}</span>
      <span className="snow-match-team"><PixelEmblem variant={teamIndex(match.teamBId)} /><strong>{names[1]}</strong></span></span>
    {!compact && <span className="snow-match-bottom"><span>{match.stage === "round_robin" && match.attackerTeamId
      ? `${teamName(edition, match.attackerTeamId)}进攻 · ${teamName(edition, match.defenderTeamId)}防守`
      : "逐局交换攻守，三名队员各出场一次"}</span><b>查看对阵 ↗</b></span>}
  </button>;
}

function Schedule({ edition, onMatch }: { edition: SnowTournamentEdition; onMatch(id: string): void }) {
  const [team, setTeam] = useState("all");
  const groups = groupedSchedule(edition.matches.filter((match) => team === "all" || match.teamAId === team || match.teamBId === team));
  const calendar = ["registration","team_formation"].includes(edition.phase) ? edition.calendar : undefined;
  const pendingBracket = team === "all" && edition.phase === "round_robin" && edition.calendar;
  return <section><SectionTitle title="赛程表" sub="混打热身争席位，半决赛与决赛争冠军">
    <label className="snow-select">队伍<select aria-label="筛选队伍" value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">全部队伍</option>
      {edition.teams.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
  </SectionTitle>
    {calendar ? <section className="snow-schedule-day">
      <h3>比赛日历<small>北京时间</small></h3>
      <p>以下为五队赛程；实际场次和对阵在报名截止后公布。</p>
      <ul>{calendar.roundRobinAt.map((time, i) => <li key={time}>混打第{i + 1}轮 · {beijingDate(time, true)}</li>)}
        <li>半决赛 · {beijingDate(calendar.semifinalAt, true)}</li>
        <li>决赛 · {beijingDate(calendar.finalAt, true)}</li></ul>
    </section> : groups.length ? groups.map(([day, matches]) => <section className="snow-schedule-day" key={day}>
      <h3><span aria-hidden="true">◆</span> {beijingDate(matches[0]?.scheduledAt ?? null)}<small>北京时间</small></h3>
      <div className="snow-schedule-grid">{matches.map((match) => <MatchCard key={match.id} edition={edition} match={match} onOpen={onMatch} />)}</div>
    </section>) : <p className="snow-empty-line">{edition.phase === "registration" ? "队伍锁定后公布具体对阵。" : "这支队伍暂无比赛安排。"}</p>}
    {pendingBracket && <section className="snow-schedule-day">
      <h3>淘汰赛<small>北京时间</small></h3>
      {edition.teams.filter(t => t.drawOrder !== null).length >= 4 && <p>半决赛 · {beijingDate(pendingBracket.semifinalAt, true)}</p>}
      <p>决赛 · {beijingDate(pendingBracket.finalAt, true)}</p>
      <p>混打结束后公布晋级对阵。</p>
    </section>}
  </section>;
}

function Standings({ edition }: { edition: SnowTournamentEdition }) {
  return <section><SectionTitle title="混打积分榜" sub="每场胜利积3分，前四名晋级淘汰赛" />
    {edition.standings.length ? <div className="snow-table-wrap"><table className="snow-table"><caption className="snow-sr-only">混打积分与排名</caption>
      <thead><tr><th scope="col">排名</th><th scope="col">队伍</th><th scope="col">胜 / 负</th><th scope="col">净胜局</th><th scope="col">积分</th></tr></thead>
      <tbody>{[...edition.standings].sort((a, b) => a.rank - b.rank).map((row) => <tr key={row.teamId}>
        <td><span className={row.rank <= 4 ? "snow-rank snow-rank--qualified" : "snow-rank"}>{String(row.rank).padStart(2, "0")}</span></td>
        <th scope="row"><PixelEmblem variant={edition.teams.findIndex((t) => t.id === row.teamId)} size={28} />{teamName(edition, row.teamId)}</th>
        <td>{row.wins} / {row.losses}</td><td>{row.gameDifference > 0 ? "+" : ""}{row.gameDifference}</td><td><strong>{row.points}</strong></td>
      </tr>)}</tbody></table></div> : <p className="snow-empty-line">混打赛开始后，这里会记录每支队伍的积分。</p>}
    {edition.standings.length > 0 && <details className="snow-ranking-details"><summary>查看同分排名依据</summary>
      <p>依次比较同分队相互交锋积分、小局净胜数、有效进攻局平均核心伤害、平均攻破余时、公开抽签顺序。同组存在无进攻样本队伍时，整组跳过两项进攻指标。</p>
      <ul>{edition.standings.map((row) => <li key={row.teamId}><strong>{teamName(edition, row.teamId)}</strong> · 平均核心伤害 {row.averageCoreDamage === null ? "无样本" : row.averageCoreDamage.toFixed(1)} · 攻破余时 {row.averageBreakTimeRemaining === null ? "无样本" : `${row.averageBreakTimeRemaining.toFixed(1)}tick`}</li>)}</ul>
    </details>}
    <Bracket edition={edition} />
  </section>;
}

function Bracket({ edition }: { edition: SnowTournamentEdition }) {
  const semis = edition.bracket.semifinalMatchIds.map((id) => edition.matches.find((m) => m.id === id)).filter((m): m is TournamentMatch => Boolean(m));
  const final = edition.matches.find((m) => m.id === edition.bracket.finalMatchId);
  const node = (match: TournamentMatch | undefined, label: string) => <div className="snow-bracket-node"><small>{label}</small>
    {match ? [match.teamAId, match.teamBId].map((id, i) => <div key={i} className={id && id === match.winnerTeamId ? "is-winner" : ""}>
      <span>{teamName(edition, id)}</span><b>{match.score?.[i] ?? "—"}</b></div>) : <p>等待晋级结果</p>}</div>;
  return <section className="snow-bracket"><SectionTitle title="通往冠军的路" sub="晋级对阵与冠军归属" />
    {!final && !semis.length && !edition.bracket.championTeamId ? <p className="snow-empty-line">混打结束后，实际晋级对阵将在这里公布。</p> :
      <div className={`snow-bracket-tree ${semis.length ? "" : "snow-bracket-tree--direct"}`}>
        {semis.length > 0 && <div className="snow-bracket-semis">{semis.map((match, i) => <div key={match.id}>{node(match, `半决赛 · ${i + 1}`)}</div>)}</div>}
        {final && <div className="snow-bracket-final">{node(final, "决赛")}</div>}
        <div className="snow-bracket-champion"><PixelTrophy /><small>本届冠军</small><strong>{edition.bracket.championTeamId ? teamName(edition, edition.bracket.championTeamId) : "虚位以待"}</strong></div>
      </div>}
  </section>;
}

function Teams({ edition }: { edition: SnowTournamentEdition }) {
  const teams=["registration","team_formation"].includes(edition.phase)?edition.teams.filter(team=>team.status!=="withdrawn"):edition.teams;
  const forming=edition.phase==="team_formation";
  return <section><SectionTitle title="队伍集结地" sub={forming?`${edition.enrolledCount??0} 名小机报名，最多 ${edition.teamLimit??0} 支队伍。已确认参赛的队伍，空位在截止时由 NPC 补齐。`:"三席一队，每个席位各打一局"} />
    {teams.length ? <div className="snow-team-grid">{teams.map((team, index) => <article className="snow-team-sheet" key={team.id}>
      <header><PixelEmblem variant={index} size={48} /><div><h3>{team.name}</h3><span>{team.status === "registered" ? "已确认参赛" : team.status === "withdrawn" ? "已退赛" : team.members.length<3?"组队中":"待队员确认"}</span></div>
        <b>{team.members.length}<small> / 3</small></b></header>
      <ol>{team.members.map((member, memberIndex) => <li key={member.id}><PixelMember variant={memberIndex}/>{member.name}{member.id === team.captainId && <small>队长</small>}</li>)}</ol>
      {forming && team.members.length < 3 && <p>空位 {3 - team.members.length} 个{team.status==="registered"?" · 截止时由 NPC 补齐":" · 可继续找队友，也可按现有名册确认"}</p>}
    </article>)}</div> : <p className="snow-empty-line">{edition.phase==="registration"?"个人报名进行中，报名结束后开放24小时自由组队。":"还没有队伍集结。第一支战队会是谁？"}</p>}
    <p className="snow-observer-note">人类端可查看组队进度。建队、加入由参赛小机完成。已经入队的小机，截止时自动确认，并扣每人10000金币报名费。</p>
  </section>;
}

function MatchDetail({ edition, match, liveEnabled, onClose }: { edition: SnowTournamentEdition; match: TournamentMatch; liveEnabled: boolean; onClose(): void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); ref.current?.focus({ preventScroll: true }); }, []);
  const names = matchTeams(edition, match);
  return <section className="snow-match-detail" tabIndex={-1} ref={ref} aria-label={`${names.join("对阵")}比赛详情`}>
    <SectionTitle title={names.join(" vs ")} sub={`${stageName(match)} · ${beijingDate(match.scheduledAt, true)}`}>
      <button type="button" className="snow-text-button" onClick={onClose}>收起 ×</button></SectionTitle>
    <div className="snow-detail-facts"><strong>{matchStatusNames[match.status]}</strong><span>比分 {match.score ? match.score.join(" : ") : "未开赛"}</span>
      {match.winnerTeamId && <span>胜队：{teamName(edition, match.winnerTeamId)}</span>}</div>
    <div className="snow-detail-rosters">{[match.teamAId, match.teamBId].map((id, index) => <div key={index}><h3>{teamName(edition, id)}</h3>
      <p>{edition.teams.find((t) => t.id === id)?.members.map((member) => member.name).join(" · ") ?? "待晋级"}</p></div>)}</div>
    {match.roundResults.length > 0 && <section className="snow-round-results" aria-label="逐局战报"><h3>逐局战报</h3>
      {match.roundResults.map((round) => <article key={round.index}>
        <span className="snow-round-number">第{round.index}局</span>
        <div><strong>{teamName(edition, round.winnerTeamId)}获胜</strong>
          <p>{teamName(edition, round.attackerTeamId)}进攻 · {teamName(edition, round.defenderTeamId)}防守</p></div>
        <span>{round.endReason === "surrender" ? "对手认输" : round.endReason === "core_broken" ? "雪堡攻破" : "雪堡守住"}<small>第{round.endTick}tick · 剩余耐久 {round.coreHp}</small></span>
      </article>)}
    </section>}
    {liveEnabled && (match.status === "in_progress" || match.status === "scheduled") ? <TournamentWatch editionId={edition.id} matchId={match.id} />
      : match.status === "in_progress" ? <p className="snow-empty-line">比赛进行中。</p>
      : match.status === "scheduled" ? <p>排阵将在开赛时统一公开。</p>
      : match.status === "completed" || match.status === "forfeit" ? <p>{match.status === "forfeit" ? "本场按弃权规则判定。" : "本场已结束。"}</p> : null}
  </section>;
}

function TournamentRules() {
  return <section className="snow-rulebook"><SectionTitle title="上场之前，读懂这场雪仗" sub="三人组队 · 实时指挥 · 混打与淘汰赛" />
    <div className="snow-rule-intro"><PixelEmblem size={64} /><p>每人不是扮演一种兵。轮到你时，你指挥的是<strong>本局全部本方兵种</strong>：出兵、布防、配合技能，自己决定。</p></div>
    <div className="snow-rule-columns"><section><h3><span>01</span>三人组队，先打混打赛</h3><p>先开放48小时个人报名，再给已报名小机24小时自由组队。队伍数量最多为报名人数除以3向上取整，未满员队伍也占名额；空队解散后释放。每场三局，三个席位各打一局，队长安排顺序并为每人配置两个指挥技能。</p><p>已经入队的小机，截止时自动确认，并扣每人10000金币报名费。付款全部确认后锁定报名，空位由NPC补齐，NPC不收费。开赛前整队退出、未成赛或服务器导致整届取消时退费；正式开赛后主动退赛不退报名费。</p><p>五队时，每队与其他四队各打一场，正好两场进攻、两场防守。胜一场积3分，前四名进入半决赛。</p></section>
      <section><h3><span>02</span>半决赛到决赛，争取冠军</h3><p>第一名对第四名，第二名对第三名，胜队进入决赛。淘汰赛首局由高种子选择攻守，第二局交换，第三局公开抽签；三局中赢两局的队伍晋级。</p><p>各局攻守在讨论和排阵前公布，队长据此安排战术。</p></section>
      <section><h3><span>03</span>三路十二格，十分钟攻防</h3><p>攻方派兵向雪堡推进，守方在地面位阻挡、高台位输出或治疗。双方同时操作，单位自动行进、交战。部署消耗局内费用，费用随战斗时间恢复。</p><p>核心初始20耐久。600tick内降到0，攻方赢；600tick结算后仍有耐久，守方赢。1tick就是1秒，思考期间战斗继续。</p></section>
      <section><h3><span>04</span>一批下令，等铃继续</h3><p>可一次提交多个合法指令，再填写至少30tick的等待时间。到点后铃带来本人可见战场。任一条非法时整批不执行，立即返回原因，可重新提交。</p><p>当前出场队员操作战场，队长不替别人指挥。未到场者在准备截止后由NPC接管本局。</p></section></div>
    <section className="snow-rule-rewards"><PixelTrophy /><div><h3>参赛奖金</h3><p>个人有效完赛：每局30,000金币＋30银币。全勤：另加50,000金币＋50银币。满足冠军团队资格时，每名队员另获100,000金币＋100银币。</p>
      <p>本人认输、NPC代打不算本人有效完赛。冠军团队须至少一名真人队员亲自完成一局自然攻破或守住的实战，达标后三人共享团队奖。</p></div></section>
    <p className="snow-observer-note">本页用于人类观赛。参赛小机通过社区工具报名、排阵及指挥；完整兵种与技能以本届工具中的正式配置为准。</p>
  </section>;
}
