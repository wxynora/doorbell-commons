export interface MerchantNightOffer {
  itemId: string;
  name: string;
  grantQuantity: number;
  currency: "gold" | "silver";
  unitPrice: number;
}

/** Facts supplied by the merchant authority, never by a buyer request. */
export interface MerchantNightEvent {
  eventId: string;
  hostFarmId: string;
  hostFarmName: string;
  startsAt: number;
  endsAt: number;
  discoveredAt: number | null;
  offers: MerchantNightOffer[];
}

export interface MerchantNightRecipient {
  residentId: string;
  farmId: string;
}

export interface MerchantNightWake {
  wakeId: string;
  residentId: string;
  phase: "arrival" | "discovery";
  text: string;
  createdAt: number;
  expiresAt: number;
}

export function isMerchantNight(timestamp: number): boolean {
  const hour = new Date(timestamp + 8 * 3_600_000).getUTCHours();
  return hour >= 1 && hour < 5;
}

export function renderMerchantNightBell(
  event: MerchantNightEvent,
  phase: MerchantNightWake["phase"],
): string {
  const leaves = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai",
  }).format(event.endsAt);
  const title = phase === "arrival"
    ? `神秘商人来到了你的农场「${event.hostFarmName}」，将在北京时间 ${leaves} 离开。`
    : `神秘商人已在「${event.hostFarmName}」被发现，将在北京时间 ${leaves} 离开。`;
  const shelf = event.offers.map(offer => {
    const call = JSON.stringify({ op: "farm.buy", args: {
      source: "mystery-merchant", items: [offer.itemId],
    } });
    return `${offer.name} ×${offer.grantQuantity}，${offer.unitPrice}${offer.currency === "gold" ? "金币" : "银币"}\n购买：doorbell(${call})`;
  }).join("\n\n");
  return `${title}\n\n本次货架：\n${shelf}\n\n${phase === "arrival" ? "打开" : "查看"}集市：\ndoorbell({"op":"farm.market","args":{}})`;
}

/** Produces deterministic wake identities; the durable outbox owns deduplication. */
export function merchantNightWakes(
  event: MerchantNightEvent,
  recipients: readonly MerchantNightRecipient[],
  now: number,
): MerchantNightWake[] {
  if (now < event.startsAt || now >= event.endsAt || !isMerchantNight(event.startsAt)) return [];
  const wakes: MerchantNightWake[] = [];
  for (const recipient of recipients) {
    const phase = recipient.farmId === event.hostFarmId ? "arrival" : "discovery";
    const createdAt = phase === "arrival" ? event.startsAt : event.discoveredAt;
    if (createdAt === null || createdAt > now || !isMerchantNight(createdAt)) continue;
    wakes.push({
      wakeId: `mystery-merchant:${JSON.stringify([event.eventId, phase, recipient.residentId])}`,
      residentId: recipient.residentId,
      phase,
      text: renderMerchantNightBell(event, phase),
      createdAt,
      expiresAt: event.endsAt,
    });
  }
  return wakes;
}
