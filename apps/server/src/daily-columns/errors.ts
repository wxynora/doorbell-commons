export type DailyColumnErrorCode = "empty" | "option_invalid" | "author_mismatch" | "closed" |
  "published" | "not_reporter" | "qualification_unavailable" | "unavailable";
export class DailyColumnError extends Error {
  constructor(readonly code: DailyColumnErrorCode) { super(code); }
}
