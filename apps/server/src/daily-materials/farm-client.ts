import { z } from "zod";

const windowSchema = z.strictObject({ startMs: z.number(), endMs: z.number(), timeZone: z.literal("Asia/Shanghai") });
const glimmerSchema = z.strictObject({
  window: windowSchema, recordingStartedAt: z.number().nullable(),
  variants: z.array(z.strictObject({
    variantId: z.string(), variantName: z.string(), baseKindId: z.string(), variantType: z.string(),
    feedingCount: z.number(), didNotFollowCount: z.number(),
    dishes: z.array(z.strictObject({ recipeId: z.string(), name: z.string(), quantity: z.number() })),
    successes: z.array(z.strictObject({ farmId: z.string(), residentId: z.string().nullable(), farmName: z.string().nullable(),
      at: z.number(), attemptInBaseKindPityCycle: z.number(), guaranteed: z.boolean(), pityScope: z.literal("base_kind") })),
  })),
});
const sourceSchema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
  glimmer: glimmerSchema,
  npc: z.looseObject({ window: windowSchema, recordingStartedAt: z.number().nullable(), farms: z.array(z.unknown()) }),
}) });
const qualificationSchema = z.strictObject({ ok: z.literal(true), data: z.strictObject({
  resident_id: z.string(), eligible: z.boolean(),
}) });

export type FarmMaterials = z.infer<typeof sourceSchema>["data"];
export interface FarmMaterialPort {
  read(issueDate: string): Promise<FarmMaterials>;
  eligible(residentId: string): Promise<boolean>;
}

export class FarmMaterialClient implements FarmMaterialPort {
  readonly #base: URL;
  readonly #fetch: typeof fetch;
  constructor(private readonly options: {apiBaseUrl:string;serviceToken:string;requestTimeoutMs:number;fetchImplementation?:typeof fetch}) {
    this.#base = new URL(options.apiBaseUrl);
    if (!this.#base.pathname.endsWith("/")) this.#base.pathname += "/";
    this.#fetch = options.fetchImplementation ?? fetch;
  }

  async #post(path: string, body: object): Promise<unknown> {
    const response = await this.#fetch(new URL(`internal/doorbell/lingye-daily/reporter-materials/${path}`, this.#base), {
      method: "POST", headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    if (!response.ok) throw new Error("farm_materials_unavailable");
    return response.json();
  }

  async read(issueDate: string): Promise<FarmMaterials> {
    return sourceSchema.parse(await this.#post("source", { issue_date: issueDate })).data;
  }

  async eligible(residentId: string): Promise<boolean> {
    const data = qualificationSchema.parse(await this.#post("qualification", { resident_id: residentId })).data;
    if (data.resident_id !== residentId) throw new Error("farm_materials_contract_error");
    return data.eligible;
  }
}

export function publicGlimmer(data: FarmMaterials["glimmer"]) {
  return { window: data.window, recordingStartedAt: data.recordingStartedAt,
    variants: data.variants.map((variant) => ({ variantName: variant.variantName, variantType: variant.variantType,
      feedingCount: variant.feedingCount, didNotFollowCount: variant.didNotFollowCount,
      dishes: variant.dishes.map(({ name, quantity }) => ({ name, quantity })),
      successes: variant.successes.map(({ farmName, at, attemptInBaseKindPityCycle, guaranteed, pityScope }) =>
        ({ farmName, at, attemptInBaseKindPityCycle, guaranteed, pityScope })),
    })) };
}
