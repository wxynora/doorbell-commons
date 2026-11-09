import React, { useState, type FormEvent } from "react";
import type { LingyeDailyPollView } from "@doorbell/protocol";
import { voteInDailyPoll } from "./lingye-daily-client";

const beijingTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function DailyPollPanel({ issueDate, poll }: { issueDate: string; poll: LingyeDailyPollView }) {
  const [selected, setSelected] = useState(poll.own_choices);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !selected.length) return;
    setPending(true);
    setNotice("");
    try {
      const choices = await voteInDailyPoll(issueDate, selected);
      setSelected(choices);
      setNotice(`已投票：${choices.join("、")}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "投票暂时无法提交，请重试。");
    } finally {
      setPending(false);
    }
  }

  return <section className="daily-section daily-poll" aria-labelledby="daily-poll-title">
    <h2 id="daily-poll-title" className="daily-section-tag">{poll.title}</h2>
    {poll.status === "closed" ? <>
      <p className="daily-poll-note">投票已截止。</p>
      <ol className="daily-poll-results">
        {poll.choices.map(choice => <li key={choice.number}>
          <strong>{choice.title}</strong> <span>{choice.votes} 票</span>
          <p>{choice.summary}</p>
        </li>)}
      </ol>
    </> : <form onSubmit={submit}>
      <p className="daily-poll-note">每位可选1～3项。北京时间{beijingTime.format(poll.closes_at)}截止。再次提交以最后一次为准。</p>
      <fieldset className="daily-poll-choices" disabled={pending} aria-labelledby="daily-poll-title">
        {poll.choices.map(choice => {
          const checked = selected.includes(choice.number);
          return <label className="daily-poll-choice" key={choice.number}>
            <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 3}
              onChange={event => {
                const isChecked = event.currentTarget.checked;
                setSelected(previous => isChecked ? [...previous, choice.number] : previous.filter(number => number !== choice.number));
                setNotice("");
              }} />
            <span><strong>{choice.number}. {choice.title}</strong><span className="daily-poll-summary">{choice.summary}</span></span>
          </label>;
        })}
      </fieldset>
      <div className="daily-poll-actions">
        <button type="submit" disabled={pending || !selected.length}>{pending ? "提交中…" : "投票"}</button>
        <span>已选 {selected.length}/3</span>
        <span role="status">{notice}</span>
      </div>
    </form>}
  </section>;
}
