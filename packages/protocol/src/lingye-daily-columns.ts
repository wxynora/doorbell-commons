import { z } from "zod";

export const lingyeDailyColumnTextRunSchema = z.object({ text: z.string(), bold: z.boolean().optional() }).strict();
export type LingyeDailyColumnTextRun = z.infer<typeof lingyeDailyColumnTextRunSchema>;

const lingyeDailyColumnImageCropSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
}).strict().refine(crop => crop.x + crop.width <= crop.sourceWidth && crop.y + crop.height <= crop.sourceHeight);

const lingyeDailyColumnStandardBlockSchema = z.object({
  type: z.enum(["paragraph", "heading", "quote", "byline", "submission", "question", "image"]),
  runs: z.array(lingyeDailyColumnTextRunSchema),
  imageId: z.string().optional(),
  crop: lingyeDailyColumnImageCropSchema.optional(),
  submissionId: z.string().optional(),
  presentation: z.enum(["title", "subtitle", "subheading", "minor-heading", "highlight"]).optional(),
}).strict().refine(block => !block.crop || (block.type === "image" && !!block.imageId))
  .refine(block => !block.presentation || (block.type === "heading"
    ? ["title", "subheading", "minor-heading"].includes(block.presentation)
    : block.type === "paragraph" && ["subtitle", "highlight"].includes(block.presentation)));

export const lingyeDailyColumnKeySchema = z.enum([
  "column_nain",
  "column_gucheng",
  "column_etincelle",
]);
export type LingyeDailyColumnKey = z.infer<typeof lingyeDailyColumnKeySchema>;

export const LINGYE_DAILY_COLUMNS = [
  { key: "column_nain", title: "铃野拆解台" },
  { key: "column_gucheng", title: "田埂茶水间" },
  { key: "column_etincelle", title: "拾火" },
] as const satisfies readonly { key: LingyeDailyColumnKey; title: string }[];

const columnTitleByKey: Record<LingyeDailyColumnKey, string> = {
  column_nain: "铃野拆解台",
  column_gucheng: "田埂茶水间",
  column_etincelle: "拾火",
};

export function lingyeDailyColumnTitle(key: LingyeDailyColumnKey): string {
  return columnTitleByKey[key];
}

export const lingyeDailyColumnArticleSchema = z.object({
  column_key: lingyeDailyColumnKeySchema,
  submission_id: z.string().trim().min(1),
  author: z.string().trim().min(1),
  text: z.string().min(1),
}).strict();
export type LingyeDailyColumnArticle = z.infer<typeof lingyeDailyColumnArticleSchema>;

export const lingyeDailyColumnArticlesSchema = z.array(lingyeDailyColumnArticleSchema).superRefine((articles, ctx) => {
  const seen = new Set<LingyeDailyColumnKey>();
  articles.forEach((article, index) => {
    if (seen.has(article.column_key)) {
      ctx.addIssue({ code: "custom", path: [index, "column_key"], message: "同一期同一独立栏目只能有一篇稿件" });
    }
    seen.add(article.column_key);
  });
});

export interface LingyeDailyColumnImagePrompt {
  ordinal: number;
  imageId: string;
  prompt: string;
}

export function lingyeDailyColumnImageId(submissionId: string, ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new RangeError("image ordinal must be a non-negative integer");
  return `daily-column-image:${encodeURIComponent(submissionId)}:${ordinal}`;
}

export const lingyeDailyColumnProgressStatusSchema = z.enum([
  "waiting_materials",
  "pending",
  "submitted",
  "rested",
  "unavailable",
]);

export const lingyeDailyColumnProgressSchema = z.object({
  columnKey: lingyeDailyColumnKeySchema,
  title: z.string().min(1),
  reporterName: z.string().min(1),
  status: lingyeDailyColumnProgressStatusSchema,
  label: z.string(),
}).strict();
export type LingyeDailyColumnProgress = z.infer<typeof lingyeDailyColumnProgressSchema>;

export const lingyeDailyColumnDividerBlockSchema = z.object({
  type: z.literal("divider"),
  runs: z.array(lingyeDailyColumnTextRunSchema).length(0),
}).strict();

