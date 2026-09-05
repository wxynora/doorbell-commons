import {
  lingyeNpcReadSuccessSchema, lingyeNpcInteractSuccessSchema,
  type LingyeNpcInteractRequest, type FarmHumanNpcReadSuccess, type FarmHumanNpcInteractSuccess,
} from "@doorbell/protocol";

export interface HumanNpcAuth {
  getCurrentFarmNpcs(token: string): Promise<FarmHumanNpcReadSuccess>;
  interactCurrentFarmNpc(token: string, input: LingyeNpcInteractRequest): Promise<FarmHumanNpcInteractSuccess>;
}

/** Human transport projection only. Farm owns sessions, choices, affinity and settlement. */
export class HumanNpcService {
  constructor(readonly auth: HumanNpcAuth) {}
  async read(token: string) {
    const result = await this.auth.getCurrentFarmNpcs(token);
    return lingyeNpcReadSuccessSchema.parse({ npcs: result.npcs });
  }
  async interact(token: string, input: LingyeNpcInteractRequest) {
    const result = await this.auth.interactCurrentFarmNpc(token, input);
    return lingyeNpcInteractSuccessSchema.parse({ npc: result.npc, dialogue: result.dialogue });
  }
}
