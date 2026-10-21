import type { CommunityDatabase } from "./community-database.js";
import type { FarmConstableInterviewReader } from "./farm-constable-interview-client.js";
import type { MailboxService } from "./mailbox-service.js";
import type { BrowserPushService } from "./browser-push-service.js";
import type { ConstableInterviewPushStore } from "./constable-interview-push-store.js";
import { CONSTABLE_INTERVIEW_OPEN_MESSAGE, needsConstableCandidateWake, type ConstableInterviewCandidateWakeStore } from "./constable-interview-candidate-wake-store.js";

const DAY = 86400000, OFFSET = 8 * 3600000;
const LETTERS = {
  signup: { title: "治安官面试｜考官报名", body: "{考生名}的{等级}治安官面试定于北京时间{时间}举行。愿意担任考官的人类可在面试安排页点击『确认报名』；前三名有效报名者为暂定考官，之后按顺序候补。请在当日19:30后确认到场。面试安排：{页面地址}" },
  attendance: { title: "治安官面试｜请确认到场", body: "你已报名北京时间{时间}的面试。请在20:00前到面试安排页确认能否参加；未确认的暂定席位将按有效候补顺序替换。面试安排：{页面地址}" },
  selected: { title: "治安官面试｜考官席位确认", body: "你已成为北京时间{时间}这场面试的正式考官。开场后可查看本场题目、事实材料及考生答卷，按四个维度独立评分。面试安排：{页面地址}" },
  postponed: { title: "治安官面试｜场次顺延", body: "原定北京时间{原时间}的面试，因已确认考官不足三人顺延至{新时间}。这不算考生失败，也不收取本场面试费用。新场次需要重新报名、确认到场。面试安排：{页面地址}" },
} as const;
const date = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
export function nextInterviewDeliveryAt(now: number) {
  const day = Math.floor((now + OFFSET) / DAY) * DAY - OFFSET;
  return [8, 19.5, 20].map(hour => day + hour * 3600000).find(at => at > now) ?? day + DAY + 8 * 3600000;
}
interface Options {
  database: Pick<CommunityDatabase, "listActiveHumanCommunities">;
  registrationAuth: { confirmCurrentResidentMembership(residentId: string): Promise<unknown> };
  farmInterviews: FarmConstableInterviewReader;
  mailboxService: Pick<MailboxService, "deliver">;
  candidateWake?: {
    store: Pick<ConstableInterviewCandidateWakeStore, "enqueue">;
    bell: { notifyResident(residentId: string): void };
  };
  browserPush?: {
    service: Pick<BrowserPushService, "sendActivityReminder">;
    receipts: Pick<ConstableInterviewPushStore, "claim" | "confirm">;
  };
  now?: () => number;
  onError?: (error: unknown) => void;
}
export class ConstableInterviewDeliveryService {
  readonly #options: Options;
  readonly #now: () => number;
  #timer: NodeJS.Timeout | undefined;
  #closed = false;
  #started = false;
  constructor(options: Options) { this.#options = options; this.#now = options.now ?? Date.now; }
  start() {
    if (this.#started || this.#closed) return;
    this.#started = true;
    void this.processDue().catch(error => this.#options.onError?.(error));
    this.#arm();
  }
  processDue(): Promise<void> {
    return this.#process();
  }
  async #process() {
    const communities = this.#options.database.listActiveHumanCommunities(), now = this.#now();
    const names = new Map(communities.map(c => [c.resident.residentId, c.resident.residentName]));
    for (const community of communities) {
      if (this.#closed) return;
      try {
        await this.#options.registrationAuth.confirmCurrentResidentMembership(community.resident.residentId);
        const farmHumanKey = community.farmBinding.farmHumanKey;
        if (farmHumanKey === null) continue;
        const result = await this.#options.farmInterviews.readConstableInterview({
          farmDoorplate: community.farmBinding.farmDoorplate, farmHumanKey,
          accountId: community.account.accountId, residentId: community.resident.residentId,
        });
        const deliver = async (kind: keyof typeof LETTERS, id: string, fields: Record<string, string>) => {
          const copy = LETTERS[kind];
          const letter = this.#options.mailboxService.deliver({
            homeId: community.home.homeId, category: "lingye",
            idempotencyKey: "lingye:constable-interview:" + kind + ":" + id + ":" + community.resident.residentId,
            title: copy.title, body: copy.body.replace(/\{([^}]+)\}/gu, (whole, key: string) => {
              if (!(key in fields)) throw new Error("Missing constable mail field: " + key);
              return fields[key]!;
            }), sensitiveValues: [farmHumanKey],
          });
          try {
            const push = this.#options.browserPush;
            if (push && push.receipts.claim(letter.letterId, now)) {
              const confirmed = await push.service.sendActivityReminder({
                residentId: community.resident.residentId, homeId: community.home.homeId,
                title: letter.title, body: letter.body, url: "/lingye/constable-interview",
                tag: "constable-interview:" + letter.letterId, createdAt: letter.createdAt,
              });
              if (confirmed) push.receipts.confirm(letter.letterId, this.#now());
            }
          } catch (error) { this.#options.onError?.(error); }
        };
        for (const interview of result.data.interviews) {
          const candidateWake = this.#options.candidateWake;
          if (candidateWake && needsConstableCandidateWake(interview, now)) {
            const candidate = communities.find(c => c.resident.residentId === interview.candidate_resident_id);
            if (candidate) {
              await this.#options.registrationAuth.confirmCurrentResidentMembership(candidate.resident.residentId);
              const letter = this.#options.mailboxService.deliver({
                homeId: candidate.home.homeId, category: "lingye", title: "面试题目",
                body: CONSTABLE_INTERVIEW_OPEN_MESSAGE, sensitiveValues: [farmHumanKey],
                idempotencyKey: `lingye:constable-interview:open:${interview.interview_id}:${interview.scheduled_at}`,
              });
              if (candidateWake.store.enqueue({ residentId: candidate.resident.residentId,
                letterId: letter.letterId, createdAt: now })) {
                candidateWake.bell.notifyResident(candidate.resident.residentId);
              }
            }
          }
          const scheduled = Date.parse(interview.scheduled_at);
          const fields = { "时间": date(interview.scheduled_at), "页面地址": "/lingye/constable-interview?interview_id=" + encodeURIComponent(interview.interview_id) };
          const id = interview.interview_id + ":" + interview.scheduled_at;
          if (interview.self.signup_eligible) {
            const name = names.get(interview.candidate_resident_id);
            if (!name) throw new Error("Constable candidate public name unavailable");
            await deliver("signup", id, { ...fields, "考生名": name, "等级": ["初级", "中级", "高级", "特级"][interview.qualification_level - 1]! });
          }
          if (interview.status === "signup_open" && interview.self.signed_up &&
              !interview.self.attendance_confirmed && now >= scheduled - 1800000 && now < scheduled)
            await deliver("attendance", id, fields);
        }
        for (const event of result.data.events) {
          const fields = { "时间": date(event.scheduled_at), "原时间": date(event.scheduled_at),
            "页面地址": "/lingye/constable-interview?interview_id=" + encodeURIComponent(event.interview_id) };
          if (event.kind === "selected") {
            const interview = result.data.interviews.find(item => item.interview_id === event.interview_id &&
              item.scheduled_at === event.scheduled_at && ["panel_ready", "scoring"].includes(item.status) && item.self.selected);
            if (interview) await deliver("selected", String(event.event_id), fields);
          } else if (event.next_scheduled_at && Date.parse(event.next_scheduled_at) > now) {
            await deliver("postponed", String(event.event_id), { ...fields, "新时间": date(event.next_scheduled_at) });
          }
        }
      } catch (error) { this.#options.onError?.(error); }
    }
  }
  close() { this.#closed = true; if (this.#timer) clearTimeout(this.#timer); this.#timer = undefined; }
  #arm() {
    if (this.#closed) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.processDue().catch(error => this.#options.onError?.(error)).finally(() => this.#arm());
    }, Math.max(0, nextInterviewDeliveryAt(this.#now()) - this.#now()));
    this.#timer.unref?.();
  }
}
