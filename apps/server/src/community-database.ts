import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ClimateType,
  climateTypeValues,
  type MailboxCategory,
  mailboxCategoryValues,
  type WeatherCondition,
  type WeatherSeasonPhase,
  weatherConditionValues,
  weatherSeasonPhaseValues,
} from "@doorbell/protocol";
import Database from "better-sqlite3";

const REGISTRATION_CODE_WINDOW_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_CONNECTION_DURATION_MINUTES = 5;
export const COMMUNITY_DATABASE_SCHEMA_VERSION = 1;

export interface RegistrationCodeRecord {
  code: string;
  generatedAt: number;
  expiresAt: number;
}

export interface HumanAccountRecord {
  accountId: string;
  qqNumber: string;
  createdAt: number;
  membershipStatus: "active" | "inactive";
}

export interface ResidentRecord {
  residentId: string;
  residentName: string;
}

export interface HomeRecord {
  homeId: string;
  homeName: string;
}

export interface FarmBindingRecord {
  farmDoorplate: string;
  farmHumanKey: string | null;
}

export interface HumanCommunityRecord {
  account: HumanAccountRecord;
  resident: ResidentRecord;
  home: HomeRecord;
  farmBinding: FarmBindingRecord;
}

export interface HumanRegistrationInput {
  residentName: string;
  homeName: string;
  farmDoorplate: string;
  farmHumanKey: string;
  passwordCredential?: string;
  farmCreationId?: string;
}

export interface FarmCreationRequestInput {
  farmName: string;
  aiName: string;
  humanName: string;
}

export interface FarmCreationRequestRecord extends FarmCreationRequestInput {
  creationId: string;
  qqNumber: string;
  requestedAt: number;
}

export interface FarmCreationReceiptInput {
  farmDoorplate: string;
  farmName: string;
  aiName: string;
  humanName: string;
  farmHumanKey: string;
  farmCreatedAt: number;
}

export type HumanSettingsChatMode = "natural" | "proactive" | "listening";

export interface HomeWeatherStateRecord {
  climateType: ClimateType;
  weatherRevision: number;
  seasonPhase: WeatherSeasonPhase | null;
  condition: WeatherCondition | null;
  stateStartedAt: number | null;
  nextTransitionAt: number | null;
  updatedAt: number;
}

export interface HomeWeatherStateUpdate {
  climateType: ClimateType;
  expectedWeatherRevision: number;
  seasonPhase: WeatherSeasonPhase;
  condition: WeatherCondition;
  stateStartedAt: number | null;
  nextTransitionAt: number | null;
}

export interface ConnectorBindingState {
  configured: boolean;
  credentialId: string | null;
  lastConnectedAt: number | null;
  lastOnlineAt: number | null;
}

export interface McpAccessBindingRecord {
  residentId: string;
  migrationId: string;
  farmDoorplate: string;
  migrationRequestedAt: number;
  farmRevokedAt: number | null;
  farmConfirmationId: string | null;
  credentialId: string | null;
  credentialTokenHash: string | null;
  credentialIssuedAt: number | null;
  credentialRevokedAt: number | null;
}

export interface McpCredentialReplacementResult {
  binding: McpAccessBindingRecord;
  replacedPrevious: boolean;
}

export interface AuthenticatedConnectorBinding {
  residentId: string;
  credentialId: string;
}

export interface ConnectorEventRecord {
  residentId: string;
  eventId: string;
  cursor: number;
  eventType: string;
  createdAt: number;
  payload: Record<string, unknown>;
}

export interface ConnectorEventAckResult {
  status: "acked" | "duplicate" | "gap" | "mismatch";
  lastAckedCursor: number;
}

export type MailboxAudience = "human" | "resident";

export interface MailboxAttachmentRecord {
  attachmentType: "farm_reward";
  status: "available" | "claimed";
}

export interface MailboxLetterRecord {
  letterId: string;
  homeId: string;
  category: MailboxCategory;
  title: string;
  body: string;
  createdAt: number;
  isNew: boolean;
  attachment: MailboxAttachmentRecord | null;
}

export interface MailboxLetterDelivery {
  letterId: string;
  homeId: string;
  idempotencyKey: string;
  category: MailboxCategory;
  title: string;
  body: string;
  createdAt: number;
  attachment: MailboxAttachmentRecord | null;
}

export interface MailboxLetterPage {
  letters: MailboxLetterRecord[];
  totalItems: number;
}

export interface HumanSettingsRecord {
  homeId: string;
  residentId: string;
  homeName: string;
  environmentDescription: string | null;
  climateType: ClimateType | null;
  weatherState: HomeWeatherStateRecord | null;
  pauseAllWakeups: boolean | null;
  visitRequestsAndInvitationsEnabled: boolean | null;
  activityInvitationsEnabled: boolean | null;
  importantSystemNotificationsEnabled: boolean | null;
  defaultConnectionDurationMinutes: number;
  initialRecentActivityCount: number | null;
  chatMode: HumanSettingsChatMode | null;
  allowActivityRoomWarmup: boolean | null;
}

export interface HumanSettingsPatch {
  homeName?: string;
  environmentDescription?: string | null;
  climateType?: ClimateType;
  pauseAllWakeups?: boolean | null;
  visitRequestsAndInvitationsEnabled?: boolean | null;
  activityInvitationsEnabled?: boolean | null;
  importantSystemNotificationsEnabled?: boolean | null;
  defaultConnectionDurationMinutes?: number | null;
  initialRecentActivityCount?: number | null;
  chatMode?: HumanSettingsChatMode | null;
  allowActivityRoomWarmup?: boolean | null;
}

export interface CreatedHumanSession {
  community: HumanCommunityRecord;
  accountCreated: boolean;
  token: string;
}

export interface ActiveHumanSessionRecord {
  account: HumanAccountRecord;
  community?: HumanCommunityRecord;
}

export class RegistrationProfileRequiredError extends Error {
  constructor() {
    super("Resident, home, and farm registration fields are required");
    this.name = "RegistrationProfileRequiredError";
  }
}

export class RegistrationProfileMismatchError extends Error {
  constructor() {
    super("Submitted resident, home, or farm fields do not match the existing registration");
    this.name = "RegistrationProfileMismatchError";
  }
}

export class HumanAccountAlreadyRegisteredError extends Error {
  constructor() {
    super("The QQ account already has a complete Doorbell registration");
    this.name = "HumanAccountAlreadyRegisteredError";
  }
}

export class FarmAlreadyBoundError extends Error {
  constructor() {
    super("The farm doorplate is already bound to another human account");
    this.name = "FarmAlreadyBoundError";
  }
}

export class FarmCreationStateConflictError extends Error {
  constructor() {
    super("The farm creation state conflicts with this registration request");
    this.name = "FarmCreationStateConflictError";
  }
}

export class MailboxIdempotencyConflictError extends Error {
  constructor() {
    super("The mailbox idempotency key was already used for different letter content");
    this.name = "MailboxIdempotencyConflictError";
  }
}

export class McpAccessStateConflictError extends Error {
  constructor() {
    super("The stored MCP access state conflicts with the requested transition");
    this.name = "McpAccessStateConflictError";
  }
}

interface RegistrationCodeRow {
  code: string;
  generated_at: number;
  expires_at: number;
}

interface HumanAccountRow {
  account_id: string;
  qq_number: string;
  created_at: number;
  membership_status: "active" | "inactive";
  password_credential?: string | null;
}

interface FarmCreationRequestRow {
  creation_id: string;
  qq_number: string;
  requested_farm_name: string;
  requested_ai_name: string;
  requested_human_name: string;
  requested_at: number;
  farm_doorplate: string | null;
  farm_name: string | null;
  ai_name: string | null;
  human_name: string | null;
  farm_human_key: string | null;
  farm_created_at: number | null;
  completed_at: number | null;
}

interface HumanCommunityRow extends HumanAccountRow {
  resident_id: string;
  resident_name: string;
  home_id: string;
  home_name: string;
  farm_doorplate: string;
  farm_human_key: string | null;
}

