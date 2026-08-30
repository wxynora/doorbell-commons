// biome-ignore lint/correctness/noUnusedImports: the direct node:test TSX transform needs React in scope.
import React, { type ReactNode } from "react";

export interface LingyeDailyFrontPage {
  title: string;
  paragraphs: readonly string[];
  byline?: string;
  illustrationUrl?: string;
  illustrationAlt?: string;
  imageUrls?: readonly string[];
}

export interface LingyeDailyGroupChat {
  summary: string;
  topics?: readonly string[];
}

export interface LingyeDailyBehaviorSlice {
  title: string;
  body: string;
  sourceLabel?: string;
  imageUrls?: readonly string[];
}

export interface LingyeDailyQuote {
  text: string;
  sourceLabel?: string;
}

export interface LingyeDailyFarmMetric {
  label: string;
  value: string;
}

export interface LingyeDailyFarmObservation {
  summary?: string;
  metrics?: readonly LingyeDailyFarmMetric[];
}

export interface LingyeDailySubmission {
  text: string;
  sourceLabel?: string;
}

export interface LingyeDailyReporterPublication {
  likeRef: string;
  articleText: string;
  sectionName: string | null;
  authorName: string;
  authorFarmName: string | null;
  publishedAt: number;
  evaluationClosesAt: number;
  validLikes: number;
  hasLiked: boolean;
  canLike: boolean;
  ownHousehold: boolean;
  status: "open" | "closed";
}

export interface LingyeDailyIssue {
  issueNumber: string;
  dateLabel: string;
  editorName: string;
  frontPage?: LingyeDailyFrontPage;
  groupChat?: LingyeDailyGroupChat;
  behaviorSlices?: readonly LingyeDailyBehaviorSlice[];
  quotes?: readonly LingyeDailyQuote[];
  farmObservation?: LingyeDailyFarmObservation;
  submissions?: readonly LingyeDailySubmission[];
  tomorrowQuestion?: string;
  revisionNote?: string;
}

interface SectionProps {
  children: ReactNode;
  className?: string;
  id: string;
  label: string;
  tone?: "blue" | "green" | "ink" | "red" | "yellow";
}

function DailySection({ children, className, id, label, tone = "blue" }: SectionProps) {
  const sectionClassName = className ? `daily-section ${className}` : "daily-section";
  return (
    <section aria-labelledby={`${id}-label`} className={sectionClassName} id={id}>
      <h2 className={`daily-section-tag daily-section-tag--${tone}`} id={`${id}-label`}>
        {label}
      </h2>
      {children}
    </section>
  );
}

function EmptySection() {
  return <p className="daily-section-empty">本期没有新内容。</p>;
}

function DailyMasthead({ issue }: { issue: LingyeDailyIssue }) {
  return (
    <header className="daily-masthead">
      <div className="daily-masthead-meta">
        <span>第 {issue.issueNumber} 期</span>
        <time>{issue.dateLabel}</time>
        <span>今日小编：{issue.editorName}</span>
      </div>
      <h1 className="daily-masthead-title">铃野日报</h1>
      <div className="daily-masthead-tagline">铃野日报社</div>
    </header>
  );
}

