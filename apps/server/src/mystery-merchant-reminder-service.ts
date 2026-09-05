import type { BrowserPushService } from "./browser-push-service.js";
import type { ActivityReminderProfileKey } from "./community-database.js";
import type { FarmHumanCatalogReader } from "./farm-catalog-client.js";
import type { MysteryMerchantReminderStore } from "./mystery-merchant-reminder-store.js";

/** Called only for eligible profiles by the existing activity reminder reconciliation. */
export class MysteryMerchantReminderService {
  constructor(private readonly options: {
    reader: FarmHumanCatalogReader;
    store: MysteryMerchantReminderStore;
    push: Pick<BrowserPushService, "sendActivityReminder">;
    now?: () => number;
  }) {}

  async reconcile(profile: ActivityReminderProfileKey, farmHumanKey: string): Promise<void> {
    const catalog = await this.options.reader.readCatalog({
      farmDoorplate: profile.farmDoorplate,
      farmHumanKey,
    });
    const market = catalog.data.market;
    if (catalog.data.farm.farm_doorplate !== profile.farmDoorplate || market.status !== "available") return;
    const merchant = market.mystery_merchant;
    if (merchant.status !== "present" || merchant.host_farm_doorplate !== profile.farmDoorplate) return;
    const now = (this.options.now ?? Date.now)();
    const endsAt = Date.parse(merchant.ends_at);
    if (!Number.isFinite(endsAt) || endsAt <= now || this.options.store.wasDelivered(profile, merchant.ends_at)) return;
    const leaves = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai",
    }).format(endsAt);
    const delivered = await this.options.push.sendActivityReminder({
      residentId: profile.residentId,
      homeId: profile.homeId,
      title: "神秘商人来到了你的农场",
      body: `快去集市看看吧，他将在 ${leaves} 离开。`,
      url: "/lingye/farm",
      tag: `mystery-merchant:${profile.farmDoorplate}:${endsAt}`,
      createdAt: now,
    });
    if (delivered) this.options.store.markDelivered(profile, merchant.ends_at, now);
  }
}
