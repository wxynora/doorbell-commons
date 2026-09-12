import { randomBytes, randomUUID } from "node:crypto";
import type { CommunityDatabase } from "../community-database.js";
import {
  LoungeGachaCredentialInvalidError, LoungeGachaNotFoundError,
  LoungeGachaInsufficientGoldError, LoungeGachaQuotaExceededError,
  LoungeGachaPrizePoolEmptyError,
  type LoungeGachaReader, type LoungeGachaStatus, type LoungeGachaRewardCategory,
} from "./gacha-client.js";

export class LoungeGachaViewError extends Error {}

interface DrawOption {
  code: string;
  requestId: string;
  farmDoorplate: string;
  completed: boolean;
  result?: Promise<string>;
}
interface ViewOptions { code: string; draw?: DrawOption }
const categoryNames: Record<LoungeGachaRewardCategory, string> = {
  gold: "金币", silver: "银币", ingredient: "食材", dish: "料理", material: "材料",
  sr_seed: "SR种子", decor: "装饰", sp_material: "SP材料", sp_seed: "SP种子", ssr_seed: "SSR种子",
};
const optionCode = () => randomBytes(6).toString("base64url");

/** Internal options for go.lounge.view; this does not register another tool. */
export class LoungeGachaViewOptions {
  private readonly options = new Map<string, ViewOptions>();
  constructor(
    private readonly database: Pick<CommunityDatabase, "findActiveHumanCommunityByResidentId">,
    private readonly gacha: LoungeGachaReader,
  ) {}

  list(residentId: string): string[] {
    if (!this.database.findActiveHumanCommunityByResidentId(residentId)?.farmBinding.farmHumanKey) return [];
    let options = this.options.get(residentId);
    if (!options) {
      options = { code: optionCode() };
      this.options.set(residentId, options);
    }
    return [`${options.code}：查看扭蛋机`];
  }

  owns(residentId: string, option: string): boolean {
    const options = this.options.get(residentId);
    return !!options && (options.code === option || options.draw?.code === option);
  }

  async execute(residentId: string, code: string): Promise<string> {
    const community = this.database.findActiveHumanCommunityByResidentId(residentId);
    if (!community?.farmBinding.farmHumanKey) throw new LoungeGachaViewError("当前居民没有可用的农场绑定。");
    const binding = {
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey: community.farmBinding.farmHumanKey,
    };
    const options = this.options.get(residentId);
    if (!options || !this.owns(residentId, code)) throw new LoungeGachaViewError("这个 view option 已失效或不属于当前身份，请重新查看休息室。");
    if (code === options.code) {
      let status;
      try { status = await this.gacha.read(binding); }
      catch (error) { throw this.failure(error, "扭蛋机暂时无法查看，请稍后使用同一个 option 再查。"); }
      // An unresolved draw keeps its request id, including after a lost response.
      if (!options.draw || options.draw.completed || options.draw.farmDoorplate !== binding.farmDoorplate) {
        options.draw = { code: optionCode(), requestId: randomUUID(), farmDoorplate: binding.farmDoorplate, completed: false };
      }
      return [
        "休息室扭蛋机", ...this.statusLines(status),
        `概率：${Object.entries(status.probabilities).map(([key, value]) => `${categoryNames[key as LoungeGachaRewardCategory]} ${value}%`).join("、")}`,
        `${options.draw.code}：扭一次（500金币）`,
      ].join("\n");
    }
    const draw = options.draw!;
    if (draw.farmDoorplate !== binding.farmDoorplate) throw new LoungeGachaViewError("农场绑定已变化，请重新查看扭蛋机。");
    if (draw.result) return draw.result;
    draw.result = (async () => {
      try {
        const receipt = await this.gacha.draw({ ...binding, requestId: draw.requestId });
        draw.completed = true;
        const reward = receipt.reward;
        const name = reward.name ?? categoryNames[reward.category];
        return [
          `已扭蛋，花费500金币，获得${name} × ${reward.quantity ?? reward.amount ?? 1}。`,
          ...this.statusLines(receipt, true),
          `${options.code}：查看扭蛋机（继续抽取）`,
        ].join("\n");
      } catch (error) {
        throw this.failure(error, `本次扭蛋结果暂未确认。请使用同一个 option ${draw.code} 查询本次结果，不会重复扣费。`);
      }
    })().catch(error => { delete draw.result; throw error; });
    return draw.result;
  }

  private statusLines(status: LoungeGachaStatus, settled = false): string[] {
    return [
      `每次${status.price_gold}金币；${settled ? "结算后" : ""}余额：${status.gold}金币、${status.silver}银币。`,
      `${status.day}已抽${status.count}/${status.limit}次，还可抽${status.remaining_today}次。`,
      `稀有保底：最多还需${status.pity.remaining}次。`,
    ];
  }

  private failure(error: unknown, fallback: string): LoungeGachaViewError {
    if (error instanceof LoungeGachaInsufficientGoldError) return new LoungeGachaViewError("金币不足，扭一次需要500金币。");
    if (error instanceof LoungeGachaQuotaExceededError) return new LoungeGachaViewError("今天的100次扭蛋次数已用完。");
    if (error instanceof LoungeGachaPrizePoolEmptyError) return new LoungeGachaViewError("稀有奖品暂不可用，保底进度已保留。");
    if (error instanceof LoungeGachaCredentialInvalidError || error instanceof LoungeGachaNotFoundError) return new LoungeGachaViewError("当前农场绑定不可用，请先检查绑定。");
    return new LoungeGachaViewError(fallback);
  }
}