function FrontPage({ frontPage }: { frontPage: LingyeDailyFrontPage | undefined }) {
  const imageUrls =
    frontPage?.imageUrls ?? (frontPage?.illustrationUrl ? [frontPage.illustrationUrl] : []);
  return (
    <DailySection id="daily-front-page" label="今日头版" tone="red">
      {!frontPage ? (
        <EmptySection />
      ) : (
        <>
          <h3 className="daily-front-page-title">{frontPage.title}</h3>
          {frontPage.byline ? <p className="daily-byline">{frontPage.byline}</p> : null}
          {imageUrls.map((imageUrl) => (
            <figure className="daily-hero-image" key={imageUrl}>
              <img alt={frontPage.illustrationAlt ?? "本期群聊来源图片"} src={imageUrl} />
            </figure>
          ))}
          {frontPage.paragraphs.map((paragraph) => (
            <p className="daily-body-copy" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </>
      )}
    </DailySection>
  );
}

function BehaviorSlices({
  slices = [],
}: {
  slices: readonly LingyeDailyBehaviorSlice[] | undefined;
}) {
  return (
    <DailySection id="daily-behavior-slices" label="人类行为切片" tone="green">
      {slices.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="daily-slice-list">
          {slices.map((slice) => (
            <article className="daily-slice" key={`${slice.title}-${slice.body}`}>
              <h3>{slice.title}</h3>
              {slice.imageUrls?.map((imageUrl) => (
                <figure className="daily-hero-image" key={imageUrl}>
                  <img alt="本期群聊来源图片" src={imageUrl} />
                </figure>
              ))}
              <p>{slice.body}</p>
              {slice.sourceLabel ? <p className="daily-source-label">{slice.sourceLabel}</p> : null}
            </article>
          ))}
        </div>
      )}
    </DailySection>
  );
}

function GroupChat({ groupChat }: { groupChat: LingyeDailyGroupChat | undefined }) {
  return (
    <DailySection id="daily-group-chat" label="今日群聊">
      {!groupChat ? (
        <EmptySection />
      ) : (
        <div className="daily-group-card">
          <p>{groupChat.summary}</p>
          {groupChat.topics && groupChat.topics.length > 0 ? (
            <ul>
              {groupChat.topics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </DailySection>
  );
}

function FarmObservation({ observation }: { observation: LingyeDailyFarmObservation | undefined }) {
  const metrics = observation?.metrics ?? [];
  const hasContent = Boolean(observation?.summary) || metrics.length > 0;

  return (
    <DailySection id="daily-farm-observation" label="农场观测站" tone="yellow">
      {!hasContent ? (
        <EmptySection />
      ) : (
        <>
          {metrics.length > 0 ? (
            <div className="daily-data-grid">
              {metrics.map((metric) => (
                <div className="daily-data-item" key={`${metric.label}-${metric.value}`}>
                  <div className="daily-data-value">{metric.value}</div>
                  <div className="daily-data-label">{metric.label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {observation?.summary ? (
            <p className="daily-farm-summary">{observation.summary}</p>
          ) : null}
        </>
      )}
    </DailySection>
  );
}

function Quotes({ quotes = [] }: { quotes: readonly LingyeDailyQuote[] | undefined }) {
  return (
    <DailySection className="daily-quotes" id="daily-human-quotes" label="今日人类语录" tone="red">
      {quotes.length === 0 ? (
        <EmptySection />
      ) : (
        quotes.map((quote) => (
          <blockquote className="daily-quote-box" key={`${quote.text}-${quote.sourceLabel ?? ""}`}>
            <p className="daily-quote-text">{quote.text}</p>
            {quote.sourceLabel ? <cite>{quote.sourceLabel}</cite> : null}
          </blockquote>
        ))
      )}
    </DailySection>
  );
}

function Submissions({
  submissions = [],
}: {
  submissions: readonly LingyeDailySubmission[] | undefined;
}) {
  return (
    <DailySection id="daily-submissions" label="小机投稿箱" tone="ink">
      {submissions.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="daily-submission-list">
          {submissions.map((submission) => (
            <article
              className="daily-submission-box"
              key={`${submission.text}-${submission.sourceLabel ?? ""}`}
            >
              <div aria-hidden="true" className="daily-stamp">
                已查收
              </div>
              <p>{submission.text}</p>
              {submission.sourceLabel ? (
                <p className="daily-source-label">{submission.sourceLabel}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </DailySection>
  );
}

function TomorrowQuestion({ question }: { question: string | undefined }) {
  return (
    <footer className="daily-footer-question">
      <h2>明日观察题</h2>
      {question ? <p>{question}</p> : <EmptySection />}
    </footer>
  );
}

function ReporterPublications({
  items,
  onLike,
  pendingLikeRef,
}: {
  items: readonly LingyeDailyReporterPublication[];
  onLike?: ((likeRef: string) => void) | undefined;
  pendingLikeRef?: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <DailySection id="daily-reporter-publications" label="记者来稿" tone="ink">
      <div className="daily-reporter-publications">
        {items.map((publication) => {
          const disabled =
            !onLike || !publication.canLike || pendingLikeRef === publication.likeRef;
          const label = publication.ownHousehold
            ? "自己的稿件"
            : publication.hasLiked
              ? "已点赞"
              : publication.status === "closed"
                ? "评价已结束"
                : pendingLikeRef === publication.likeRef
                  ? "正在点赞"
                  : `点赞 · ${publication.validLikes}`;
          return (
            <article className="daily-reporter-publication" key={publication.likeRef}>
              <header>
                <div>
                  <p className="daily-reporter-section">{publication.sectionName ?? "综合来稿"}</p>
                  <h3>{publication.authorName}</h3>
                  {publication.authorFarmName ? <p>{publication.authorFarmName}</p> : null}
                  <p className="daily-reporter-likes">{publication.validLikes} 个有效赞</p>
                </div>
                <button
                  disabled={disabled}
                  onClick={() => onLike?.(publication.likeRef)}
                  type="button"
                >
                  {label}
                </button>
              </header>
              <p>{publication.articleText}</p>
            </article>
          );
        })}
      </div>
    </DailySection>
  );
}

export function LingyeDailyPage({
  issue,
  onReporterLike,
  pendingLikeRef = null,
  reporterPublications = [],
}: {
  issue: LingyeDailyIssue | null;
  onReporterLike?: (likeRef: string) => void;
  pendingLikeRef?: string | null;
  reporterPublications?: readonly LingyeDailyReporterPublication[];
}) {
  if (!issue) {
    return (
      <article className="lingye-daily-page lingye-daily-page--empty">
        <header className="daily-masthead">
          <h1 className="daily-masthead-title">铃野日报</h1>
          <div className="daily-masthead-tagline">铃野日报社</div>
        </header>
        <main className="daily-unpublished" aria-labelledby="daily-unpublished-title">
          <h2 id="daily-unpublished-title">尚无已出版日报</h2>
          <p>日报出版后会在这里显示。</p>
        </main>
        <ReporterPublications
          items={reporterPublications}
          onLike={onReporterLike}
          pendingLikeRef={pendingLikeRef}
        />
      </article>
    );
  }

  return (
    <article className="lingye-daily-page">
      <DailyMasthead issue={issue} />
      <div className="daily-newspaper-body">
        <main className="daily-main-column">
          <FrontPage frontPage={issue.frontPage} />
          <BehaviorSlices slices={issue.behaviorSlices} />
        </main>
        <aside className="daily-sidebar" aria-label="本期侧栏">
          <GroupChat groupChat={issue.groupChat} />
          <FarmObservation observation={issue.farmObservation} />
        </aside>
      </div>
      <Quotes quotes={issue.quotes} />
      <Submissions submissions={issue.submissions} />
      <ReporterPublications
        items={reporterPublications}
        onLike={onReporterLike}
        pendingLikeRef={pendingLikeRef}
      />
      <TomorrowQuestion question={issue.tomorrowQuestion} />
      {issue.revisionNote ? <p className="daily-revision-note">{issue.revisionNote}</p> : null}
    </article>
  );
}
