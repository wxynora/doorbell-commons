import type { MomentsStore } from "./store.js";
import type { FarmGiftPort, MomentActor } from "./types.js";

/** Main owns social intent/visibility; Farm owns and atomically moves the items. */
export class MomentsGiftService {
  constructor(private readonly store: MomentsStore, private readonly farm: FarmGiftPort, private readonly now=Date.now) {}
  inventory(actor: MomentActor) { return this.farm.inventory(this.store.giftInventoryIdentity(actor)); }
  async send(actor: MomentActor, momentId: string, input: unknown) {
    const intent=this.store.prepareGift(actor,momentId,input,this.now());
    if(intent.completed)return intent.completed;
    // If the response or Main acknowledgement is lost, the same durable intent
    // reuses the same Farm receipt. No background retry or pretend-success state.
    const receipt=await this.farm.transfer(intent.request);
    return this.store.completeGift(intent,receipt);
  }
}
