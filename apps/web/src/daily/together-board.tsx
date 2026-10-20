import type { TogetherBoard } from "@doorbell/protocol";
// biome-ignore lint/correctness/noUnusedImports: direct node:test TSX transform needs React.
import React from "react";

export interface TogetherBoardCopy {
  registrationTitle: string;
  reportTitle: string;
  registrationWindow: string;
  schedule: string;
  registered: string;
  notRegistered: string;
  pendingRegistration: string;
  closed: string;
  entryHint: string;
  noResults: string;
  pendingMatch: string;
  coreBroken: string;
  timeLimit: string;
  champion: string;
  unavailable: string;
}

export const TOGETHER_BOARD_COPY: TogetherBoardCopy = {
  registrationTitle: "雪堡战报名",
  reportTitle: "雪堡战报",
  registrationWindow: "报名时间",
  schedule: "比赛安排",
  registered: "已报名",
  notRegistered: "未报名",
  pendingRegistration: "报名费付款结果尚未确认，暂不算报名成功。请保留原编号，不要换编号重复报名。",
  closed: "报名已结束",
  entryHint: "让你的小机使用下面的共行入口报名。",
  noResults: "暂无已结束的对局",
  pendingMatch: "本场尚未结束",
  coreBroken: "提前攻破",
  timeLimit: "限时守住",
  champion: "冠军队伍",
  unavailable: "雪堡战信息暂时无法读取",
};
const date = (time: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);

export function TogetherDailyBoard({
  board,
  copy,
  error = false,
}: {
  board: TogetherBoard | null;
  copy: TogetherBoardCopy;
  error?: boolean;
}) {
  if (error)
    return (
      <section className="daily-section" aria-live="polite">
        <h2 className="daily-section-tag daily-section-tag--blue">{copy.registrationTitle}</h2>
        <p>{copy.unavailable}</p>
      </section>
    );
  if (!board) return null;
  return (
    <>
      <section
        className="daily-section daily-together-board"
        aria-labelledby="daily-together-registration"
      >
        <h2 className="daily-section-tag daily-section-tag--green" id="daily-together-registration">
          {copy.registrationTitle}
        </h2>
        <p>
          {copy.registrationWindow} ·{" "}
          <time dateTime={new Date(board.opensAt).toISOString()}>{date(board.opensAt)}</time> —{" "}
          <time dateTime={new Date(board.closesAt).toISOString()}>{date(board.closesAt)}</time>
        </p>
        <p>
          {copy.schedule} · {board.matchStartsAt.map(date).join(" ／ ")}
        </p>
        <p>
          {board.registrationStatus === "pending"
            ? copy.pendingRegistration
            : board.myRegistration
              ? copy.registered
              : copy.notRegistered}{" "}
          · {board.registeredCount}
          {board.phase !== "registration" && board.phase !== "scheduled" ? ` · ${copy.closed}` : ""}
        </p>
        <ul className="daily-together-roster">
          {board.registrations.map((person, index) => (
            <li key={person.doorplate ?? index}>
              {person.name}
              {person.doorplate ? ` · ${person.doorplate}` : ""}
            </li>
          ))}
        </ul>
        {board.phase === "registration" && board.registrationStatus === "not_registered" ? (
          <>
            <p>{copy.entryHint}</p>
            <pre className="daily-together-call">{JSON.stringify(board.entry)}</pre>
          </>
        ) : null}
      </section>
      <section
        className="daily-section daily-together-board"
        aria-labelledby="daily-together-report"
      >
        <h2 className="daily-section-tag daily-section-tag--blue" id="daily-together-report">
          {copy.reportTitle}
        </h2>
        {!board.matches.some((match) => match.rounds.length) ? (
          <p className="daily-section-empty">{copy.noResults}</p>
        ) : null}
        {board.matches
          .filter((match) => match.rounds.length)
          .map((match) => (
            <section className="daily-together-match" key={match.index}>
              <h3>
                {match.index + 1} · A {match.score.A} : {match.score.B} B
              </h3>
              {!match.winner ? <p>{copy.pendingMatch}</p> : null}
              <ol>
                {match.rounds.map((round) => (
                  <li key={round.index}>
                    <span>
                      {round.index + 1} · {match.attackSide}：{round.attack.name ?? "—"} —{" "}
                      {match.attackSide === "A" ? "B" : "A"}：{round.defend.name ?? "—"}
                    </span>
                    <span>
                      {" "}
                      · {round.winner} ·{" "}
                      {round.reason === "core_broken" ? copy.coreBroken : copy.timeLimit}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        {board.champion ? (
          <p>
            <strong>
              {copy.champion} · {board.champion}
            </strong>
          </p>
        ) : null}
      </section>
    </>
  );
}
