import type Database from "better-sqlite3";

// The formal Main protocol owns this document. This structural type also lets
// the domain module be prepared in an older checkout without replacing it.
export interface PublishedDailyDocument {
  sections: readonly {
    key: string;
    title: string;
    blocks: readonly {
      type: string;
      runs: readonly { text: string }[];
      submissionId?: string | undefined;
      table?: {headers: readonly (readonly {text: string}[])[];
        rows: readonly (readonly (readonly {text: string}[])[])[]} | undefined;
    }[];
  }[];
}

type DailySection = PublishedDailyDocument["sections"][number];
type DailyBlock = DailySection["blocks"][number];

export interface PublishedArticle {
  issueDate: string;
  issueNumber: number;
  column: string;
  title: string | null;
  body: string;
  kind: "article" | "introduction" | "quote" | "submission";
}

export interface UnresolvedDailySection {
  issueDate: string;
  issueNumber: number;
  column: string | null;
  reason: "legacy_document_unavailable" | "unstructured_section";
}

export interface PublishedArticleSearchResult {
  articles: PublishedArticle[];
  unresolved: UnresolvedDailySection[];
}

export type LegacyPublishedDocument = (
  edition: unknown,
  issueDate: string,
) => PublishedDailyDocument;

interface PublishedIssueRow {
  issue_date: string;
  issue_number: number;
  edition_json: string;
}

function blockText(block: DailyBlock): string {
  if (block.type === "table" && block.table) {
    return [block.table.headers, ...block.table.rows]
      .map(row => row.map(cell => cell.map(run => run.text).join("")).join(" | ")).join("\n");
  }
  if (block.type === "divider") return "---";
  return block.runs.map((run) => run.text).join("");
}

function textOf(blocks: readonly DailyBlock[]): string {
  return blocks.filter((block) => block.type !== "image").map(blockText).join("\n\n");
}

function hasText(blocks: readonly DailyBlock[]): boolean {
  return blocks.some((block) => block.type !== "image" && blockText(block).trim());
}

/** Reads current published editions only; it never reads the editor draft tables. */
export class PublishedArticleStore {
  constructor(
    private readonly database: Database.Database,
    // Formal Main can supply dailyDocumentFromEdition(schema.parse(edition), date).
    // It is needed only for older published editions without editor_document.
    private readonly legacyDocument?: LegacyPublishedDocument,
  ) {}

  search(keyword: string, now: number): PublishedArticleSearchResult {
    if (!keyword.trim()) throw new RangeError("keyword_required");
    const rows = this.database.prepare(`SELECT issue_date, issue_number, edition_json
      FROM lingye_daily_issues WHERE published_at <= ?`).all(now) as PublishedIssueRow[];
    const result: PublishedArticleSearchResult = { articles: [], unresolved: [] };

    for (const row of rows) {
      const edition = JSON.parse(row.edition_json) as { editor_document?: PublishedDailyDocument };
      const document = edition.editor_document ?? this.legacyDocument?.(edition, row.issue_date);
      const issue = { issueDate: row.issue_date, issueNumber: row.issue_number };
      if (!document) {
        result.unresolved.push({ ...issue, column: null, reason: "legacy_document_unavailable" });
        continue;
      }

      for (const section of document.sections) {
        const unresolved = () => result.unresolved.push({
          ...issue, column: section.title, reason: "unstructured_section",
        });
        const add = (
          title: string | null,
          blocks: readonly DailyBlock[],
          kind: PublishedArticle["kind"],
        ) => {
          const body = textOf(blocks);
          if (!(title?.includes(keyword) || body.includes(keyword))) return;
          result.articles.push({ ...issue, column: section.title, title, body, kind });
        };

        if (["column_nain", "column_gucheng", "column_etincelle"].includes(section.key)) {
          // This section is exactly one commissioned article: its internal
          // subheadings never split it into multiple search results.
          const first = section.blocks[0];
          const title = first?.type === "heading" ? blockText(first) : null;
          const body = title !== null ? section.blocks.slice(1) : section.blocks;
          if (hasText(body)) add(title, body, "article");
          else if (title) add(null, section.blocks, "article");
        } else if (section.key === "front" || section.key === "slices" || section.key === "farm") {
          let title: string | null = null;
          let blocks: DailyBlock[] = [];
          let sawHeading = false;
          const flush = (followedByHeading = false) => {
            if (!hasText(blocks)) {
              if (title !== null) unresolved();
            } else if (title !== null) {
              add(title, blocks, "article");
            } else if (section.key === "farm" && !sawHeading && followedByHeading &&
              !blocks.some((block) => block.type === "byline")) {
              add(null, blocks, "introduction");
            } else {
              unresolved();
            }
            blocks = [];
          };
          for (const block of section.blocks) {
            if (block.type === "heading") {
              flush(true);
              sawHeading = true;
              title = blockText(block);
              if (!title.trim()) title = null;
            } else blocks.push(block);
          }
          flush();
        } else if (section.key === "quotes") {
          for (let index = 0; index < section.blocks.length; index += 1) {
            const block = section.blocks[index]!;
            if (block.type === "image") continue;
            if (block.type !== "quote") {
              if (blockText(block).trim()) unresolved();
              continue;
            }
            const blocks = [block];
            if (section.blocks[index + 1]?.type === "byline") blocks.push(section.blocks[++index]!);
            if (hasText(blocks)) add(null, blocks, "quote");
          }
        } else if (section.key === "submissions") {
          for (let index = 0; index < section.blocks.length; index += 1) {
            const block = section.blocks[index]!;
            if (["image", "question", "byline"].includes(block.type)) continue;
            if (block.type !== "submission" || !block.submissionId) {
              if (blockText(block).trim()) unresolved();
              continue;
            }
            const blocks = [block];
            while (section.blocks[index + 1]?.type === "submission" &&
              section.blocks[index + 1]?.submissionId === block.submissionId) {
              blocks.push(section.blocks[++index]!);
            }
            if (hasText(blocks)) add(null, blocks, "submission");
          }
        } else if (["group", "voice", "weather", "tomorrow"].includes(section.key)) {
          if (hasText(section.blocks)) {
            const first = section.blocks.findIndex((block) => block.type !== "image");
            const heading = section.blocks[first];
            if (heading?.type === "heading") {
              const title = blockText(heading);
              add(title.trim() ? title : null, section.blocks.slice(first + 1), "article");
            } else add(null, section.blocks, "article");
          }
        } else if (hasText(section.blocks)) unresolved();
      }
    }
    return result;
  }
}
