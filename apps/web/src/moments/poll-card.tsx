import { useEffect, useId, useState } from "react";
import { issueMessage, MomentsApiError, type MomentView } from "./api";
import "./poll-card.css";

type Poll = NonNullable<MomentView["poll"]>;
const deadlineFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function PollCard({ postId, question, poll, update }: {
  postId: string; question: string; poll: Poll;
  update(id: string, choices?: number[], signal?: AbortSignal): Promise<void>;
}) {
  const field = useId();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = draft ?? poll.choices;
  const changed = chosen.length !== poll.choices.length || chosen.some(number => !poll.choices.includes(number));
  const single = poll.max === 1;

  useEffect(() => {
    if (poll.closed) return;
    const delay = Math.max(0, poll.at - Date.now());
    if (delay > 2_147_483_647) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void update(postId, undefined, controller.signal).catch(() => {}); }, delay);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [poll.at, poll.closed, postId, update]);

  async function submit() {
    if (saving || !changed || !chosen.length) return;
    setSaving(true); setError(null);
    try { await update(postId, chosen); setDraft(null); }
    catch (cause) {
      setError(issueMessage(cause));
      if (cause instanceof MomentsApiError && cause.code === "poll_closed") await update(postId).catch(() => {});
    } finally { setSaving(false); }
  }

  function choose(number: number) {
    setError(null);
    setDraft(single ? [number] : chosen.includes(number) ? chosen.filter(value => value !== number) : [...chosen, number]);
  }

  return <form className="source ly-ballot" aria-labelledby={field} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="ly-ballot-bar">
      <span>▦ 投票</span>
      <span>{poll.closed ? "已截止" : single ? "盲投 · 单选" : `盲投 · 最多选 ${poll.max} 项`}</span>
    </div>
    <fieldset disabled={saving}>
      <legend id={field}>{question}</legend>
      {poll.options.map(option => poll.closed
        ? <div className="ly-ballot-row" key={option.number}>
          <span className="ly-ballot-number">{option.number}</span>
          <span>{option.text}</span>
          <strong className="ly-ballot-total">{option.votes} 票</strong>
        </div>
        : <label className="ly-ballot-row" key={option.number}>
          <span className="ly-ballot-number">{option.number}</span>
          <span>{option.text}</span>
          <input type={single ? "radio" : "checkbox"} name={field} checked={chosen.includes(option.number)}
            disabled={!single && chosen.length >= poll.max && !chosen.includes(option.number)}
            onChange={() => choose(option.number)} />
        </label>)}
    </fieldset>
    <div className="ly-ballot-foot">
      <time dateTime={new Date(poll.at).toISOString()}>截止 · {deadlineFormat.format(poll.at)}</time>
      {poll.closed
        ? poll.choices.length > 0 && <span>我的选择 · {poll.choices.join("、")}</span>
        : <button type="submit" className="quiet" disabled={saving || !chosen.length || !changed}>
          {saving ? "提交中" : poll.choices.length ? changed ? "改票" : "已投票" : "投票"}
        </button>}
    </div>
    {error && !poll.closed && <p role="alert" className="ly-ballot-error">{error}</p>}
  </form>;
}
