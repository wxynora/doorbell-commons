const common = "snow_fort_participant";
const outcomes = ["snow_fort_winner", "snow_fort_loser"];

export function validTogetherTitles(input) {
  const decoration = input.decoration;
  const validDecoration = decoration === undefined || (
    input.titles?.[1] === "snow_fort_loser" && decoration && typeof decoration === "object" &&
    !Array.isArray(decoration) && Object.keys(decoration).sort().join(",") === "item_id,quantity" &&
    decoration.item_id === "farm_decor:small_snow_fort" && decoration.quantity === 1
  );
  return input.gold === 0 && input.silver === 0 && validDecoration &&
    Array.isArray(input.titles) && input.titles.length === 2 &&
    input.titles[0] === common && outcomes.includes(input.titles[1]);
}

export function titleRewardReference(input) {
  return JSON.stringify([input.grant_id, input.resident_id, input.gold, input.silver,
    input.titles ?? null, input.decoration ?? null]);
}

export function assertTogetherTitleReplay(farms, input) {
  for (const farm of farms) {
    const records = farm.togetherTitleRewards ?? {};
    if (Object.hasOwn(records, input.grant_id) && records[input.grant_id] !== titleRewardReference(input)) {
      const error = new Error("together_reward_conflict");
      error.code = "IDEMPOTENCY_CONFLICT";
      throw error;
    }
  }
}

export function stageTogetherTitles(farm, input) {
  if (!validTogetherTitles(input)) throw new Error("invalid_together_reward");
  assertTogetherTitleReplay([farm], input);
  if (Object.hasOwn(farm.togetherTitleRewards ?? {}, input.grant_id)) return null;
  const working = structuredClone(farm);
  working.titles = [...new Set([...(working.titles ?? []), ...input.titles])];
  working.togetherTitleRewards = {
    ...(working.togetherTitleRewards ?? {}),
    [input.grant_id]: titleRewardReference(input),
  };
  return working;
}
