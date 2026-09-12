import { z } from "zod";

export type LoungePet = "cat" | "dog";
export interface LoungePetRewardInput {
  residentId: string;
  farmDoorplate: string;
  farmHumanKey: string;
  requestId: string;
  pet: LoungePet;
}
const receiptSchema = z.strictObject({
  ok: z.literal(true), request_id: z.string(), resident_id: z.string(), farm_doorplate: z.string(),
  pet: z.enum(["cat", "dog"]), reward_day: z.iso.date(),
  rewarded_silver: z.union([z.literal(0), z.literal(5)]),
  rewards_remaining: z.number().int().min(0).max(2), silver_balance: z.number().int().nonnegative(),
});
export type LoungePetReceipt = z.infer<typeof receiptSchema>;
export interface LoungePetRewards { interact(input: LoungePetRewardInput): Promise<LoungePetReceipt> }

export class LoungePetClient implements LoungePetRewards {
  constructor(private readonly options: {
    apiBaseUrl: string; serviceToken: string; requestTimeoutMs: number; fetch?: typeof fetch;
  }) {}
  async interact(input: LoungePetRewardInput): Promise<LoungePetReceipt> {
    const response = await (this.options.fetch ?? fetch)(new URL("/internal/doorbell/lounge-pet", this.options.apiBaseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.serviceToken}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      body: JSON.stringify({
        farm_human_key: input.farmHumanKey, expected_farm_doorplate: input.farmDoorplate,
        resident_id: input.residentId, request_id: input.requestId, pet: input.pet,
      }),
    });
    if (!response.ok) throw new Error("Lounge pet reward unavailable");
    const receipt = receiptSchema.parse(await response.json());
    if (receipt.request_id !== input.requestId || receipt.resident_id !== input.residentId
        || receipt.farm_doorplate !== input.farmDoorplate || receipt.pet !== input.pet)
      throw new Error("Lounge pet receipt identity mismatch");
    return receipt;
  }
}
