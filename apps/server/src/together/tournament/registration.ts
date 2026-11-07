import { SNOW_TEAM_SIZE } from "./roster.js";

/** Registration accounting state. All mutations must be saved in the shared-store transaction. */
export interface TournamentPayment {
  paymentId: string; residentId: string;
  charge: "not_started" | "unknown" | "paid" | "failed";
  refund: "not_due" | "pending" | "refunded";
}
export interface RegistrationRound {
  id: string; teamId: string; members: string[]; confirmed: string[];
  status: "confirming" | "paying" | "registered" | "cancelled";
  payments: TournamentPayment[];
}

export function newRegistrationRound(id: string, teamId: string, members: string[]): RegistrationRound {
  if (!members.length || members.length>SNOW_TEAM_SIZE || new Set(members).size!==members.length) throw new Error("invalid_roster");
  return {id, teamId, members:[...members], confirmed:[], status:"confirming",
    payments:members.map((residentId, i) => ({paymentId:`${id}:${i}`,residentId,charge:"not_started",refund:"not_due"}))};
}

export function confirmRegistration(round: RegistrationRound, residentId: string, roster: string[]): void {
  if (round.status !== "confirming" || !round.members.includes(residentId) ||
      roster.length !== round.members.length || roster.some((id, i) => id !== round.members[i])) throw new Error("invalid_confirmation");
  if (!round.confirmed.includes(residentId)) round.confirmed.push(residentId);
  if (round.confirmed.length === round.members.length) round.status = "paying";
}

/** Call and persist before issuing a charge, then use the same paymentId to resolve uncertainty. */
export function beginCharge(round: RegistrationRound, residentId: string): TournamentPayment {
  const payment = round.payments.find(p => p.residentId === residentId);
  if (round.status !== "paying" || !payment || payment.charge !== "not_started") throw new Error("charge_not_available");
  payment.charge = "unknown";
  return payment;
}

export function cancelRegistration(round: RegistrationRound): void {
  if (round.status === "cancelled") return;
  round.status = "cancelled";
  round.confirmed = [];
  for (const payment of round.payments) if (payment.charge === "paid" && payment.refund === "not_due") payment.refund = "pending";
}

/** Only verified authoritative charge outcomes may be passed here; unknown is left untouched. */
export function resolveCharge(round: RegistrationRound, paymentId: string, outcome: "paid" | "failed"): void {
  const payment = round.payments.find(p => p.paymentId === paymentId);
  if (!payment) throw new Error("unknown_payment");
  if (payment.charge === outcome) return;
  if (payment.charge !== "unknown") throw new Error("conflicting_payment_result");
  payment.charge = outcome;
  if (outcome === "failed") cancelRegistration(round);
  else if (round.status === "cancelled") payment.refund = "pending";
  else if (round.payments.every(p => p.charge === "paid")) round.status = "registered";
}

/** Refund identifier is stable for a given original payment and never changes on retry. */
export function refundId(payment: TournamentPayment): string { return `${payment.paymentId}:refund`; }
export function resolveRefund(round: RegistrationRound, paymentId: string): void {
  const payment = round.payments.find(p => p.paymentId === paymentId);
  if (!payment || payment.charge !== "paid" || payment.refund === "not_due") throw new Error("refund_not_due");
  payment.refund = "refunded";
}
