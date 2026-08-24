/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  claimMcpAccess,
  createHumanSession,
  deleteHumanSession,
  type FrontendFetcher,
  getBoundFarmField,
  getCurrentHumanSession,
  getHumanSettings,
  getMcpAccessStatus,
  harvestBoundFarmField,
  issueConnectorCredential,
  issueMcpCredential,
  lookupFarm,
  revokeConnectorCredential,
  revokeMcpCredential,
  updateHumanSettings,
} from "./auth-client";
import { AUTH_ISSUE_MESSAGES } from "./auth-errors";

const IDENTITY = {
  account: {
    account_id: "11111111-1111-4111-8111-111111111111",
    qq_number: "123456789",
    created_at: "2026-08-02T00:00:00.000Z",
    membership_status: "active" as const,
  },
  resident: {
    resident_id: "22222222-2222-4222-8222-222222222222",
    resident_name: "小渡",
  },
  home: {
    home_id: "33333333-3333-4333-8333-333333333333",
    home_name: "渡的小屋",
  },
  farm_binding: { farm_doorplate: "3ET3FE" },
};

const SETTINGS = {
  connection_status: {
    connector: { status: "online" as const, last_online_at: "2026-08-12T02:03:04.000Z" },
    wake_bridge: { status: "online" as const, last_connected_at: "2026-08-12T02:03:04.000Z" },
  },
  home: {
    home_name: "渡的小屋",
    environment_description: null,
    climate_type: null,
    weather_state: null,
  },
  notification_preferences: {
    pause_all_wakeups: null,
    visit_requests_and_invitations_enabled: null,
    activity_invitations_enabled: null,
    important_system_notifications_enabled: null,
  },
  community_connection_preferences: {
    default_connection_duration_minutes: 5,
    initial_recent_activity_count: null,
    chat_mode: null,
    allow_activity_room_warmup: null,
  },
};

const FARM_FIELD = {
  data: {
    farm: {
      farm_doorplate: "3ET3FE",
      farm_name: "渡的小农场",
      welcome_message: "今天也慢慢来。",
      equipped_title: { title_id: "title-sprout", name: "新芽守望者" },
    },
    balance: { farm_coins: 0 },
    season: { name: "夏" },
    land: { tier: 2, name: "沃土" },
    plots: [
      {
        plot_id: 1,
        state: "empty" as const,
        seed_type: null,
        watered: 0,
        progress: null,
        matures_at: null,
        identity_state: "empty" as const,
        crop_identity: null,
      },
      {
        plot_id: 2,
        state: "growing" as const,
        seed_type: "common" as const,
        watered: 2,
        progress: { current: 3, total: 8 },
        matures_at: "2026-08-23T08:30:00.000Z",
        identity_state: "hidden" as const,
        crop_identity: null,
      },
    ],
    harvest_assist: {
      daily_limit: 3,
      remaining: 2,
      mature_plot_count: 0,
      can_assist: false,
      reset_at: "2026-08-24T16:00:00.000Z",
    },
  },
  revision: "field-v1:test",
  server_time: "2026-08-23T08:00:00.000Z",
};

const FARM_HARVEST_ASSIST = {
  data: {
    result: {
      receipt_id: "11111111-2222-4333-8444-555555555555",
      harvested_count: 1,
      farm_coins_gained: 45,
      silver_gained: 0,
      harvests: [
        {
          plot_id: 2,
          crop: {
            crop_id: "tomato",
            name: "番茄",
            category: "common" as const,
            rarity: "N" as const,
          },
          quality: { id: "normal", name: "普通" },
          value: 45,
          currency: "gold" as const,
          is_new: true,
          material_drop: null,
          potion_drop: null,
          bonus_value: 0,
        },
      ],
      season_event: null,
      new_titles: [],
    },
    resource: {
      ...FARM_FIELD.data,
      balance: { farm_coins: 45 },
      plots: [FARM_FIELD.data.plots[0]],
      harvest_assist: {
        ...FARM_FIELD.data.harvest_assist,
        remaining: 1,
        mature_plot_count: 0,
        can_assist: false,
      },
    },
  },
  revision: "field-v1:after-harvest",
  server_time: "2026-08-23T08:01:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("current session uses the GET contract and returns only server identity", async () => {
  let observedUrl = "";
  let observedMethod = "";
  const fetcher: FrontendFetcher = async (url, init) => {
    observedUrl = url;
    observedMethod = init?.method ?? "";
    return jsonResponse({ authenticated: true, ...IDENTITY });
  };

  const result = await getCurrentHumanSession({ fetcher });

  assert.equal(observedUrl, "/api/auth/session");
  assert.equal(observedMethod, "GET");
  assert.deepEqual(result, {
    ok: true,
    identity: {
      account: IDENTITY.account,
      resident: IDENTITY.resident,
      home: IDENTITY.home,
      farmBinding: IDENTITY.farm_binding,
    },
    accountCreated: null,
  });
});

