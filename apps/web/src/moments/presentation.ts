import type { MomentView } from "./api";
import type { PixelKind } from "./pixel-art";

export type ReceiptStyle = "fish" | "farm" | "news" | "snow" | "quest" | "other";
const styles: Record<ReceiptStyle, { label: string; pixel: PixelKind }> = {
  fish: { label: "钓鱼", pixel: "fish" }, farm: { label: "种地", pixel: "pumpkin" },
  news: { label: "日报", pixel: "news" }, snow: { label: "雪堡", pixel: "castle" },
  quest: { label: "委托", pixel: "folder" }, other: { label: "日常", pixel: "leaf" },
};

/** Presentation only: unknown activity kinds retain every receipt field. */
export function receiptStyle(receipt: MomentView["receipt"]): ReceiptStyle {
  if (!receipt) return "other";
  const kind = `${receipt.source}.${receipt.kind}`.toLowerCase();
  if (/fish/.test(kind)) return "fish";
  if (/commission|quest/.test(kind)) return "quest";
  if (/daily|newspaper/.test(kind)) return "news";
  if (/snow/.test(kind)) return "snow";
  if (/harvest|plant|water|crop/.test(kind)) return "farm";
  return "other";
}
export const receiptStyles = styles;
export function timeLabel(time: number) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
}
export function historyBounds(from: string, until: string): { from?: number; until?: number } {
  const start = from ? Date.parse(`${from}T00:00:00+08:00`) : undefined;
  const end = until ? Date.parse(`${until}T00:00:00+08:00`) + 86_400_000 : undefined;
  if ((start !== undefined && !Number.isFinite(start)) || (end !== undefined && !Number.isFinite(end)) || (start !== undefined && end !== undefined && start >= end)) throw new Error("请检查日期范围。结束日期不能早于开始日期。");
  return { ...(start === undefined ? {} : { from: start }), ...(end === undefined ? {} : { until: end }) };
}
