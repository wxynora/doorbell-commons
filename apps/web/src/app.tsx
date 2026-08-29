import {
  climateTypeSchema,
  type HumanSettingsPatchRequest,
  type HumanSettingsSuccess,
  weatherConditionDetails,
} from "@doorbell/protocol";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  type AuthIssue,
  type BoundFarmField,
  deleteHumanSession,
  getCurrentHumanSession,
  getHumanSettings,
  type HumanIdentity,
  switchHumanProfile,
  updateHumanSettings,
} from "./auth/auth-client";
import { authIssueMessage } from "./auth/auth-errors";
import {
  type BoundGlimmerRead,
  type BoundQixiMemorialRead,
  type BoundTogetherRead,
  getBoundGlimmer,
  getBoundQixiMemorial,
  getBoundTogether,
  type LingyeIssue,
  lingyeIssueMessage,
} from "./auth/lingye-client";
import {
  claimMailboxAttachment,
  getMailboxLetter,
  listMailbox,
  mailboxIssueMessage,
} from "./auth/mailbox-client";
import {
  addSharedMeme,
  getSharedMeme,
  listSharedMemes,
  sharedMemeIssueMessage,
} from "./auth/shared-meme-client";
import { disableBrowserNotifications, enableBrowserNotifications } from "./browser-notifications";
import { AdditionalProfileForm } from "./components/additional-profile-form";
import { AuthScreen, RegistrationHeader, SessionCheckingScreen } from "./components/auth-screen";
import { McpAccessPage } from "./components/mcp-access-panel";
import { ResidencePermitTransition } from "./components/residence-permit-transition";
import {
  buildCandidateTwoDemoPreset,
  type CandidateTwoAction,
  type CandidateTwoDemoPreset,
  type CandidateTwoHomeSettingsView,
  type CandidateTwoIdentityView,
  type CandidateTwoLingyeReadState,
  type CandidateTwoMailboxView,
  CandidateTwoPreview,
  type CandidateTwoSharedMemeDetailView,
  type CandidateTwoSharedMemeListView,
  type CandidateTwoViewState,
  resolveCandidateTwoDemoPreset,
} from "./preview/candidate-two-preview";
import { DOORBELL_FARM_PATH, isDoorbellFarmPath } from "./routes";

const FarmPage = lazy(async () => {
  const module = await import("./farm/farm-page");
  return { default: module.FarmPage };
});

const candidateTwoFarmPreviewSeedTypes = [
  "common",
  "common",
  "fantasy",
  "common",
  "limited",
  "fantasy",
] as const;
const candidateTwoFarmPreviewPlots: BoundFarmField["data"]["plots"] = Array.from(
  { length: 20 },
  (_, index) => {
    const plotId = index + 1;
    const state = plotId % 6 === 1 ? "empty" : plotId % 3 === 0 ? "ripe" : "growing";
    const seedType =
      candidateTwoFarmPreviewSeedTypes[index % candidateTwoFarmPreviewSeedTypes.length];
    const progressTotal = 8;
    return {
      plot_id: plotId,
      seed_type: state === "empty" ? null : (seedType ?? "common"),
      state,
      watered: state === "empty" ? 0 : state === "ripe" ? 2 : 1,
      progress:
        state === "empty"
          ? null
          : { current: state === "ripe" ? progressTotal : (plotId % 6) + 1, total: progressTotal },
      matures_at: state === "growing" ? "2026-08-24T08:00:00.000Z" : null,
      identity_state:
        state === "empty" ? "empty" : seedType === "limited" ? "unavailable" : "hidden",
      crop_identity: null,
    };
  },
);

const candidateTwoFarmPreview: BoundFarmField = {
  data: {
    farm: {
      farm_doorplate: "3ET3FE",
      farm_name: "农场 UI 预览",
      welcome_message: "今天也来看看田里吧。",
      equipped_title: { title_id: "preview-title", name: "新芽守望者" },
    },
    balance: { farm_coins: 1280 },
    season: { id: "summer", name: "夏" },
    weather: { condition: "light_rain" },
    land: { tier: 3, name: "葱郁田地" },
    plots: candidateTwoFarmPreviewPlots,
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: candidateTwoFarmPreviewPlots.filter((plot) => plot.state === "ripe")
        .length,
      can_assist: true,
      reset_at: "2026-08-24T16:00:00.000Z",
    },
  },
  revision: "preview-field-v1",
  server_time: "2026-08-23T08:00:00.000Z",
};

