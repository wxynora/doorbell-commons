import { qixiLantern2026PrivateData } from "../qixi-lantern-2026.js";

const EVENT_ID = "qixi-lantern-2026";
const DEFAULT_APPEARANCE = Object.freeze({
    shape: "square-palace",
    color: "moon-white",
    pattern: "none",
    ornament: "none",
    seal: "none",
});

function displayName(value, fallback) {
    const name = typeof value === "string" ? value.trim() : "";
    return name || fallback;
}

function projectSide(lamp) {
    const text = typeof lamp?.text === "string" ? lamp.text.trim() : "";
    const appearance = lamp?.appearance && typeof lamp.appearance === "object"
        ? lamp.appearance
        : DEFAULT_APPEARANCE;
    return {
        letter: text || "无",
        lantern: {
            shape: appearance.shape ?? DEFAULT_APPEARANCE.shape,
            color: appearance.color ?? DEFAULT_APPEARANCE.color,
            pattern: appearance.pattern ?? DEFAULT_APPEARANCE.pattern,
            ornament: appearance.ornament ?? DEFAULT_APPEARANCE.ornament,
            seal: appearance.seal ?? DEFAULT_APPEARANCE.seal,
        },
    };
}

export function projectQixiMemorial(farm, now = Date.now()) {
    const privateData = qixiLantern2026PrivateData(structuredClone(farm), now);
    return {
        subject: { farm_doorplate: String(farm.id) },
        data: {
            event_id: EVENT_ID,
            human_name: displayName(farm.humanName, "人类伴侣"),
            ai_name: displayName(farm.aiName, "小机"),
            human: projectSide(privateData?.lamps?.human),
            ai: projectSide(privateData?.lamps?.ai),
        },
        server_time: new Date(now).toISOString(),
    };
}
