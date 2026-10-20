import { useEffect, useState } from "react";
import type { BoundConstableInterviewSuccess, BoundConstableInterviewView } from "@doorbell/protocol";
import { actOnConstableInterview, interviewIssueMessage, readConstableInterviews, scoreConstableInterview, type InterviewIssue } from "../auth/constable-interview-client";
import "./constable-interview-page.css";

const statuses: Record<BoundConstableInterviewView["status"], string> = {
  signup_open: "考官报名／到场确认", panel_ready: "考官已就位", postponed: "本场顺延", scoring: "评分中",
  failed: "面试未通过", public_notice: "公示中", pending_review_configuration: "等待复核规则确认",
  review_required: "复核中", certificate_activated: "资格已核准",
};
const time = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
function Material({ value }: { value: unknown }) {
  if (typeof value === "string" || typeof value === "number") return <p>{String(value)}</p>;
  if (Array.isArray(value)) return <ol>{value.map((item, i) => <li key={i}><Material value={item} /></li>)}</ol>;
  if (value && typeof value === "object") return <dl>{Object.entries(value).map(([key, item]) => <div key={key}>{key === "questions" ? null : <dt>{key}</dt>}<dd><Material value={item} /></dd></div>)}</dl>;
  return null;
}
function Interview({ item, pending, act, score }: { item: BoundConstableInterviewView; pending: boolean; act(action: "signup" | "attendance", id: string): void; score(input: Parameters<typeof scoreConstableInterview>[0]): void }) {
  const [total, setTotal] = useState(""), [comment, setComment] = useState("");
  const [stars, setStars] = useState({ clarity: 0, fairness: 0, reliability: 0 });
  const dimensions = { clarity: "说人话程度", fairness: "一碗水端平", reliability: "靠谱程度" } as const;
  return <article className="bell-access__section">
    <div className="bell-access__section-heading"><h2>{time(item.scheduled_at)}</h2><strong>{statuses[item.status]}</strong></div>
    <div className="bell-access__content">
      <p className="interview-page__id">{["初级", "中级", "高级", "特级"][item.qualification_level - 1]} · {item.phase === "review" ? "原卷复核" : "资格面试"} · {item.interview_id}</p>
      {item.phase === "review" ? <p>{item.review_outcome === "passed" ? "复核通过，资格将于下一自然日生效。" : item.review_outcome === "failed" ? "复核未通过，可按学校当前选项重新报名。" : "本场面试进入复核，资格暂不生效。"}</p> : null}
      {item.self.signed_up ? <p>报名顺位 {item.self.signup_order} · {item.self.selected ? "本场考官" : item.self.tentative ? "暂定考官" : "候补"} · {item.self.attendance_confirmed ? "已确认到场" : "尚未确认到场"}</p> : null}
      <div className="bell-access__actions">
        {item.self.signup_eligible ? <button className="bell-access__primary" type="button" disabled={pending} onClick={() => act("signup", item.interview_id)}>确认报名</button> : null}
        {item.self.signed_up && !item.self.attendance_confirmed && item.status === "signup_open" ? <button className="bell-access__primary" type="button" disabled={pending} onClick={() => act("attendance", item.interview_id)}>确认到场</button> : null}
      </div>
      {item.self.signed_up && item.status === "signup_open" ? <p>到场确认开始：{time(item.attendance_confirmation_open_at)}。不足三名已确认考官时按原规则顺延。</p> : null}
      {item.interview_material ? <>
        <h3>题目与事实材料</h3><Material value={item.interview_material.paper} />
        {JSON.stringify(item.interview_material.paper) !== JSON.stringify(item.interview_material.fact_material) ? <><h3>事实材料</h3><Material value={item.interview_material.fact_material} /></> : null}
        <h3>考生答卷</h3>{item.answer ? <p className="interview-page__answer">{item.answer.text}</p> : <p>考生尚未提交答卷，暂不能评分。</p>}
        {item.original_scores ? <details><summary>原三名考官评分</summary><ol>{item.original_scores.map((value, index) => <li key={index}>{"score" in value ? <><p>评分 {value.score}／20分</p><p>说人话程度 {value.stars.clarity}／5 · 一碗水端平 {value.stars.fairness}／5 · 靠谱程度 {value.stars.reliability}／5</p><p>{value.comment}</p></> : <>事实与证据 {value.facts} · 权限克制 {value.restraint} · 程序完整 {value.procedure} · 说明清楚 {value.explanation}</>}</li>)}</ol></details> : null}
        {item.self.score_submitted ? <p role="status">你的评分已提交。本场已收 {item.score_count}／3 份评分。</p> : item.answer ? <form onSubmit={event => {
          event.preventDefault(); if (pending) return;
          score({ interview_id: item.interview_id, score: Number(total), stars, comment });
        }}><fieldset disabled={pending}><legend>你的评价</legend>
          <p className="interview-page__hint">点亮星星，说说这份答卷给你的感觉。</p>
          <div className="interview-page__ratings">{Object.entries(dimensions).map(([key, label]) =>
            <fieldset className="interview-page__rating" key={key}><legend>{label}</legend>
              <div className="interview-page__stars">{[1, 2, 3, 4, 5].map(value =>
                <label key={value} className={stars[key as keyof typeof stars] >= value ? "is-lit" : ""}>
                  <input type="radio" name={`${item.interview_id}-${key}`} value={value} required
                    aria-label={`${label} ${value}星`} checked={stars[key as keyof typeof stars] === value}
                    onChange={() => setStars(current => ({ ...current, [key]: value }))} />
                  <span aria-hidden="true">★</span>
                </label>)}</div>
            </fieldset>)}</div>
          <label className="interview-page__score">正式评分
            <span><input aria-label="正式评分" type="text" inputMode="numeric" pattern="([0-9]|1[0-9]|20)" required
              placeholder="填写分数" value={total} onChange={event => setTotal(event.target.value)} /><span>／20分</span></span>
          </label>
          <label className="interview-page__comment">考官评语<textarea rows={4} placeholder="写下你的看法…" value={comment} onChange={event => setComment(event.target.value)} /></label>
          <div className="bell-access__actions"><button className="bell-access__primary" type="submit">提交评分</button></div>
        </fieldset></form> : null}
      </> : null}
      {item.public_notice && item.public_notice.status === "open" ? <p>公示截止：{time(item.public_notice.closes_at)}。公示期内资格尚不生效。</p> : null}
    </div>
  </article>;
}
export function ConstableInterviewPage({ onBack }: { onBack(): void }) {
  const [data, setData] = useState<BoundConstableInterviewSuccess | null>(null), [issue, setIssue] = useState<InterviewIssue | null>(null), [pending, setPending] = useState(false);
  const apply = (result: Awaited<ReturnType<typeof readConstableInterviews>>) => { if (result.ok) { setData(result.data); setIssue(null); } else setIssue(result.issue); };
  useEffect(() => {
    const controller = new AbortController();
    void readConstableInterviews({}, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) apply(result); });
    return () => controller.abort();
  }, []);
  const refresh = async () => { if (pending) return; setPending(true); apply(await readConstableInterviews()); setPending(false); };
  const act = async (action: "signup" | "attendance", id: string) => { if (pending) return; setPending(true); apply(await actOnConstableInterview(action, { interview_id: id })); setPending(false); };
  const score = async (input: Parameters<typeof scoreConstableInterview>[0]) => { if (pending) return; setPending(true); apply(await scoreConstableInterview(input)); setPending(false); };
  return <div className="bell-access interview-page"><main className="bell-access__page" aria-labelledby="interview-title">
    <button className="bell-access__back" type="button" onClick={onBack}>← 返回社区</button>
    <header className="bell-access__heading"><p className="bell-access__kicker">铃野职业学校</p><h1 id="interview-title">治安官面试</h1><p className="bell-access__intro">报名、到场确认与本场评分。时间均为北京时间。</p></header>
    <div className="bell-access__actions interview-page__refresh"><button className="bell-access__secondary" type="button" disabled={pending} onClick={() => void refresh()}>{pending ? "正在办理…" : "刷新状态"}</button></div>
    {issue ? <p className="bell-access__notice bell-access__notice--error" role="alert">{interviewIssueMessage(issue)}</p> : null}
    {!data && !issue ? <p role="status">正在读取面试安排…</p> : null}
    {data?.interviews.length === 0 ? <p>当前没有你可报名或参与的面试。</p> : null}
    {data?.interviews.map(item => <Interview key={item.interview_id} item={item} pending={pending} act={(action, id) => void act(action, id)} score={input => void score(input)} />)}
  </main></div>;
}
