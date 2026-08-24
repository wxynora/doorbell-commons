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
  type ConnectorControlIssue,
  deleteHumanSession,
  getCurrentHumanSession,
  getHumanSettings,
  type HumanIdentity,
  issueConnectorCredential,
  revokeConnectorCredential,
  updateHumanSettings,
} from "./auth/auth-client";
import { authIssueMessage } from "./auth/auth-errors";
import {
  type BoundGlimmerRead,
  type BoundTogetherRead,
  getBoundGlimmer,
  getBoundTogether,
  type LingyeIssue,
  lingyeIssueMessage,
} from "./auth/lingye-client";
import {
  addSharedMeme,
  getSharedMeme,
  listSharedMemes,
  sharedMemeIssueMessage,
} from "./auth/shared-meme-client";
import { AuthScreen, SessionCheckingScreen } from "./components/auth-screen";
import { McpAccessPage } from "./components/mcp-access-panel";
import { ResidencePermitTransition } from "./components/residence-permit-transition";
import {
  buildCandidateTwoDemoPreset,
  type CandidateTwoAction,
  type CandidateTwoConnectorCredentialDelivery,
  type CandidateTwoConnectorSettingsView,
  type CandidateTwoDemoPreset,
  type CandidateTwoHomeSettingsView,
  type CandidateTwoIdentityView,
  type CandidateTwoLingyeReadState,
  CandidateTwoPreview,
  type CandidateTwoSharedMemeDetailView,
  type CandidateTwoSharedMemeListView,
  type CandidateTwoViewState,
  resolveCandidateTwoDemoPreset,
} from "./preview/candidate-two-preview";

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
    season: { name: "夏" },
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

type ConnectorSettingsState =
  | { stage: "loading" }
  | { stage: "error"; issue: AuthIssue }
  | Extract<CandidateTwoConnectorSettingsView, { stage: "ready" }>;

type HomeSettingsState =
  | { stage: "loading" }
  | { stage: "error"; issue: AuthIssue }
  | { stage: "ready"; data: HumanSettingsSuccess };

type AppState =
  | { stage: "checking-session" }
  | { stage: "anonymous"; issue: AuthIssue | null; pending: boolean }
  | { stage: "issuing-permit"; identity: HumanIdentity }
  | {
      stage: "authenticated";
      connectorControlIssue: ConnectorControlIssue | null;
      connectorControlPending: boolean;
      connectorSettings: ConnectorSettingsState;
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
        together: CandidateTwoLingyeReadState<BoundTogetherRead>;
      };
    };

function identityView(identity: HumanIdentity): CandidateTwoIdentityView {
  return {
    farmDoorplate: identity.farmBinding.farm_doorplate,
    homeName: identity.home.home_name,
    qqNumber: identity.account.qq_number,
    residentName: identity.resident.resident_name,
  };
}

function connectorControlIssueMessage(issue: ConnectorControlIssue) {
  if (issue.code === "connector_not_configured") {
    return "当前尚未配置 Connector 凭据。";
  }
  return authIssueMessage(issue as AuthIssue);
}

function connectorSettingsView(
  connectorSettings: ConnectorSettingsState,
): CandidateTwoConnectorSettingsView {
  if (connectorSettings.stage === "error") {
    return {
      stage: "error",
      message: authIssueMessage(connectorSettings.issue),
    };
  }
  return connectorSettings;
}

function homeSettingsView(homeSettings: HomeSettingsState): CandidateTwoHomeSettingsView {
  if (homeSettings.stage === "error") {
    return { stage: "error", message: authIssueMessage(homeSettings.issue) };
  }
  if (homeSettings.stage === "loading") {
    return homeSettings;
  }

  const { community_connection_preferences, home, notification_preferences } = homeSettings.data;
  let weatherSummary = "尚未设置气候";
  if (home.climate_type) {
    weatherSummary = home.weather_state?.condition
      ? weatherConditionDetails[home.weather_state.condition].label
      : "天气正在形成";
  }
  return {
    stage: "ready",
    activityInvitationsEnabled: notification_preferences.activity_invitations_enabled ?? true,
    allowActivityRoomWarmup: community_connection_preferences.allow_activity_room_warmup ?? true,
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
    visitRequestsAndInvitationsEnabled:
      notification_preferences.visit_requests_and_invitations_enabled ?? true,
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
    connectorControlIssue: null,
    connectorControlPending: false,
    connectorSettings: { stage: "loading" },
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
      together: { stage: "idle" },
    },
  };
}

function authenticatedViewState(
  appState: Extract<AppState, { stage: "authenticated" }>,
): CandidateTwoViewState {
  return {
    stage: "authenticated",
    connectorControlIssueMessage: appState.connectorControlIssue
      ? connectorControlIssueMessage(appState.connectorControlIssue)
      : null,
    connectorControlPending: appState.connectorControlPending,
    connectorSettings: connectorSettingsView(appState.connectorSettings),
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
  };
}