test("bound farm field uses the no-parameter same-origin GET contract", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const result = await getBoundFarmField({
    fetcher: async (url, init) => {
      observedUrl = url;
      observedInit = init;
      return jsonResponse(FARM_FIELD);
    },
  });

  assert.equal(observedUrl, "/api/farm/field");
  assert.deepEqual(observedInit, { credentials: "same-origin", method: "GET" });
  assert.deepEqual(result, { ok: true, data: FARM_FIELD });
});

test("bound farm field keeps binding, contract and service errors distinct", async () => {
  const credentialInvalid = await getBoundFarmField({
    fetcher: async () =>
      jsonResponse({ error: { code: "farm_credential_invalid", message: "binding changed" } }, 409),
  });
  const contractUnavailable = await getBoundFarmField({
    fetcher: async () =>
      jsonResponse(
        { error: { code: "upstream_contract_unavailable", message: "field contract changed" } },
        502,
      ),
  });
  const unavailable = await getBoundFarmField({
    fetcher: async () =>
      jsonResponse(
        { error: { code: "farm_unavailable", message: "The farm could not be queried" } },
        503,
      ),
  });
  const malformed = await getBoundFarmField({
    fetcher: async () => jsonResponse({ ...FARM_FIELD, revision: "" }),
  });

  assert.deepEqual(credentialInvalid, {
    ok: false,
    issue: { code: "farm_credential_invalid", serverMessage: "binding changed" },
  });
  assert.deepEqual(contractUnavailable, {
    ok: false,
    issue: { code: "upstream_contract_unavailable", serverMessage: "field contract changed" },
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "farm_unavailable", serverMessage: "The farm could not be queried" },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});

test("harvest assist sends only an empty body, idempotency key, and the quoted field revision", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const result = await harvestBoundFarmField(
    {
      expectedRevision: FARM_FIELD.revision,
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
    },
    {
      fetcher: async (url, init) => {
        observedUrl = url;
        observedInit = init;
        return jsonResponse(FARM_HARVEST_ASSIST);
      },
    },
  );

  assert.equal(observedUrl, "/api/farm/field/harvest-assists");
  assert.deepEqual(observedInit, {
    body: JSON.stringify({}),
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "11111111-2222-4333-8444-555555555555",
      "if-match": `"${FARM_FIELD.revision}"`,
    },
    method: "POST",
  });
  assert.deepEqual(result, { ok: true, data: FARM_HARVEST_ASSIST });
  assert.equal(JSON.stringify(observedInit).includes("farm_human_key"), false);
  assert.equal(JSON.stringify(observedInit).includes("farm_doorplate"), false);
  assert.equal(JSON.stringify(observedInit).includes("plot_id"), false);
});

test("harvest assist preserves a conflict revision and rejects malformed success", async () => {
  const conflict = await harvestBoundFarmField(
    {
      expectedRevision: FARM_FIELD.revision,
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
    },
    {
      fetcher: async () =>
        jsonResponse(
          {
            error: {
              code: "state_conflict",
              message: "field changed",
              current_revision: "field-v1:newer",
            },
          },
          409,
        ),
    },
  );
  const malformed = await harvestBoundFarmField(
    {
      expectedRevision: FARM_FIELD.revision,
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
    },
    {
      fetcher: async () =>
        jsonResponse({
          ...FARM_HARVEST_ASSIST,
          data: {
            ...FARM_HARVEST_ASSIST.data,
            result: { ...FARM_HARVEST_ASSIST.data.result, harvested_count: 2 },
          },
        }),
    },
  );

  assert.deepEqual(conflict, {
    ok: false,
    issue: {
      code: "state_conflict",
      currentRevision: "field-v1:newer",
      serverMessage: "field changed",
    },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: {
      code: "unexpected_response",
      currentRevision: null,
      serverMessage: null,
    },
  });
});

