/** tryPlace uses the scene's existing terrain, house and collision checks. */
export function planSharedLayout(source, data, tryPlace, makeId = () => crypto.randomUUID()) {
  const skipped = [];
  const skip = (name, reason) => {
    const row = skipped.find(item => item.name === name && item.reason === reason);
    if (row) row.quantity++;
    else skipped.push({ name, quantity: 1, reason });
  };
  const layout = { roof: source.roof, canopy: source.canopy, stall: { ...data.layout.stall }, decorations: [] };
  if (layout.canopy === "floral" && (!data.house?.canopy_unlocked || data.house.level < 2)) {
    layout.canopy = "plain";
    skip("花植雨棚", "missing");
  }
  if (tryPlace("stall", source.stall)) layout.stall = { ...source.stall };
  else skip("集市摊位（保留原位置）", "conflict");
  const placed = new Map();
  for (const item of source.decorations) {
    const def = data.catalog.find(entry => entry.item_id === item.item_id);
    const own = data.inventory.find(entry => entry.item_id === item.item_id);
    const count = placed.get(item.item_id) ?? 0;
    if (!def || def.layer === "house" || !own || (def.purchase_mode === "unlock" ? !own.unlocked : count >= own.owned_quantity)) {
      skip(def?.name ?? "未收录的装饰", "missing");
      continue;
    }
    if (!tryPlace(item.item_id, item)) { skip(def.name, "conflict"); continue; }
    placed.set(item.item_id, count + 1);
    layout.decorations.push({ item_id: item.item_id, instance_id: makeId(), x: item.x, z: item.z, rotation: item.rotation });
  }
  return { layout, skipped };
}
