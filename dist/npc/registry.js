export const LINGYE_NPC_REGISTRY_VERSION = 1;

export const LINGYE_NPCS = Object.freeze([
    Object.freeze({
        npcId: "npc_atu",
        name: "阿土",
        species: "土拨鼠",
        role: "杂货郎和常驻邻居",
        institutionId: "farm",
        homeLocationId: "farm-ranch",
        initialWorkStatus: "on_duty",
    }),
    Object.freeze({
        npcId: "npc_pupu",
        name: "蒲蒲",
        species: "水豚",
        role: "值班分诊员和病例管理员",
        institutionId: "animal_hospital",
        homeLocationId: "animal-hospital",
        initialWorkStatus: "on_duty",
    }),
    Object.freeze({
        npcId: "npc_modian",
        name: "墨点",
        species: "乌鸦",
        role: "值班编辑",
        institutionId: "lingye_daily",
        homeLocationId: "lingye-daily",
        initialWorkStatus: "on_duty",
    }),
    Object.freeze({
        npcId: "npc_liyuan",
        name: "栗圆",
        species: "金丝熊",
        role: "柜员与合同管理员",
        institutionId: "bank",
        homeLocationId: "bank",
        initialWorkStatus: "on_duty",
    }),
    Object.freeze({
        npcId: "npc_songmo",
        name: "松墨",
        species: "雪鸮",
        role: "教务员",
        institutionId: "vocational_school",
        homeLocationId: "vocational-school",
        initialWorkStatus: "on_duty",
    }),
    Object.freeze({
        npcId: "npc_beiheng",
        name: "北衡",
        species: "黑背犬",
        role: "值班接案员和程序管理员",
        institutionId: "public_security",
        homeLocationId: "lingye-public-security-office",
        initialWorkStatus: "on_duty",
    }),
]);

export const LINGYE_NPC_BY_ID = new Map(LINGYE_NPCS.map((npc) => [npc.npcId, npc]));

export const LINGYE_NPC_PUBLIC_LOCATION_IDS = Object.freeze([
    "farm-ranch", "animal-hospital", "lingye-daily", "bank", "vocational-school",
    "lingye-public-security-office", "doorbell-community", "commercial-street",
    "moonlight-pond", "floating-lake", "mangrove-shoal",
]);

const NPC_PUBLIC_LOCATIONS = new Set(LINGYE_NPC_PUBLIC_LOCATION_IDS);

export function isLingyeNpcLocation(locationId) {
    return NPC_PUBLIC_LOCATIONS.has(locationId);
}

if (LINGYE_NPC_BY_ID.size !== LINGYE_NPCS.length)
    throw new Error("Lingye NPC ids must be unique");

export function requireLingyeNpc(npcId) {
    const npc = LINGYE_NPC_BY_ID.get(String(npcId ?? ""));
    if (!npc)
        throw new Error("lingye_npc_not_active");
    return npc;
}