test("harvest assist reports an unknown network outcome without changing the idempotency key", async () => {
  const input = {
    expectedRevision: FARM_FIELD.revision,
    idempotencyKey: "11111111-2222-4333-8444-555555555555",
  };
  const observedInputs: (typeof input)[] = [];
  const call = () => {
    observedInputs.push(input);
    return harvestBoundFarmField(input, {
      fetcher: async () => {
        throw new Error("connection closed");
      },
    });
  };

  assert.deepEqual(await call(), {
    ok: false,
    issue: {
      code: "network_unavailable",
      currentRevision: null,
      serverMessage: null,
    },
  });
  assert.deepEqual(await call(), {
    ok: false,
    issue: {
      code: "network_unavailable",
      currentRevision: null,
      serverMessage: null,
    },
  });
  assert.equal(observedInputs[0]?.idempotencyKey, observedInputs[1]?.idempotencyKey);
});

test("returning login sends exactly QQ and password", async () => {
  let submittedBody: unknown;
  const fetcher: FrontendFetcher = async (_url, init) => {
    submittedBody = JSON.parse(String(init?.body));
    return jsonResponse({ authenticated: true, account_created: false, ...IDENTITY });
  };

  const result = await createHumanSession(
    { qq_number: "123456789", password: "doorbell password" },
    fetcher,
  );

  assert.deepEqual(submittedBody, {
    qq_number: "123456789",
    password: "doorbell password",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.accountCreated, false);
  }
});

test("profile completion sends the confirmed farm name with all required fields", async () => {
  let submittedBody: unknown;
  let submittedUrl = "";
  const fetcher: FrontendFetcher = async (url, init) => {
    submittedUrl = url;
    submittedBody = JSON.parse(String(init?.body));
    return jsonResponse({ authenticated: true, account_created: true, ...IDENTITY });
  };
  const input = {
    qq_number: "123456789",
    registration_code: "DB-2345-6789",
    password: "doorbell password",
    resident_name: "小渡",
    home_name: "渡的小屋",
    farm_doorplate: "3ET3FE",
    farm_human_url: "https://farm.example/farm/ui/private-farm-key",
    confirmed_farm_name: "西红柿农场",
  } as const;

  const result = await createHumanSession(input, fetcher);

  assert.equal(submittedUrl, "/api/auth/session");
  assert.equal(submittedUrl.includes(input.farm_human_url), false);
  assert.deepEqual(submittedBody, input);
  assert.equal(result.ok, true);
});

test("logout deletes only the current same-origin browser session", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const result = await deleteHumanSession(async (url, init) => {
    observedUrl = url;
    observedInit = init;
    return jsonResponse({ logged_out: true });
  });

  assert.equal(observedUrl, "/api/auth/session");
  assert.deepEqual(observedInit, {
    credentials: "same-origin",
    method: "DELETE",
  });
  assert.deepEqual(result, { ok: true, data: { logged_out: true } });
});

test("logout preserves the current authentication error contract", async () => {
  const result = await deleteHumanSession(async () =>
    jsonResponse({ error: { code: "authentication_required", message: "session expired" } }, 401),
  );

  assert.deepEqual(result, {
    ok: false,
    issue: { code: "authentication_required", serverMessage: "session expired" },
  });
});

test("farm lookup keeps not-found and unavailable as different contract errors", async () => {
  const notFound = await lookupFarm({ farm_doorplate: "3ET3FE" }, async () =>
    jsonResponse({ error: { code: "farm_not_found", message: "farm does not exist" } }, 404),
  );
  const unavailable = await lookupFarm({ farm_doorplate: "3ET3FE" }, async () =>
    jsonResponse({ error: { code: "farm_unavailable", message: "farm service unavailable" } }, 503),
  );

  assert.deepEqual(notFound, {
    ok: false,
    issue: { code: "farm_not_found", serverMessage: "farm does not exist" },
  });
  assert.deepEqual(unavailable, {
    ok: false,
    issue: { code: "farm_unavailable", serverMessage: "farm service unavailable" },
  });
  assert.notEqual(AUTH_ISSUE_MESSAGES.farm_not_found, AUTH_ISSUE_MESSAGES.farm_unavailable);
});

