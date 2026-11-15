import type { LingyeActionResult } from "@doorbell/protocol";
import type { CommunityDatabase } from "./community-database.js";
import type { MailboxService, LingyeNotificationBellNotifier } from "./mailbox-service.js";

type Notification = NonNullable<Extract<LingyeActionResult, { ok: true }>["notifications"]>[number];
type Offer = Extract<Notification, { kind: "service_proposal_offer" }>;

function residentName(database: CommunityDatabase, id: string): string {
  const name = database.serviceProposalStore.residentName(id);
  if (!name) throw new Error("The service proposal resident is unavailable");
  return name;
}

export function renderServiceProposalReceipt(database: CommunityDatabase, result: LingyeActionResult): LingyeActionResult {
  if (!result.ok || !Object.hasOwn(result.data, "service_proposal")) return result;
  const { service_proposal: raw, ...data } = result.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid service proposal receipt");
  const fact = raw as Record<string, unknown>;
  let text: string;
  if (fact.kind === "offered" && typeof fact.owner_resident_id === "string" &&
      (fact.career === "agronomist" || fact.career === "veterinarian")) {
    const name = residentName(database, fact.owner_resident_id);
    text = `已向${name}提出${fact.career === "agronomist" ? "处理" : "接诊"}建议，等待对方决定；目前没有扣款，也没有成立委托。`;
  } else if (fact.kind === "rejected" && typeof fact.actor_resident_id === "string") {
    text = `已拒绝${residentName(database, fact.actor_resident_id)}的处理提议，没有扣款。`;
  } else throw new Error("Invalid service proposal receipt");
  return { ...result, text, data };
}

export function deliverServiceProposalOffer(
  database: CommunityDatabase, mailbox: MailboxService, bell: LingyeNotificationBellNotifier,
  notification: Offer, sourceResidentId: string,
): void {
  const homeId = database.findHomeIdByResidentId(notification.recipient_resident_id);
  if (!homeId) throw new Error("The service proposal recipient has no community home");
  const idempotencyKey = `lingye-notification:${notification.notification_id}`;
  let letter = database.serviceProposalStore.existingLetter(homeId, idempotencyKey);
  if (!letter) {
    const name = residentName(database, sourceResidentId);
    const price = `${notification.amount}${notification.currency === "silver" ? "银币" : "金币"}`;
    const agronomy = notification.career === "agronomist";
    const description = agronomy
      ? `${name}在你家第${notification.subject_text}块地看到${notification.observation_text}，愿意帮忙处理。按现行规则，委托费为${price}。是否同意委托？`
      : `${name}看到你家${notification.subject_text}出现${notification.observation_text}，愿意接诊。基础诊金为${price}，检查后的治疗材料另计。是否同意委托？`;
    const op = agronomy ? "go.farm.commission" : "go.hospital.commission";
    const call = (option: string) => `doorbell(${JSON.stringify({ op, args: { option } })})`;
    const body = `${description}\n\n同意委托：${call(notification.decision_options.accept)}\n拒绝委托：${call(notification.decision_options.reject)}`;
    const delivered = mailbox.deliver({ homeId, idempotencyKey, category: "system",
      title: agronomy ? "提出处理" : "提出接诊", body, sensitiveValues: [] });
    letter = { letterId: delivered.letterId, body, createdAt: delivered.createdAt };
  }
  if (notification.recipient_resident_id === sourceResidentId) return;
  database.createCareerJobWake({ wakeId: `career-job:${letter.letterId}`,
    residentId: notification.recipient_resident_id, letterId: letter.letterId,
    message: letter.body, createdAt: letter.createdAt });
  bell.notifyResident(notification.recipient_resident_id);
}