export const lingyeDailyColumnTableBlockSchema = z.object({
  type: z.literal("table"),
  runs: z.array(lingyeDailyColumnTextRunSchema).length(0),
  table: z.object({
    headers: z.array(z.array(lingyeDailyColumnTextRunSchema)).min(1),
    rows: z.array(z.array(z.array(lingyeDailyColumnTextRunSchema))),
  }).strict().superRefine((table, ctx) => {
    table.rows.forEach((row, index) => {
      if (row.length !== table.headers.length) {
        ctx.addIssue({ code: "custom", path: ["rows", index], message: "表格每行的单元格数量必须与表头一致" });
      }
    });
  }),
}).strict();

export const lingyeDailyColumnBlockSchema = z.union([
  lingyeDailyColumnStandardBlockSchema,
  lingyeDailyColumnDividerBlockSchema,
  lingyeDailyColumnTableBlockSchema,
]);
export type LingyeDailyColumnBlock = z.infer<typeof lingyeDailyColumnBlockSchema>;

export const lingyeDailyColumnSectionSchema = z.object({
  key: lingyeDailyColumnKeySchema,
  title: z.string(),
  blocks: z.array(lingyeDailyColumnBlockSchema),
}).strict();
export type LingyeDailyColumnSection = z.infer<typeof lingyeDailyColumnSectionSchema>;

const inlineMarkdownPattern = /\*\*([^*]+)\*\*/gu;

export function parseLingyeDailyColumnInline(text: string): LingyeDailyColumnTextRun[] {
  const runs: LingyeDailyColumnTextRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(inlineMarkdownPattern)) {
    const index = match.index ?? 0;
    const whole = match[0];
    const boldText = match[1];
    if (index > cursor) runs.push({ text: text.slice(cursor, index) });
    if (boldText) runs.push({ text: boldText, bold: true });
    cursor = index + whole.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs.length ? runs : text ? [{ text }] : [];
}

function splitMarkdownTableRow(line: string): string[] {
  const source = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && source[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else if (character !== undefined) {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isMarkdownTableSeparator(line: string, expectedColumns: number): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length === expectedColumns && cells.every(cell => /^:?-{3,}:?$/u.test(cell));
}

function looksLikeMarkdownTable(lines: readonly string[], index: number): boolean {
  const header = lines[index];
  const separator = lines[index + 1];
  if (!header?.includes("|") || !separator) return false;
  const headers = splitMarkdownTableRow(header);
  return headers.length > 0 && isMarkdownTableSeparator(separator, headers.length);
}

function markdownTableBlock(lines: readonly string[], start: number): { block: LingyeDailyColumnBlock; next: number } | null {
  const headerLine = lines[start];
  const separatorLine = lines[start + 1];
  if (!headerLine || !separatorLine) return null;
  const headerCells = splitMarkdownTableRow(headerLine);
  if (!isMarkdownTableSeparator(separatorLine, headerCells.length)) return null;

  const rowCells: string[][] = [];
  let next = start + 2;
  while (next < lines.length && lines[next]?.trim() && lines[next]?.includes("|")) {
    const cells = splitMarkdownTableRow(lines[next] ?? "");
    if (cells.length !== headerCells.length) return null;
    rowCells.push(cells);
    next += 1;
  }

  const block = lingyeDailyColumnTableBlockSchema.parse({
    type: "table",
    runs: [],
    table: {
      headers: headerCells.map(parseLingyeDailyColumnInline),
      rows: rowCells.map(row => row.map(parseLingyeDailyColumnInline)),
    },
  });
  return { block, next };
}

function parseLingyeDailyColumnMarkdownDocument(text: string, submissionId: string): {
  blocks: LingyeDailyColumnBlock[];
  imagePrompts: LingyeDailyColumnImagePrompt[];
} {
  const lines = text.split(/\r?\n/u);
  if (!lines.some(line => line.trim().length > 0)) return { blocks: [], imagePrompts: [] };
  const blocks: LingyeDailyColumnBlock[] = [];
  const imagePrompts: LingyeDailyColumnImagePrompt[] = [];
  let index = 0;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", runs: parseLingyeDailyColumnInline(paragraph.join("\n")) });
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const imagePrompt = /^[\t ]*配图[:：](.*)$/u.exec(line);
    if (imagePrompt && (imagePrompt[1] ?? "").length > 0) {
      flushParagraph();
      const ordinal = imagePrompts.length;
      const imageId = lingyeDailyColumnImageId(submissionId, ordinal);
      imagePrompts.push({ ordinal, imageId, prompt: imagePrompt[1] ?? "" });
      const caption = /^[\t ]*图注：([\s\S]*)$/u.exec(lines[index + 1] ?? "");
      blocks.push({
        type: "image",
        runs: caption ? parseLingyeDailyColumnInline((caption[1] ?? "").trim()) : [],
        imageId,
      });
      index += caption ? 2 : 1;
      continue;
    }

    const label = /^(标题|副标题|小标题|引用|重点)\s*[:：]\s*(\S.*)$/u.exec(trimmed);
    if (label) {
      flushParagraph();
      const runs = parseLingyeDailyColumnInline(label[2] ?? "");
      switch (label[1]) {
        case "标题": blocks.push({ type: "heading", presentation: "title", runs }); break;
        case "副标题": blocks.push({ type: "paragraph", presentation: "subtitle", runs }); break;
        case "小标题": blocks.push({ type: "heading", presentation: "subheading", runs }); break;
        case "引用": blocks.push({ type: "quote", runs }); break;
        case "重点": blocks.push({ type: "paragraph", presentation: "highlight", runs }); break;
      }
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(trimmed);
    if (heading) {
      flushParagraph();
      const presentation = heading[1] === "#" ? "title" : heading[1] === "##" ? "subheading" : "minor-heading";
      blocks.push({ type: "heading", presentation, runs: parseLingyeDailyColumnInline(heading[2] ?? "") });
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      flushParagraph();
      blocks.push({ type: "divider", runs: [] });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/u, ""));
        index += 1;
      }
      blocks.push({ type: "quote", runs: parseLingyeDailyColumnInline(quoteLines.join("\n")) });
      continue;
    }

    if (looksLikeMarkdownTable(lines, index)) {
      flushParagraph();
      const table = markdownTableBlock(lines, index);
      if (table) {
        blocks.push(table.block);
        index = table.next;
        continue;
      }
    }

    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return { blocks, imagePrompts };
}

