// Only operations whose handlers mutate these farms are scoped. Shared story,
// ranch collection, theft and unlisted operations retain world diffing.
const OWN_FARM_ACTIONS = new Set([
    "bag", "buy-recipe", "list", "unlist", "buy-seed", "buy-item", "buy-potion-set",
    "set-welcome", "rename", "guestbook", "block", "unblock",
    "plant", "water", "harvest", "run", "ripen", "use", "craft", "design",
    "upgrade-land", "accept-task",
]);
export function ownFarmPersistenceScope(action, farmId) {
    if (!OWN_FARM_ACTIONS.has(action)) return null;
    return {farmIds: [farmId], componentKeys:
        action === "design" ? ["ugc"] :
        action === "harvest" || action === "run" ? ["nature"] : [], allowCrossDomain: false};
}
