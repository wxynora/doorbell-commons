import { z } from "zod";
import { farmActivityEventSchema, type FarmActivityEvent, type FarmActivitySource } from "./farm-activity-source.js";
import type { MomentsAgentContext } from "./agent-actions.js";
import type { MomentsStore } from "./store.js";

type RecoveryErrorCode = "invalid_request" | "farm_binding_mismatch" | "activity_unavailable";
export class ActivityRecoveryError extends Error {
  constructor(readonly code: RecoveryErrorCode) { super(code); this.name = "ActivityRecoveryError"; }
}

export interface ActivityRecoveryRange { from: number; until: number }
interface FarmActivityQuery extends ActivityRecoveryRange { residentId: string; farmDoorplate: string }
interface FarmLatestActivityQuery { residentId: string; farmDoorplate: string; latest: true; until: number }
export interface FarmActivityReader {
  read(input: FarmActivityQuery): Promise<FarmActivityEvent[]>;
  latest(input: FarmLatestActivityQuery): Promise<FarmActivityEvent[]>;
}

const rangeSchema = z.object({ from: z.number().int().safe(), until: z.number().int().safe() }).strict()
  .refine(range => range.from <= range.until);
const responseSchema = z.object({ ok: z.literal(true), activities: z.array(farmActivityEventSchema) }).strict();

/** Uses the existing Farm service credential and configured upstream timeout. */
export class FarmActivityRecoveryClient implements FarmActivityReader {
  private readonly endpoint: URL;
  constructor(private readonly options: { apiBaseUrl: string; serviceToken: string; requestTimeoutMs: number;
    fetchImplementation?: typeof fetch }) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.endpoint = new URL("internal/doorbell/moments/activities", base);
  }

  private async request(input: FarmActivityQuery | FarmLatestActivityQuery): Promise<FarmActivityEvent[]> {
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(this.endpoint, {
        method: "POST", headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error = z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }).strict() }).strict().safeParse(body);
        if (response.status === 409 && error.success && error.data.error.code === "farm_binding_mismatch")
          throw new ActivityRecoveryError("farm_binding_mismatch");
        throw new ActivityRecoveryError("activity_unavailable");
      }
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ActivityRecoveryError("activity_unavailable");
      return parsed.data.activities;
    } catch (error) {
      if (error instanceof ActivityRecoveryError) throw error;
      throw new ActivityRecoveryError("activity_unavailable");
    }
  }
  read(input: FarmActivityQuery) { return this.request(input); }
  latest(input: FarmLatestActivityQuery) { return this.request(input); }
}

/** Caller supplies the authenticated connection identity; no identity comes from tool arguments. */
export class ActivityRecovery {
  constructor(private readonly store: Pick<MomentsStore, "giftInventoryIdentity">,
    private readonly farm: FarmActivityReader, private readonly source: Pick<FarmActivitySource, "accept">) {}

  async read(context: MomentsAgentContext, input: ActivityRecoveryRange) {
    const range = rangeSchema.safeParse(input);
    if (!range.success) throw new ActivityRecoveryError("invalid_request");
    const actor = { kind: "resident" as const, residentId: context.residentId };
    const binding = this.store.giftInventoryIdentity(actor);
    const events = await this.farm.read({ residentId: binding.sender_resident_id,
      farmDoorplate: binding.sender_farm_doorplate, ...range.data });
    if (events.some(event => event.residentId !== context.residentId ||
      event.occurredAt < range.data.from || event.occurredAt >= range.data.until))
      throw new ActivityRecoveryError("activity_unavailable");
    const current = this.store.giftInventoryIdentity(actor);
    if (current.sender_resident_id !== binding.sender_resident_id ||
        current.sender_farm_doorplate !== binding.sender_farm_doorplate)
      throw new ActivityRecoveryError("farm_binding_mismatch");
    return events.map(event => this.source.accept(context.residentId, event));
  }

  /** A single authoritative latest event for automatic location, if one exists. */
  async latest(context: MomentsAgentContext, now: number) {
    if (!Number.isSafeInteger(now) || now < 0 || now === Number.MAX_SAFE_INTEGER)
      throw new ActivityRecoveryError("invalid_request");
    const actor = { kind: "resident" as const, residentId: context.residentId };
    const binding = this.store.giftInventoryIdentity(actor);
    const events = await this.farm.latest({ residentId: binding.sender_resident_id,
      farmDoorplate: binding.sender_farm_doorplate, latest: true, until: now + 1 });
    if (events.length > 1 || events.some(event => event.residentId !== context.residentId || event.occurredAt > now))
      throw new ActivityRecoveryError("activity_unavailable");
    const current = this.store.giftInventoryIdentity(actor);
    if (current.sender_resident_id !== binding.sender_resident_id ||
        current.sender_farm_doorplate !== binding.sender_farm_doorplate)
      throw new ActivityRecoveryError("farm_binding_mismatch");
    return events.length ? this.source.accept(context.residentId, events[0]!) : null;
  }
}
