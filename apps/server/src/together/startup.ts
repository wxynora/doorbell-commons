import type { BellService } from "../bell-service.js";
import type { CommunityDatabase } from "../community-database.js";
import type { MailboxService } from "../mailbox-service.js";
import type { RegistrationAuthService } from "../registration-auth.js";
import type { TogetherActivity } from "../together-activity.js";
import { togetherBellSource } from "./bell.js";
import { togetherAdminSchema } from "./config.js";
import type { SnowActivity, SnowControl, SnowNotice, SnowRewardPort } from "./contracts.js";
import { createRegistrationCoordinator } from "./registration.js";
import { SNOW_WAR_CHAT_NOTICE_COPY } from "./snow-fort/snow-war-notice-copy.mjs";
import { presentSnowResult, renderSnowChatMessage } from "./snow-fort/snow-war-presentation.mjs";

export interface TogetherStartupOptions {
  database: CommunityDatabase;
  registrationAuth: Pick<RegistrationAuthService, "confirmCurrentResidentMembership">;
  mailbox: MailboxService;
  bell: Pick<BellService, "notifyResident" | "notifyWakeCancelled">;
  rewards: SnowRewardPort;
  now?: () => number;
  clock?: () => number;
  automatic?: boolean;
  onError?: (error: unknown) => void;
}

