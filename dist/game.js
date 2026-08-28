// 共享游戏核心：HTTP 服务和 CLI 适配器都调这里，保证同一套规则与存档结构。
import { dispatchImpl } from "./game/actions/router.js";
import { checkTitles } from "./titles.js";

export { HELP } from "./game/help.js";
export { genCode, hasDamagedPublicName, makeFarm } from "./game/factory.js";
export {
    farmView,
    potionTargetLine,
    randomTip,
} from "./game/presentation/farm.js";
export {
    ranchAgentSection,
    ranchShopSection,
    shopBrief,
    viewLedger,
    viewShop,
} from "./game/presentation/shop.js";
export {
    viewBag,
    viewEncyclopedia,
    viewKitchen,
} from "./game/presentation/catalog.js";
export {
    buyFromMarket,
    listForSale,
    refPrice,
    reportUgc,
    unlistItem,
    viewHot,
    viewMarket,
} from "./game/market.js";
export {
    buyNpcSeed,
    makeNpcFarm,
    tendNpc,
    viewNpc,
    visitView,
} from "./game/visit-npc.js";
export { advance } from "./engine.js";
export { statusFooter } from "./flavor.js";

/** 单农场动作分发（HTTP 与 CLI 共用）。多人动作(偷菜/串门)由各端各自处理。 */
export function dispatch(f, b, now, options = {}) {
    const result = dispatchImpl(f, b, now, options);
    checkTitles(f); // 每次本人动作后重新结算称号解锁（纯派生、幂等）
    return result;
}
//# sourceMappingURL=game.js.map