test("profile-required remains a distinct state and malformed success is rejected", async () => {
  const profileRequired = await createHumanSession(
    { qq_number: "123456789", registration_code: "DB-2345-6789" },
    async () =>
      jsonResponse(
        {
          error: {
            code: "registration_profile_required",
            message: "profile required",
          },
        },
        409,
      ),
  );
  const malformed = await getCurrentHumanSession({
    fetcher: async () => jsonResponse({ authenticated: true }),
  });

  assert.deepEqual(profileRequired, {
    ok: false,
    issue: { code: "registration_profile_required", serverMessage: "profile required" },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});

test("every first-registration backend error has explicit frontend copy", () => {
  const backendCodes = [
    "invalid_request",
    "invalid_credentials",
    "invalid_registration_code",
    "account_already_registered",
    "qq_not_group_member",
    "onebot_unavailable",
    "authentication_required",
    "farm_not_found",
    "farm_unavailable",
    "farm_confirmation_mismatch",
    "invalid_farm_human_url",
    "invalid_farm_human_key",
    "farm_human_key_mismatch",
    "upstream_contract_unavailable",
    "registration_profile_required",
    "registration_profile_mismatch",
    "farm_already_bound",
  ] as const;

  for (const code of backendCodes) {
    assert.ok((AUTH_ISSUE_MESSAGES[code] ?? "").length > 0, `missing frontend copy for ${code}`);
  }
});

test("settings restoration uses the authenticated GET contract and parses Connector status", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const result = await getHumanSettings({
    fetcher: async (url, init) => {
      observedUrl = url;
      observedInit = init;
      return jsonResponse(SETTINGS);
    },
  });

  assert.equal(observedUrl, "/api/settings");
  assert.deepEqual(observedInit, { credentials: "same-origin", method: "GET" });
  assert.deepEqual(result, { ok: true, data: SETTINGS });
});

test("settings restoration preserves all three Connector states and nullable last-online time", async () => {
  const cases = [
    { status: "not_configured" as const, last_online_at: null },
    { status: "offline" as const, last_online_at: "2026-08-11T01:02:03.000Z" },
    { status: "online" as const, last_online_at: "2026-08-12T02:03:04.000Z" },
  ];

  for (const connector of cases) {
    const result = await getHumanSettings({
      fetcher: async () =>
        jsonResponse({
          ...SETTINGS,
          connection_status: { ...SETTINGS.connection_status, connector },
        }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.connection_status.connector, connector);
    }
  }
});

test("settings update sends only the requested home patch and parses the saved state", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const updatedSettings = {
    ...SETTINGS,
    home: { ...SETTINGS.home, home_name: "海边小屋" },
  };
  const result = await updateHumanSettings(
    { home: { home_name: "海边小屋" } },
    async (url, init) => {
      observedUrl = url;
      observedInit = init;
      return jsonResponse(updatedSettings);
    },
  );

  assert.equal(observedUrl, "/api/settings");
  assert.deepEqual(observedInit, {
    body: JSON.stringify({ home: { home_name: "海边小屋" } }),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  assert.deepEqual(result, { ok: true, data: updatedSettings });
});

test("settings update sends exact notification and community preference patches", async () => {
  const observedBodies: unknown[] = [];
  const fetcher: FrontendFetcher = async (url, init) => {
    assert.equal(url, "/api/settings");
    assert.equal(init?.method, "PATCH");
    observedBodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(SETTINGS);
  };

  const notificationResult = await updateHumanSettings(
    { notification_preferences: { pause_all_wakeups: true } },
    fetcher,
  );
  const communityResult = await updateHumanSettings(
    {
      community_connection_preferences: {
        initial_recent_activity_count: 12,
      },
    },
    fetcher,
  );

  assert.equal(notificationResult.ok, true);
  assert.equal(communityResult.ok, true);
  assert.deepEqual(observedBodies, [
    { notification_preferences: { pause_all_wakeups: true } },
    { community_connection_preferences: { initial_recent_activity_count: 12 } },
  ]);
});

test("Connector credential issue and revoke send only an empty object body", async () => {
  const calls: { init: RequestInit | undefined; url: string }[] = [];
  const credential = `dbc_${"A".repeat(43)}`;
  const issueResult = await issueConnectorCredential(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      configured: true,
      connector_credential: credential,
      credential_id: "44444444-4444-4444-8444-444444444444",
      issued_at: "2026-08-12T02:03:04.000Z",
      replaced_previous: true,
    });
  });
  const revokeResult = await revokeConnectorCredential(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ revoked: true });
  });

  assert.equal(issueResult.ok, true);
  assert.deepEqual(revokeResult, { ok: true, data: { revoked: true } });
  assert.deepEqual(
    calls.map(({ init, url }) => ({
      body: init?.body,
      credentials: init?.credentials,
      method: init?.method,
      url,
    })),
    [
      {
        body: "{}",
        credentials: "same-origin",
        method: "POST",
        url: "/api/connector/credential",
      },
      {
        body: "{}",
        credentials: "same-origin",
        method: "DELETE",
        url: "/api/connector/credential",
      },
    ],
  );
});

