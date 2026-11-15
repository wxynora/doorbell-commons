import { ITEMS } from "../../config.js";

// The item count includes the currently used shovel. A missing remainder means
// the next owned shovel has not been used yet; buying never resets this field.
export function hasSnowShovel(farm) {
    const maximum = ITEMS.snow_shovel?.durability;
    const count = farm?.items?.snow_shovel;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(count) || count < 1) return false;
    const remaining = farm.snowShovelRemaining ?? maximum;
    return Number.isSafeInteger(remaining) && remaining >= 1 && remaining <= maximum;
}

export function consumeSnowShovel(farm) {
    if (!hasSnowShovel(farm)) return { ok: false, reason: "snow_shovel_unavailable" };
    const maximum = ITEMS.snow_shovel.durability;
    const remaining = (farm.snowShovelRemaining ?? maximum) - 1;
    const broken = remaining === 0;
    if (broken) {
        farm.items.snow_shovel -= 1;
        delete farm.snowShovelRemaining;
    } else farm.snowShovelRemaining = remaining;
    return { ok: true, remaining, maximum, broken };
}
