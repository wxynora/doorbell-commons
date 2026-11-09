import { materialById, cropById } from "../../content.js";
import { Rng } from "../../rng.js";
import { onTaskEvent } from "../../tasks.js";
import { recordQixi2026Progress } from "../../qixi-2026.js";
import { recordMidAutumnSeedProgress } from "../../mid-autumn-seeds.js";
import { pushLog } from "../shared/notifications.js";
import { prepareSmeltingDraw } from "./smelting-rules.js";

export function craftBatch(farm, materialIds, quantity, now) {
  const needed = new Map();
  for (const id of materialIds) needed.set(id, (needed.get(id) ?? 0) + 1);
  for (const [id, perRound] of needed) {
    if (!materialById.has(id) || quantity > Math.floor((farm.materials[id] ?? 0) / perRound))
      return { ok: false, error: `素材不足：${materialById.get(id)?.name ?? id}` };
  }
  const draw = prepareSmeltingDraw(farm, materialIds);
  const rng = new Rng(farm.rngState);
  const results = [];
  const produced = new Map();
  // Only random draws repeat: no craft(), inventory mutation or task settlement here.
  for (let round = 0; round < quantity; round++) {
    const result = draw(rng);
    const crop = cropById.get(result.cropId);
    results.push({ ...result, cropName: crop.name, rarity: crop.rarity });
    produced.set(crop.id, (produced.get(crop.id) ?? 0) + 1);
  }
  for (const [id, perRound] of needed) {
    farm.materials[id] -= perRound * quantity;
    if (farm.materials[id] === 0) delete farm.materials[id];
  }
  for (const [id, count] of produced) farm.seeds[id] = (farm.seeds[id] ?? 0) + count;
  farm.rngState = rng.state;
  farm.crafted = (farm.crafted ?? 0) + quantity;
  onTaskEvent(farm, "craft", now, {}, quantity);
  const qixi = recordQixi2026Progress(farm, "craft", quantity, now);
  const midAutumnSeed = recordMidAutumnSeedProgress(farm, "craft", quantity, now);
  pushLog(farm, `熔炼出限定种子：${[...produced].map(([id, count]) => `${cropById.get(id).name}${count > 1 ? ` ×${count}` : ""}`).join("、")}${results.every(result => result.byRecipe) ? "（配方）" : ""}`);
  return { ok: true, results, qixi, midAutumnSeed };
}
