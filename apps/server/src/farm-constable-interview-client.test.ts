import assert from "node:assert/strict";
import test from "node:test";
import {
  FarmConstableInterviewClient,
  FarmConstableInterviewContractUnavailableError,
} from "./farm-constable-interview-client.js";

const FARM_DOORPLATE = "ABC234";
const FARM_HUMAN_KEY = "private-constable-human-key";
const ACCOUNT_ID = "account-examiner";
const RESIDENT_ID = "resident-examiner";
const INTERVIEW_ID = "interview-1";
const SCHEDULED_AT = 1_788_000_000_000;
const SCHEDULED_AT_ISO = new Date(SCHEDULED_AT).toISOString();

const INTERVIEW = {
  interview_id: INTERVIEW_ID,
  attempt_id: "attempt-1",
  candidate_resident_id: "resident-candidate",
  scheduled_at: SCHEDULED_AT_ISO,
  status: "panel_ready" as const,
  signup_open_at: new Date(SCHEDULED_AT - 43_200_000).toISOString(),
  attendance_confirmation_open_at: new Date(SCHEDULED_AT - 1_800_000).toISOString(),
  score_count: 0,
  self: {
    signed_up: true,
    signup_order: 1,
    tentative: true,
    attendance_confirmed: true,
    selected: true,
    score_submitted: false,
    signup_eligible: false,
  },
  interview_material: {
    bank_version: "constable-v1",
    paper: { version: "paper-1", questions: [] },
    fact_material: { version: "facts-1", facts: [] },
    scoring_standard: {
      version: "standard-1",
      dimensions: ["facts", "restraint", "procedure", "explanation"],
      minimumDimensionAverage: 3,
      minimumTotalAverage: 16,
    },
  },
  public_notice: null,
};

const RESPONSE = {
  subject: {
    farm_doorplate: FARM_DOORPLATE,
    account_id: ACCOUNT_ID,
    resident_id: RESIDENT_ID,
  },
  data: { interviews: [INTERVIEW] },
  server_time: SCHEDULED_AT_ISO,
};

function createClient(fetchImplementation: typeof fetch): FarmConstableInterviewClient {
  return new FarmConstableInterviewClient({
    apiBaseUrl: "https://farm.example/farm/",
    requestTimeoutMs: 1_000,
    serviceToken: "service-secret",
    fetchImplementation,
  });
}

test("constable interview client sends server-derived account and optional interview filter", async () => {
  const calls: Array<{ body: string; headers: Headers; method: string | undefined; url: string }> =
    [];
  const client = createClient(async (input, init) => {
    calls.push({
      body: String(init?.body),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: String(input),
    });
    return Response.json(RESPONSE);
  });

  assert.deepEqual(
    await client.readConstableInterview({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      accountId: ACCOUNT_ID,
      residentId: RESIDENT_ID,
      interviewId: INTERVIEW_ID,
    }),
    RESPONSE,
  );
  assert.deepEqual(
    calls.map(({ body, headers, method, url }) => ({
      body,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method,
      url,
    })),
    [
      {
        body: JSON.stringify({
          farm_human_key: FARM_HUMAN_KEY,
          expected_farm_doorplate: FARM_DOORPLATE,
          account_id: ACCOUNT_ID,
          resident_id: RESIDENT_ID,
          interview_id: INTERVIEW_ID,
        }),
        authorization: "Bearer service-secret",
        contentType: "application/json",
        method: "POST",
        url: "https://farm.example/farm/internal/doorbell/human/constable/interview/read",
      },
    ],
  );
});

test("constable interview action client sends the server-derived resident and no eligibility text", async () => {
  const bodies: string[] = [];
  const client = createClient(async (_input, init) => {
    bodies.push(String(init?.body));
    return Response.json(RESPONSE);
  });

  await client.executeConstableInterviewAction({
    action: "score",
    farmDoorplate: FARM_DOORPLATE,
    farmHumanKey: FARM_HUMAN_KEY,
    accountId: ACCOUNT_ID,
    residentId: RESIDENT_ID,
    interviewId: INTERVIEW_ID,
    facts: 5,
    restraint: 4,
    procedure: 5,
    explanation: 4,
  });

  assert.deepEqual(JSON.parse(bodies[0] ?? "{}"), {
    farm_human_key: FARM_HUMAN_KEY,
    expected_farm_doorplate: FARM_DOORPLATE,
    account_id: ACCOUNT_ID,
    resident_id: RESIDENT_ID,
    interview_id: INTERVIEW_ID,
    action: "score",
    facts: 5,
    restraint: 4,
    procedure: 5,
    explanation: 4,
  });
  assert.equal(Object.hasOwn(JSON.parse(bodies[0] ?? "{}"), "eligibility_reference"), false);
});

test("constable interview client opens public notice with only the server-resolved voter freeze", async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const client = createClient(async (input, init) => {
    calls.push({ body: String(init?.body), url: String(input) });
    return Response.json({
      data: { notice_id: "notice-1" },
      server_time: SCHEDULED_AT_ISO,
    });
  });

  await client.openConstablePublicNotice({
    interviewId: INTERVIEW_ID,
    eligibleVoterResidentIds: ["resident-a", "resident-b"],
  });
  assert.deepEqual(calls, [
    {
      body: JSON.stringify({
        interview_id: INTERVIEW_ID,
        eligible_voter_resident_ids: ["resident-a", "resident-b"],
      }),
      url: "https://farm.example/farm/internal/doorbell/constable/interview/public-notice/open",
    },
  ]);
});

test("constable interview client rejects a selected examiner response without frozen material", async () => {
  const client = createClient(async () =>
    Response.json({
      ...RESPONSE,
      data: { interviews: [{ ...INTERVIEW, interview_material: null }] },
    }),
  );

  await assert.rejects(
    client.readConstableInterview({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      accountId: ACCOUNT_ID,
      residentId: RESIDENT_ID,
      interviewId: INTERVIEW_ID,
    }),
    FarmConstableInterviewContractUnavailableError,
  );
});

test("constable interview client rejects a response for a different bound identity", async () => {
  const client = createClient(async () =>
    Response.json({
      ...RESPONSE,
      subject: { ...RESPONSE.subject, resident_id: "resident-other" },
    }),
  );

  await assert.rejects(
    client.readConstableInterview({
      farmDoorplate: FARM_DOORPLATE,
      farmHumanKey: FARM_HUMAN_KEY,
      accountId: ACCOUNT_ID,
      residentId: RESIDENT_ID,
      interviewId: INTERVIEW_ID,
    }),
    FarmConstableInterviewContractUnavailableError,
  );
});
