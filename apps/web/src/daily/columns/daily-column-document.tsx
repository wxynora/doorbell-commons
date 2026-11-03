import React from "react";
import type { LingyeDailyColumnBlock, LingyeDailyColumnSection, LingyeDailyColumnTextRun } from "./protocol.js";
import "./daily-columns.css";

function DailyColumnRuns({ runs }: { runs: LingyeDailyColumnTextRun[] }) {
  return <>{runs.map((run, index) => run.bold
    ? <strong key={index}>{run.text}</strong>
    : <React.Fragment key={index}>{run.text}</React.Fragment>)}</>;
}

export function DailyColumnBlockView({ block }: { block: LingyeDailyColumnBlock }) {
  if (block.type === "divider") return <hr className="daily-column-divider" data-daily-divider="true" data-block-type="divider" />;
  if (block.type === "table") return <table className="daily-column-table" data-daily-table="true">
    <thead><tr>{block.table.headers.map((cell, index) => <th key={index}><DailyColumnRuns runs={cell} /></th>)}</tr></thead>
    <tbody>{block.table.rows.map((row, rowIndex) => <tr key={rowIndex}>
      {row.map((cell, cellIndex) => <td key={cellIndex}><DailyColumnRuns runs={cell} /></td>)}
    </tr>)}</tbody>
  </table>;
  const content = <DailyColumnRuns runs={block.runs} />;
  if (block.type === "heading") {
    const Heading = block.presentation === "subheading" ? "h4" : block.presentation === "minor-heading" ? "h5" : "h3";
    return <Heading className="daily-column-heading" data-block-type="heading" data-presentation={block.presentation}>{content}</Heading>;
  }
  if (block.type === "quote") return <blockquote className="daily-column-quote" data-block-type="quote">{content}</blockquote>;
  if (block.type === "byline") return <p className="daily-column-byline" data-block-type="byline"
    data-submission-id={block.submissionId}>{content}</p>;
  if (block.type === "image") return null;
  return <p data-block-type={block.type} data-presentation={block.presentation}
    className={`daily-column-${block.type}`}>{content}</p>;
}

export function DailyColumnSectionView({ section, editable = false }: {
  section: LingyeDailyColumnSection;
  editable?: boolean;
}) {
  const tone = section.key === "column_gucheng" ? "green" : section.key === "column_etincelle" ? "red" : "blue";
  return <section className="daily-section daily-document-section daily-column-section"
    data-section-key={section.key}>
    <h2 className={`daily-section-tag daily-section-tag--${tone}`} contentEditable={false}>{section.title}</h2>
    <div className="daily-document-copy daily-column-copy" contentEditable={editable}
      suppressContentEditableWarning role={editable ? "textbox" : undefined}
      aria-label={editable ? section.title : undefined} aria-multiline={editable ? true : undefined}>
      {section.blocks.map((block, index) => <DailyColumnBlockView block={block} key={`${block.type}:${index}`} />)}
    </div>
  </section>;
}

export function DailyColumnSectionsView({ sections, editable = false }: {
  sections: readonly LingyeDailyColumnSection[];
  editable?: boolean;
}) {
  return <>{sections.map(section => <DailyColumnSectionView key={section.key} section={section} editable={editable} />)}</>;
}
