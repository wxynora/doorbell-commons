import { dailyImageCropSchema } from "@doorbell/protocol";
import {
  lingyeDailyColumnBlockSchema,
  lingyeDailyColumnKeySchema,
  lingyeDailyColumnSectionSchema,
  lingyeDailyColumnTableBlockSchema,
  lingyeDailyColumnTitle,
  type LingyeDailyColumnBlock,
  type LingyeDailyColumnSection,
  type LingyeDailyColumnTextRun,
} from "./protocol.js";

function textRuns(node: Node, bold = false): LingyeDailyColumnTextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [{ text: node.textContent, ...(bold ? { bold: true } : {}) }] : [];
  }
  if (!(node instanceof HTMLElement)) return [];
  if (node.tagName === "BR") return [{ text: "\n", ...(bold ? { bold: true } : {}) }];
  const strong = bold || ["STRONG", "B"].includes(node.tagName) || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600;
  return [...node.childNodes].flatMap(child => textRuns(child, strong));
}

function tableBlock(table: HTMLTableElement): LingyeDailyColumnBlock {
  const headerCells = [...table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th")];
  const rows = [...table.querySelectorAll<HTMLTableSectionElement>("tbody")]
    .flatMap(body => [...body.rows])
    .map(row => [...row.cells].map(cell => textRuns(cell)));
  return lingyeDailyColumnTableBlockSchema.parse({
    type: "table",
    runs: [],
    table: { headers: headerCells.map(cell => textRuns(cell)), rows },
  });
}

function readBlock(node: Node): LingyeDailyColumnBlock | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const runs = textRuns(node);
    return runs.some(run => run.text.trim())
      ? lingyeDailyColumnBlockSchema.parse({ type: "paragraph", runs })
      : null;
  }
  if (!(node instanceof HTMLElement)) return null;
  if (node.dataset.imageId) {
    const caption = node.querySelector("figcaption");
    return lingyeDailyColumnBlockSchema.parse({
      type: "image",
      runs: caption ? textRuns(caption) : [],
      imageId: node.dataset.imageId,
      ...(node.dataset.imageCrop ? { crop: dailyImageCropSchema.parse(JSON.parse(node.dataset.imageCrop)) } : {}),
    });
  }
  if (node.dataset.dailyDivider === "true" || node.tagName === "HR") {
    return lingyeDailyColumnBlockSchema.parse({ type: "divider", runs: [] });
  }
  if (node instanceof HTMLTableElement || node.dataset.dailyTable === "true") {
    const table = node instanceof HTMLTableElement ? node : node.querySelector("table");
    return table ? tableBlock(table) : null;
  }
  const runs = textRuns(node);
  if (!runs.some(run => run.text.trim())) return null;
  const headingPresentation = ({ H3: "title", H4: "subheading", H5: "minor-heading" } as const)[node.tagName as "H3" | "H4" | "H5"];
  const type = headingPresentation ? "heading"
    : node.tagName === "BLOCKQUOTE" ? "quote"
      : node.dataset.blockType === "heading" ? "paragraph" : node.dataset.blockType ?? "paragraph";
  // formatBlock can keep the former element's data attributes; the live tag wins.
  const presentation = headingPresentation ?? (type === "paragraph" && ["subtitle", "highlight"].includes(node.dataset.presentation ?? "")
    ? node.dataset.presentation : undefined);
  return lingyeDailyColumnBlockSchema.parse({
    type,
    runs,
    ...(presentation ? { presentation } : {}),
    ...(node.dataset.submissionId ? { submissionId: node.dataset.submissionId } : {}),
  });
}

export function readDailyColumnEditorSection(sectionElement: HTMLElement): LingyeDailyColumnSection {
  const key = lingyeDailyColumnKeySchema.parse(sectionElement.dataset.sectionKey);
  const copy = sectionElement.querySelector<HTMLElement>(".daily-column-copy, .daily-document-copy");
  if (!copy) throw new Error(`栏目正文缺失：${key}`);
  const blocks = [...copy.childNodes].flatMap(node => {
    const block = readBlock(node);
    return block ? [block] : [];
  });
  return lingyeDailyColumnSectionSchema.parse({
    key,
    title: lingyeDailyColumnTitle(key),
    blocks,
  });
}
