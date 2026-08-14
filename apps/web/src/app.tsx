import {
  climateTypeSchema,
  type HumanSettingsSuccess,
  weatherConditionDetails,
} from "@doorbell/protocol";
import { useCallback, useEffect, useState } from "react";
import {
  type AuthIssue,
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
  CandidateTwoPreview,
  type CandidateTwoSharedMemeDetailView,
  type CandidateTwoSharedMemeListView,
  type CandidateTwoViewState,
  resolveCandidateTwoDemoPreset,
} from "./preview/candidate-two-preview";

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

  const { home } = homeSettings.data;
  let weatherSummary = "尚未设置气候";
  if (home.climate_type) {
    weatherSummary = home.weather_state?.condition
      ? weatherConditionDetails[home.weather_state.condition].label
      : "天气正在形成";
  }
  return {
    stage: "ready",
    climateType: home.climate_type,
    environmentDescription: home.environment_description,
    homeName: home.home_name,
    weatherSummary,
  };
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
  };
}

function LiveApp() {
  const [appState, setAppState] = useState<AppState>({ stage: "checking-session" });
  const [showMcpAfterPermit, setShowMcpAfterPermit] = useState(false);
  const [connectorCredentialDelivery, setConnectorCredentialDelivery] =
    useState<CandidateTwoConnectorCredentialDelivery | null>(null);

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

  const handleCandidateAction = useCallback(
    async (action: CandidateTwoAction) => {
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
        setAppState({
          ...appState,
          sharedMemeCreateMessage: null,
          sharedMemeDetail: { stage: "idle" },
          sharedMemes: { stage: "loading" },
        });
        const result = await listSharedMemes();
        setAppState((current) =>
          current.stage === "authenticated"
            ? {
                ...current,
                sharedMemes: result.ok
                  ? { stage: "ready", data: result.data }
                  : { stage: "error", message: sharedMemeIssueMessage(result.issue) },
              }
            : current,
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

        const authenticatedBeforeLogout = appState;
        setAppState({ ...appState, issue: null, pendingLogout: true });
        const result = await deleteHumanSession();
        if (result.ok || result.issue.code === "authentication_required") {
          setConnectorCredentialDelivery(null);
          setShowMcpAfterPermit(false);
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
    [appState],
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
    </div>
  );
}

function CandidateTwoDemoApp({ initialPreset }: { initialPreset: CandidateTwoDemoPreset }) {
  const [preset, setPreset] = useState(initialPreset);

  const handleDemoAction = useCallback((action: CandidateTwoAction) => {
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
    <CandidateTwoPreview demo={preset.demo} onAction={handleDemoAction} state={preset.state} />
  );
}

export function App() {
  const demoPreset = resolveCandidateTwoDemoPreset(
    window.location.hostname,
    window.location.search,
  );
  return demoPreset ? <CandidateTwoDemoApp initialPreset={demoPreset} /> : <LiveApp />;
}
