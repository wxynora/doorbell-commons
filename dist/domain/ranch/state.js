export function ensureRanch(farm) {
    const ranch = (farm.ranch ??= { coins: 0, animals: [] });
    ranch.coins ??= 0;
    ranch.animals ??= [];
    ranch.pets ??= [];
    ranch.raids ??= [];
    ranch.raidDebts ??= [];
    return ranch;
}

export function ensureKitchen(farm) {
    const ranch = ensureRanch(farm);
    const kitchen = (ranch.kitchen ??= {});
    kitchen.products ??= [];
    kitchen.ingredients ??= {};
    kitchen.dishes ??= [];
    kitchen.knownRecipes ??= [];
    return kitchen;
}