type HomeSettingsState =
  | { stage: "loading" }
  | { stage: "error"; issue: AuthIssue }
  | { stage: "ready"; data: HumanSettingsSuccess };

type AppState =
  | { stage: "checking-session" }
  | { stage: "anonymous"; issue: AuthIssue | null; pending: boolean }
  | { stage: "issuing-permit"; identity: HumanIdentity }
  | { stage: "adding-profile"; identity: HumanIdentity }
  | {
      stage: "authenticated";
      homeSettings: HomeSettingsState;
      homeSettingsIssue: AuthIssue | null;
      homeSettingsPending: boolean;
      identity: HumanIdentity;
      issue: AuthIssue | null;
      pendingLogout: boolean;
      sharedMemeCreateMessage: string | null;
      sharedMemeCreatePending: boolean;
      sharedMemeDetail: CandidateTwoSharedMemeDetailView;
      sharedMemes: CandidateTwoSharedMemeListView;
      lingye: {
        glimmer: CandidateTwoLingyeReadState<BoundGlimmerRead>;
        memorial: CandidateTwoLingyeReadState<BoundQixiMemorialRead>;
        together: CandidateTwoLingyeReadState<BoundTogetherRead>;
      };
      mailbox: CandidateTwoMailboxView;
    };

function identityView(identity: HumanIdentity): CandidateTwoIdentityView {
  return {
    farmDoorplate: identity.farmBinding.farm_doorplate,
    homeName: identity.home.home_name,
    qqNumber: identity.account.qq_number,
    residentName: identity.resident.resident_name,
  };
}

export function homeSettingsView(homeSettings: HomeSettingsState): CandidateTwoHomeSettingsView {
  if (homeSettings.stage === "error") {
    return { stage: "error", message: authIssueMessage(homeSettings.issue) };
  }
  if (homeSettings.stage === "loading") {
    return homeSettings;
  }

  const {
    browser_notification_preferences,
    community_connection_preferences,
    home,
    notification_preferences,
    shared_data_preferences,
  } = homeSettings.data;
  let weatherSummary = "尚未设置气候";
  if (home.climate_type) {
    weatherSummary = home.weather_state?.condition
      ? weatherConditionDetails[home.weather_state.condition].label
      : "天气正在形成";
  }
  return {
    stage: "ready",
    activityInvitationsEnabled: notification_preferences.activity_invitations_enabled ?? true,
    activityRemindersEnabled: browser_notification_preferences.activity_reminders_enabled,
    allowActivityRoomWarmup: community_connection_preferences.allow_activity_room_warmup ?? true,
    browserNotificationsAvailable: browser_notification_preferences.browser_notifications_available,
    browserNotificationsEnabled: browser_notification_preferences.browser_notifications_enabled,
    browserNotificationApplicationServerKey:
      browser_notification_preferences.application_server_key,
    chatMode: community_connection_preferences.chat_mode ?? "natural",
    climateType: home.climate_type,
    defaultConnectionDurationMinutes:
      community_connection_preferences.default_connection_duration_minutes,
    environmentDescription: home.environment_description,
    homeName: home.home_name,
    importantSystemNotificationsEnabled:
      notification_preferences.important_system_notifications_enabled ?? true,
    initialRecentActivityCount: community_connection_preferences.initial_recent_activity_count,
    pauseAllWakeups: notification_preferences.pause_all_wakeups ?? false,
    profileSwitcher:
      homeSettings.data.profiles.length > 1
        ? {
            activeProfileId: homeSettings.data.active_profile_id,
            profiles: homeSettings.data.profiles.map((profile) => ({
              profileId: profile.profile_id,
              residentName: profile.resident_name,
              homeName: profile.home_name,
              farmDoorplate: profile.farm_doorplate,
            })),
          }
        : null,
    sharedMemeUpdateSignalsEnabled: shared_data_preferences.shared_meme_update_signals_enabled,
    visitRequestsAndInvitationsEnabled:
      notification_preferences.visit_requests_and_invitations_enabled ?? true,
    wakeBridgeStatus: homeSettings.data.connection_status.wake_bridge.status,
    weatherSummary,
  };
}

