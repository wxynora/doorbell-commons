import { decorationState } from "./state.js";

function decorationReference(input) {
  return JSON.stringify([input.grant_id, input.resident_id, input.gold, input.silver,
    input.decoration?.item_id ?? null, input.decoration?.quantity ?? null]);
}

export function assertTogetherDecorationReplay(farms, input) {
  for (const farm of farms) {
    const records = farm.togetherDecorationRewards ?? {};
    if (Object.hasOwn(records, input.grant_id) && records[input.grant_id] !== decorationReference(input)) {
      const error = new Error("together_reward_conflict"); error.code = "IDEMPOTENCY_CONFLICT"; throw error;
    }
  }
}

// Pure staging: the caller publishes inventory and its immutable source receipt
// in one existing Farm world checkpoint. No coin writer or new wallet.
export function stageTogetherDecoration(farm, input) {
  if (!["farm_decor:snow_fort", "farm_decor:small_snow_fort"].includes(input.decoration?.item_id) || input.decoration.quantity !== 1)
    throw new Error("invalid_together_reward");
  const reference = decorationReference(input);
  const receipts = farm.togetherDecorationRewards ?? {};
  if (Object.hasOwn(receipts, input.grant_id)) {
    if (receipts[input.grant_id] !== reference) {
      const error = new Error("together_reward_conflict"); error.code = "IDEMPOTENCY_CONFLICT"; throw error;
    }
    return null;
  }
  const working = structuredClone(farm), state = decorationState(working);
  const count = (state.owned[input.decoration.item_id] ?? 0) + 1;
  if (!Number.isSafeInteger(count)) throw new Error("together_decoration_quantity_invalid");
  state.owned[input.decoration.item_id] = count;
  working.farmDecorations = state;
  working.togetherDecorationRewards = { ...receipts, [input.grant_id]: reference };
  return working;
}
