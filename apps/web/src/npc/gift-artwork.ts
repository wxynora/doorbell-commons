import { getCookingIngredientAsset, getCookingRecipeAsset, type FarmAssetManifestEntry } from "../farm/farm-asset-manifest";
import type { NpcGiftImage } from "./scene";

function giftImage(asset: FarmAssetManifestEntry): NpcGiftImage {
  return { url: asset.url, atlasFrame: asset.atlasFrame };
}

/** The four confirmed NPC gifts reuse the same image and tile as the kitchen. */
export const npcGiftArtwork = {
  玉米: giftImage(getCookingIngredientAsset("corn")!),
  蜂蜜茶: giftImage(getCookingRecipeAsset("honey_tea")!),
  黄油曲奇: giftImage(getCookingRecipeAsset("butter_cookie")!),
  羊奶馒头: giftImage(getCookingRecipeAsset("goat_milk_bun")!),
};
