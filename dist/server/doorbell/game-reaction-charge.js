export function chargeGameReaction(backend, input) {
    if (!(typeof input === "object" && input !== null && !Array.isArray(input)) || Object.keys(input).length !== 6 ||
        ![input.event_id, input.room_id, input.resident_id, input.target_id].every(value => typeof value === "string" && value.length > 0) ||
        !["flower", "bomb"].includes(input.kind) || !["human", "agent"].includes(input.actor)) {
        throw Object.assign(new Error("Invalid game reaction"), { code: "GAME_REACTION_INVALID" });
    }
    const charge = backend?.trustedSystemCommands?.chargeToSystem;
    if (typeof charge !== "function") throw new Error("Economy unavailable");
    const result = charge({
        residentId: input.resident_id, currency: "gold", amount: 50, actor: input.actor,
        businessType: "game_reaction", businessRef: JSON.stringify([input.room_id, input.target_id, input.kind]),
        idempotencyKey: `game.reaction:${input.event_id}`,
    });
    return { ok: true, event_id: input.event_id, charged_gold: 50, balance: result.availableGold };
}
