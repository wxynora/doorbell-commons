import { buildBorder } from "./borders.js";
import { buildPlant, buildPlanting } from "./plants.js";
import { buildFurniture } from "./furniture.js";
import { buildPath } from "./paths.js";

export const FARM_FURNITURE_IDS = new Set([
  "white_fence", "timber_fence", "stone_wall", "hedge", "ghost_fence",
  "lavender", "daisies", "ferns", "ornamental_grass", "black_roses", "red_roses",
  "log_steps", "moss_path", "checker_tiles", "pumpkin_path", "web_tiles",
  "garden_bench", "stone_fountain", "bird_bath", "flower_stand", "witch_cauldron",
  "cat_pumpkin", "ghost_lamp", "pumpkin_lamppost", "ghost_rocker", "bat_arch",
  "candy_cart", "haunted_lantern", "cherry_tree", "maple_tree", "ginkgo_tree",
  "birch_tree", "pine_tree", "osmanthus_tree",
]);

export const SEASONAL_FURNITURE_IDS = new Set([
  "lavender", "daisies", "ferns", "ornamental_grass", "black_roses", "red_roses", "flower_stand",
  "cherry_tree", "maple_tree", "ginkgo_tree", "birch_tree", "pine_tree", "osmanthus_tree",
]);

export function createFarmFurniture(id, season) {
  if (["white_fence", "timber_fence", "stone_wall", "hedge", "ghost_fence"].includes(id)) return buildBorder(id, .86);
  if (["cherry_tree", "maple_tree", "ginkgo_tree", "birch_tree", "pine_tree", "osmanthus_tree"].includes(id)) return buildPlant(id, season);
  if (["lavender", "daisies", "ferns", "ornamental_grass", "black_roses", "red_roses"].includes(id)) return buildPlanting(id, season);
  if (["log_steps", "moss_path", "checker_tiles", "pumpkin_path", "web_tiles"].includes(id)) return buildPath(id);
  if (["garden_bench", "stone_fountain", "bird_bath", "flower_stand", "witch_cauldron", "cat_pumpkin", "ghost_lamp", "pumpkin_lamppost", "ghost_rocker", "bat_arch", "candy_cart", "haunted_lantern"].includes(id)) return buildFurniture(id, season);
  throw new Error(`Unknown farm furniture model: ${id}`);
}
