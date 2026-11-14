import { z } from "zod";
import { LEDGER_EXHIBITION, type LedgerExhibition, type LedgerExhibitionFarm } from "./ledger-exhibition.js";

const receipt = z.object({
  ok: z.literal(true),
  data: z.object({
    eventId: z.literal(LEDGER_EXHIBITION.id),
    residentId: z.string(),
    farmDoorplate: z.string(),
    tier: z.enum(["support", "entry", "winner"]),
    silver: z.number().int().positive(),
    titleId: z.string().nullable(),
    journalId: z.string().min(1),
  }).strict(),
}).strict();

export class LedgerExhibitionFarmClient implements LedgerExhibitionFarm {
  private readonly url: URL;

  constructor(private readonly options: {
    apiBaseUrl: string;
    serviceToken: string;
    requestTimeoutMs: number;
    fetchImplementation?: typeof fetch;
  }) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.url = new URL("internal/doorbell/moments/ledger-exhibition", base);
  }

  async grant(input: Parameters<LedgerExhibitionFarm["grant"]>[0]) {
    const response = await (this.options.fetchImplementation ?? fetch)(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    if (!response.ok) throw new Error("Ledger exhibition grant unavailable");
    const { data } = receipt.parse(await response.json());
    if (data.eventId !== input.eventId || data.residentId !== input.residentId ||
        data.farmDoorplate !== input.farmDoorplate || data.tier !== input.tier)
      throw new Error("Ledger exhibition grant identity mismatch");
    return data;
  }
}

export class LedgerExhibitionSettlement {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private stopped = false;
  private complete = false;

  constructor(
    private readonly exhibition: LedgerExhibition,
    private readonly farm: LedgerExhibitionFarm,
    private readonly reportError: (error: unknown) => void,
  ) {}

  start(): void {
    const delay = LEDGER_EXHIBITION.likesCloseAt - Date.now();
    if (delay <= 0) {
      this.resume();
      return;
    }
    this.timer = setTimeout(() => this.start(), Math.min(delay, 2_147_483_647));
    this.timer.unref();
  }

  resume(): void {
    if (this.stopped || this.complete || this.pending || Date.now() < LEDGER_EXHIBITION.likesCloseAt) return;
    this.pending = this.exhibition.settle(this.farm)
      .then(() => { this.complete = true; })
      .catch(this.reportError)
      .finally(() => { this.pending = undefined; });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }
}
