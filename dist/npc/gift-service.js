import { cookingIngredientById, cookingRecipeById } from "../content.js";
import { LINGYE_NPC_GIFT_LINES } from "./dialogue-catalog.js";

const ingredient = (itemId, quantity) => ({ kind: "ingredient", itemId, quantity });
const dish = (itemId) => ({ kind: "dish", itemId, quantity: 1 });
export const LINGYE_NPC_GIFT_POOLS = Object.freeze({
    npc_atu: [ingredient("corn", 2)],
    npc_pupu: [dish("honey_tea")],
    npc_modian: [dish("butter_cookie")],
    npc_liyuan: [dish("butter_cookie")],
    npc_songmo: [dish("butter_cookie")],
    npc_beiheng: [dish("goat_milk_bun")],
});

export const npcBeijingDay = (now) => Math.floor((now + 8 * 3_600_000) / 86_400_000);

export function npcRandomFraction(random) {
    const result = random();
    if (!Number.isFinite(result) || result < 0 || result >= 1) throw new Error("lingye_npc_random_invalid");
    return result;
}

export function availableLingyeNpcGifts(npcId, affinityValue) {
    const line = LINGYE_NPC_GIFT_LINES[npcId];
    if (!line) return [];
    if (affinityValue < 60) return [];
    return (LINGYE_NPC_GIFT_POOLS[npcId] ?? []).flatMap((item) => {
        const content = item.kind === "ingredient" ? cookingIngredientById.get(item.itemId)
            : item.kind === "dish" ? cookingRecipeById.get(item.itemId) : { name: "金币" };
        if (!content || content.name !== line.itemName) return [];
        return [{ ...item, weight: 1, name: content.name, dialogueLine: line.line }];
    });
}

export function drawLingyeNpcGift(database, { residentId, npcId, sessionId, affinityValue, now, random, giftAdapter }) {
    if (!database.isTransaction) throw new Error("lingye_npc_gift_transaction_required");
    const day = npcBeijingDay(now);
    const prior = database.prepare(`SELECT * FROM lingye_npc_gift_draws
      WHERE resident_id = ? AND npc_id = ? AND beijing_day = ?`).get(residentId, npcId, day);
    if (prior) return { drawId: prior.draw_id, gift: null, publish: null };
    const drawId = `npc-gift:${residentId}:${npcId}:${day}`;
    const pool = availableLingyeNpcGifts(npcId, affinityValue);
    const lastGift = database.prepare(`SELECT beijing_day FROM lingye_npc_gift_draws
      WHERE resident_id = ? AND npc_id = ? AND status = 'gifted'
      ORDER BY beijing_day DESC LIMIT 1`).get(residentId, npcId);
    let status = "not_eligible";
    let gift = null;
    let publish = null;
    if (affinityValue >= 60 && pool.length > 0) {
        if (lastGift && day <= lastGift.beijing_day + 7) status = "cooldown";
        else if (npcRandomFraction(random) >= (affinityValue >= 80 ? 0.2 : 0.1)) status = "miss";
        else {
            if (!giftAdapter) throw new Error("lingye_npc_gift_adapter_required");
            let pick = npcRandomFraction(random) * pool.reduce((sum, item) => sum + item.weight, 0);
            const selected = pool.find((item) => (pick -= item.weight) < 0) ?? pool[pool.length - 1];
            const staged = giftAdapter.prepareGift({ residentId, giftId: drawId,
                kind: selected.kind, itemId: selected.itemId, quantity: selected.quantity, createdAt: now });
            gift = { ...staged.receipt, dialogueLine: selected.dialogueLine };
            publish = staged.publish;
            status = "gifted";
        }
    }
    database.prepare(`INSERT INTO lingye_npc_gift_draws
      (draw_id, resident_id, npc_id, beijing_day, session_id, status, gift_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(drawId, residentId, npcId, day, sessionId, status,
        gift ? JSON.stringify(gift) : null, now);
    return { drawId, gift, publish };
}