export function parseLingyeDailyColumnMarkdown(text: string, submissionId: string): LingyeDailyColumnBlock[] {
  return parseLingyeDailyColumnMarkdownDocument(text, submissionId).blocks;
}

export function parseLingyeDailyColumnImagePrompts(text: string, submissionId: string): LingyeDailyColumnImagePrompt[] {
  return parseLingyeDailyColumnMarkdownDocument(text, submissionId).imagePrompts;
}

export function lingyeDailyColumnArticleToSection(article: LingyeDailyColumnArticle): LingyeDailyColumnSection {
  const checked = lingyeDailyColumnArticleSchema.parse(article);
  const parsed = parseLingyeDailyColumnMarkdownDocument(checked.text, checked.submission_id);
  return lingyeDailyColumnSectionSchema.parse({
    key: checked.column_key,
    title: columnTitleByKey[checked.column_key],
    blocks: [
      ...parsed.blocks,
      { type: "byline", runs: [{ text: `——${checked.author}` }], submissionId: checked.submission_id },
    ],
  });
}

export function lingyeDailyColumnSectionsFromEdition(
  columnArticles: readonly LingyeDailyColumnArticle[] | undefined,
): LingyeDailyColumnSection[] {
  const checked = lingyeDailyColumnArticlesSchema.parse(columnArticles ?? []);
  const articlesByKey = new Map(checked.map(article => [article.column_key, article]));
  return LINGYE_DAILY_COLUMNS.flatMap(column => {
    const article = articlesByKey.get(column.key);
    return article ? [lingyeDailyColumnArticleToSection(article)] : [];
  });
}

export function lingyeDailyColumnBlockText(block: LingyeDailyColumnBlock): string {
  if (block.type === "divider") return "---";
  if (block.type === "table") {
    const rows = [block.table.headers, ...block.table.rows];
    return rows.map(row => row.map(cell => cell.map(run => run.text).join("")).join(" | ")).join("\n");
  }
  return block.runs.map(run => run.text).join("");
}

export function lingyeDailyColumnDocumentText(sections: readonly LingyeDailyColumnSection[]): string {
  return sections.filter(section => section.blocks.length).map(section =>
    [section.title, ...section.blocks.map(lingyeDailyColumnBlockText).filter(Boolean)]
      .filter(Boolean).join("\n\n")).join("\n\n");
}
