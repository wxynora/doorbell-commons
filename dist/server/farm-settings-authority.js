import { UGC_NAME_MAX } from "../config.js";
import { hasDamagedPublicName } from "../game.js";

const NICKNAME_FIELDS = new Map([
  ["ai_name", "aiName"],
  ["human_name", "humanName"],
]);

const SOCIAL_LABELS = {
  visit: "来访 / 访问",
  steal: "偷菜",
  water: "帮浇水",
  message: "留言",
};

export const DAMAGED_PUBLIC_NAME_TEXT = "名称看起来已经发生编码损坏（只剩问号或包含 �），请用 UTF-8 重新发送原名称。";

function normalizeName(value) {
  return String(value ?? "").trim();
}

function validateName(value) {
  const name = normalizeName(value);
  return hasDamagedPublicName(name)
    ? { ok: false, error: DAMAGED_PUBLIC_NAME_TEXT }
    : { ok: true, value: name.slice(0, UGC_NAME_MAX) || undefined };
}

/**
 * Validate the three names used by the old Human settings form without
 * changing the farm. The caller can rename the farm first, then apply the
 * already validated nicknames, preserving the legacy route's error ordering.
 */
export function validateHumanFarmNames({ farmName = "", aiName = "", humanName = "" } = {}) {
  const farm = validateName(farmName);
  if (!farm.ok) return farm;
  const ai = validateName(aiName);
  if (!ai.ok) return ai;
  const human = validateName(humanName);
  if (!human.ok) return human;
  return {
    ok: true,
    value: {
      farmName: normalizeName(farmName),
      aiName: ai.value,
      humanName: human.value,
    },
  };
}

/** Apply both nicknames as one validated settings change. */
export function applyHumanFarmNames(farm, { aiName = "", humanName = "" } = {}) {
  const ai = validateName(aiName);
  if (!ai.ok) return ai;
  const human = validateName(humanName);
  if (!human.ok) return human;
  farm.aiName = ai.value;
  farm.humanName = human.value;
  return { ok: true, aiName: ai.value, humanName: human.value };
}

/** Apply one structured nickname action using the same legacy normalization. */
export function applyHumanFarmNickname(farm, field, value) {
  const property = NICKNAME_FIELDS.get(field);
  if (!property || typeof value !== "string") {
    return { ok: false, error: "该昵称字段的值无效" };
  }
  const result = validateName(value);
  if (!result.ok) return result;
  farm[property] = result.value;
  return { ok: true, field, value: result.value };
}

/** Apply one structured social switch action. */
export function applyHumanFarmSocialSetting(farm, key, on) {
  if (!Object.hasOwn(SOCIAL_LABELS, key) || typeof on !== "boolean") {
    return { ok: false, error: "未知的开关。" };
  }
  farm.social ??= {};
  farm.social[key] = on;
  return { ok: true, key, on, label: SOCIAL_LABELS[key] };
}

export { SOCIAL_LABELS };