export function preferencePatchForCandidateAction(
  action: CandidateTwoAction,
): HumanSettingsPatchRequest | null {
  if (action.type === "notification-preference-save") {
    if (action.field === "pauseAllWakeups") {
      return { notification_preferences: { pause_all_wakeups: action.value } };
    }
    if (action.field === "visitRequestsAndInvitationsEnabled") {
      return {
        notification_preferences: {
          visit_requests_and_invitations_enabled: action.value,
        },
      };
    }
    if (action.field === "activityInvitationsEnabled") {
      return { notification_preferences: { activity_invitations_enabled: action.value } };
    }
    return {
      notification_preferences: { important_system_notifications_enabled: action.value },
    };
  }

  if (action.type === "shared-data-preference-save") {
    return {
      shared_data_preferences: { shared_meme_update_signals_enabled: action.value },
    };
  }

  if (action.type === "browser-notification-preference-save") {
    return action.field === "browserNotificationsEnabled"
      ? {
          browser_notification_preferences: {
            browser_notifications_enabled: action.value,
          },
        }
      : {
          browser_notification_preferences: {
            activity_reminders_enabled: action.value,
          },
        };
  }

  if (action.type !== "community-connection-preference-save") {
    return null;
  }
  if (action.field === "defaultConnectionDurationMinutes") {
    return {
      community_connection_preferences: {
        default_connection_duration_minutes: action.value,
      },
    };
  }
  if (action.field === "initialRecentActivityCount") {
    return {
      community_connection_preferences: { initial_recent_activity_count: action.value },
    };
  }
  if (action.field === "chatMode") {
    return { community_connection_preferences: { chat_mode: action.value } };
  }
  return {
    community_connection_preferences: { allow_activity_room_warmup: action.value },
  };
}

export async function loadSharedMemesAfterOpen(
  onLoading: (state: Extract<CandidateTwoSharedMemeListView, { stage: "loading" }>) => void,
  loader: typeof listSharedMemes = listSharedMemes,
): Promise<CandidateTwoSharedMemeListView> {
  onLoading({ stage: "loading" });
  const result = await loader();
  return result.ok
    ? { stage: "ready", data: result.data }
    : { stage: "error", message: sharedMemeIssueMessage(result.issue) };
}

type LingyeReadLoadResult<T> = { ok: true; data: T | null } | { ok: false; issue: LingyeIssue };

export async function loadLingyeAfterOpen<T>(
  onLoading: (state: { stage: "loading" }) => void,
  loader: () => Promise<LingyeReadLoadResult<T>>,
): Promise<{ stage: "ready"; data: T } | { stage: "empty" } | { stage: "error"; message: string }> {
  onLoading({ stage: "loading" });
  const result = await loader();
  if (!result.ok) {
    return { stage: "error", message: lingyeIssueMessage(result.issue) };
  }
  return result.data == null ? { stage: "empty" } : { stage: "ready", data: result.data };
}

function authenticatedState(
  identity: HumanIdentity,
): Extract<AppState, { stage: "authenticated" }> {
  return {
    stage: "authenticated",
    homeSettings: { stage: "loading" },
    homeSettingsIssue: null,
    homeSettingsPending: false,
    identity,
    issue: null,
    pendingLogout: false,
    sharedMemeCreateMessage: null,
    sharedMemeCreatePending: false,
    sharedMemeDetail: { stage: "idle" },
    sharedMemes: { stage: "idle" },
    lingye: {
      glimmer: { stage: "idle" },
      memorial: { stage: "idle" },
      together: { stage: "idle" },
    },
    mailbox: {
      claimMessage: null,
      claimPending: false,
      detail: { stage: "idle" },
      list: { stage: "loading", category: null, page: 1 },
    },
  };
}

function authenticatedViewState(
  appState: Extract<AppState, { stage: "authenticated" }>,
): CandidateTwoViewState {
  return {
    stage: "authenticated",
    homeSettings: homeSettingsView(appState.homeSettings),
    homeSettingsIssueMessage: appState.homeSettingsIssue
      ? authIssueMessage(appState.homeSettingsIssue)
      : null,
    homeSettingsPending: appState.homeSettingsPending,
    identity: identityView(appState.identity),
    issueMessage: appState.issue ? authIssueMessage(appState.issue) : null,
    pendingLogout: appState.pendingLogout,
    sharedMemeCreateMessage: appState.sharedMemeCreateMessage,
    sharedMemeCreatePending: appState.sharedMemeCreatePending,
    sharedMemeDetail: appState.sharedMemeDetail,
    sharedMemes: appState.sharedMemes,
    lingye: appState.lingye,
    mailbox: appState.mailbox,
  };
}

