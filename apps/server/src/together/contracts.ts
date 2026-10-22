import type { TogetherBoard } from "@doorbell/protocol";
import type { TogetherActivity } from "../together-activity.js";

export interface SnowConfiguration {
  activityId: string;
  opensAt: number;
  closesAt: number;
  matchStartsAt: [number, number, number];
  rewards: Record<"round" | "complete" | "champion", { gold: number; silver: number }>;
  copy: Record<"registration" | "team" | "captain" | "round" | "started" | "result", string>;
  chatEnabled: boolean;
}
export interface SnowIdentity {
  humanId: string;
  homeId: string;
  residentName: string;
  farmDoorplate: string;
}
export interface SnowNotice {
  id: string;
  residentId: string;
  kind: keyof SnowConfiguration["copy"] | "chat_turn" | "action_due" | "discussion_start";
  facts: Record<string, string>;
  createdAt: number;
  status: "pending" | "acked" | "blocked" | "cancelled";
  letterId: string | null;
  bellEligible?: boolean; // Absent on previously published notices; preserve their original delivery.
  endedAt?: number;
  blockReason?: string | null;
  errorCode?: string | null;
}
export interface SnowDecorationReward {
  itemId: "farm_decor:snow_fort";
  quantity: 1;
}
export interface SnowReward {
  grantId: string;
  residentId: string;
  gold: number;
  silver: number;
  status: "pending" | "paid";
  decoration?: SnowDecorationReward;
  titles?: string[];
}
export interface SnowRewardReceipt {
  grantId: string;
  residentId: string;
  gold: number;
  silver: number;
  journalIds: string[];
  decoration?: SnowDecorationReward;
  titles?: string[];
}
export interface SnowRegistrationPayment {
  paymentId: string;
  residentId: string;
  gold: number;
  status: "pending" | "paid" | "declined";
  option: string;
  attemptRevision: number;
  excludedFromSeries?: boolean;
  excludedAt?: number;
}
export interface SnowRegistrationReceipt {
  paymentId: string;
  residentId: string;
  gold: number;
  journalId: string;
}
export interface SnowControl {
  chatBoundaries: number[];
  waitBoundaries: number[];
  configuration: SnowConfiguration;
  retired: boolean;
  registrations: string[];
  registrationPayments: SnowRegistrationPayment[];
  series?: unknown;
  notices: SnowNotice[];
  rewards: SnowReward[];
  proposedTeams?: unknown;
}
export interface SnowActivity extends TogetherActivity {
  mailboxNotificationExclusions(residentId: string, deliveredMessageIds?: string[]): string[];
  prepareRegistration(
    input: Parameters<TogetherActivity["execute"]>[0],
  ): SnowRegistrationPayment | undefined;
  completeRegistration(
    payment: SnowRegistrationPayment,
    receipt: SnowRegistrationReceipt,
  ): { ok: boolean; data: Record<string, unknown> };
  failRegistration(
    payment: SnowRegistrationPayment,
    insufficient: boolean,
  ): { ok: boolean; data: Record<string, unknown> };
  configure(config: SnowConfiguration): void;
  setCaptains(captains: { A: string; B: string }): void;
  reconcile(): void;
  controlView(): SnowControl | undefined;
  chatNoticeMessages(id: string): Array<{ residentName: string; text: string }>;
  board(residentId: string): TogetherBoard | null;
  publishNotice(id: string, deliver: (notice: SnowNotice) => string): SnowNotice;
  finishNotice(
    id: string,
    status: "acked" | "blocked" | "cancelled",
    at: number,
    blockReason?: string | null,
    errorCode?: string | null,
  ): "changed" | "duplicate" | "conflict" | "missing";
  settleReward(id: string, receipt: SnowRewardReceipt): void;
  retire(): void;
  close(): void;
}
export interface SnowRewardPort {
  grant(reward: SnowReward): Promise<SnowRewardReceipt>;
  chargeRegistration?(payment: SnowRegistrationPayment): Promise<SnowRegistrationReceipt>;
}
