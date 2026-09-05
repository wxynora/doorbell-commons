import { animals, cooking, cookingIngredientById, cookingProductById, cookingRecipeById } from "../content.js";
import { createFarmWorldSqlitePersistence } from "../farm-world-sqlite-persistence.js";
import { COOKING_PRICE_VERSION } from "../domain/kitchen/pricing.js";
import { ensureKitchen } from "../domain/ranch/state.js";
import { resolveChefFarmForResident } from "../career/chef-farm-inventory-adapter.js";

/** Uses the existing world SQLite and kitchen format. Publication is returned,
 * never performed before the dialogue's outer durable transaction commits. */
export function createLingyeNpcGiftAdapter({ database, economyCommands, getFarmForResident } = {}) {
    if (!database || !economyCommands) throw new Error("lingye_npc_gift_adapter_required");
    const persistence = createFarmWorldSqlitePersistence(database);
    const resolveFarm = getFarmForResident ?? ((residentId) => resolveChefFarmForResident(database, residentId));
    return Object.freeze({
        prepareGift({ residentId, giftId, kind, itemId, quantity, createdAt }) {
            if (!database.isTransaction) throw new Error("lingye_npc_gift_transaction_required");
            if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("lingye_npc_gift_quantity_invalid");
            const farm = resolveFarm(residentId);
            const binding = database.prepare("SELECT binding_reference FROM residents WHERE resident_id = ?").get(residentId);
            if (!farm || farm.doorbellMcpMigration?.residentId !== residentId ||
                farm.doorbellMcpMigration?.migrationId !== binding?.binding_reference)
                throw new Error("lingye_npc_gift_resident_binding_invalid");
            const stored = database.prepare("SELECT farm_id FROM farm_states WHERE farm_id = ?").get(farm.id);
            if (!stored) throw new Error("lingye_npc_gift_farm_not_persisted");
            const working = structuredClone(farm);
            let name;
            let financialReceipt = null;
            if (kind === "gold") {
                name = "金币";
                const credited = economyCommands.creditFromSystem({
                    residentId, currency: "gold", amount: quantity,
                    businessType: "npc_gift", businessRef: giftId, idempotencyKey: giftId,
                });
                if (!credited?.financialReceipt) throw new Error("lingye_npc_gift_financial_receipt_missing");
                financialReceipt = credited.financialReceipt;
                working.coins = credited.availableGold;
                working.silver = credited.availableSilver;
                working.doorbellMcpMigration.balanceProjection = {
                    authority: "ledger", operationId: giftId,
                    gold: credited.availableGold, silver: credited.availableSilver,
                };
            }
            else if (kind === "ingredient") {
                const ingredient = cookingIngredientById.get(itemId);
                if (!ingredient) throw new Error("lingye_npc_gift_item_unavailable");
                name = ingredient.name;
                const kitchen = ensureKitchen(working);
                const current = kitchen.ingredients[itemId] ?? 0;
                if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + quantity))
                    throw new Error("lingye_npc_gift_inventory_invalid");
                kitchen.ingredients[itemId] = current + quantity;
            }
            else if (kind === "dish") {
                const recipe = cookingRecipeById.get(itemId);
                if (!recipe) throw new Error("lingye_npc_gift_item_unavailable");
                name = recipe.name;
                const baseValue = recipe.ingredients.reduce((sum, id) => {
                    const ingredient = cookingIngredientById.get(id);
                    if (ingredient) return sum + ingredient.price * cooking.ingredientRecycleValueMultiplier;
                    const product = cookingProductById.get(id);
                    const animal = animals.find((candidate) => candidate.produceId === id);
                    if (!product?.cookable || !animal || !Number.isSafeInteger(animal.producePrice))
                        throw new Error("lingye_npc_gift_item_unavailable");
                    // A gifted dish has standard catalog ingredients, not a
                    // player's quality/season/buff-enhanced production instance.
                    return sum + animal.producePrice;
                }, 0);
                const value = Math.round(baseValue * (1 + cooking.processingFeeRate) * cooking.recyclePremium[recipe.rarity]);
                const kitchen = ensureKitchen(working);
                for (let index = 0; index < quantity; index++) {
                    kitchen.dishes.push({
                        id: `${giftId}:${index}`, recipeId: recipe.id, name, rarity: recipe.rarity,
                        value, image: `${recipe.id}.webp`, createdAt, pricingVersion: COOKING_PRICE_VERSION,
                    });
                }
                // Receiving a meal does not discover its recipe or count as cooking.
            }
            else throw new Error("lingye_npc_gift_kind_invalid");
            persistence.commitMutation({
                farms: [{ id: farm.id, state: working }], components: [],
                // The caller owns the outer COMMIT and delays live publication.
                durableBoundary: true,
            });
            const receipt = {
                giftId, receiptId: financialReceipt?.receiptId ?? giftId,
                kind, ...(itemId ? { itemId } : {}), name, quantity, createdAt,
            };
            return {
                receipt,
                publish() {
                    if (database.isTransaction) throw new Error("lingye_npc_gift_publish_before_commit");
                    if (kind === "gold") {
                        farm.coins = working.coins;
                        farm.silver = working.silver;
                        farm.doorbellMcpMigration.balanceProjection = working.doorbellMcpMigration.balanceProjection;
                    }
                    else ensureKitchen(farm) && (farm.ranch.kitchen = working.ranch.kitchen);
                },
            };
        },
    });
}
