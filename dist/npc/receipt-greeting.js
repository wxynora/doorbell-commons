import { createHash } from "node:crypto";
import { isLingyeNpcChatAvailable } from "./shift-policy.js";

const GREETINGS = Object.freeze({
    npc_atu: "（阿土把滚到脚边的南瓜往筐里一推。）“这家伙今天溜出来三回了，比我还想下班。”",
    npc_pupu: "（蒲蒲慢慢挪开椅子上的病历夹。）“坐吧。椅子是给人坐的，不能老让单子占着。”",
    npc_modian: "（墨点举起沾着墨的翅尖，停在半空。）“差点又拿它挠头。上回洗了半天，水盆都像砚台。”",
    npc_liyuan: "（栗圆把一摞凭单在桌沿磕齐，又轻轻磕了一下。）“好了。这一下不算工作，算我自己舒坦。”",
    npc_songmo: "（松墨把滑下鼻梁的眼镜推回去。）“失物筐里又多了副眼镜。希望失主还看得见招领单。”",
    npc_beiheng: "（北衡把值班簿压在水杯下，活动了一下肩膀。）“巡街没磨破鞋，回来倒把凳子坐吱呀了。明天得找人修。”",
});

const LOCATIONS = Object.freeze({
    "go.bank.view": ["bank", "npc_liyuan"],
    "go.bank.choose": ["bank", "npc_liyuan"],
    "go.school.view": ["vocational-school", "npc_songmo"],
    "go.school.choose": ["vocational-school", "npc_songmo"],
    "go.hospital.commission": ["animal-hospital", "npc_pupu"],
    "go.newsroom.commission": ["lingye-daily", "npc_modian"],
    "go.security.commission": ["lingye-public-security-office", "npc_beiheng"],
});

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object")
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
}

/** Receipt-only text. No dialogue preparation, options, affinity or reward writes.
 * A repeated business fixes the draw and institution NPC, not their presence:
 * if that NPC has left, omit the greeting instead of substituting someone else.
 * Farm commissions are not a location visit and deliberately have no mapping. */
export function appendNpcReceiptGreeting({ residentId, op, args, result, npcs, roll = Math.random }) {
    if (!result.ok || result.data?.npc_dialogue || typeof result.text !== "string") return result;
    const location = LOCATIONS[op];
    if (!location) return result;
    const [locationId, npcId] = location;
    const npc = npcs.find((entry) => entry.npcId === npcId);
    if (!npc || npc.locationId !== locationId || !isLingyeNpcChatAvailable(npcId, npc.workStatus)) return result;
    const chance = !args.option ? roll()
        : createHash("sha256").update(JSON.stringify([residentId, op, canonical(args)]))
            .digest().readUInt32BE(0) / 0x1_0000_0000;
    if (chance >= 0.2) return result;
    return { ...result, text: `${result.text}\n${GREETINGS[npcId]}` };
}