interface HumanSettingsRow {
  home_id: string;
  resident_id: string;
  home_name: string;
  environment_description: string | null;
  climate_type: ClimateType | null;
  weather_revision: number | null;
  season_phase: WeatherSeasonPhase | null;
  weather_condition: WeatherCondition | null;
  state_started_at: number | null;
  next_transition_at: number | null;
  weather_updated_at: number | null;
  pause_all_wakeups: number | null;
  visit_requests_and_invitations_enabled: number | null;
  activity_invitations_enabled: number | null;
  important_system_notifications_enabled: number | null;
  default_connection_duration_minutes: number | null;
  initial_recent_activity_count: number | null;
  chat_mode: HumanSettingsChatMode | null;
  allow_activity_room_warmup: number | null;
}

interface ConnectorBindingRow {
  resident_id: string;
  credential_id: string;
  credential_token_hash: string | null;
  credential_revoked_at: number | null;
  last_connected_at: number | null;
  last_online_at: number | null;
}

interface McpAccessBindingRow {
  resident_id: string;
  migration_id: string;
  farm_doorplate: string;
  migration_requested_at: number;
  farm_revoked_at: number | null;
  farm_confirmation_id: string | null;
  credential_id: string | null;
  credential_token_hash: string | null;
  credential_issued_at: number | null;
  credential_revoked_at: number | null;
}

interface ConnectorDeliveryStateRow {
  last_event_cursor: number;
  last_acked_cursor: number;
}

interface ConnectorEventRow {
  resident_id: string;
  event_id: string;
  cursor: number;
  event_type: string;
  created_at: number;
  payload_json: string;
}

interface MailboxLetterRow {
  letter_id: string;
  home_id: string;
  idempotency_key: string;
  category: MailboxCategory;
  title: string;
  body: string;
  attachment_type: "farm_reward" | null;
  attachment_status: "available" | "claimed" | null;
  created_at: number;
  read_at: number | null;
}

export interface CommunityDatabaseOptions {
  generateRegistrationCode?: () => string;
  generateSessionToken?: () => string;
  generateAccountId?: () => string;
  generateResidentId?: () => string;
  generateHomeId?: () => string;
  generateFarmCreationId?: () => string;
}

function generateRegistrationCode(): string {
  const bytes = randomBytes(5);
  let bits = 0n;
  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte);
  }

  let body = "";
  for (let index = 7; index >= 0; index -= 1) {
    const alphabetIndex = Number((bits >> BigInt(index * 5)) & 31n);
    body += REGISTRATION_CODE_ALPHABET[alphabetIndex];
  }
  return `DB-${body.slice(0, 4)}-${body.slice(4)}`;
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function registrationCodesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function makeRegistrationCodeDistinct(candidate: string, previousCode: string): string {
  if (!registrationCodesEqual(candidate, previousCode)) {
    return candidate;
  }

  const finalCharacter = candidate.at(-1);
  const alphabetIndex = finalCharacter ? REGISTRATION_CODE_ALPHABET.indexOf(finalCharacter) : -1;
  if (alphabetIndex === -1) {
    throw new Error("Generated registration code does not use the configured alphabet");
  }

  const replacement =
    REGISTRATION_CODE_ALPHABET[(alphabetIndex + 1) % REGISTRATION_CODE_ALPHABET.length];
  return `${candidate.slice(0, -1)}${replacement}`;
}

function mapAccount(row: HumanAccountRow): HumanAccountRecord {
  return {
    accountId: row.account_id,
    qqNumber: row.qq_number,
    createdAt: row.created_at,
    membershipStatus: row.membership_status,
  };
}

function mapCommunity(row: HumanCommunityRow): HumanCommunityRecord {
  return {
    account: mapAccount(row),
    resident: {
      residentId: row.resident_id,
      residentName: row.resident_name,
    },
    home: {
      homeId: row.home_id,
      homeName: row.home_name,
    },
    farmBinding: {
      farmDoorplate: row.farm_doorplate,
      farmHumanKey: row.farm_human_key,
    },
  };
}

function mapNullableBoolean(value: number | null): boolean | null {
  return value === null ? null : value === 1;
}

function storeNullableBoolean(value: boolean | null): number | null {
  return value === null ? null : value ? 1 : 0;
}

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

function mapHumanSettings(row: HumanSettingsRow): HumanSettingsRecord {
  return {
    homeId: row.home_id,
    residentId: row.resident_id,
    homeName: row.home_name,
    environmentDescription: row.environment_description,
    climateType: row.climate_type,
    weatherState: mapHomeWeatherState(row) ?? null,
    pauseAllWakeups: mapNullableBoolean(row.pause_all_wakeups),
    visitRequestsAndInvitationsEnabled: mapNullableBoolean(
      row.visit_requests_and_invitations_enabled,
    ),
    activityInvitationsEnabled: mapNullableBoolean(row.activity_invitations_enabled),
    importantSystemNotificationsEnabled: mapNullableBoolean(
      row.important_system_notifications_enabled,
    ),
    defaultConnectionDurationMinutes:
      row.default_connection_duration_minutes ?? DEFAULT_CONNECTION_DURATION_MINUTES,
    initialRecentActivityCount: row.initial_recent_activity_count,
    chatMode: row.chat_mode,
    allowActivityRoomWarmup: mapNullableBoolean(row.allow_activity_room_warmup),
  };
}

function mapHomeWeatherState(row: HumanSettingsRow): HomeWeatherStateRecord | undefined {
  if (
    row.climate_type === null ||
    row.weather_revision === null ||
    row.weather_updated_at === null
  ) {
    return undefined;
  }
  return {
    climateType: row.climate_type,
    weatherRevision: row.weather_revision,
    seasonPhase: row.season_phase,
    condition: row.weather_condition,
    stateStartedAt: row.state_started_at,
    nextTransitionAt: row.next_transition_at,
    updatedAt: row.weather_updated_at,
  };
}

function mapConnectorEvent(row: ConnectorEventRow): ConnectorEventRecord {
  const payload = JSON.parse(row.payload_json) as unknown;
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    throw new Error("Stored Connector event payload is invalid");
  }
  return {
    residentId: row.resident_id,
    eventId: row.event_id,
    cursor: row.cursor,
    eventType: row.event_type,
    createdAt: row.created_at,
    payload: payload as Record<string, unknown>,
  };
}

function mapMcpAccessBinding(row: McpAccessBindingRow): McpAccessBindingRecord {
  return {
    residentId: row.resident_id,
    migrationId: row.migration_id,
    farmDoorplate: row.farm_doorplate,
    migrationRequestedAt: row.migration_requested_at,
    farmRevokedAt: row.farm_revoked_at,
    farmConfirmationId: row.farm_confirmation_id,
    credentialId: row.credential_id,
    credentialTokenHash: row.credential_token_hash,
    credentialIssuedAt: row.credential_issued_at,
    credentialRevokedAt: row.credential_revoked_at,
  };
}

function mapMailboxLetter(row: MailboxLetterRow): MailboxLetterRecord {
  return {
    letterId: row.letter_id,
    homeId: row.home_id,
    category: row.category,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    isNew: row.read_at === null,
    attachment:
      row.attachment_type === null || row.attachment_status === null
        ? null
        : {
            attachmentType: row.attachment_type,
            status: row.attachment_status,
          },
  };
}

export class CommunityDatabase {
  readonly #database: Database.Database;
  readonly #generateRegistrationCode: () => string;
  readonly #generateSessionToken: () => string;
  readonly #generateAccountId: () => string;
  readonly #generateResidentId: () => string;
  readonly #generateHomeId: () => string;
  readonly #generateFarmCreationId: () => string;