function LiveApp() {
  const [appState, setAppState] = useState<AppState>({ stage: "checking-session" });
  const [activeInternalPage, setActiveInternalPage] = useState<"community" | "farm">(() =>
    isDoorbellFarmPath(window.location.pathname) ? "farm" : "community",
  );
  const [showMcpAfterPermit, setShowMcpAfterPermit] = useState(false);
  const lingyeRequestIdsRef = useRef({ glimmer: 0, memorial: 0, together: 0 });
  const lingyeControllersRef = useRef<{
    glimmer: AbortController | null;
    memorial: AbortController | null;
    together: AbortController | null;
  }>({ glimmer: null, memorial: null, together: null });

  useEffect(
    () => () => {
      lingyeControllersRef.current.glimmer?.abort();
      lingyeControllersRef.current.memorial?.abort();
      lingyeControllersRef.current.together?.abort();
    },
    [],
  );

  useEffect(() => {
    const syncInternalPageFromLocation = () => {
      setActiveInternalPage(isDoorbellFarmPath(window.location.pathname) ? "farm" : "community");
    };
    window.addEventListener("popstate", syncInternalPageFromLocation);
    return () => window.removeEventListener("popstate", syncInternalPageFromLocation);
  }, []);

  const openFarmPage = useCallback(() => {
    if (!isDoorbellFarmPath(window.location.pathname)) {
      window.history.pushState({ doorbellInternalPage: "farm" }, "", DOORBELL_FARM_PATH);
    }
    setActiveInternalPage("farm");
  }, []);

  const closeFarmPage = useCallback(() => {
    if (
      isDoorbellFarmPath(window.location.pathname) &&
      window.history.state?.doorbellInternalPage === "farm"
    ) {
      window.history.back();
      return;
    }
    if (isDoorbellFarmPath(window.location.pathname)) {
      window.history.replaceState({}, "", "/");
    }
    setActiveInternalPage("community");
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void getCurrentHumanSession({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }

      if (result.ok) {
        setAppState(authenticatedState(result.identity));
        return;
      }

      setAppState({
        stage: "anonymous",
        issue: result.issue.code === "authentication_required" ? null : result.issue,
        pending: false,
      });
    });

    return () => controller.abort();
  }, []);

  const settingsLoading =
    appState.stage === "authenticated" ? appState.homeSettings.stage === "loading" : false;
  const mailboxListLoading =
    appState.stage === "authenticated" && appState.mailbox.list.stage === "loading"
      ? appState.mailbox.list
      : null;
  const mailboxListCategory = mailboxListLoading?.category ?? null;
  const mailboxListPage = mailboxListLoading?.page ?? 0;
  const mailboxListRequestKey = mailboxListLoading
    ? `${mailboxListCategory ?? "all"}:${mailboxListPage}`
    : null;

  useEffect(() => {
    if (!settingsLoading) {
      return;
    }

    const controller = new AbortController();
    void getHumanSettings({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      setAppState((current) => {
        if (current.stage !== "authenticated" || current.homeSettings.stage !== "loading") {
          return current;
        }
        return {
          ...current,
          homeSettings: result.ok
            ? { stage: "ready", data: result.data }
            : { stage: "error", issue: result.issue },
        };
      });
    });

    return () => controller.abort();
  }, [settingsLoading]);

  useEffect(() => {
    if (!mailboxListRequestKey) {
      return;
    }

    const category = mailboxListCategory;
    const page = mailboxListPage;
    const controller = new AbortController();
    void listMailbox({
      ...(category ? { category } : {}),
      page,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      setAppState((current) => {
        if (
          current.stage !== "authenticated" ||
          current.mailbox.list.stage !== "loading" ||
          current.mailbox.list.category !== category ||
          current.mailbox.list.page !== page
        ) {
          return current;
        }
        return {
          ...current,
          mailbox: {
            ...current.mailbox,
            list: result.ok
              ? { stage: "ready", category, data: result.data }
              : { stage: "error", category, message: mailboxIssueMessage(result.issue), page },
          },
        };
      });
    });

    return () => controller.abort();
  }, [mailboxListCategory, mailboxListPage, mailboxListRequestKey]);

  const loadLingye = useCallback(
    (kind: "glimmer" | "memorial" | "together") => {
      if (appState.stage !== "authenticated") {
        return;
      }

      const requestId = lingyeRequestIdsRef.current[kind] + 1;
      lingyeRequestIdsRef.current[kind] = requestId;
      lingyeControllersRef.current[kind]?.abort();
      const controller = new AbortController();
      lingyeControllersRef.current[kind] = controller;
      setAppState((current) => {
        if (current.stage !== "authenticated") {
          return current;
        }
        return {
          ...current,
          lingye: {
            ...current.lingye,
            [kind]: { stage: "loading" },
          },
        };
      });

      const isCurrentRequest = () =>
        !controller.signal.aborted && lingyeRequestIdsRef.current[kind] === requestId;
      if (kind === "glimmer") {
        void loadLingyeAfterOpen<BoundGlimmerRead>(
          () => undefined,
          () => getBoundGlimmer({ signal: controller.signal }),
        ).then((result) => {
          if (!isCurrentRequest()) return;
          setAppState((current) =>
            current.stage === "authenticated"
              ? { ...current, lingye: { ...current.lingye, glimmer: result } }
              : current,
          );
        });
        return;
      }
      if (kind === "memorial") {
        void loadLingyeAfterOpen<BoundQixiMemorialRead>(
          () => undefined,
          () => getBoundQixiMemorial({ signal: controller.signal }),
        ).then((result) => {
          if (!isCurrentRequest()) return;
          setAppState((current) =>
            current.stage === "authenticated"
              ? { ...current, lingye: { ...current.lingye, memorial: result } }
              : current,
          );
        });
        return;
      }
      void loadLingyeAfterOpen<BoundTogetherRead>(
        () => undefined,
        () => getBoundTogether({ signal: controller.signal }),
      ).then((result) => {
        if (!isCurrentRequest()) return;
        setAppState((current) =>
          current.stage === "authenticated"
            ? { ...current, lingye: { ...current.lingye, together: result } }
            : current,
        );
      });
    },
    [appState.stage],
  );

  const handleCandidateAction = useCallback(
    async (action: CandidateTwoAction) => {
      if (action.type === "navigate") {
        if (action.path === DOORBELL_FARM_PATH && appState.stage === "authenticated") {
          openFarmPage();
        }
        return;
      }

      if (
        action.type === "lingye-glimmer-open" ||
        action.type === "lingye-memorial-open" ||
        action.type === "lingye-together-open"
      ) {
        loadLingye(
          action.type === "lingye-glimmer-open"
            ? "glimmer"
            : action.type === "lingye-memorial-open"
              ? "memorial"
              : "together",
        );
        return;
      }

      if (action.type === "home-mailbox-list") {
        if (appState.stage !== "authenticated") {
          return;
        }
        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                mailbox: {
                  claimMessage: null,
                  claimPending: false,
                  detail: { stage: "idle" },
                  list: {
                    stage: "loading",
                    category: action.category,
                    page: action.page,
                  },
                },
              }
            : current,
        );
        return;
      }

      if (action.type === "home-mailbox-detail-open") {
        if (appState.stage !== "authenticated") {
          return;
        }
        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                mailbox: {
                  ...current.mailbox,
                  claimMessage: null,
                  detail: { stage: "loading", letterId: action.letterId },
                },
              }
            : current,
        );
        const result = await getMailboxLetter(action.letterId);
        setAppState((current) => {
          if (
            current.stage !== "authenticated" ||
            current.mailbox.detail.stage !== "loading" ||
            current.mailbox.detail.letterId !== action.letterId
          ) {
            return current;
          }
          const list = current.mailbox.list;
          const nextList =
            result.ok && list.stage === "ready"
              ? {
                  ...list,
                  data: {
                    ...list.data,
                    letters: list.data.letters.map((letter) =>
                      letter.letter_id === action.letterId
                        ? { ...letter, attachment: result.data.letter.attachment, is_new: false }
                        : letter,
                    ),
                  },
                }
              : list;
          return {
            ...current,
            mailbox: {
              ...current.mailbox,
              detail: result.ok
                ? { stage: "ready", data: result.data }
                : {
                    stage: "error",
                    letterId: action.letterId,
                    message: mailboxIssueMessage(result.issue),
                  },
              list: nextList,
            },
          };
        });
        return;
      }

      if (action.type === "home-mailbox-claim") {
        if (
          appState.stage !== "authenticated" ||
          appState.mailbox.claimPending ||
          appState.mailbox.detail.stage !== "ready" ||
          appState.mailbox.detail.data.letter.letter_id !== action.letterId ||
          appState.mailbox.detail.data.letter.attachment?.status !== "available"
        ) {
          return;
        }
        setAppState((current) =>
          current.stage === "authenticated" &&
          current.mailbox.detail.stage === "ready" &&
          current.mailbox.detail.data.letter.letter_id === action.letterId
            ? {
                ...current,
                mailbox: {
                  ...current.mailbox,
                  claimMessage: null,
                  claimPending: true,
                },
              }
            : current,
        );
        const result = await claimMailboxAttachment(action.letterId);
        setAppState((current) => {
          if (
            current.stage !== "authenticated" ||
            current.mailbox.detail.stage !== "ready" ||
            current.mailbox.detail.data.letter.letter_id !== action.letterId
          ) {
            return current;
          }
          const list = current.mailbox.list;
          const nextList =
            result.ok && list.stage === "ready"
              ? {
                  ...list,
                  data: {
                    ...list.data,
                    letters: list.data.letters.map((letter) =>
                      letter.letter_id === action.letterId
                        ? { ...letter, attachment: result.data.letter.attachment }
                        : letter,
                    ),
                  },
                }
              : list;
          return {
            ...current,
            mailbox: {
              ...current.mailbox,
              claimMessage: result.ok ? "附件已领取。" : mailboxIssueMessage(result.issue),
              claimPending: false,
              detail: result.ok ? { stage: "ready", data: result.data } : current.mailbox.detail,
              list: nextList,
            },
          };
        });
        return;
      }

      if (action.type === "profile-add") {
        if (appState.stage === "authenticated") {
          setAppState({ stage: "adding-profile", identity: appState.identity });
        }
        return;
      }

      if (action.type === "profile-switch") {
        if (
          appState.stage !== "authenticated" ||
          appState.homeSettingsPending ||
          appState.homeSettings.stage !== "ready" ||
          !appState.homeSettings.data.profiles.some(
            (profile) => profile.profile_id === action.profileId,
          )
        ) {
          return;
        }
        lingyeControllersRef.current.glimmer?.abort();
        lingyeControllersRef.current.memorial?.abort();
        lingyeControllersRef.current.together?.abort();
        lingyeRequestIdsRef.current.glimmer += 1;
        lingyeRequestIdsRef.current.memorial += 1;
        lingyeRequestIdsRef.current.together += 1;
        setAppState({ ...appState, homeSettingsIssue: null, homeSettingsPending: true });
        const switched = await switchHumanProfile({ profile_id: action.profileId });
        if (!switched.ok) {
          setAppState((current) =>
            current.stage === "authenticated"
              ? {
                  ...current,
                  homeSettingsIssue: switched.issue,
                  homeSettingsPending: false,
                }
              : current,
          );
          return;
        }
        const settings = await getHumanSettings();
        const next = authenticatedState(switched.identity);
        setAppState({
          ...next,
          homeSettings: settings.ok
            ? { stage: "ready", data: settings.data }
            : { stage: "error", issue: settings.issue },
        });
        return;
      }

      if (
        action.type === "credentials-submit" ||
        action.type === "farm-lookup" ||
        action.type === "registration-submit" ||
        action.type === "permit-complete"
      ) {
        return;
      }

      if (action.type === "shared-memes-open") {
        if (appState.stage !== "authenticated" || appState.sharedMemes.stage === "loading") {
          return;
        }
        const sharedMemes = await loadSharedMemesAfterOpen((loading) => {
          setAppState((current) =>
            current.stage === "authenticated"
              ? {
                  ...current,
                  sharedMemeCreateMessage: null,
                  sharedMemeDetail: { stage: "idle" },
                  sharedMemes: loading,
                }
              : current,
          );
        });
        setAppState((current) =>
          current.stage === "authenticated" ? { ...current, sharedMemes } : current,
        );
        return;
      }

      if (action.type === "shared-meme-open") {
        if (appState.stage !== "authenticated" || appState.sharedMemeDetail.stage === "loading") {
          return;
        }
        setAppState({ ...appState, sharedMemeDetail: { stage: "loading" } });
        const result = await getSharedMeme(action.memeId);
        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                sharedMemeDetail: result.ok
                  ? { stage: "ready", data: result.data }
                  : { stage: "error", message: sharedMemeIssueMessage(result.issue) },
              }
            : current,
        );
        return;
      }

      if (action.type === "shared-meme-create") {
        if (appState.stage !== "authenticated" || appState.sharedMemeCreatePending) {
          return;
        }
        setAppState({
          ...appState,
          sharedMemeCreateMessage: null,
          sharedMemeCreatePending: true,
        });
        const result = await addSharedMeme(action.input);
        setAppState((current) => {
          if (current.stage !== "authenticated") {
            return current;
          }
          if (!result.ok) {
            return {
              ...current,
              sharedMemeCreateMessage: sharedMemeIssueMessage(result.issue),
              sharedMemeCreatePending: false,
            };
          }
          const memes =
            current.sharedMemes.stage === "ready"
              ? [...current.sharedMemes.data.memes, result.data.meme]
              : [result.data.meme];
          return {
            ...current,
            sharedMemeCreateMessage: `“${result.data.meme.term}”已加入共享梗库。`,
            sharedMemeCreatePending: false,
            sharedMemeDetail: {
              stage: "ready",
              data: {
                library_version: result.data.library.library_version,
                meme: result.data.meme,
              },
            },
            sharedMemes: {
              stage: "ready",
              data: { library: result.data.library, memes },
            },
          };
        });
        return;
      }

      if (action.type === "home-settings-save") {
        if (
          appState.stage !== "authenticated" ||
          appState.homeSettingsPending ||
          appState.homeSettings.stage !== "ready"
        ) {
          return;
        }

        const home =
          action.field === "homeName"
            ? { home_name: action.value }
            : action.field === "environmentDescription"
              ? { environment_description: action.value.length === 0 ? null : action.value }
              : (() => {
                  const parsed = climateTypeSchema.safeParse(action.value);
                  return parsed.success ? { climate_type: parsed.data } : null;
                })();

        if (!home || (action.field === "homeName" && action.value.length === 0)) {
          setAppState({
            ...appState,
            homeSettingsIssue: { code: "invalid_request", serverMessage: null },
          });
          return;
        }

        setAppState({
          ...appState,
          homeSettingsIssue: null,
          homeSettingsPending: true,
        });
        const result = await updateHumanSettings({ home });
        setAppState((current) => {
          if (current.stage !== "authenticated") {
            return current;
          }
          if (!result.ok) {
            return {
              ...current,
              homeSettingsIssue: result.issue,
              homeSettingsPending: false,
            };
          }
          return {
            ...current,
            homeSettings: { stage: "ready", data: result.data },
            homeSettingsIssue: null,
            homeSettingsPending: false,
            identity: {
              ...current.identity,
              home: { ...current.identity.home, home_name: result.data.home.home_name },
            },
          };
        });
        return;
      }

      if (
        action.type === "browser-notification-preference-save" &&
        action.field === "browserNotificationsEnabled"
      ) {
        if (
          appState.stage !== "authenticated" ||
          appState.homeSettingsPending ||
          appState.homeSettings.stage !== "ready"
        ) {
          return;
        }
        setAppState({
          ...appState,
          homeSettingsIssue: null,
          homeSettingsPending: true,
        });
        if (action.value) {
          const enabled = await enableBrowserNotifications({
            applicationServerKey:
              appState.homeSettings.data.browser_notification_preferences.application_server_key,
          });
          if (!enabled.ok) {
            setAppState((current) =>
              current.stage === "authenticated"
                ? {
                    ...current,
                    homeSettingsIssue: enabled.issue,
                    homeSettingsPending: false,
                  }
                : current,
            );
            return;
          }
        }
        const result = await updateHumanSettings({
          browser_notification_preferences: {
            browser_notifications_enabled: action.value,
          },
        });
        if (result.ok && !action.value) {
          await disableBrowserNotifications();
        }
        setAppState((current) => {
          if (current.stage !== "authenticated") return current;
          return result.ok
            ? {
                ...current,
                homeSettings: { stage: "ready", data: result.data },
                homeSettingsIssue: null,
                homeSettingsPending: false,
              }
            : {
                ...current,
                homeSettingsIssue: result.issue,
                homeSettingsPending: false,
              };
        });
        return;
      }

      if (
        action.type === "notification-preference-save" ||
        action.type === "shared-data-preference-save" ||
        action.type === "browser-notification-preference-save" ||
        action.type === "community-connection-preference-save"
      ) {
        if (
          appState.stage !== "authenticated" ||
          appState.homeSettingsPending ||
          appState.homeSettings.stage !== "ready"
        ) {
          return;
        }

        const patch = preferencePatchForCandidateAction(action);
        if (!patch) {
          return;
        }
        setAppState({
          ...appState,
          homeSettingsIssue: null,
          homeSettingsPending: true,
        });
        const result = await updateHumanSettings(patch);
        setAppState((current) => {
          if (current.stage !== "authenticated") {
            return current;
          }
          return result.ok
            ? {
                ...current,
                homeSettings: { stage: "ready", data: result.data },
                homeSettingsIssue: null,
                homeSettingsPending: false,
              }
            : {
                ...current,
                homeSettingsIssue: result.issue,
                homeSettingsPending: false,
              };
        });
        return;
      }

      if (action.type === "logout") {
        if (appState.stage !== "authenticated") {
          return;
        }

        lingyeControllersRef.current.glimmer?.abort();
        lingyeControllersRef.current.memorial?.abort();
        lingyeControllersRef.current.together?.abort();
        lingyeRequestIdsRef.current.glimmer += 1;
        lingyeRequestIdsRef.current.memorial += 1;
        lingyeRequestIdsRef.current.together += 1;
        const authenticatedBeforeLogout = appState;
        setAppState({ ...appState, issue: null, pendingLogout: true });
        const result = await deleteHumanSession();
        if (result.ok || result.issue.code === "authentication_required") {
          setShowMcpAfterPermit(false);
          if (isDoorbellFarmPath(window.location.pathname)) {
            window.history.replaceState({}, "", "/");
          }
          setActiveInternalPage("community");
          setAppState({
            stage: "anonymous",
            issue: result.ok ? null : result.issue,
            pending: false,
          });
          return;
        }

        setAppState({
          ...authenticatedBeforeLogout,
          issue: result.issue,
          pendingLogout: false,
        });
      }
    },
    [appState, loadLingye, openFarmPage],
  );

  if (appState.stage === "checking-session") {
    return <SessionCheckingScreen />;
  }

  if (appState.stage === "anonymous") {
    return (
      <AuthScreen
        initialIssue={appState.issue}
        onAuthenticated={(identity) => setAppState(authenticatedState(identity))}
        onRegistered={(identity) => {
          setShowMcpAfterPermit(true);
          setAppState({ stage: "issuing-permit", identity });
        }}
      />
    );
  }

  if (appState.stage === "issuing-permit") {
    return (
      <ResidencePermitTransition
        identity={appState.identity}
        onComplete={() => setAppState(authenticatedState(appState.identity))}
      />
    );
  }

  if (appState.stage === "adding-profile") {
    return (
      <div className="registration-page">
        <main className="registration-page__main" id="main-content">
          <RegistrationHeader />
          <section className="registration-page__sheet" aria-label="添加小机档案">
            <AdditionalProfileForm
              onCancel={() => setAppState(authenticatedState(appState.identity))}
              onCreated={(identity) => {
                setShowMcpAfterPermit(false);
                setAppState({ stage: "issuing-permit", identity });
              }}
            />
          </section>
        </main>
      </div>
    );
  }

  if (appState.stage === "authenticated" && showMcpAfterPermit) {
    return <McpAccessPage onComplete={() => setShowMcpAfterPermit(false)} />;
  }

  return (
    <div className="live-app">
      <CandidateTwoPreview
        onAction={handleCandidateAction}
        state={authenticatedViewState(appState)}
      />
      {appState.stage === "authenticated" && activeInternalPage === "farm" ? (
        <Suspense fallback={null}>
          <FarmPage onBack={closeFarmPage} />
        </Suspense>
      ) : null}
    </div>
  );
}

