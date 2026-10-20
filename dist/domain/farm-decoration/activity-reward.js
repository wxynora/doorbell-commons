import { decorationState } from "./state.js";

// Pure staging: the caller publishes inventory and its immutable source receipt
// in one existing Farm world checkpoint. No coin writer or new wallet.
export function stageTogetherDecoration(farm, input) {
  if (input.decoration?.item_id !== "farm_decor:snow_fort" || input.decoration.quantity !== 1)
    throw new Error("invalid_together_reward");
  const reference = JSON.stringify([input.grant_id, input.resident_id, input.gold, input.silver,
    input.decoration.item_id, input.decoration.quantity]);
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