function LiveApp() {
  const [appState, setAppState] = useState<AppState>({ stage: "checking-session" });
  const [activeInternalPage, setActiveInternalPage] = useState<"community" | "farm">("community");
  const [showMcpAfterPermit, setShowMcpAfterPermit] = useState(false);
  const [connectorCredentialDelivery, setConnectorCredentialDelivery] =
    useState<CandidateTwoConnectorCredentialDelivery | null>(null);
  const lingyeRequestIdsRef = useRef({ glimmer: 0, together: 0 });
  const lingyeControllersRef = useRef<{
    glimmer: AbortController | null;
    together: AbortController | null;
  }>({ glimmer: null, together: null });

  useEffect(
    () => () => {
      lingyeControllersRef.current.glimmer?.abort();
      lingyeControllersRef.current.together?.abort();
    },
    [],
  );

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
    appState.stage === "authenticated"
      ? appState.connectorSettings.stage === "loading" || appState.homeSettings.stage === "loading"
      : false;

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
        if (
          current.stage !== "authenticated" ||
          (current.connectorSettings.stage !== "loading" &&
            current.homeSettings.stage !== "loading")
        ) {
          return current;
        }
        return {
          ...current,
          connectorSettings: result.ok
            ? { stage: "ready", status: result.data.connection_status.connector }
            : { stage: "error", issue: result.issue },
          homeSettings: result.ok
            ? { stage: "ready", data: result.data }
            : { stage: "error", issue: result.issue },
        };
      });
    });

    return () => controller.abort();
  }, [settingsLoading]);

  const loadLingye = useCallback(
    (kind: "glimmer" | "together") => {
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
        if (action.path === "/api/farm/ui" && appState.stage === "authenticated") {
          setActiveInternalPage("farm");
        }
        return;
      }

      if (action.type === "lingye-glimmer-open" || action.type === "lingye-together-open") {
        loadLingye(action.type === "lingye-glimmer-open" ? "glimmer" : "together");
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
        action.type === "notification-preference-save" ||
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

      if (action.type === "connector-credential-issue") {
        if (appState.stage !== "authenticated" || appState.connectorControlPending) {
          return;
        }

        setAppState({
          ...appState,
          connectorControlIssue: null,
          connectorControlPending: true,
        });
        const result = await issueConnectorCredential();
        if (result.ok) {
          setConnectorCredentialDelivery({
            connectorCredential: result.data.connector_credential,
            deliveryId: result.data.credential_id,
          });
          setAppState((current) =>
            current.stage === "authenticated"
              ? {
                  ...current,
                  connectorControlIssue: null,
                  connectorControlPending: false,
                  connectorSettings: { stage: "loading" },
                }
              : current,
          );
          return;
        }

        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                connectorControlIssue: result.issue,
                connectorControlPending: false,
              }
            : current,
        );
        return;
      }

      if (action.type === "connector-credential-revoke") {
        if (appState.stage !== "authenticated" || appState.connectorControlPending) {
          return;
        }

        setAppState({
          ...appState,
          connectorControlIssue: null,
          connectorControlPending: true,
        });
        const result = await revokeConnectorCredential();
        if (result.ok) {
          setConnectorCredentialDelivery(null);
          setAppState((current) =>
            current.stage === "authenticated"
              ? {
                  ...current,
                  connectorControlIssue: null,
                  connectorControlPending: false,
                  connectorSettings: { stage: "loading" },
                }
              : current,
          );
          return;
        }

        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                connectorControlIssue: result.issue,
                connectorControlPending: false,
              }
            : current,
        );
        return;
      }

      if (action.type === "logout") {
        if (appState.stage !== "authenticated") {
          return;
        }

        lingyeControllersRef.current.glimmer?.abort();
        lingyeControllersRef.current.together?.abort();
        lingyeRequestIdsRef.current.glimmer += 1;
        lingyeRequestIdsRef.current.together += 1;
        const authenticatedBeforeLogout = appState;
        setAppState({ ...appState, issue: null, pendingLogout: true });
        const result = await deleteHumanSession();
        if (result.ok || result.issue.code === "authentication_required") {
          setConnectorCredentialDelivery(null);
          setShowMcpAfterPermit(false);
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
    [appState, loadLingye],
  );

  const handleConnectorCredentialDelivered = useCallback((deliveryId: string) => {
    setConnectorCredentialDelivery((current) =>
      current?.deliveryId === deliveryId ? null : current,
    );
  }, []);

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

  if (appState.stage === "authenticated" && showMcpAfterPermit) {
    return <McpAccessPage onComplete={() => setShowMcpAfterPermit(false)} />;
  }

  return (
    <div className="live-app">
      <CandidateTwoPreview
        connectorCredentialDelivery={connectorCredentialDelivery}
        onAction={handleCandidateAction}
        onConnectorCredentialDelivered={handleConnectorCredentialDelivered}
        state={authenticatedViewState(appState)}
      />
      {activeInternalPage === "farm" ? (
        <Suspense fallback={null}>
          <FarmPage onBack={() => setActiveInternalPage("community")} />
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
      if (action.path === "/api/farm/ui") {
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
