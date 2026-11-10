import { z } from "zod";
import { MomentsPromotionError, type MomentsPromotionFarm, type PromotionCharge, type PromotionReceipt } from "./promotion.js";

const rejection = z.object({ error: z.object({
  code: z.enum(["price_changed", "farm_binding_mismatch", "insufficient_coins", "spend_limit"]),
}) });

export class MomentsPromotionClient implements MomentsPromotionFarm {
  private readonly url: URL;
  constructor(private readonly options: {
    apiBaseUrl: string; serviceToken: string; requestTimeoutMs: number; fetchImplementation?: typeof fetch;
  }) {
    const base = new URL(options.apiBaseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    this.url = new URL("internal/doorbell/moments/promotion", base);
  }

  async charge(input: PromotionCharge): Promise<PromotionReceipt> {
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(this.url, {
        method: "POST", headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
      const value: unknown = await response.json();
      if (response.status === 409) {
        const parsed = rejection.safeParse(value);
        if (parsed.success) throw new MomentsPromotionError(parsed.data.error.code);
      }
      const receipt = z.object({ ok: z.literal(true), postId: z.literal(input.postId),
        residentId: z.literal(input.residentId), farmDoorplate: z.literal(input.farmDoorplate),
        gold: z.literal(input.gold), receiptId: z.string().min(1), payerResidentId: z.string().min(1) }).strict();
      const parsed = receipt.safeParse(value);
      if (!response.ok || !parsed.success) throw new MomentsPromotionError("promotion_unavailable");
      return { receiptId: parsed.data.receiptId, payerResidentId: parsed.data.payerResidentId };
    } catch (error) {
      if (error instanceof MomentsPromotionError) throw error;
      throw new MomentsPromotionError("promotion_unavailable");
    }
  }
}