export function createTogetherStartup(options: TogetherStartupOptions) {
  const now = options.now ?? Date.now;
  const controls = options.database.togetherControls();
  const report = options.onError ?? (() => undefined);
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let rerun = false;
  let activity: SnowActivity;
  const signal = () => {
    queueMicrotask(() => {
      if (!closed) void reconcile().catch(report);
    });
  };
  activity = options.database.createTogetherActivity({
    now,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.automatic === undefined ? {} : { automatic: options.automatic }),
    onChange: signal,
  });
  const registration = createRegistrationCoordinator(
    activity,
    options.rewards,
    options.registrationAuth,
  );
  const source = togetherBellSource(activity, options.database);
  const bellSource = {
    ...source,
    listPending(residentId: string) {
      signal(); // Reuse Bell's existing recovery trigger, never add a new polling interval.
      return source.listPending(residentId);
    },
  };

  const consumeControls = () => {
    for (const command of controls.pending()) {
      try {
        const input = togetherAdminSchema.parse(command.payload);
        if (input.kind === "inspect") {
          const state = activity.controlView();
          controls.complete(
            command.commandId,
            "complete",
            state
              ? {
                  ...state,
                  registeredResidents: state.registrations.flatMap((residentId) => {
                    const identity = options.database.findTogetherIdentity(residentId);
                    return identity
                      ? [
                          {
                            residentId,
                            residentName: identity.residentName,
                            farmDoorplate: identity.farmDoorplate,
                          },
                        ]
                      : [];
                  }),
                }
              : null,
          );
          continue;
        }
        if (input.kind === "configure") {
          const { copyReviewConfirmed: _reviewed, ...configuration } = input.configuration;
          activity.configure(configuration);
        } else if (input.kind === "captains") {
          if (
            activity
              .controlView()
              ?.registrationPayments.some(
                (payment) =>
                  payment.status === "pending" &&
                  !payment.excludedFromSeries &&
                  options.database.findTogetherIdentity(payment.residentId),
              )
          )
            throw new Error("registration_payments_pending");
          const ids = activity.controlView()?.registrations ?? [];
          const resolve = (doorplate: string) =>
            ids.find(
              (id) => options.database.findTogetherIdentity(id)?.farmDoorplate === doorplate,
            );
          const A = resolve(input.A),
            B = resolve(input.B);
          if (!A || !B) throw new Error("captain_not_registered");
          activity.setCaptains({ A, B });
        } else activity.retire();
        controls.complete(command.commandId, "complete", { accepted: true });
      } catch (error) {
        controls.complete(command.commandId, "rejected", {
          code:
            error instanceof Error && /^[a-z_]+$/u.test(error.message)
              ? error.message
              : "invalid_control",
        });
        report(error);
      }
    }
  };
  const render = (control: SnowControl, notice: SnowNotice) =>
    notice.kind === "chat_turn"
      ? [
          SNOW_WAR_CHAT_NOTICE_COPY,
          ...activity
            .chatNoticeMessages(notice.id)
            .map((message) => renderSnowChatMessage(message.residentName, message.text)),
        ].join("\n")
      : control.configuration.copy[notice.kind].replace(
          /\{(team|match|round)\}/gu,
          (placeholder, key: string) => notice.facts[key] ?? placeholder,
        );
  const publishNotices = (control: SnowControl) => {
    for (const notice of control.notices) {
      if (notice.status === "cancelled") {
        if (notice.bellEligible !== false)
          options.bell.notifyWakeCancelled(notice.residentId, `together:${notice.id}`);
        continue;
      }
      if (notice.status !== "pending" || notice.letterId !== null) continue;
      const identity = options.database.findTogetherIdentity(notice.residentId);
      if (!identity) continue;
      try {
        const published = activity.publishNotice(
          notice.id,
          (current) =>
            options.mailbox.deliver({
              homeId: identity.homeId,
              idempotencyKey: `together:${current.id}`,
              category: "lingye",
              title: "雪堡战",
              body: render(control, current),
              sensitiveValues: [],
            }).letterId,
        );
        if (
          published.status === "pending" &&
          published.letterId &&
          published.bellEligible !== false
        )
          options.bell.notifyResident(notice.residentId);
      } catch (error) {
        report(error);
      }
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (closed || options.automatic === false) return;
    const state = activity.controlView();
    if (!state || state.retired) return;
    const config = state.configuration;
    const future = [
      config.opensAt,
      config.closesAt,
      ...config.matchStartsAt,
      ...state.chatBoundaries,
      ...state.waitBoundaries,
    ].filter((time) => time > now());
    if (!future.length) return;
    // Node's timeout representation is mechanical, not a product polling interval.
    const delay = Math.min(Math.min(...future) - now(), 2_147_483_647);
    timer = setTimeout(signal, delay);
    timer.unref();
  };
  async function reconcile(): Promise<void> {
    if (closed) return;
    rerun = true;
    if (running) return running;
    running = Promise.resolve()
      .then(async () => {
        while (rerun && !closed) {
          rerun = false;
          await registration.recover();
          consumeControls();
          activity.reconcile();
          const control = activity.controlView();
          if (!control) {
            schedule();
            continue;
          }
          publishNotices(control);
          for (const reward of control.rewards.filter((reward) => reward.status === "pending")) {
            if (closed) break;
            try {
              // The durable outbox records an already-earned system obligation,
              // not a new resident action. Membership still gates player access
              // and registration; it must not strand settlement after departure.
              const receipt =
                reward.gold + reward.silver === 0
                  ? {
                      grantId: reward.grantId,
                      residentId: reward.residentId,
                      gold: 0,
                      silver: 0,
                      journalIds: [],
                    }
                  : await options.rewards.grant(reward);
              if (!closed) activity.settleReward(reward.grantId, receipt);
            } catch (error) {
              report(error);
            }
          }
          // Upstream IO may have crossed a persisted deadline, including when
          // every request failed. Consume due transitions before filtering future
          // timers; never drop an overdue preparation/chat/lineup boundary.
          activity.reconcile();
          const current = activity.controlView();
          if (current) publishNotices(current);
          schedule();
        }
      })
      .finally(() => {
        running = undefined;
        if (rerun && !closed) signal();
      });
    return running;
  }
  const tool: TogetherActivity = {
    decorateFarmStatus: (residentId, text) =>
      activity.decorateFarmStatus?.(residentId, text) ?? text,
    mailboxNotificationExclusions: (residentId, deliveredMessageIds) =>
      activity.mailboxNotificationExclusions(residentId, deliveredMessageIds),
    async execute(input) {
      consumeControls();
      const result = await registration.execute(input);
      signal();
      return presentSnowResult(result);
    },
  };
  signal();
  return {
    tool,
    async readBoard(residentId: string) {
      await reconcile();
      return activity.board(residentId);
    },
    bell: bellSource,
    reconcile,
    controlView: () => activity.controlView(),
    async stop() {
      closed = true;
      if (timer) clearTimeout(timer);
      if (running) await running;
      activity.close();
    },
  };
}
