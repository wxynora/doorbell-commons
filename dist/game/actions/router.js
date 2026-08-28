import { handleCommerceAction } from "./commerce.js";
import { handleExpeditionAction } from "./expedition.js";
import { handleFieldAction } from "./field.js";
import { handleKitchenAction } from "./kitchen.js";
import { handleProfileSocialAction } from "./profile-social.js";
import { handleRanchAction } from "./ranch.js";

export function dispatchImpl(f, b, now, options = {}) {
    const action = b.action;
    switch (action) {
        case "status":
            return handleFieldAction(action, f, b, now, options);
        case "shop":
        case "encyclopedia":
        case "bag":
            return handleCommerceAction(action, f, b, now);
        case "kitchen":
            return handleKitchenAction(action, f, b, now, options);
        case "wander":
        case "steal":
        case "visit":
        case "leaderboard":
        case "ranking":
            return handleProfileSocialAction(action, f, b, now);
        case "craft":
            return handleFieldAction(action, f, b, now, options);
        case "buy-recipe":
            return handleCommerceAction(action, f, b, now);
        case "design":
            return handleFieldAction(action, f, b, now, options);
        case "list":
        case "unlist":
        case "market":
        case "npc":
        case "buy":
        case "buy-seed":
        case "hot":
        case "report":
            return handleCommerceAction(action, f, b, now);
        case "set-welcome":
        case "rename":
        case "guestbook":
        case "block":
        case "unblock":
            return handleProfileSocialAction(action, f, b, now);
        case "explore":
        case "adventure":
        case "choose":
        case "retreat":
        case "roll":
        case "expedition":
        case "exp":
            return handleExpeditionAction(action, f, b, now);
        case "run":
        case "plant":
        case "water":
        case "harvest":
        case "ripen":
        case "use":
            return handleFieldAction(action, f, b, now, options);
        case "buy-item":
        case "buy-potion-set":
            return handleCommerceAction(action, f, b, now);
        case "buy-animal":
        case "buy-pet":
        case "buy-patrol-goose":
        case "send-ranch":
        case "ranch-feed":
        case "ledger":
            return handleRanchAction(action, f, b, now);
        case "upgrade-land":
        case "accept-task":
            return handleFieldAction(action, f, b, now);
        default:
            return { ok: false, text: `没有这个动作：${action ?? "(空)"}` };
    }
}
