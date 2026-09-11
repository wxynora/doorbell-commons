import type { BellService } from "./bell-service.js";
import type { ActivityReminderProfileKey } from "./community-database.js";
import type { FarmHumanCatalogReader } from "./farm-catalog-client.js";
import { merchantNightWakes } from "./mystery-merchant-night-bell.js";
import type { MysteryMerchantNightStore } from "./mystery-merchant-night-store.js";

/** Uses the activity scheduler's existing cadence, independently of browser push. */
export class MysteryMerchantNightService {
  constructor(private readonly options: {
    reader: FarmHumanCatalogReader;
    store: Pick<MysteryMerchantNightStore, "enqueue">;
    bell: Pick<BellService, "notifyResident">;
    now?: () => number;
  }) {}

  needsReconcile(): boolean {
    const hour = new Date((this.options.now ?? Date.now)() + 8 * 3_600_000).getUTCHours();
    // A visit starting before 05:00 can still be open for its existing one-hour stay.
    return hour >= 1 && hour < 6;
  }

  async reconcile(profile: ActivityReminderProfileKey, farmHumanKey: string): Promise<void> {
    if (!this.needsReconcile()) return;
    const catalog = await this.options.reader.readCatalog({
      farmDoorplate: profile.farmDoorplate, farmHumanKey,
    });
    if (catalog.data.farm.farm_doorplate !== profile.farmDoorplate) return;
    const market = catalog.data.market;
    if (market.status !== "available" || market.mystery_merchant.status !== "present") return;
    const merchant = market.mystery_merchant;
    if (merchant.host_farm_name === null) return;
    const event = {
      eventId: JSON.stringify([merchant.host_farm_doorplate, merchant.starts_at]),
      hostFarmId: merchant.host_farm_doorplate,
      hostFarmName: merchant.host_farm_name,
      startsAt: Date.parse(merchant.starts_at),
      endsAt: Date.parse(merchant.ends_at),
      discoveredAt: merchant.discovered_at === null ? null : Date.parse(merchant.discovered_at),
      offers: merchant.offers.map(offer => ({
        itemId: offer.item_id, name: offer.name, grantQuantity: offer.grant_quantity,
        currency: offer.currency, unitPrice: offer.unit_price,
      })),
    };
    const wakes = merchantNightWakes(event, [{
      residentId: profile.residentId, farmId: profile.farmDoorplate,
    }], (this.options.now ?? Date.now)());
    for (const wake of wakes) {
      if (this.options.store.enqueue(wake)) this.options.bell.notifyResident(wake.residentId);
    }
  }
}
