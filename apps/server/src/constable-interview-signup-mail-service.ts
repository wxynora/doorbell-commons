import type { FarmHumanConstableInterviewSuccess } from "@doorbell/protocol";
import type { CommunityDatabase } from "./community-database.js";
import type { FarmConstableInterviewReader } from "./farm-constable-interview-client.js";
import type { MailboxService } from "./mailbox-service.js";

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export interface ConstableInterviewSignupMailCopy {
  title: string;
  body: string;
}

export interface ConstableInterviewSignupMailServiceOptions {
  database: Pick<CommunityDatabase, "listActiveHumanCommunities">;
  registrationAuth: {
    confirmCurrentResidentMembership(residentId: string): Promise<unknown>;
  };
  farmInterviews: FarmConstableInterviewReader;
  mailboxService: Pick<MailboxService, "deliver">;
  copy: ConstableInterviewSignupMailCopy;
  now?: () => number;
  onError?: (error: unknown) => void;
}

function nextBeijingEight(now: number): number {
  const beijingDay = Math.floor((now + BEIJING_UTC_OFFSET_MS) / DAY_MS);
  const todayAtEight = beijingDay * DAY_MS + EIGHT_HOURS_MS - BEIJING_UTC_OFFSET_MS;
  return todayAtEight > now ? todayAtEight : todayAtEight + DAY_MS;
}

function signupEligibleInterviews(result: FarmHumanConstableInterviewSuccess) {
  return result.data.interviews.filter((interview) => interview.self.signup_eligible);
}

export class ConstableInterviewSignupMailService {
  readonly #database: ConstableInterviewSignupMailServiceOptions["database"];
  readonly #registrationAuth: ConstableInterviewSignupMailServiceOptions["registrationAuth"];
  readonly #farmInterviews: FarmConstableInterviewReader;
  readonly #mailboxService: ConstableInterviewSignupMailServiceOptions["mailboxService"];
  readonly #copy: ConstableInterviewSignupMailCopy;
  readonly #now: () => number;
  readonly #onError: (error: unknown) => void;
  #timer: NodeJS.Timeout | undefined;
  #closed = false;
  #started = false;

  constructor(options: ConstableInterviewSignupMailServiceOptions) {
    this.#database = options.database;
    this.#registrationAuth = options.registrationAuth;
    this.#farmInterviews = options.farmInterviews;
    this.#mailboxService = options.mailboxService;
    this.#copy = options.copy;
    this.#now = options.now ?? Date.now;
    this.#onError = options.onError ?? (() => undefined);
  }

  start(): void {
    if (this.#started || this.#closed) return;
    this.#started = true;
    void this.processDue().catch((error) => this.#onError(error));
    this.#arm();
  }

  async processDue(): Promise<void> {
    for (const community of this.#database.listActiveHumanCommunities()) {
      try {
        await this.#registrationAuth.confirmCurrentResidentMembership(
          community.resident.residentId,
        );
        const farmHumanKey = community.farmBinding.farmHumanKey;
        if (farmHumanKey === null) continue;
        const result = await this.#farmInterviews.readConstableInterview({
          farmDoorplate: community.farmBinding.farmDoorplate,
          farmHumanKey,
          accountId: community.account.accountId,
          residentId: community.resident.residentId,
        });
        for (const interview of signupEligibleInterviews(result)) {
          this.#mailboxService.deliver({
            homeId: community.home.homeId,
            idempotencyKey: `lingye:constable-interview-signup:${interview.interview_id}:${community.resident.residentId}`,
            category: "lingye",
            title: this.#copy.title,
            body: this.#copy.body,
            sensitiveValues: [farmHumanKey],
          });
        }
      } catch (error) {
        this.#onError(error);
      }
    }
  }

  close(): void {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #arm(): void {
    if (this.#closed) return;
    const delay = Math.max(0, nextBeijingEight(this.#now()) - this.#now());
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.processDue()
        .catch((error) => this.#onError(error))
        .finally(() => this.#arm());
    }, delay);
    this.#timer.unref?.();
  }
}