  constructor(databasePath: string, options: CommunityDatabaseOptions = {}) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    }
    this.#database = new Database(databasePath);
    if (databasePath !== ":memory:") {
      chmodSync(databasePath, 0o600);
    }
    this.#generateRegistrationCode = options.generateRegistrationCode ?? generateRegistrationCode;
    this.#generateSessionToken = options.generateSessionToken ?? generateSessionToken;
    this.#generateAccountId = options.generateAccountId ?? randomUUID;
    this.#generateResidentId = options.generateResidentId ?? randomUUID;
    this.#generateHomeId = options.generateHomeId ?? randomUUID;
    this.#generateFarmCreationId = options.generateFarmCreationId ?? randomUUID;
    this.#database.pragma("foreign_keys = ON");
    const databaseSchemaVersion = this.#database.pragma("user_version", {
      simple: true,
    });
    if (
      typeof databaseSchemaVersion !== "number" ||
      !Number.isInteger(databaseSchemaVersion) ||
      databaseSchemaVersion < 0 ||
      databaseSchemaVersion > COMMUNITY_DATABASE_SCHEMA_VERSION
    ) {
      this.#database.close();
      throw new Error(
        `Unsupported community database schema version: ${String(databaseSchemaVersion)}`,
      );
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS registration_code (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        code TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS farm_creation_requests (
        creation_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
        requested_farm_name TEXT NOT NULL,
        requested_ai_name TEXT NOT NULL,
        requested_human_name TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        farm_doorplate TEXT UNIQUE,
        farm_name TEXT,
        ai_name TEXT,
        human_name TEXT,
        farm_human_key TEXT,
        farm_created_at INTEGER,
        completed_at INTEGER,
        CHECK (
          (farm_doorplate IS NULL
            AND farm_name IS NULL
            AND ai_name IS NULL
            AND human_name IS NULL
            AND farm_human_key IS NULL
            AND farm_created_at IS NULL
            AND completed_at IS NULL)
          OR (farm_doorplate IS NOT NULL
            AND farm_name IS NOT NULL
            AND ai_name IS NOT NULL
            AND human_name IS NOT NULL
            AND farm_human_key IS NOT NULL
            AND farm_created_at IS NOT NULL
            AND completed_at IS NULL)
          OR (farm_doorplate IS NOT NULL
            AND farm_name IS NOT NULL
            AND ai_name IS NOT NULL
            AND human_name IS NOT NULL
            AND farm_human_key IS NULL
            AND farm_created_at IS NOT NULL
            AND completed_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS human_accounts (
        account_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
        password_credential TEXT,
        created_at INTEGER NOT NULL,
        membership_status TEXT NOT NULL CHECK (membership_status IN ('active', 'inactive')),
        membership_checked_at INTEGER NOT NULL,
        membership_inactive_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS human_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS residents (
        resident_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE REFERENCES human_accounts(account_id) ON DELETE CASCADE,
        resident_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS homes (
        home_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS farm_bindings (
        farm_doorplate TEXT PRIMARY KEY,
        home_id TEXT NOT NULL UNIQUE REFERENCES homes(home_id) ON DELETE CASCADE,
        farm_human_key TEXT,
        bound_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS human_settings (
        home_id TEXT PRIMARY KEY REFERENCES homes(home_id) ON DELETE CASCADE,
        environment_description TEXT,
        pause_all_wakeups INTEGER CHECK (pause_all_wakeups IN (0, 1)),
        visit_requests_and_invitations_enabled INTEGER
          CHECK (visit_requests_and_invitations_enabled IN (0, 1)),
        activity_invitations_enabled INTEGER CHECK (activity_invitations_enabled IN (0, 1)),
        important_system_notifications_enabled INTEGER
          CHECK (important_system_notifications_enabled IN (0, 1)),
        default_connection_duration_minutes INTEGER
          CHECK (default_connection_duration_minutes > 0),
        initial_recent_activity_count INTEGER CHECK (initial_recent_activity_count >= 0),
        chat_mode TEXT CHECK (chat_mode IN ('natural', 'proactive', 'listening')),
        allow_activity_room_warmup INTEGER CHECK (allow_activity_room_warmup IN (0, 1)),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS home_weather_state (
        home_id TEXT PRIMARY KEY REFERENCES homes(home_id) ON DELETE CASCADE,
        climate_type TEXT NOT NULL CHECK (climate_type IN (${sqlStringList(climateTypeValues)})),
        weather_revision INTEGER NOT NULL CHECK (weather_revision > 0),
        season_phase TEXT CHECK (
          season_phase IS NULL OR season_phase IN (${sqlStringList(weatherSeasonPhaseValues)})
        ),
        condition TEXT CHECK (
          condition IS NULL OR condition IN (${sqlStringList(weatherConditionValues)})
        ),
        state_started_at INTEGER,
        next_transition_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connector_bindings (
        resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        credential_token_hash TEXT UNIQUE,
        credential_issued_at INTEGER NOT NULL,
        credential_revoked_at INTEGER,
        last_connected_at INTEGER,
        last_online_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS mcp_access_bindings (
        resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
        migration_id TEXT NOT NULL UNIQUE,
        farm_doorplate TEXT NOT NULL UNIQUE,
        migration_requested_at INTEGER NOT NULL,
        farm_revoked_at INTEGER,
        farm_confirmation_id TEXT UNIQUE,
        credential_id TEXT UNIQUE,
        credential_token_hash TEXT UNIQUE,
        credential_issued_at INTEGER,
        credential_revoked_at INTEGER,
        CHECK (
          (farm_revoked_at IS NULL AND farm_confirmation_id IS NULL)
          OR (farm_revoked_at IS NOT NULL AND farm_confirmation_id IS NOT NULL)
        ),
        CHECK (
          (credential_id IS NULL
            AND credential_token_hash IS NULL
            AND credential_issued_at IS NULL
            AND credential_revoked_at IS NULL)
          OR (credential_id IS NOT NULL
            AND credential_issued_at IS NOT NULL
            AND (
              (credential_token_hash IS NOT NULL AND credential_revoked_at IS NULL)
              OR (credential_token_hash IS NULL AND credential_revoked_at IS NOT NULL)
            ))
        ),
        CHECK (
          credential_token_hash IS NULL
          OR (
            farm_revoked_at IS NOT NULL
            AND farm_confirmation_id IS NOT NULL
            AND length(credential_token_hash) = 64
            AND credential_token_hash NOT GLOB '*[^0-9a-f]*'
          )
        )
      );

      CREATE TABLE IF NOT EXISTS connector_delivery_state (
        resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
        last_event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (last_event_cursor >= 0),
        last_acked_cursor INTEGER NOT NULL DEFAULT 0 CHECK (
          last_acked_cursor >= 0 AND last_acked_cursor <= last_event_cursor
        )
      );

      CREATE TABLE IF NOT EXISTS connector_events (
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        cursor INTEGER NOT NULL CHECK (cursor > 0),
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY (resident_id, cursor)
      );

      CREATE TABLE IF NOT EXISTS mailbox_letters (
        letter_id TEXT PRIMARY KEY,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (${sqlStringList(mailboxCategoryValues)})),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        attachment_type TEXT CHECK (
          attachment_type IS NULL OR attachment_type = 'farm_reward'
        ),
        attachment_status TEXT CHECK (
          attachment_status IS NULL OR attachment_status IN ('available', 'claimed')
        ),
        created_at INTEGER NOT NULL,
        UNIQUE (home_id, idempotency_key),
        CHECK (
          (attachment_type IS NULL AND attachment_status IS NULL)
          OR (attachment_type IS NOT NULL AND attachment_status IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS mailbox_letters_home_created
        ON mailbox_letters (home_id, created_at DESC, letter_id DESC);

      CREATE INDEX IF NOT EXISTS mailbox_letters_home_category_created
        ON mailbox_letters (home_id, category, created_at DESC, letter_id DESC);

      CREATE TABLE IF NOT EXISTS mailbox_read_states (
        letter_id TEXT NOT NULL REFERENCES mailbox_letters(letter_id) ON DELETE CASCADE,
        audience TEXT NOT NULL CHECK (audience IN ('human', 'resident')),
        read_at INTEGER NOT NULL,
        PRIMARY KEY (letter_id, audience)
      );
    `);
    if (databaseSchemaVersion < 1) {
      this.#database.transaction(() => {
        const farmBindingColumns = this.#database.pragma("table_info(farm_bindings)") as Array<{
          name: string;
        }>;
        if (!farmBindingColumns.some((column) => column.name === "farm_human_key")) {
          this.#database.exec("ALTER TABLE farm_bindings ADD COLUMN farm_human_key TEXT");
        }
        const humanAccountColumns = this.#database.pragma("table_info(human_accounts)") as Array<{
          name: string;
        }>;
        if (!humanAccountColumns.some((column) => column.name === "password_credential")) {
          this.#database.exec("ALTER TABLE human_accounts ADD COLUMN password_credential TEXT");
        }
        this.#database.pragma(`user_version = ${COMMUNITY_DATABASE_SCHEMA_VERSION}`);
      })();
    }
  }

  close(): void {
    this.#database.close();
  }

  getCurrentRegistrationCode(now: number): RegistrationCodeRecord {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          "SELECT code, generated_at, expires_at FROM registration_code WHERE singleton_id = 1",
        )
        .get() as RegistrationCodeRow | undefined;

      if (row && now < row.expires_at) {
        return {
          code: row.code,
          generatedAt: row.generated_at,
          expiresAt: row.expires_at,
        };
      }

      const generatedCode = this.#generateRegistrationCode();
      const code = row ? makeRegistrationCodeDistinct(generatedCode, row.code) : generatedCode;
      const expiresAt = now + REGISTRATION_CODE_WINDOW_MS;
      this.#database
        .prepare(
          `INSERT INTO registration_code (singleton_id, code, generated_at, expires_at)
           VALUES (1, ?, ?, ?)
           ON CONFLICT(singleton_id) DO UPDATE SET
             code = excluded.code,
             generated_at = excluded.generated_at,
             expires_at = excluded.expires_at`,
        )
        .run(code, now, expiresAt);
      return { code, generatedAt: now, expiresAt };
    });

    return transaction.immediate();
  }

  isCurrentRegistrationCode(candidate: string, now: number): boolean {
    return registrationCodesEqual(candidate, this.getCurrentRegistrationCode(now).code);
  }

  getOrCreateFarmCreationRequest(
    qqNumber: string,
    now: number,
    input: FarmCreationRequestInput,
  ): FarmCreationRequestRecord {
    const transaction = this.#database.transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT creation_id,
                  qq_number,
                  requested_farm_name,
                  requested_ai_name,
                  requested_human_name,
                  requested_at,
                  farm_doorplate,
                  farm_name,
                  ai_name,
                  human_name,
                  farm_human_key,
                  farm_created_at,
                  completed_at
           FROM farm_creation_requests
           WHERE qq_number = ?`,
        )
        .get(qqNumber) as FarmCreationRequestRow | undefined;
      if (existing) {
        if (
          existing.requested_farm_name !== input.farmName ||
          existing.requested_ai_name !== input.aiName ||
          existing.requested_human_name !== input.humanName
        ) {
          throw new FarmCreationStateConflictError();
        }
        return {
          creationId: existing.creation_id,
          qqNumber: existing.qq_number,
          farmName: existing.requested_farm_name,
          aiName: existing.requested_ai_name,
          humanName: existing.requested_human_name,
          requestedAt: existing.requested_at,
        };
      }

      const creationId = this.#generateFarmCreationId();
      this.#database
        .prepare(
          `INSERT INTO farm_creation_requests (
             creation_id,
             qq_number,
             requested_farm_name,
             requested_ai_name,
             requested_human_name,
             requested_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(creationId, qqNumber, input.farmName, input.aiName, input.humanName, now);
      return { creationId, qqNumber, ...input, requestedAt: now };
    });
    return transaction.immediate();
  }

  recordFarmCreationReceipt(
    qqNumber: string,
    creationId: string,
    receipt: FarmCreationReceiptInput,
  ): void {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT creation_id,
                  qq_number,
                  requested_farm_name,
                  requested_ai_name,
                  requested_human_name,
                  requested_at,
                  farm_doorplate,
                  farm_name,
                  ai_name,
                  human_name,
                  farm_human_key,
                  farm_created_at,
                  completed_at
           FROM farm_creation_requests
           WHERE qq_number = ? AND creation_id = ?`,
        )
        .get(qqNumber, creationId) as FarmCreationRequestRow | undefined;
      if (!row) {
        throw new FarmCreationStateConflictError();
      }
      if (row.farm_doorplate !== null) {
        const storedKey =
          row.farm_human_key ??
          (
            this.#database
              .prepare("SELECT farm_human_key FROM farm_bindings WHERE farm_doorplate = ?")
              .get(row.farm_doorplate) as { farm_human_key: string | null } | undefined
          )?.farm_human_key;
        if (
          row.farm_doorplate !== receipt.farmDoorplate ||
          row.farm_name !== receipt.farmName ||
          row.ai_name !== receipt.aiName ||
          row.human_name !== receipt.humanName ||
          row.farm_created_at !== receipt.farmCreatedAt ||
          storedKey !== receipt.farmHumanKey
        ) {
          throw new FarmCreationStateConflictError();
        }
        return;
      }
      const result = this.#database
        .prepare(
          `UPDATE farm_creation_requests
           SET farm_doorplate = ?,
               farm_name = ?,
               ai_name = ?,
               human_name = ?,
               farm_human_key = ?,
               farm_created_at = ?
           WHERE qq_number = ? AND creation_id = ? AND farm_doorplate IS NULL`,
        )
        .run(
          receipt.farmDoorplate,
          receipt.farmName,
          receipt.aiName,
          receipt.humanName,
          receipt.farmHumanKey,
          receipt.farmCreatedAt,
          qqNumber,
          creationId,
        );
      if (result.changes !== 1) {
        throw new FarmCreationStateConflictError();
      }
    });
    transaction.immediate();
  }

  createHumanSession(
    qqNumber: string,
    now: number,
    registration?: HumanRegistrationInput,
  ): CreatedHumanSession {
    const transaction = this.#database.transaction(() => {
      let account = this.#database
        .prepare(
          `SELECT account_id, qq_number, created_at, membership_status
           FROM human_accounts
           WHERE qq_number = ?`,
        )
        .get(qqNumber) as HumanAccountRow | undefined;
      const accountCreated = account === undefined;

      if (!account && !registration) {
        throw new RegistrationProfileRequiredError();
      }

      let community = account ? this.#findCommunityByAccountId(account.account_id) : undefined;

      if (community) {
        throw new HumanAccountAlreadyRegisteredError();
      }

      if (account && !community && !registration) {
        throw new RegistrationProfileRequiredError();
      }

      if (!community && registration?.farmCreationId) {
        const creation = this.#database
          .prepare(
            `SELECT farm_doorplate, farm_human_key, completed_at
             FROM farm_creation_requests
             WHERE qq_number = ? AND creation_id = ?`,
          )
          .get(qqNumber, registration.farmCreationId) as
          | {
              farm_doorplate: string | null;
              farm_human_key: string | null;
              completed_at: number | null;
            }
          | undefined;
        if (
          !creation ||
          creation.completed_at !== null ||
          creation.farm_doorplate !== registration.farmDoorplate ||
          creation.farm_human_key !== registration.farmHumanKey
        ) {
          throw new FarmCreationStateConflictError();
        }
      }

      if (!community && registration) {
        const existingFarmBinding = this.#database
          .prepare("SELECT home_id FROM farm_bindings WHERE farm_doorplate = ?")
          .get(registration.farmDoorplate);
        if (existingFarmBinding) {
          throw new FarmAlreadyBoundError();
        }
      }

      if (!account) {
        account = {
          account_id: this.#generateAccountId(),
          qq_number: qqNumber,
          created_at: now,
          membership_status: "active",
        };
        this.#database
          .prepare(
            `INSERT INTO human_accounts (
               account_id,
               qq_number,
               password_credential,
               created_at,
               membership_status,
               membership_checked_at
             ) VALUES (?, ?, ?, ?, 'active', ?)`,
          )
          .run(
            account.account_id,
            account.qq_number,
            registration?.passwordCredential ?? null,
            account.created_at,
            now,
          );
      } else {
        this.#database
          .prepare(
            `UPDATE human_accounts
             SET membership_status = 'active',
                 membership_checked_at = ?,
                 membership_inactive_at = NULL,
                 password_credential = COALESCE(?, password_credential)
             WHERE account_id = ?`,
          )
          .run(now, registration?.passwordCredential ?? null, account.account_id);
        account.membership_status = "active";
      }

      if (!community && registration) {
        const residentId = this.#generateResidentId();
        const homeId = this.#generateHomeId();
        this.#database
          .prepare(
            `INSERT INTO residents (resident_id, account_id, resident_name, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(residentId, account.account_id, registration.residentName, now);
        this.#database
          .prepare(
            `INSERT INTO homes (home_id, resident_id, home_name, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(homeId, residentId, registration.homeName, now);
        this.#database
          .prepare(
            `INSERT INTO farm_bindings (farm_doorplate, home_id, farm_human_key, bound_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(registration.farmDoorplate, homeId, registration.farmHumanKey, now);
        if (registration.farmCreationId) {
          const completed = this.#database
            .prepare(
              `UPDATE farm_creation_requests
               SET farm_human_key = NULL,
                   completed_at = ?
               WHERE qq_number = ?
                 AND creation_id = ?
                 AND completed_at IS NULL
                 AND farm_human_key = ?`,
            )
            .run(now, qqNumber, registration.farmCreationId, registration.farmHumanKey);
          if (completed.changes !== 1) {
            throw new FarmCreationStateConflictError();
          }
        }
        community = this.#findCommunityByAccountId(account.account_id);
      }

      if (!community) {
        throw new RegistrationProfileRequiredError();
      }

      if (community.farmBinding.farmHumanKey === null) {
        throw new RegistrationProfileRequiredError();
      }

      const token = this.#generateSessionToken();
      this.#database
        .prepare("INSERT INTO human_sessions (token_hash, account_id, created_at) VALUES (?, ?, ?)")
        .run(hashSessionToken(token), account.account_id, now);

      return {
        community,
        accountCreated,
        token,
      };
    });

    return transaction.immediate();
  }

  findHumanPasswordCredentialByQq(qqNumber: string): string | null | undefined {
    const row = this.#database
      .prepare("SELECT password_credential FROM human_accounts WHERE qq_number = ?")
      .get(qqNumber) as { password_credential: string | null } | undefined;
    return row?.password_credential;
  }

  createExistingHumanSession(qqNumber: string, now: number): CreatedHumanSession {
    const transaction = this.#database.transaction(() => {
      const account = this.#database
        .prepare(
          `SELECT account_id, qq_number, created_at, membership_status, password_credential
           FROM human_accounts
           WHERE qq_number = ?`,
        )
        .get(qqNumber) as HumanAccountRow | undefined;
      if (!account?.password_credential) {
        throw new RegistrationProfileRequiredError();
      }
      const community = this.#findCommunityByAccountId(account.account_id);
      if (!community || community.farmBinding.farmHumanKey === null) {
        throw new RegistrationProfileRequiredError();
      }
      this.#database
        .prepare(
          `UPDATE human_accounts
           SET membership_status = 'active',
               membership_checked_at = ?,
               membership_inactive_at = NULL
           WHERE account_id = ?`,
        )
        .run(now, account.account_id);
      community.account.membershipStatus = "active";
      const token = this.#generateSessionToken();
      this.#database
        .prepare("INSERT INTO human_sessions (token_hash, account_id, created_at) VALUES (?, ?, ?)")
        .run(hashSessionToken(token), account.account_id, now);
      return { community, accountCreated: false, token };
    });
    return transaction.immediate();
  }

  resetHumanPassword(qqNumber: string, passwordCredential: string, now: number): boolean {
    const transaction = this.#database.transaction(() => {
      const account = this.#database
        .prepare("SELECT account_id FROM human_accounts WHERE qq_number = ?")
        .get(qqNumber) as { account_id: string } | undefined;
      if (!account) {
        return false;
      }
      const updated = this.#database
        .prepare("UPDATE human_accounts SET password_credential = ? WHERE account_id = ?")
        .run(passwordCredential, account.account_id);
      this.#database
        .prepare(
          `UPDATE human_sessions
           SET revoked_at = ?
           WHERE account_id = ? AND revoked_at IS NULL`,
        )
        .run(now, account.account_id);
      return updated.changes === 1;
    });
    return transaction.immediate();
  }

  findActiveHumanSession(token: string): ActiveHumanSessionRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.account_id, a.qq_number, a.created_at, a.membership_status
         FROM human_sessions AS s
         JOIN human_accounts AS a ON a.account_id = s.account_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND a.membership_status = 'active'`,
      )
      .get(hashSessionToken(token)) as HumanAccountRow | undefined;
    if (!row) {
      return undefined;
    }
    const account = mapAccount(row);
    const community = this.#findCommunityByAccountId(row.account_id);
    return community ? { account, community } : { account };
  }

  findActiveHumanAccountByResidentId(residentId: string): HumanAccountRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.account_id, a.qq_number, a.created_at, a.membership_status
         FROM residents AS r
         JOIN human_accounts AS a ON a.account_id = r.account_id
         WHERE r.resident_id = ?
           AND a.membership_status = 'active'`,
      )
      .get(residentId) as HumanAccountRow | undefined;
    return row ? mapAccount(row) : undefined;
  }

  findHomeIdByResidentId(residentId: string): string | undefined {
    const row = this.#database
      .prepare("SELECT home_id FROM homes WHERE resident_id = ?")
      .get(residentId) as { home_id: string } | undefined;
    return row?.home_id;
  }

  findFarmBindingByHomeId(homeId: string): FarmBindingRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT farm_doorplate, farm_human_key
         FROM farm_bindings
         WHERE home_id = ?`,
      )
      .get(homeId) as { farm_doorplate: string; farm_human_key: string | null } | undefined;
    return row
      ? { farmDoorplate: row.farm_doorplate, farmHumanKey: row.farm_human_key }
      : undefined;
  }

  getMcpAccessBinding(residentId: string): McpAccessBindingRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT resident_id,
                migration_id,
                farm_doorplate,
                migration_requested_at,
                farm_revoked_at,
                farm_confirmation_id,
                credential_id,
                credential_token_hash,
                credential_issued_at,
                credential_revoked_at
         FROM mcp_access_bindings
         WHERE resident_id = ?`,
      )
      .get(residentId) as McpAccessBindingRow | undefined;
    return row ? mapMcpAccessBinding(row) : undefined;
  }

  beginMcpFarmMigration(
    residentId: string,
    farmDoorplate: string,
    migrationId: string,
    now: number,
  ): McpAccessBindingRecord {
    const transaction = this.#database.transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO mcp_access_bindings (
             resident_id,
             migration_id,
             farm_doorplate,
             migration_requested_at
           ) VALUES (?, ?, ?, ?)
           ON CONFLICT(resident_id) DO NOTHING`,
        )
        .run(residentId, migrationId, farmDoorplate, now);
      const binding = this.getMcpAccessBinding(residentId);
      if (!binding || binding.farmDoorplate !== farmDoorplate) {
        throw new McpAccessStateConflictError();
      }
      return binding;
    });
    return transaction.immediate();
  }

  confirmMcpFarmRevoked(
    residentId: string,
    migrationId: string,
    confirmationId: string,
    farmRevokedAt: number,
  ): McpAccessBindingRecord {
    const transaction = this.#database.transaction(() => {
      const current = this.getMcpAccessBinding(residentId);
      if (!current || current.migrationId !== migrationId) {
        throw new McpAccessStateConflictError();
      }
      if (current.farmRevokedAt !== null || current.farmConfirmationId !== null) {
        if (
          current.farmRevokedAt !== farmRevokedAt ||
          current.farmConfirmationId !== confirmationId
        ) {
          throw new McpAccessStateConflictError();
        }
        return current;
      }
      this.#database
        .prepare(
          `UPDATE mcp_access_bindings
           SET farm_revoked_at = ?, farm_confirmation_id = ?
           WHERE resident_id = ?
             AND migration_id = ?
             AND farm_revoked_at IS NULL
             AND farm_confirmation_id IS NULL`,
        )
        .run(farmRevokedAt, confirmationId, residentId, migrationId);
      const updated = this.getMcpAccessBinding(residentId);
      if (!updated) {
        throw new McpAccessStateConflictError();
      }
      return updated;
    });
    return transaction.immediate();
  }

  replaceMcpCredential(
    residentId: string,
    credentialId: string,
    credentialTokenHash: string,
    now: number,
  ): McpCredentialReplacementResult | undefined {
    const transaction = this.#database.transaction(() => {
      const current = this.getMcpAccessBinding(residentId);
      if (!current || current.farmRevokedAt === null || current.farmConfirmationId === null) {
        return undefined;
      }
      const replacedPrevious =
        current.credentialTokenHash !== null && current.credentialRevokedAt === null;
      this.#database
        .prepare(
          `UPDATE mcp_access_bindings
           SET credential_id = ?,
               credential_token_hash = ?,
               credential_issued_at = ?,
               credential_revoked_at = NULL
           WHERE resident_id = ?`,
        )
        .run(credentialId, credentialTokenHash, now, residentId);
      const binding = this.getMcpAccessBinding(residentId);
      if (!binding) {
        throw new McpAccessStateConflictError();
      }
      return { binding, replacedPrevious };
    });
    return transaction.immediate();
  }

  revokeMcpCredential(residentId: string, now: number): McpAccessBindingRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const current = this.getMcpAccessBinding(residentId);
      if (!current || current.credentialId === null || current.credentialIssuedAt === null) {
        return undefined;
      }
      if (current.credentialTokenHash !== null && current.credentialRevokedAt === null) {
        this.#database
          .prepare(
            `UPDATE mcp_access_bindings
             SET credential_token_hash = NULL, credential_revoked_at = ?
             WHERE resident_id = ?
               AND credential_token_hash IS NOT NULL
               AND credential_revoked_at IS NULL`,
          )
          .run(now, residentId);
      }
      const binding = this.getMcpAccessBinding(residentId);
      if (!binding) {
        throw new McpAccessStateConflictError();
      }
      return binding;
    });
    return transaction.immediate();
  }

  authenticateMcpCredentialHash(
    credentialTokenHash: string,
  ): { residentId: string; credentialId: string } | undefined {
    const row = this.#database
      .prepare(
        `SELECT resident_id, credential_id
         FROM mcp_access_bindings
         WHERE credential_token_hash = ?
           AND credential_id IS NOT NULL
           AND credential_revoked_at IS NULL
           AND farm_revoked_at IS NOT NULL
           AND farm_confirmation_id IS NOT NULL`,
      )
      .get(credentialTokenHash) as { resident_id: string; credential_id: string } | undefined;
    return row ? { residentId: row.resident_id, credentialId: row.credential_id } : undefined;
  }

  replaceConnectorCredential(
    residentId: string,
    credentialId: string,
    credentialTokenHash: string,
    now: number,
  ): boolean {
    const transaction = this.#database.transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT resident_id,
                  credential_id,
                  credential_token_hash,
                  credential_revoked_at,
                  last_connected_at,
                  last_online_at
           FROM connector_bindings
           WHERE resident_id = ?`,
        )
        .get(residentId) as ConnectorBindingRow | undefined;
      this.#database
        .prepare(
          `INSERT INTO connector_bindings (
             resident_id,
             credential_id,
             credential_token_hash,
             credential_issued_at,
             credential_revoked_at,
             last_connected_at,
             last_online_at
           ) VALUES (?, ?, ?, ?, NULL, NULL, NULL)
           ON CONFLICT(resident_id) DO UPDATE SET
             credential_id = excluded.credential_id,
             credential_token_hash = excluded.credential_token_hash,
             credential_issued_at = excluded.credential_issued_at,
             credential_revoked_at = NULL`,
        )
        .run(residentId, credentialId, credentialTokenHash, now);
      return existing?.credential_token_hash !== null && existing?.credential_revoked_at === null;
    });
    return transaction.immediate();
  }

  revokeConnectorCredential(residentId: string, now: number): boolean {
    const result = this.#database
      .prepare(
        `UPDATE connector_bindings
         SET credential_token_hash = NULL,
             credential_revoked_at = ?
         WHERE resident_id = ?
           AND credential_token_hash IS NOT NULL
           AND credential_revoked_at IS NULL`,
      )
      .run(now, residentId);
    return result.changes === 1;
  }

  authenticateConnectorCredentialHash(
    credentialTokenHash: string,
  ): AuthenticatedConnectorBinding | undefined {
    const row = this.#database
      .prepare(
        `SELECT resident_id,
                credential_id,
                credential_token_hash,
                credential_revoked_at,
                last_connected_at,
                last_online_at
         FROM connector_bindings
         WHERE credential_token_hash = ?
           AND credential_revoked_at IS NULL`,
      )
      .get(credentialTokenHash) as ConnectorBindingRow | undefined;
    return row ? { residentId: row.resident_id, credentialId: row.credential_id } : undefined;
  }

  getConnectorBindingState(residentId: string): ConnectorBindingState {
    const row = this.#database
      .prepare(
        `SELECT resident_id,
                credential_id,
                credential_token_hash,
                credential_revoked_at,
                last_connected_at,
                last_online_at
         FROM connector_bindings
         WHERE resident_id = ?`,
      )
      .get(residentId) as ConnectorBindingRow | undefined;
    return {
      configured:
        row !== undefined &&
        row.credential_token_hash !== null &&
        row.credential_revoked_at === null,
      credentialId: row?.credential_id ?? null,
      lastConnectedAt: row?.last_connected_at ?? null,
      lastOnlineAt: row?.last_online_at ?? null,
    };
  }

  listConfiguredConnectorResidentIds(): string[] {
    const rows = this.#database
      .prepare(
        `SELECT resident_id
         FROM connector_bindings
         WHERE credential_token_hash IS NOT NULL
           AND credential_revoked_at IS NULL
         ORDER BY resident_id ASC`,
      )
      .all() as Array<{ resident_id: string }>;
    return rows.map((row) => row.resident_id);
  }

  markConnectorConnected(residentId: string, credentialId: string, now: number): boolean {
    const result = this.#database
      .prepare(
        `UPDATE connector_bindings
         SET last_connected_at = ?,
             last_online_at = ?
         WHERE resident_id = ?
           AND credential_id = ?
           AND credential_token_hash IS NOT NULL
           AND credential_revoked_at IS NULL`,
      )
      .run(now, now, residentId, credentialId);
    return result.changes === 1;
  }

  markConnectorAlive(residentId: string, credentialId: string, now: number): boolean {
    const result = this.#database
      .prepare(
        `UPDATE connector_bindings
         SET last_online_at = ?
         WHERE resident_id = ?
           AND credential_id = ?
           AND credential_token_hash IS NOT NULL
           AND credential_revoked_at IS NULL`,
      )
      .run(now, residentId, credentialId);
    return result.changes === 1;
  }

  appendConnectorEvent(
    residentId: string,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    now: number,
  ): ConnectorEventRecord {
    const payloadJson = JSON.stringify(payload);
    const transaction = this.#database.transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO connector_delivery_state (
             resident_id,
             last_event_cursor,
             last_acked_cursor
           ) VALUES (?, 0, 0)
           ON CONFLICT(resident_id) DO NOTHING`,
        )
        .run(residentId);
      const state = this.#database
        .prepare(
          `SELECT last_event_cursor, last_acked_cursor
           FROM connector_delivery_state
           WHERE resident_id = ?`,
        )
        .get(residentId) as ConnectorDeliveryStateRow;
      const cursor = state.last_event_cursor + 1;
      this.#database
        .prepare(
          `INSERT INTO connector_events (
             resident_id,
             cursor,
             event_id,
             event_type,
             created_at,
             payload_json
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(residentId, cursor, eventId, eventType, now, payloadJson);
      this.#database
        .prepare(
          `UPDATE connector_delivery_state
           SET last_event_cursor = ?
           WHERE resident_id = ?`,
        )
        .run(cursor, residentId);
      return {
        residentId,
        eventId,
        cursor,
        eventType,
        createdAt: now,
        payload,
      };
    });
    return transaction.immediate();
  }

  listConnectorEventsAfter(residentId: string, afterCursor: number): ConnectorEventRecord[] {
    const rows = this.#database
      .prepare(
        `SELECT resident_id, event_id, cursor, event_type, created_at, payload_json
         FROM connector_events
         WHERE resident_id = ? AND cursor > ?
         ORDER BY cursor ASC`,
      )
      .all(residentId, afterCursor) as ConnectorEventRow[];
    return rows.map(mapConnectorEvent);
  }

  getConnectorLastAckedCursor(residentId: string): number {
    const row = this.#database
      .prepare(
        `SELECT last_event_cursor, last_acked_cursor
         FROM connector_delivery_state
         WHERE resident_id = ?`,
      )
      .get(residentId) as ConnectorDeliveryStateRow | undefined;
    return row?.last_acked_cursor ?? 0;
  }

  acknowledgeConnectorEvent(
    residentId: string,
    cursor: number,
    eventId: string,
  ): ConnectorEventAckResult {
    const transaction = this.#database.transaction(() => {
      const state = this.#database
        .prepare(
          `SELECT last_event_cursor, last_acked_cursor
           FROM connector_delivery_state
           WHERE resident_id = ?`,
        )
        .get(residentId) as ConnectorDeliveryStateRow | undefined;
      const lastAckedCursor = state?.last_acked_cursor ?? 0;
      const event = this.#database
        .prepare(
          `SELECT resident_id, event_id, cursor, event_type, created_at, payload_json
           FROM connector_events
           WHERE resident_id = ? AND cursor = ?`,
        )
        .get(residentId, cursor) as ConnectorEventRow | undefined;

      if (cursor <= lastAckedCursor) {
        return {
          status: event?.event_id === eventId ? ("duplicate" as const) : ("mismatch" as const),
          lastAckedCursor,
        };
      }
      if (cursor !== lastAckedCursor + 1) {
        return { status: "gap" as const, lastAckedCursor };
      }
      if (!event || event.event_id !== eventId) {
        return { status: "mismatch" as const, lastAckedCursor };
      }

      this.#database
        .prepare(
          `UPDATE connector_delivery_state
           SET last_acked_cursor = ?
           WHERE resident_id = ? AND last_acked_cursor = ?`,
        )
        .run(cursor, residentId, lastAckedCursor);
      return { status: "acked" as const, lastAckedCursor: cursor };
    });
    return transaction.immediate();
  }

  deliverMailboxLetter(delivery: MailboxLetterDelivery): MailboxLetterRecord {
    const transaction = this.#database.transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT letter_id,
                  home_id,
                  idempotency_key,
                  category,
                  title,
                  body,
                  attachment_type,
                  attachment_status,
                  created_at,
                  NULL AS read_at
           FROM mailbox_letters
           WHERE home_id = ? AND idempotency_key = ?`,
        )
        .get(delivery.homeId, delivery.idempotencyKey) as MailboxLetterRow | undefined;

      if (existing) {
        const sameAttachment =
          existing.attachment_type === (delivery.attachment?.attachmentType ?? null);
        if (
          existing.category !== delivery.category ||
          existing.title !== delivery.title ||
          existing.body !== delivery.body ||
          !sameAttachment
        ) {
          throw new MailboxIdempotencyConflictError();
        }
        return mapMailboxLetter(existing);
      }

      this.#database
        .prepare(
          `INSERT INTO mailbox_letters (
             letter_id,
             home_id,
             idempotency_key,
             category,
             title,
             body,
             attachment_type,
             attachment_status,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          delivery.letterId,
          delivery.homeId,
          delivery.idempotencyKey,
          delivery.category,
          delivery.title,
          delivery.body,
          delivery.attachment?.attachmentType ?? null,
          delivery.attachment?.status ?? null,
          delivery.createdAt,
        );

      return mapMailboxLetter({
        letter_id: delivery.letterId,
        home_id: delivery.homeId,
        idempotency_key: delivery.idempotencyKey,
        category: delivery.category,
        title: delivery.title,
        body: delivery.body,
        attachment_type: delivery.attachment?.attachmentType ?? null,
        attachment_status: delivery.attachment?.status ?? null,
        created_at: delivery.createdAt,
        read_at: null,
      });
    });

    return transaction.immediate();
  }

  listMailboxLetters(
    homeId: string,
    audience: MailboxAudience,
    page: number,
    pageSize: number,
    category?: MailboxCategory,
  ): MailboxLetterPage {
    const offset = (page - 1) * pageSize;
    const categoryClause = category === undefined ? "" : " AND l.category = ?";
    const parameters = category === undefined ? [homeId] : [homeId, category];
    const total = this.#database
      .prepare(
        `SELECT COUNT(*) AS total
         FROM mailbox_letters AS l
         WHERE l.home_id = ?${categoryClause}`,
      )
      .get(...parameters) as { total: number };
    const rows = this.#database
      .prepare(
        `SELECT l.letter_id,
                l.home_id,
                l.idempotency_key,
                l.category,
                l.title,
                l.body,
                l.attachment_type,
                l.attachment_status,
                l.created_at,
                r.read_at
         FROM mailbox_letters AS l
         LEFT JOIN mailbox_read_states AS r
           ON r.letter_id = l.letter_id AND r.audience = ?
         WHERE l.home_id = ?${categoryClause}
         ORDER BY l.created_at DESC, l.letter_id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(audience, ...parameters, pageSize, offset) as MailboxLetterRow[];
    return {
      letters: rows.map(mapMailboxLetter),
      totalItems: total.total,
    };
  }

  openMailboxLetter(
    homeId: string,
    audience: MailboxAudience,
    letterId: string,
    now: number,
  ): MailboxLetterRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT l.letter_id,
                  l.home_id,
                  l.idempotency_key,
                  l.category,
                  l.title,
                  l.body,
                  l.attachment_type,
                  l.attachment_status,
                  l.created_at,
                  r.read_at
           FROM mailbox_letters AS l
           LEFT JOIN mailbox_read_states AS r
             ON r.letter_id = l.letter_id AND r.audience = ?
           WHERE l.home_id = ? AND l.letter_id = ?`,
        )
        .get(audience, homeId, letterId) as MailboxLetterRow | undefined;
      if (!row) {
        return undefined;
      }

      this.#database
        .prepare(
          `INSERT INTO mailbox_read_states (letter_id, audience, read_at)
           VALUES (?, ?, ?)
           ON CONFLICT(letter_id, audience) DO NOTHING`,
        )
        .run(letterId, audience, now);
      return mapMailboxLetter({ ...row, read_at: row.read_at ?? now });
    });

    return transaction.immediate();
  }

  findMailboxLetter(
    homeId: string,
    audience: MailboxAudience,
    letterId: string,
  ): MailboxLetterRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT l.letter_id,
                l.home_id,
                l.idempotency_key,
                l.category,
                l.title,
                l.body,
                l.attachment_type,
                l.attachment_status,
                l.created_at,
                r.read_at
         FROM mailbox_letters AS l
         LEFT JOIN mailbox_read_states AS r
           ON r.letter_id = l.letter_id AND r.audience = ?
         WHERE l.home_id = ? AND l.letter_id = ?`,
      )
      .get(audience, homeId, letterId) as MailboxLetterRow | undefined;
    return row ? mapMailboxLetter(row) : undefined;
  }

  markMailboxAttachmentClaimed(homeId: string, letterId: string): boolean {
    const result = this.#database
      .prepare(
        `UPDATE mailbox_letters
         SET attachment_status = 'claimed'
         WHERE home_id = ?
           AND letter_id = ?
           AND attachment_type = 'farm_reward'
           AND attachment_status = 'available'`,
      )
      .run(homeId, letterId);
    return result.changes === 1;
  }

  getHumanSettings(homeId: string): HumanSettingsRecord {
    const row = this.#findHumanSettingsRow(homeId);
    if (!row) {
      throw new Error("The registered home does not exist");
    }
    return mapHumanSettings(row);
  }

  updateHomeWeatherState(
    homeId: string,
    now: number,
    update: HomeWeatherStateUpdate,
  ): HomeWeatherStateRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE home_weather_state
           SET weather_revision = weather_revision + 1,
               season_phase = ?,
               condition = ?,
               state_started_at = ?,
               next_transition_at = ?,
               updated_at = ?
           WHERE home_id = ?
             AND climate_type = ?
             AND weather_revision = ?`,
        )
        .run(
          update.seasonPhase,
          update.condition,
          update.stateStartedAt,
          update.nextTransitionAt,
          now,
          homeId,
          update.climateType,
          update.expectedWeatherRevision,
        );
      if (result.changes !== 1) {
        return undefined;
      }
      const row = this.#findHumanSettingsRow(homeId);
      return row ? mapHomeWeatherState(row) : undefined;
    });

    return transaction.immediate();
  }

  updateHumanSettings(homeId: string, now: number, patch: HumanSettingsPatch): HumanSettingsRecord {
    const transaction = this.#database.transaction(() => {
      const current = this.#findHumanSettingsRow(homeId);
      if (!current) {
        throw new Error("The registered home does not exist");
      }

      if (Object.hasOwn(patch, "homeName")) {
        this.#database
          .prepare("UPDATE homes SET home_name = ? WHERE home_id = ?")
          .run(patch.homeName, homeId);
      }

      if (Object.hasOwn(patch, "climateType")) {
        this.#database
          .prepare(
            `INSERT INTO home_weather_state (
               home_id,
               climate_type,
               weather_revision,
               season_phase,
               condition,
               state_started_at,
               next_transition_at,
               updated_at
             ) VALUES (?, ?, 1, NULL, NULL, NULL, NULL, ?)
             ON CONFLICT(home_id) DO UPDATE SET
               climate_type = excluded.climate_type,
               weather_revision = home_weather_state.weather_revision + 1,
               season_phase = NULL,
               condition = NULL,
               state_started_at = NULL,
               next_transition_at = NULL,
               updated_at = excluded.updated_at
             WHERE home_weather_state.climate_type <> excluded.climate_type`,
          )
          .run(homeId, patch.climateType, now);
      }

      const settingsKeys: Array<keyof HumanSettingsPatch> = [
        "environmentDescription",
        "pauseAllWakeups",
        "visitRequestsAndInvitationsEnabled",
        "activityInvitationsEnabled",
        "importantSystemNotificationsEnabled",
        "defaultConnectionDurationMinutes",
        "initialRecentActivityCount",
        "chatMode",
        "allowActivityRoomWarmup",
      ];
      if (settingsKeys.some((key) => Object.hasOwn(patch, key))) {
        const environmentDescription = Object.hasOwn(patch, "environmentDescription")
          ? (patch.environmentDescription ?? null)
          : current.environment_description;
        const pauseAllWakeups = Object.hasOwn(patch, "pauseAllWakeups")
          ? storeNullableBoolean(patch.pauseAllWakeups ?? null)
          : current.pause_all_wakeups;
        const visitRequestsAndInvitationsEnabled = Object.hasOwn(
          patch,
          "visitRequestsAndInvitationsEnabled",
        )
          ? storeNullableBoolean(patch.visitRequestsAndInvitationsEnabled ?? null)
          : current.visit_requests_and_invitations_enabled;
        const activityInvitationsEnabled = Object.hasOwn(patch, "activityInvitationsEnabled")
          ? storeNullableBoolean(patch.activityInvitationsEnabled ?? null)
          : current.activity_invitations_enabled;
        const importantSystemNotificationsEnabled = Object.hasOwn(
          patch,
          "importantSystemNotificationsEnabled",
        )
          ? storeNullableBoolean(patch.importantSystemNotificationsEnabled ?? null)
          : current.important_system_notifications_enabled;
        const defaultConnectionDurationMinutes = Object.hasOwn(
          patch,
          "defaultConnectionDurationMinutes",
        )
          ? (patch.defaultConnectionDurationMinutes ?? null)
          : current.default_connection_duration_minutes;
        const initialRecentActivityCount = Object.hasOwn(patch, "initialRecentActivityCount")
          ? (patch.initialRecentActivityCount ?? null)
          : current.initial_recent_activity_count;
        const chatMode = Object.hasOwn(patch, "chatMode")
          ? (patch.chatMode ?? null)
          : current.chat_mode;
        const allowActivityRoomWarmup = Object.hasOwn(patch, "allowActivityRoomWarmup")
          ? storeNullableBoolean(patch.allowActivityRoomWarmup ?? null)
          : current.allow_activity_room_warmup;

        this.#database
          .prepare(
            `INSERT INTO human_settings (
               home_id,
               environment_description,
               pause_all_wakeups,
               visit_requests_and_invitations_enabled,
               activity_invitations_enabled,
               important_system_notifications_enabled,
               default_connection_duration_minutes,
               initial_recent_activity_count,
               chat_mode,
               allow_activity_room_warmup,
               updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(home_id) DO UPDATE SET
               environment_description = excluded.environment_description,
               pause_all_wakeups = excluded.pause_all_wakeups,
               visit_requests_and_invitations_enabled = excluded.visit_requests_and_invitations_enabled,
               activity_invitations_enabled = excluded.activity_invitations_enabled,
               important_system_notifications_enabled = excluded.important_system_notifications_enabled,
               default_connection_duration_minutes = excluded.default_connection_duration_minutes,
               initial_recent_activity_count = excluded.initial_recent_activity_count,
               chat_mode = excluded.chat_mode,
               allow_activity_room_warmup = excluded.allow_activity_room_warmup,
               updated_at = excluded.updated_at`,
          )
          .run(
            homeId,
            environmentDescription,
            pauseAllWakeups,
            visitRequestsAndInvitationsEnabled,
            activityInvitationsEnabled,
            importantSystemNotificationsEnabled,
            defaultConnectionDurationMinutes,
            initialRecentActivityCount,
            chatMode,
            allowActivityRoomWarmup,
            now,
          );
      }

      const updated = this.#findHumanSettingsRow(homeId);
      if (!updated) {
        throw new Error("The registered home does not exist");
      }
      return mapHumanSettings(updated);
    });

    return transaction.immediate();
  }

  #findHumanSettingsRow(homeId: string): HumanSettingsRow | undefined {
    return this.#database
      .prepare(
        `SELECT h.home_id,
                r.resident_id,
                h.home_name,
                s.environment_description,
                w.climate_type,
                w.weather_revision,
                w.season_phase,
                w.condition AS weather_condition,
                w.state_started_at,
                w.next_transition_at,
                w.updated_at AS weather_updated_at,
                s.pause_all_wakeups,
                s.visit_requests_and_invitations_enabled,
                s.activity_invitations_enabled,
                s.important_system_notifications_enabled,
                s.default_connection_duration_minutes,
                s.initial_recent_activity_count,
                s.chat_mode,
                s.allow_activity_room_warmup
         FROM homes AS h
         JOIN residents AS r ON r.resident_id = h.resident_id
         LEFT JOIN human_settings AS s ON s.home_id = h.home_id
         LEFT JOIN home_weather_state AS w ON w.home_id = h.home_id
         WHERE h.home_id = ?`,
      )
      .get(homeId) as HumanSettingsRow | undefined;
  }

  #findCommunityByAccountId(accountId: string): HumanCommunityRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.account_id,
                a.qq_number,
                a.created_at,
                a.membership_status,
                r.resident_id,
                r.resident_name,
                h.home_id,
                h.home_name,
                f.farm_doorplate,
                f.farm_human_key
         FROM human_accounts AS a
         JOIN residents AS r ON r.account_id = a.account_id
         JOIN homes AS h ON h.resident_id = r.resident_id
         JOIN farm_bindings AS f ON f.home_id = h.home_id
         WHERE a.account_id = ?`,
      )
      .get(accountId) as HumanCommunityRow | undefined;
    return row ? mapCommunity(row) : undefined;
  }

  revokeHumanSession(token: string, now: number): boolean {
    const result = this.#database
      .prepare(
        "UPDATE human_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
      )
      .run(now, hashSessionToken(token));
    return result.changes === 1;
  }

  confirmHumanAccountMembership(accountId: string, now: number): void {
    this.#database
      .prepare(
        `UPDATE human_accounts
         SET membership_status = 'active',
             membership_checked_at = ?,
             membership_inactive_at = NULL
         WHERE account_id = ?`,
      )
      .run(now, accountId);
  }

  revokeHumanAccountMembership(accountId: string, now: number): void {
    const transaction = this.#database.transaction(() => {
      this.#database
        .prepare(
          `UPDATE human_accounts
           SET membership_status = 'inactive',
               membership_checked_at = ?,
               membership_inactive_at = ?
           WHERE account_id = ?`,
        )
        .run(now, now, accountId);
      this.#database
        .prepare(
          `UPDATE human_sessions
           SET revoked_at = ?
           WHERE account_id = ? AND revoked_at IS NULL`,
        )
        .run(now, accountId);
      this.#database
        .prepare(
          `UPDATE mcp_access_bindings
           SET credential_token_hash = NULL,
               credential_revoked_at = ?
           WHERE resident_id IN (
             SELECT resident_id FROM residents WHERE account_id = ?
           )
             AND credential_token_hash IS NOT NULL
             AND credential_revoked_at IS NULL`,
        )
        .run(now, accountId);
    });
    transaction.immediate();
  }

  revokeHumanAccountMembershipByQq(qqNumber: string, now: number): void {
    const account = this.#database
      .prepare("SELECT account_id AS accountId FROM human_accounts WHERE qq_number = ?")
      .get(qqNumber) as { accountId: string } | undefined;
    if (account) {
      this.revokeHumanAccountMembership(account.accountId, now);
    }
  }
}
