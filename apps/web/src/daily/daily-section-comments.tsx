import React, { useEffect, useState } from "react";
import type { LingyeDailyCommentSection, LingyeDailySectionComment, LingyeDailySectionCommentsLoader, LingyeDailySectionCommentPublisher } from "./lingye-daily-client";

export function DailySectionComments({ issueDate, sectionKey, sectionTitle, loadComments, publishComment, initialCount = 0 }: {
  issueDate: string;
  sectionKey: LingyeDailyCommentSection;
  sectionTitle: string;
  loadComments: LingyeDailySectionCommentsLoader;
  publishComment?: LingyeDailySectionCommentPublisher | undefined;
  initialCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const characterCount = [...text].length;
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; comments: LingyeDailySectionComment[] }>({ status: "loading" });
  const regionId = `daily-comments-${issueDate}-${sectionKey}`;
  useEffect(() => {
    if (!open) return;
    let active = true;
    setState({ status: "loading" });
    void loadComments(issueDate, sectionKey).then(comments => {
      if (active) { setState({ status: "ready", comments }); setCount(comments.length); }
    }).catch(() => {
      if (active) setState({ status: "error" });
    });
    return () => { active = false; };
  }, [open, issueDate, sectionKey, loadComments]);
  const publish = async () => {
    if (!publishComment || publishing || state.status === "loading" || characterCount > 100 || !text.trim()) return;
    setPublishing(true); setPublishError("");
    try {
      const comments = await publishComment(issueDate, sectionKey, text);
      setState({ status: "ready", comments }); setCount(comments.length); setText(""); setComposing(false);
    } catch {
      setPublishError("评论未发布，请重试。");
    } finally { setPublishing(false); }
  };
  return <>
    <button type="button" className="daily-comments-toggle" aria-label={`${open ? "收起" : "查看"}${sectionTitle}评论${count > 0 ? `，共 ${count} 条` : ""}`}
      aria-expanded={open} aria-controls={regionId} onClick={() => setOpen(value => !value)}><span className="daily-comments-icon" aria-hidden="true">💬
        {count > 0 ? <span className="daily-comments-count">{count}</span> : null}</span></button>
    {open ? <div className="daily-section-comments" id={regionId} role="region" aria-label={`${sectionTitle}评论`} aria-live="polite">
      {state.status === "loading" ? <p>正在读取评论…</p> : state.status === "error" ? <p>评论暂时没打开，请收起后重试。</p>
        : state.comments.length ? state.comments.map(comment => <p key={comment.comment_id}><strong>{comment.name}</strong>：{comment.text}</p>)
        : <p>还没有评论。</p>}
      {publishComment ? composing ? <form className="daily-comment-form" onSubmit={event => { event.preventDefault(); void publish(); }}>
        <textarea aria-label="评论内容" value={text} disabled={publishing} onChange={event => setText(event.target.value)} />
        <p className="daily-comment-character-count" aria-live="polite">{characterCount} / 100</p>
        <div><button className="daily-comment-action" type="submit" disabled={publishing || state.status === "loading" || characterCount > 100 || !text.trim()}>{publishing ? "正在发布…" : "发布"}</button>
          <button className="daily-comment-action" type="button" disabled={publishing} onClick={() => setComposing(false)}>取消</button></div>
        {publishError ? <p role="alert">{publishError}</p> : null}
        {characterCount > 100 ? <p role="alert">正文不能超过100字，当前为{characterCount}字。</p> : null}
      </form> : <button className="daily-comment-action" type="button" disabled={state.status === "loading"} onClick={() => { setComposing(true); setPublishError(""); }}>发布评论</button> : null}
    </div> : null}
  </>;
}
