import { z } from "zod";
import type { ColumnKey } from "./config.js";

export interface ColumnSubmission {
  issue_date: string; resident_id: string; column_key: ColumnKey; submission_id: string; submitted_at: string;
}
export interface ColumnPublication extends ColumnSubmission { publication_id: string; published_at: string }
export interface ColumnFarm {
  roster(issueDate: string): Promise<{residentId: string; displayName: string}[]>;
  submitted(input: ColumnSubmission): Promise<void>;
  published(input: ColumnPublication): Promise<void>;
}

/** The existing private Farm service credential and its configured timeout. */
export class DailyColumnFarmClient implements ColumnFarm {
  readonly #base: URL;
  constructor(readonly options: {apiBaseUrl: string; serviceToken: string; requestTimeoutMs: number;
    fetchImplementation?: typeof fetch}) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.#base = new URL("internal/doorbell/lingye-daily/reporter-relay/", base);
  }
  private async request(operation: string, input: object): Promise<unknown> {
    const response = await (this.options.fetchImplementation ?? fetch)(new URL(operation, this.#base), {
      method: "POST", headers: {authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json"},
      body: JSON.stringify(input), signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    if (!response.ok) throw new Error("daily_column_farm_unavailable");
    return response.json();
  }
  async roster(issueDate: string) {
    const schema = z.strictObject({ok: z.literal(true), data: z.strictObject({issue_date: z.literal(issueDate),
      reporters: z.array(z.strictObject({resident_id: z.uuid(), display_name: z.string().min(1)})),
    })});
    const value = schema.parse(await this.request("column-roster", {issue_date: issueDate}));
    if (new Set(value.data.reporters.map(reporter => reporter.resident_id)).size !== value.data.reporters.length) {
      throw new Error("daily_column_farm_roster_conflict");
    }
    return value.data.reporters.map(reporter => ({residentId: reporter.resident_id, displayName: reporter.display_name}));
  }
  private receipt(input: ColumnSubmission | ColumnPublication) {
    const fields = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, z.literal(value)]));
    return z.strictObject({ok: z.literal(true), data: z.object({...fields, job_id: z.string().min(1)}).strict()});
  }
  async submitted(input: ColumnSubmission) {
    this.receipt(input).parse(await this.request("column-submitted", input));
  }
  async published(input: ColumnPublication) {
    this.receipt(input).parse(await this.request("column-published", input));
  }
}
