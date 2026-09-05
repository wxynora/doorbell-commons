import { KITCHEN_TOOL_ALIASES } from "./chef.js";

// Shared purchase IDs and prices for the Human and AI kitchen views.
export const PAID_KITCHEN_TOOLS = [
    { tool_id: "roast", name: "烤炉", price_silver: 800 },
    { tool_id: "steam", name: "蒸笼", price_silver: 1_200 },
    { tool_id: "deep-fry", name: "炸锅", price_silver: 1_600 },
];

export function kitchenToolOffer(toolId) {
    const canonicalId = KITCHEN_TOOL_ALIASES[toolId];
    return canonicalId
        ? PAID_KITCHEN_TOOLS.find((tool) => KITCHEN_TOOL_ALIASES[tool.tool_id] === canonicalId) ?? null
        : null;
}
