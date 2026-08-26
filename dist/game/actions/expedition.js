import { expChoose, expExplore, expRetreat, expRoll, expView } from "../../expedition.js";

export function handleExpeditionAction(action, f, b, now) {
    switch (action) {
        case "explore":
        case "adventure": return expExplore(f, now, Number(b.charges) || 1);
        case "choose": return expChoose(f, String(b.option ?? b.key ?? b.id ?? ""), now);
        case "retreat": return expRetreat(f, now);
        case "roll": return expRoll(f, false, now); // AI 自掷（无同心+1）；伴侣摇骰走人类前端
        case "expedition":
        case "exp": return expView(f, now);
    }
}