function CandidateTwoDemoApp({ initialPreset }: { initialPreset: CandidateTwoDemoPreset }) {
  const [preset, setPreset] = useState(initialPreset);
  const [activeInternalPage, setActiveInternalPage] = useState<"community" | "farm">("community");

  const handleDemoAction = useCallback((action: CandidateTwoAction) => {
    if (action.type === "navigate") {
      if (action.path === DOORBELL_FARM_PATH) {
        setActiveInternalPage("farm");
      }
      return;
    }

    if (action.type === "credentials-submit" || action.type === "farm-lookup") {
      setPreset(buildCandidateTwoDemoPreset("registration"));
      return;
    }

    if (action.type === "registration-submit") {
      setPreset(buildCandidateTwoDemoPreset("permit"));
      return;
    }

    if (action.type === "permit-complete") {
      setPreset(buildCandidateTwoDemoPreset("home"));
      return;
    }

    if (action.type === "logout") {
      setPreset(buildCandidateTwoDemoPreset("login"));
    }
  }, []);

  return (
    <div className="live-app">
      <CandidateTwoPreview demo={preset.demo} onAction={handleDemoAction} state={preset.state} />
      {activeInternalPage === "farm" ? (
        <Suspense fallback={null}>
          <FarmPage
            onBack={() => setActiveInternalPage("community")}
            previewData={candidateTwoFarmPreview}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export function App() {
  const demoPreset = resolveCandidateTwoDemoPreset(
    window.location.hostname,
    window.location.search,
  );
  return demoPreset ? <CandidateTwoDemoApp initialPreset={demoPreset} /> : <LiveApp />;
}