test("Connector control errors remain distinct and malformed success never becomes success", async () => {
  const notConfigured = await revokeConnectorCredential(async () =>
    jsonResponse(
      { error: { code: "connector_not_configured", message: "no active credential" } },
      404,
    ),
  );
  const malformed = await issueConnectorCredential(async () =>
    jsonResponse({ configured: true, connector_credential: "not-a-real-credential" }),
  );

  assert.deepEqual(notConfigured, {
    ok: false,
    issue: { code: "connector_not_configured", serverMessage: "no active credential" },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});

test("MCP access status, claim, issue, and revoke use only the fixed same-origin routes", async () => {
  const calls: { init: RequestInit | undefined; url: string }[] = [];
  const endpoint = "https://doorbell.example/mcp";
  const migrationId = "55555555-5555-4555-8555-555555555555";
  const credentialId = "66666666-6666-4666-8666-666666666666";
  const requestedAt = "2026-08-13T12:00:00.000Z";
  const revokedAt = "2026-08-13T12:00:01.000Z";
  const issuedAt = "2026-08-13T12:00:02.000Z";
  const credential = `dbm_${"A".repeat(43)}`;
  const farmRevokedStatus = {
    mcp_endpoint: endpoint,
    authorization_scheme: "Bearer" as const,
    migration_status: "farm_revoked" as const,
    credential_status: "not_issued" as const,
    migration_id: migrationId,
    migration_requested_at: requestedAt,
    farm_revoked_at: revokedAt,
    credential_id: null,
    credential_issued_at: null,
    credential_revoked_at: null,
  };
  const responses = [
    {
      mcp_endpoint: endpoint,
      authorization_scheme: "Bearer",
      migration_status: "not_started",
      credential_status: "not_issued",
      migration_id: null,
      migration_requested_at: null,
      farm_revoked_at: null,
      credential_id: null,
      credential_issued_at: null,
      credential_revoked_at: null,
    },
    farmRevokedStatus,
    {
      mcp_endpoint: endpoint,
      authorization_scheme: "Bearer",
      mcp_credential: credential,
      credential_id: credentialId,
      credential_issued_at: issuedAt,
      replaced_previous: false,
    },
    {
      ...farmRevokedStatus,
      credential_status: "revoked",
      credential_id: credentialId,
      credential_issued_at: issuedAt,
      credential_revoked_at: "2026-08-13T12:00:03.000Z",
    },
  ];
  const fetcher: FrontendFetcher = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(responses.shift());
  };

  assert.equal((await getMcpAccessStatus({ fetcher })).ok, true);
  assert.equal((await claimMcpAccess(fetcher)).ok, true);
  const issued = await issueMcpCredential(fetcher);
  assert.equal(issued.ok, true);
  if (issued.ok) {
    assert.equal(issued.data.mcp_credential, credential);
  }
  assert.equal((await revokeMcpCredential(fetcher)).ok, true);
  assert.deepEqual(
    calls.map(({ init, url }) => ({
      body: init?.body,
      credentials: init?.credentials,
      method: init?.method,
      url,
    })),
    [
      {
        body: undefined,
        credentials: "same-origin",
        method: "GET",
        url: "/api/mcp-access",
      },
      {
        body: "{}",
        credentials: "same-origin",
        method: "POST",
        url: "/api/mcp-access/claim",
      },
      {
        body: "{}",
        credentials: "same-origin",
        method: "POST",
        url: "/api/mcp-access/credential",
      },
      {
        body: "{}",
        credentials: "same-origin",
        method: "DELETE",
        url: "/api/mcp-access/credential",
      },
    ],
  );
});

test("MCP access keeps approved backend errors distinct and rejects malformed success", async () => {
  const unavailable = await claimMcpAccess(async () =>
    jsonResponse(
      {
        error: {
          code: "mcp_runtime_unavailable",
          message: "The Doorbell MCP runtime is not available",
        },
      },
      503,
    ),
  );
  const malformed = await issueMcpCredential(async () =>
    jsonResponse({ mcp_endpoint: "https://doorbell.example/mcp" }),
  );

  assert.deepEqual(unavailable, {
    ok: false,
    issue: {
      code: "mcp_runtime_unavailable",
      serverMessage: "The Doorbell MCP runtime is not available",
    },
  });
  assert.deepEqual(malformed, {
    ok: false,
    issue: { code: "unexpected_response", serverMessage: null },
  });
});
