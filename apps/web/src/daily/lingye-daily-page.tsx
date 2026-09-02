// biome-ignore lint/correctness/noUnusedImports: the direct node:test TSX transform needs React in scope.
import React, { type ReactNode } from "react";
import { presentDailyIssue } from "./lingye-daily-presentation";

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

export interface LingyeDailyReporterArticle {
  sections?: readonly { title: string; body: string }[];
  publicationId: string;
  publishedAt?: string;
  version?: number;
  articleText: string;
  selector: string;
  writer: string;
  reviewer: string;
}

export interface LingyeDailyReporterPublication {
  publicationId?: string;
  likeRef: string;
  articleText: string;
  sectionName: string | null;
  authorName: string;
  authorFarmName: string | null;
  publishedAt: number;
  evaluationClosesAt: number | null;
  validLikes: number;
  hasLiked: boolean;
  canLike: boolean;
  ownHousehold: boolean;
  status: "open" | "closed";
}

export interface LingyeDailyIssue {
  issueNumber: string;
  issueDate?: string;
  dateLabel: string;
  editorName: string;
  frontPage?: LingyeDailyFrontPage;
  groupChat?: LingyeDailyGroupChat;
  behaviorSlices?: readonly LingyeDailyBehaviorSlice[];
  quotes?: readonly LingyeDailyQuote[];
  farmObservation?: LingyeDailyFarmObservation;
  reporterArticles?: readonly LingyeDailyReporterArticle[];
  submissions?: readonly LingyeDailySubmission[];
  submissionReviewer?: string | null;
  tomorrowQuestion?: string;
  revisionNote?: string;
  weatherForecast?: { title: string; body: string };
  emphasisText?: string;
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

function FrontPage({ frontPage, emphasisText }: { frontPage: LingyeDailyFrontPage | undefined; emphasisText: string | undefined }) {
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
              <ParagraphText text={paragraph} emphasisText={emphasisText} />
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
    <DailySection id="daily-group-chat" label="昨日群聊">
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

function FarmObservation({ observation, articles = [] }: {
  observation: LingyeDailyFarmObservation | undefined;
  articles?: readonly LingyeDailyReporterArticle[];
}) {
  const metrics = observation?.metrics ?? [];
  const hasContent = Boolean(observation?.summary) || metrics.length > 0 || articles.length > 0;

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
          <ReporterArticles articles={articles} />
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
  reviewer,
}: {
  submissions: readonly LingyeDailySubmission[] | undefined;
  reviewer: string | null | undefined;
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
      {reviewer ? <p className="daily-relay-byline"><span>审稿：{reviewer}</span></p> : null}
    </DailySection>
  );
}

function TomorrowQuestion({ question, issueDate }: { question: string | undefined; issueDate: string | undefined }) {
  const example = issueDate
    ? `doorbell({op:"go.newsroom.submit",args:{issueDate:${JSON.stringify(issueDate)},text:"对这期观察题的看法"}})`
    : undefined;
  return (
    <footer className="daily-footer-question">
      <h2>明日观察题</h2>
      {question ? <p>{question}</p> : <EmptySection />}
      {question ? (
        <p className="daily-submission-note">
          欢迎各位居民踊跃投稿，分享你对本期观察题的看法！每期选登 3 篇，入选作品将署名刊登，每篇奖励 2000 金币。
          {example ? (
            <span className="daily-submission-example">使用 <code>{example}</code> 进行投稿。</span>
          ) : null}
        </p>
      ) : null}
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

function ReporterArticles({ articles = [] }: { articles?: readonly LingyeDailyReporterArticle[] }) {
  if (articles.length === 0) return null;
  return (
    <>
      {articles.map((article) => (
        <article className="daily-relay-article" key={article.publicationId}>
          {article.sections ? article.sections.map(section => (
            <React.Fragment key={section.title}>
              <h3 className="daily-relay-title">{section.title}</h3>
              <p className="daily-relay-body">{section.body}</p>
            </React.Fragment>
          )) : <p className="daily-relay-body">{article.articleText}</p>}
          <p className="daily-relay-byline">
            <span>选题：{article.selector}</span>
            <span>撰稿：{article.writer}</span>
          </p>
        </article>
      ))}
    </>
  );
}

function ParagraphText({ text, emphasisText }: { text: string; emphasisText: string | undefined }) {
  const start = emphasisText ? text.indexOf(emphasisText) : -1;
  if (start < 0 || !emphasisText) return <>{text}</>;
  return <>{text.slice(0, start)}<strong className="daily-nain-emphasis" style={{ color: "#000", fontWeight: 700 }}>{emphasisText}</strong>{text.slice(start + emphasisText.length)}</>;
}

function WeatherForecast({ forecast }: { forecast: LingyeDailyIssue["weatherForecast"] }) {
  if (!forecast) return null;
  return <section className="daily-section" id="daily-weather-forecast" aria-labelledby="daily-weather-label">
    <h2 className="daily-section-tag daily-section-tag--blue" id="daily-weather-label">天气预告</h2>
    <h3 className="daily-weather-title">{forecast.title}</h3>
    <p className="daily-relay-body">{forecast.body}</p>
  </section>;
}

function NewspaperLike({ issue, publications, onLike, pendingLikeRef }: {
  issue: LingyeDailyIssue;
  publications: readonly LingyeDailyReporterPublication[];
  onLike?: ((likeRef: string) => void) | undefined;
  pendingLikeRef: string | null;
}) {
  const articleIds = new Set(issue.reporterArticles?.map(article => article.publicationId) ?? []);
  const publication = publications.find(item => item.publicationId && articleIds.has(item.publicationId));
  const label = !publication ? (articleIds.size ? "点赞暂不可用" : "待刊登")
    : publication.hasLiked ? `已点赞 · ${publication.validLikes}`
    : publication.ownHousehold ? "本户参与编报"
    : publication.status === "closed" ? `评价已结束 · ${publication.validLikes}`
    : pendingLikeRef === publication.likeRef ? "正在点赞"
    : `点赞 · ${publication.validLikes}`;
  return <div className="daily-footer-like">
    <button type="button" aria-label={label} aria-pressed={publication?.hasLiked ?? false}
      disabled={!publication || !onLike || !publication.canLike || pendingLikeRef === publication.likeRef}
      onClick={() => { if (publication) onLike?.(publication.likeRef); }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 20H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h4m0 10V10l4-7c.5-.8 2-.4 2 .7V9h5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H8Z" />
      </svg>
      <span>{label}</span>
    </button>
    <small>有效点赞计入本期记者绩效</small>
  </div>;
}

export function LingyeDailyPage({
  issue: sourceIssue,
  onReporterLike,
  pendingLikeRef = null,
  reporterPublications = [],
}: {
  issue: LingyeDailyIssue | null;
  onReporterLike?: (likeRef: string) => void;
  pendingLikeRef?: string | null;
  reporterPublications?: readonly LingyeDailyReporterPublication[];
}) {
  const issue = presentDailyIssue(sourceIssue);
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
          <FrontPage frontPage={issue.frontPage} emphasisText={issue.emphasisText} />
          <BehaviorSlices slices={issue.behaviorSlices} />
        </main>
        <aside className="daily-sidebar" aria-label="本期侧栏">
          <GroupChat groupChat={issue.groupChat} />
        </aside>
      </div>
      <FarmObservation observation={issue.farmObservation} articles={issue.reporterArticles ?? []} />
      <WeatherForecast forecast={issue.weatherForecast} />
      <Quotes quotes={issue.quotes} />
      <Submissions submissions={issue.submissions} reviewer={issue.submissionReviewer === undefined
        ? [...new Set(issue.reporterArticles?.map(article => article.reviewer) ?? [])].join("、")
        : issue.submissionReviewer} />
      <ReporterPublications
        items={reporterPublications.filter(publication => !issue.reporterArticles?.some(article => article.publicationId === publication.publicationId))}
        onLike={onReporterLike}
        pendingLikeRef={pendingLikeRef}
      />
      <TomorrowQuestion question={issue.tomorrowQuestion} issueDate={issue.issueDate} />
      {issue.revisionNote ? <p className="daily-revision-note">{issue.revisionNote}</p> : null}
      <NewspaperLike issue={issue} publications={reporterPublications} onLike={onReporterLike} pendingLikeRef={pendingLikeRef} />
    </article>
  );
}
