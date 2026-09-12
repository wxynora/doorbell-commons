import { randomBytes, randomUUID } from "node:crypto";
import type { CommunityDatabase } from "../community-database.js";
import { LoungeAreaUnavailableError, LoungeNoSeatAvailableError, type LoungeService } from "../lounge-service.js";
import type { LoungePet, LoungePetRewards } from "./client.js";

export class LoungePetToolError extends Error {}
interface PetOption {
  code: string;
  pet: LoungePet;
  requestId: string;
  interacted: boolean;
  completed: boolean;
  result?: Promise<string>;
}

export class LoungePetService {
  private readonly options = new Map<string, PetOption[]>();
  constructor(
    private readonly database: Pick<CommunityDatabase, "findActiveHumanCommunityByResidentId">,
    private readonly lounge: Pick<LoungeService, "pet">,
    private readonly rewards: LoungePetRewards,
    private readonly now: () => number = Date.now,
  ) {}

  list(residentId: string): string[] {
    const community = this.database.findActiveHumanCommunityByResidentId(residentId);
    if (!community?.farmBinding.farmHumanKey) return [];
    let group = this.options.get(residentId);
    // Preserve an unresolved interaction so a lost reward response can use the same request id.
    if (!group || (group.some(option => option.completed) && !group.some(option => option.interacted && !option.completed))) {
      group = (["cat", "dog"] as const).map(pet => ({
        code: randomBytes(6).toString("base64url"), pet, requestId: randomUUID(), interacted: false, completed: false,
      }));
      this.options.set(residentId, group);
    }
    return ["猫狗合计每天前3次互动各奖励5银币，之后仍可互动。", ...group.map(option =>
      `${option.code}：摸摸${option.pet === "cat" ? "猫" : "狗"}`)];
  }

  async execute(residentId: string, code: string): Promise<string> {
    const community = this.database.findActiveHumanCommunityByResidentId(residentId);
    if (!community?.farmBinding.farmHumanKey) throw new LoungePetToolError("当前居民没有可用的农场绑定。");
    const option = this.options.get(residentId)?.find(entry => entry.code === code);
    if (!option) throw new LoungePetToolError("这个 view option 已失效或不属于当前身份，请重新查看休息室。");
    if (option.result) return option.result;
    option.result = this.interact(residentId, community.farmBinding as { farmDoorplate: string; farmHumanKey: string }, option)
      .catch(error => { delete option.result; throw error; });
    return option.result;
  }

  private async interact(residentId: string, binding: { farmDoorplate: string; farmHumanKey: string }, option: PetOption): Promise<string> {
    if (!option.interacted) {
      try {
        this.lounge.pet({ residentId, activityId: option.requestId, createdAt: this.now(), data: { pet: option.pet } });
      } catch (error) {
        if (error instanceof LoungeAreaUnavailableError || error instanceof LoungeNoSeatAvailableError) throw new LoungePetToolError("现在无法前往猫狗互动区，请先离开游戏桌或等座位空出。");
        throw error;
      }
      option.interacted = true;
    }
    let receipt;
    try {
      receipt = await this.rewards.interact({ residentId, ...binding, requestId: option.requestId, pet: option.pet });
    } catch {
      throw new LoungePetToolError(`已和${option.pet === "cat" ? "猫" : "狗"}互动，奖励结果暂未确认。可用同一个 option ${option.code} 查询本次结果，不会重复发奖。`);
    }
    option.completed = true;
    return [
      `已摸摸${option.pet === "cat" ? "猫" : "狗"}。`,
      receipt.rewarded_silver ? `获得5银币，${receipt.reward_day}还可领取${receipt.rewards_remaining}次。` : `${receipt.reward_day}的3次互动奖励已领完，仍可继续互动。`,
      `结算后银币：${receipt.silver_balance}。`,
      '继续互动请查看：{"op":"go.lounge.view","args":{}}',
    ].join("\n");
  }
}
