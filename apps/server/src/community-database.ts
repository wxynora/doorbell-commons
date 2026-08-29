import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type ClimateType,
  climateTypeValues,
  type LingyeDailyEditionPublish,
  type LingyeDailyPublishRequest,
  lingyeDailyEditionPublishSchema,
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
export const HUMAN_LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const HUMAN_LOGIN_FAILURE_THRESHOLD = 10;
export const HUMAN_LOGIN_LOCK_DURATION_MS = 30 * 60 * 1000;
export const FARM_PURCHASE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
export const COMMUNITY_DATABASE_SCHEMA_VERSION = 11;
const LEGACY_CONNECTOR_DELIVERY_GENERATION = "00000000-0000-0000-0000-000000000000";

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
  profileId: string;
  account: HumanAccountRecord;
  resident: ResidentRecord;
  home: HomeRecord;
  farmBinding: FarmBindingRecord;
}

export interface HumanProfileSummaryRecord {
  profileId: string;
  residentName: string;
  homeName: string;
  farmDoorplate: string;
}

export interface BrowserPushSubscriptionRecord {
  residentId: string;
  homeId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
  updatedAt: number;
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

export interface AuthenticatedBellBinding {
  residentId: string;
  credentialId: string;
}

export interface BellBindingState {
  configured: boolean;
  lastConnectedAt: number | null;
}

export type BellWakeStatus = "pending" | "acked" | "blocked" | "cancelled";

export const FARM_PURCHASE_SHOPS = ["field", "ranch"] as const;
export type FarmPurchaseShop = (typeof FARM_PURCHASE_SHOPS)[number];

export const FARM_PURCHASE_REQUEST_STATUSES = ["requested", "expired", "failed"] as const;
export type FarmPurchaseRequestStatus = (typeof FARM_PURCHASE_REQUEST_STATUSES)[number];

export type BellWakeReason = "mailbox_unread" | "farm_purchase_request" | "career_exam_reminder";

export type CareerExamReminderStatus = "scheduled" | "delivered" | "cancelled";

export const ACTIVITY_REMINDER_KINDS = ["crop_matured", "glimmer_capture_ready"] as const;
export type ActivityReminderKind = (typeof ACTIVITY_REMINDER_KINDS)[number];
export type ActivityReminderStatus = "scheduled" | "delivered" | "cancelled";

export interface ActivityReminderRecord {
  residentId: string;
  homeId: string;
  farmDoorplate: string;
  kind: ActivityReminderKind;
  sourceKey: string;
  readyAt: number;
  status: ActivityReminderStatus;
  createdAt: number;
  deliveredAt: number | null;
  cancelledAt: number | null;
}

export interface ActivityReminderProfileKey {
  residentId: string;
  homeId: string;
  farmDoorplate: string;
}

export interface ActivityReminderScheduleInput extends ActivityReminderProfileKey {
  kind: ActivityReminderKind;
  sourceKey: string;
  readyAt: number;
  createdAt: number;
}

export interface CareerExamReminderRecord {
  attemptId: string;
  residentId: string;
  homeId: string;
  scheduledAt: number;
  remindAt: number;
  status: CareerExamReminderStatus;
  letterId: string | null;
  wakeId: string | null;
  createdAt: number;
  deliveredAt: number | null;
  cancelledAt: number | null;
}

export interface CareerExamReminderScheduleInput {
  attemptId: string;
  residentId: string;
  homeId: string;
  scheduledAt: number;
  remindAt: number;
  createdAt: number;
}

export interface CareerExamReminderDeliveryInput {
  attemptId: string;
  letterId: string;
  wakeId: string;
  deliveredAt: number;
  payload: Record<string, unknown>;
}

export interface FarmPurchaseItemInput {
  itemId: string;
  kind: string;
  qty: number;
  displayName: string;
}

export interface FarmPurchaseRequestInput {
  requestId: string;
  wakeId: string;
  residentId: string;
  homeId: string;
  idempotencyKey: string;
  shop: FarmPurchaseShop;
  shopRevision: string;
  humanName: string;
  payloadHash: string;
  notificationText: string;
  items: readonly FarmPurchaseItemInput[];
  createdAt: number;
}

export type FarmPurchaseItemRecord = FarmPurchaseItemInput;

export interface FarmPurchaseRequestRecord {
  requestId: string;
  wakeId: string;
  residentId: string;
  homeId: string;
  idempotencyKey: string;
  shop: FarmPurchaseShop;
  shopRevision: string;
  humanName: string;
  status: FarmPurchaseRequestStatus;
  createdAt: number;
  expiresAt: number;
  items: FarmPurchaseItemRecord[];
}

export interface FarmPurchaseRequestCreationResult {
  request: FarmPurchaseRequestRecord;
  created: boolean;
}

export interface FarmPurchaseRequestExpiryResult {
  request: FarmPurchaseRequestRecord;
  cancelledWakeIds: string[];
}

export interface BellWakeRecord {
  wakeId: string;
  residentId: string;
  reason: BellWakeReason;
  status: BellWakeStatus;
  createdAt: number;
  endedAt: number | null;
  blockReason: string | null;
  errorCode: string | null;
  purchaseRequestId: string | null;
  letterId: string | null;
  payload: Record<string, unknown> | null;
}

export interface BellWakeCancellationResult {
  residentId: string | null;
  cancelledWakeId: string | null;
  cancelledWakeIds: string[];
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

export interface LingyeDailyIssueRecord {
  issueDate: string;
  issueNumber: number;
  revision: number;
  revisionNote: string | null;
  periodStart: string;
  periodEnd: string;
  coverageStatus: LingyeDailyPublishRequest["coverage_status"];
  coverageNote: string;
  generatedAt: string;
  publishedAt: number;
  editorModel: string;
  screeningModel: string;
  edition: LingyeDailyEditionPublish;
}

export type LingyeDailyPublishStatus = "created" | "revised" | "duplicate";

export interface LingyeDailyPublishResult {
  issue: LingyeDailyIssueRecord;
  status: LingyeDailyPublishStatus;
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
  sharedMemeUpdateSignalsEnabled: boolean;
  browserNotificationsEnabled: boolean;
  activityRemindersEnabled: boolean;
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
  sharedMemeUpdateSignalsEnabled?: boolean;
  browserNotificationsEnabled?: boolean;
  activityRemindersEnabled?: boolean;
  defaultConnectionDurationMinutes?: number | null;
  initialRecentActivityCount?: number | null;
  chatMode?: HumanSettingsChatMode | null;
  allowActivityRoomWarmup?: boolean | null;
}

export interface CreatedHumanSession {
  activeProfileId: string;
  community: HumanCommunityRecord;
  accountCreated: boolean;
  profiles: HumanProfileSummaryRecord[];
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

export class HumanLoginLockedError extends Error {
  constructor() {
    super("The human account login is temporarily locked");
    this.name = "HumanLoginLockedError";
  }
}

export class HumanProfileNotAvailableError extends Error {
  constructor() {
    super("The selected profile is not available to this human account");
    this.name = "HumanProfileNotAvailableError";
  }
}

export class FarmAlreadyBoundError extends Error {
  constructor() {
    super("The farm doorplate is already bound to another profile");
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

export class LingyeDailyIdempotencyConflictError extends Error {
  constructor() {
    super("The Lingye Daily issue date or revision conflicts with the stored issue");
    this.name = "LingyeDailyIdempotencyConflictError";
  }
}

export class McpAccessStateConflictError extends Error {
  constructor() {
    super("The stored MCP access state conflicts with the requested transition");
    this.name = "McpAccessStateConflictError";
  }
}

export class FarmPurchaseRequestIdempotencyConflictError extends Error {
  constructor() {
    super("The farm purchase request idempotency key was already used for different content");
    this.name = "FarmPurchaseRequestIdempotencyConflictError";
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
  profile_id: string;
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
  shared_meme_update_signals_enabled: number | null;
  browser_notifications_enabled: number | null;
  activity_reminders_enabled: number | null;
  default_connection_duration_minutes: number | null;
  initial_recent_activity_count: number | null;
  chat_mode: HumanSettingsChatMode | null;
  allow_activity_room_warmup: number | null;
}

interface BrowserPushSubscriptionRow {
  resident_id: string;
  home_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: number;
  updated_at: number;
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

interface BellBindingRow {
  resident_id: string;
  credential_id: string;
  credential_token_hash: string | null;
  credential_revoked_at: number | null;
  last_connected_at: number | null;
  last_wake_mailbox_revision: number | null;
}

interface BellWakeRow {
  wake_id: string;
  resident_id: string;
  reason: BellWakeReason;
  status: BellWakeStatus;
  created_at: number;
  ended_at: number | null;
  block_reason: string | null;
  error_code: string | null;
  purchase_request_id: string | null;
  letter_id: string | null;
  payload_json: string | null;
}

interface CareerExamReminderRow {
  attempt_id: string;
  resident_id: string;
  home_id: string;
  scheduled_at: number;
  remind_at: number;
  status: CareerExamReminderStatus;
  letter_id: string | null;
  wake_id: string | null;
  created_at: number;
  delivered_at: number | null;
  cancelled_at: number | null;
}

interface ActivityReminderRow {
  resident_id: string;
  home_id: string;
  farm_doorplate: string;
  kind: ActivityReminderKind;
  source_key: string;
  ready_at: number;
  status: ActivityReminderStatus;
  created_at: number;
  delivered_at: number | null;
  cancelled_at: number | null;
}

interface FarmPurchaseRequestRow {
  request_id: string;
  wake_id: string;
  resident_id: string;
  home_id: string;
  idempotency_key: string;
  shop: FarmPurchaseShop;
  shop_revision: string;
  human_name: string;
  status: FarmPurchaseRequestStatus;
  created_at: number;
  expires_at: number;
  payload_hash: string;
}

interface FarmPurchaseItemRow {
  request_id: string;
  item_id: string;
  kind: string;
  qty: number;
  display_name: string;
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

interface LingyeDailyIssueRow {
  issue_date: string;
  issue_number: number;
  revision: number;
  revision_note: string | null;
  period_start: string;
  period_end: string;
  coverage_status: LingyeDailyPublishRequest["coverage_status"];
  coverage_note: string;
  generated_at: string;
  published_at: number;
  editor_model: string;
  screening_model: string;
  edition_json: string;
}

export interface CommunityDatabaseOptions {
  generateRegistrationCode?: () => string;
  generateSessionToken?: () => string;
  generateAccountId?: () => string;
  generateResidentId?: () => string;
  generateProfileId?: () => string;
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
    profileId: row.profile_id,
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
    sharedMemeUpdateSignalsEnabled:
      mapNullableBoolean(row.shared_meme_update_signals_enabled) ?? true,
    browserNotificationsEnabled: mapNullableBoolean(row.browser_notifications_enabled) ?? false,
    activityRemindersEnabled: mapNullableBoolean(row.activity_reminders_enabled) ?? false,
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

function mapBellWake(row: BellWakeRow): BellWakeRecord {
  let payload: Record<string, unknown> | null = null;
  if (row.payload_json !== null) {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Stored Bell wake payload is invalid");
    }
    payload = parsed as Record<string, unknown>;
  }
  return {
    wakeId: row.wake_id,
    residentId: row.resident_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    blockReason: row.block_reason,
    errorCode: row.error_code,
    purchaseRequestId: row.purchase_request_id,
    letterId: row.letter_id,
    payload,
  };
}

function mapCareerExamReminder(row: CareerExamReminderRow): CareerExamReminderRecord {
  return {
    attemptId: row.attempt_id,
    residentId: row.resident_id,
    homeId: row.home_id,
    scheduledAt: row.scheduled_at,
    remindAt: row.remind_at,
    status: row.status,
    letterId: row.letter_id,
    wakeId: row.wake_id,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

function mapActivityReminder(row: ActivityReminderRow): ActivityReminderRecord {
  return {
    residentId: row.resident_id,
    homeId: row.home_id,
    farmDoorplate: row.farm_doorplate,
    kind: row.kind,
    sourceKey: row.source_key,
    readyAt: row.ready_at,
    status: row.status,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

function mapFarmPurchaseRequest(
  row: FarmPurchaseRequestRow,
  items: readonly FarmPurchaseItemRow[],
): FarmPurchaseRequestRecord {
  return {
    requestId: row.request_id,
    wakeId: row.wake_id,
    residentId: row.resident_id,
    homeId: row.home_id,
    idempotencyKey: row.idempotency_key,
    shop: row.shop,
    shopRevision: row.shop_revision,
    humanName: row.human_name,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    items: items.map((item) => ({
      itemId: item.item_id,
      kind: item.kind,
      qty: item.qty,
      displayName: item.display_name,
    })),
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

function mapLingyeDailyIssue(row: LingyeDailyIssueRow): LingyeDailyIssueRecord {
  const edition = lingyeDailyEditionPublishSchema.parse(JSON.parse(row.edition_json));
  return {
    issueDate: row.issue_date,
    issueNumber: row.issue_number,
    revision: row.revision,
    revisionNote: row.revision_note,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    coverageStatus: row.coverage_status,
    coverageNote: row.coverage_note,
    generatedAt: row.generated_at,
    publishedAt: row.published_at,
    editorModel: row.editor_model,
    screeningModel: row.screening_model,
    edition,
  };
}

function lingyeDailyEditionFromRequest(
  input: LingyeDailyPublishRequest,
): LingyeDailyEditionPublish {
  return {
    front_page: input.front_page,
    group_chat: input.group_chat,
    behavior_slices: input.behavior_slices,
    quotes: input.quotes,
    farm_observation: input.farm_observation,
    submissions: input.submissions,
    tomorrow_question: input.tomorrow_question,
    images: input.images,
  };
}

function lingyeDailyComparableIssue(
  issue: LingyeDailyIssueRecord | LingyeDailyPublishRequest,
): string {
  const normalized =
    "issueDate" in issue
      ? {
          issue_date: issue.issueDate,
          revision: issue.revision,
          revision_note: issue.revisionNote,
          period_start: issue.periodStart,
          period_end: issue.periodEnd,
          coverage_status: issue.coverageStatus,
          coverage_note: issue.coverageNote,
          generated_at: issue.generatedAt,
          editor_model: issue.editorModel,
          screening_model: issue.screeningModel,
          ...issue.edition,
        }
      : {
          issue_date: issue.issue_date,
          revision: issue.revision,
          revision_note: issue.revision_note,
          period_start: issue.period_start,
          period_end: issue.period_end,
          coverage_status: issue.coverage_status,
          coverage_note: issue.coverage_note,
          generated_at: issue.generated_at,
          editor_model: issue.editor_model,
          screening_model: issue.screening_model,
          ...lingyeDailyEditionFromRequest(issue),
        };
  return JSON.stringify(normalized);
}

export class CommunityDatabase {
  readonly #database: Database.Database;
  readonly #generateRegistrationCode: () => string;
  readonly #generateSessionToken: () => string;
  readonly #generateAccountId: () => string;
  readonly #generateResidentId: () => string;
  readonly #generateProfileId: () => string;
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
    this.#generateProfileId = options.generateProfileId ?? randomUUID;
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
        qq_number TEXT NOT NULL,
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

      CREATE UNIQUE INDEX IF NOT EXISTS farm_creation_requests_one_pending_per_qq
        ON farm_creation_requests (qq_number)
        WHERE completed_at IS NULL;

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
        profile_id TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
        resident_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (account_id, profile_id)
      );

      CREATE TABLE IF NOT EXISTS homes (
        home_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL UNIQUE REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        mailbox_revision INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_revision >= 0)
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
        shared_meme_update_signals_enabled INTEGER NOT NULL DEFAULT 1
          CHECK (shared_meme_update_signals_enabled IN (0, 1)),
        browser_notifications_enabled INTEGER NOT NULL DEFAULT 0
          CHECK (browser_notifications_enabled IN (0, 1)),
        activity_reminders_enabled INTEGER NOT NULL DEFAULT 0
          CHECK (activity_reminders_enabled IN (0, 1)),
        default_connection_duration_minutes INTEGER
          CHECK (default_connection_duration_minutes > 0),
        initial_recent_activity_count INTEGER CHECK (initial_recent_activity_count >= 0),
        chat_mode TEXT CHECK (chat_mode IN ('natural', 'proactive', 'listening')),
        allow_activity_room_warmup INTEGER CHECK (allow_activity_room_warmup IN (0, 1)),
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
        endpoint TEXT NOT NULL,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (endpoint, resident_id, home_id)
      );

      CREATE INDEX IF NOT EXISTS browser_push_subscriptions_resident
        ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);

      CREATE TABLE IF NOT EXISTS lingye_daily_issues (
        issue_date TEXT PRIMARY KEY,
        issue_number INTEGER NOT NULL UNIQUE CHECK (issue_number > 0),
        revision INTEGER NOT NULL CHECK (revision > 0),
        revision_note TEXT,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial')),
        coverage_note TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        published_at INTEGER NOT NULL,
        editor_model TEXT NOT NULL,
        screening_model TEXT NOT NULL,
        edition_json TEXT NOT NULL,
        CHECK (
          (revision = 1 AND revision_note IS NULL)
          OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
        )
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

      CREATE TABLE IF NOT EXISTS bell_bindings (
        resident_id TEXT PRIMARY KEY REFERENCES residents(resident_id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        credential_token_hash TEXT UNIQUE,
        credential_issued_at INTEGER NOT NULL,
        credential_revoked_at INTEGER,
        last_connected_at INTEGER,
        last_wake_mailbox_revision INTEGER CHECK (
          last_wake_mailbox_revision IS NULL OR last_wake_mailbox_revision >= 0
        ),
        CHECK (
          (credential_token_hash IS NOT NULL
            AND credential_revoked_at IS NULL
            AND length(credential_token_hash) = 64
            AND credential_token_hash NOT GLOB '*[^0-9a-f]*')
          OR (credential_token_hash IS NULL AND credential_revoked_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS bell_wakes (
        wake_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        reason TEXT NOT NULL CHECK (
          reason IN ('mailbox_unread', 'farm_purchase_request', 'career_exam_reminder')
        ),
        status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        block_reason TEXT,
        error_code TEXT,
        purchase_request_id TEXT,
        letter_id TEXT REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
        payload_json TEXT,
        CHECK (
          (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
          OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
          OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
          OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
        ),
        CHECK (
          (reason = 'mailbox_unread'
            AND purchase_request_id IS NULL
            AND letter_id IS NULL
            AND payload_json IS NULL)
          OR (reason = 'farm_purchase_request'
            AND purchase_request_id IS NOT NULL
            AND letter_id IS NULL
            AND payload_json IS NOT NULL)
          OR (reason = 'career_exam_reminder'
            AND purchase_request_id IS NULL
            AND letter_id IS NOT NULL
            AND payload_json IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS career_exam_reminders (
        attempt_id TEXT PRIMARY KEY,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        scheduled_at INTEGER NOT NULL,
        remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
        letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
        wake_id TEXT UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER,
        cancelled_at INTEGER,
        CHECK (
          (status = 'scheduled'
            AND letter_id IS NULL
            AND wake_id IS NULL
            AND delivered_at IS NULL
            AND cancelled_at IS NULL)
          OR (status = 'delivered'
            AND letter_id IS NOT NULL
            AND wake_id IS NOT NULL
            AND delivered_at IS NOT NULL
            AND cancelled_at IS NULL)
          OR (status = 'cancelled'
            AND letter_id IS NULL
            AND wake_id IS NULL
            AND delivered_at IS NULL
            AND cancelled_at IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS career_exam_reminders_due
        ON career_exam_reminders (status, remind_at, attempt_id);

      CREATE TABLE IF NOT EXISTS activity_reminders (
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
        source_key TEXT NOT NULL,
        ready_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
        created_at INTEGER NOT NULL,
        delivered_at INTEGER,
        cancelled_at INTEGER,
        PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
        CHECK (
          (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
          OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
          OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS activity_reminders_due
        ON activity_reminders (
          status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
        );

      CREATE TABLE IF NOT EXISTS farm_purchase_requests (
        request_id TEXT PRIMARY KEY,
        wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
        resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
        home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL,
        shop TEXT NOT NULL CHECK (shop IN ('field', 'ranch')),
        shop_revision TEXT NOT NULL,
        human_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN (
            'requested',
            'processing',
            'completed',
            'partially_completed',
            'declined',
            'expired',
            'failed'
          )
        ),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
        payload_hash TEXT NOT NULL,
        UNIQUE (resident_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS farm_purchase_requests_resident_created
        ON farm_purchase_requests (resident_id, created_at DESC, request_id DESC);

      CREATE TABLE IF NOT EXISTS farm_purchase_request_items (
        request_id TEXT NOT NULL REFERENCES farm_purchase_requests(request_id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        qty INTEGER NOT NULL CHECK (qty > 0),
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('pending', 'settled', 'declined', 'failed', 'expired')
        ),
        settled_qty INTEGER NOT NULL DEFAULT 0 CHECK (settled_qty >= 0 AND settled_qty <= qty),
        receipt_id TEXT,
        reason_code TEXT,
        PRIMARY KEY (request_id, kind, item_id)
      );

      CREATE INDEX IF NOT EXISTS farm_purchase_request_items_request
        ON farm_purchase_request_items (request_id, kind, item_id);
    `);
    let migratedSchemaVersion = databaseSchemaVersion;
    if (migratedSchemaVersion < 1) {
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
        this.#database.pragma("user_version = 1");
      })();
      migratedSchemaVersion = 1;
    }
    if (migratedSchemaVersion < 2) {
      this.#database.transaction(() => {
        this.#database.exec(`
          CREATE TABLE human_login_failures (
            account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
            failed_at INTEGER NOT NULL
          );

          CREATE INDEX human_login_failures_account_time
            ON human_login_failures (account_id, failed_at);

          CREATE TABLE human_login_locks (
            account_id TEXT PRIMARY KEY REFERENCES human_accounts(account_id) ON DELETE CASCADE,
            locked_until INTEGER NOT NULL
          );
        `);
        this.#database.pragma("user_version = 2");
      })();
      migratedSchemaVersion = 2;
    }
    if (migratedSchemaVersion < 3) {
      this.#database.transaction(() => {
        this.#database.exec(`
          ALTER TABLE connector_delivery_state RENAME TO connector_delivery_state_v2;
          ALTER TABLE connector_events RENAME TO connector_events_v2;

          CREATE TABLE connector_delivery_state (
            generation TEXT NOT NULL CHECK (length(generation) > 0),
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            last_event_cursor INTEGER NOT NULL DEFAULT 0 CHECK (last_event_cursor >= 0),
            last_acked_cursor INTEGER NOT NULL DEFAULT 0 CHECK (
              last_acked_cursor >= 0 AND last_acked_cursor <= last_event_cursor
            ),
            PRIMARY KEY (generation, resident_id)
          );

          CREATE TABLE connector_events (
            generation TEXT NOT NULL CHECK (length(generation) > 0),
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            cursor INTEGER NOT NULL CHECK (cursor > 0),
            event_id TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (generation, resident_id, cursor)
          );

          INSERT INTO connector_delivery_state (
            generation,
            resident_id,
            last_event_cursor,
            last_acked_cursor
          )
          SELECT '${LEGACY_CONNECTOR_DELIVERY_GENERATION}',
                 resident_id,
                 last_event_cursor,
                 last_acked_cursor
          FROM connector_delivery_state_v2;

          INSERT INTO connector_events (
            generation,
            resident_id,
            cursor,
            event_id,
            event_type,
            created_at,
            payload_json
          )
          SELECT '${LEGACY_CONNECTOR_DELIVERY_GENERATION}',
                 resident_id,
                 cursor,
                 event_id,
                 event_type,
                 created_at,
                 payload_json
          FROM connector_events_v2;

          DROP TABLE connector_events_v2;
          DROP TABLE connector_delivery_state_v2;
        `);
        this.#database.pragma("user_version = 3");
      })();
      migratedSchemaVersion = 3;
    }
    if (migratedSchemaVersion < 4) {
      this.#database.transaction(() => {
        const homeColumns = this.#database.pragma("table_info(homes)") as Array<{
          name: string;
        }>;
        if (!homeColumns.some((column) => column.name === "mailbox_revision")) {
          this.#database.exec(
            "ALTER TABLE homes ADD COLUMN mailbox_revision INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_revision >= 0)",
          );
        }
        this.#database.pragma("user_version = 4");
      })();
      migratedSchemaVersion = 4;
    }
    if (migratedSchemaVersion < 5) {
      this.#database.transaction(() => {
        this.#database.exec(`
          CREATE TABLE IF NOT EXISTS lingye_daily_issues (
            issue_date TEXT PRIMARY KEY,
            issue_number INTEGER NOT NULL UNIQUE CHECK (issue_number > 0),
            revision INTEGER NOT NULL CHECK (revision > 0),
            revision_note TEXT,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial')),
            coverage_note TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            published_at INTEGER NOT NULL,
            editor_model TEXT NOT NULL,
            screening_model TEXT NOT NULL,
            group_chat_json TEXT NOT NULL,
            CHECK (
              (revision = 1 AND revision_note IS NULL)
              OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
            )
          );
        `);
        this.#database.pragma("user_version = 5");
      })();
      migratedSchemaVersion = 5;
    }
    if (migratedSchemaVersion < 6) {
      this.#database.transaction(() => {
        const dailyColumns = this.#database.pragma("table_info(lingye_daily_issues)") as Array<{
          name: string;
        }>;
        if (dailyColumns.some((column) => column.name === "group_chat_json")) {
          const legacyRows = this.#database
            .prepare(
              `SELECT issue_date,
                      issue_number,
                      revision,
                      revision_note,
                      period_start,
                      period_end,
                      coverage_status,
                      coverage_note,
                      generated_at,
                      published_at,
                      editor_model,
                      screening_model,
                      group_chat_json
               FROM lingye_daily_issues`,
            )
            .all() as Array<
            Omit<LingyeDailyIssueRow, "edition_json"> & { group_chat_json: string }
          >;
          this.#database.exec(`
            CREATE TABLE lingye_daily_issues_v6 (
              issue_date TEXT PRIMARY KEY,
              issue_number INTEGER NOT NULL UNIQUE CHECK (issue_number > 0),
              revision INTEGER NOT NULL CHECK (revision > 0),
              revision_note TEXT,
              period_start TEXT NOT NULL,
              period_end TEXT NOT NULL,
              coverage_status TEXT NOT NULL CHECK (coverage_status IN ('complete', 'partial')),
              coverage_note TEXT NOT NULL,
              generated_at TEXT NOT NULL,
              published_at INTEGER NOT NULL,
              editor_model TEXT NOT NULL,
              screening_model TEXT NOT NULL,
              edition_json TEXT NOT NULL,
              CHECK (
                (revision = 1 AND revision_note IS NULL)
                OR (revision > 1 AND revision_note IS NOT NULL AND length(trim(revision_note)) > 0)
              )
            );
          `);
          const insert = this.#database.prepare(
            `INSERT INTO lingye_daily_issues_v6 (
               issue_date,
               issue_number,
               revision,
               revision_note,
               period_start,
               period_end,
               coverage_status,
               coverage_note,
               generated_at,
               published_at,
               editor_model,
               screening_model,
               edition_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const row of legacyRows) {
            const legacyGroupChat = JSON.parse(row.group_chat_json) as {
              summary: string;
              topic_sources: LingyeDailyEditionPublish["group_chat"]["topics"];
            };
            const edition = lingyeDailyEditionPublishSchema.parse({
              front_page: null,
              group_chat: {
                summary: legacyGroupChat.summary,
                topics: legacyGroupChat.topic_sources,
              },
              behavior_slices: [],
              quotes: [],
              farm_observation: null,
              submissions: [],
              tomorrow_question: null,
              images: [],
            });
            insert.run(
              row.issue_date,
              row.issue_number,
              row.revision,
              row.revision_note,
              row.period_start,
              row.period_end,
              row.coverage_status,
              row.coverage_note,
              row.generated_at,
              row.published_at,
              row.editor_model,
              row.screening_model,
              JSON.stringify(edition),
            );
          }
          this.#database.exec(`
            DROP TABLE lingye_daily_issues;
            ALTER TABLE lingye_daily_issues_v6 RENAME TO lingye_daily_issues;
          `);
        }
        this.#database.pragma("user_version = 6");
      })();
      migratedSchemaVersion = 6;
    }
    if (migratedSchemaVersion < 7) {
      this.#database.transaction(() => {
        const wakeColumns = this.#database.pragma("table_info(bell_wakes)") as Array<{
          name: string;
        }>;
        const hasPurchaseRequestId = wakeColumns.some(
          (column) => column.name === "purchase_request_id",
        );
        const hasPayloadJson = wakeColumns.some((column) => column.name === "payload_json");
        const legacyRows =
          !hasPurchaseRequestId || !hasPayloadJson
            ? (this.#database
                .prepare(
                  `SELECT wake_id,
                          resident_id,
                          reason,
                          status,
                          created_at,
                          ended_at,
                          block_reason,
                          error_code,
                          ${hasPurchaseRequestId ? "purchase_request_id" : "NULL AS purchase_request_id"},
                          ${hasPayloadJson ? "payload_json" : "NULL AS payload_json"}
                   FROM bell_wakes`,
                )
                .all() as BellWakeRow[])
            : [];

        if (legacyRows.length > 0 || !hasPurchaseRequestId || !hasPayloadJson) {
          this.#database.exec(`
          DROP INDEX IF EXISTS bell_wakes_one_pending_per_resident;
          DROP INDEX IF EXISTS bell_wakes_one_purchase_request;
          ALTER TABLE bell_wakes RENAME TO bell_wakes_v6;

          CREATE TABLE bell_wakes (
            wake_id TEXT PRIMARY KEY,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            reason TEXT NOT NULL CHECK (reason IN ('mailbox_unread', 'farm_purchase_request')),
            status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
            created_at INTEGER NOT NULL,
            ended_at INTEGER,
            block_reason TEXT,
            error_code TEXT,
            purchase_request_id TEXT,
            payload_json TEXT,
            CHECK (
              (status = 'pending' AND ended_at IS NULL AND block_reason IS NULL AND error_code IS NULL)
              OR (status = 'acked' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
              OR (status = 'blocked' AND ended_at IS NOT NULL AND block_reason IS NOT NULL AND error_code IS NOT NULL)
              OR (status = 'cancelled' AND ended_at IS NOT NULL AND block_reason IS NULL AND error_code IS NULL)
            ),
            CHECK (
              (reason = 'mailbox_unread' AND purchase_request_id IS NULL AND payload_json IS NULL)
              OR (reason = 'farm_purchase_request'
                AND purchase_request_id IS NOT NULL
                AND payload_json IS NOT NULL)
            )
          );
        `);
          const insertWake = this.#database.prepare(
            `INSERT INTO bell_wakes (
               wake_id,
               resident_id,
               reason,
               status,
               created_at,
               ended_at,
               block_reason,
               error_code,
               purchase_request_id,
               payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const row of legacyRows) {
            insertWake.run(
              row.wake_id,
              row.resident_id,
              row.reason,
              row.status,
              row.created_at,
              row.ended_at,
              row.block_reason,
              row.error_code,
              row.purchase_request_id,
              row.payload_json,
            );
          }
          this.#database.exec(`
          DROP TABLE bell_wakes_v6;
          CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
            ON bell_wakes (purchase_request_id)
            WHERE purchase_request_id IS NOT NULL;
        `);
        }
        this.#database.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
            ON bell_wakes (purchase_request_id)
            WHERE purchase_request_id IS NOT NULL;

          CREATE TABLE IF NOT EXISTS farm_purchase_requests (
            request_id TEXT PRIMARY KEY,
            wake_id TEXT NOT NULL UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
            idempotency_key TEXT NOT NULL,
            shop TEXT NOT NULL CHECK (shop IN ('field', 'ranch')),
            shop_revision TEXT NOT NULL,
            human_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (
              status IN (
                'requested',
                'processing',
                'completed',
                'partially_completed',
                'declined',
                'expired',
                'failed'
              )
            ),
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 86400000),
            payload_hash TEXT NOT NULL,
            UNIQUE (resident_id, idempotency_key)
          );

          CREATE INDEX IF NOT EXISTS farm_purchase_requests_resident_created
            ON farm_purchase_requests (resident_id, created_at DESC, request_id DESC);

          CREATE TABLE IF NOT EXISTS farm_purchase_request_items (
            request_id TEXT NOT NULL REFERENCES farm_purchase_requests(request_id) ON DELETE CASCADE,
            item_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            qty INTEGER NOT NULL CHECK (qty > 0),
            display_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (
              status IN ('pending', 'settled', 'declined', 'failed', 'expired')
            ),
            settled_qty INTEGER NOT NULL DEFAULT 0 CHECK (settled_qty >= 0 AND settled_qty <= qty),
            receipt_id TEXT,
            reason_code TEXT,
            PRIMARY KEY (request_id, kind, item_id)
          );

          CREATE INDEX IF NOT EXISTS farm_purchase_request_items_request
            ON farm_purchase_request_items (request_id, kind, item_id);
        `);
        this.#database.pragma("user_version = 7");
      })();
      migratedSchemaVersion = 7;
    }
    if (migratedSchemaVersion < 8) {
      const wakeColumns = this.#database.pragma("table_info(bell_wakes)") as Array<{
        name: string;
      }>;
      const hasLetterId = wakeColumns.some((column) => column.name === "letter_id");
      this.#database.pragma("foreign_keys = OFF");
      try {
        this.#database.transaction(() => {
          if (!hasLetterId) {
            this.#database.exec(`
              DROP INDEX IF EXISTS bell_wakes_one_purchase_request;

              CREATE TABLE bell_wakes_v8 (
                wake_id TEXT PRIMARY KEY,
                resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
                reason TEXT NOT NULL CHECK (
                  reason IN ('mailbox_unread', 'farm_purchase_request', 'career_exam_reminder')
                ),
                status TEXT NOT NULL CHECK (status IN ('pending', 'acked', 'blocked', 'cancelled')),
                created_at INTEGER NOT NULL,
                ended_at INTEGER,
                block_reason TEXT,
                error_code TEXT,
                purchase_request_id TEXT,
                letter_id TEXT REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
                payload_json TEXT,
                CHECK (
                  (status = 'pending'
                    AND ended_at IS NULL
                    AND block_reason IS NULL
                    AND error_code IS NULL)
                  OR (status = 'acked'
                    AND ended_at IS NOT NULL
                    AND block_reason IS NULL
                    AND error_code IS NULL)
                  OR (status = 'blocked'
                    AND ended_at IS NOT NULL
                    AND block_reason IS NOT NULL
                    AND error_code IS NOT NULL)
                  OR (status = 'cancelled'
                    AND ended_at IS NOT NULL
                    AND block_reason IS NULL
                    AND error_code IS NULL)
                ),
                CHECK (
                  (reason = 'mailbox_unread'
                    AND purchase_request_id IS NULL
                    AND letter_id IS NULL
                    AND payload_json IS NULL)
                  OR (reason = 'farm_purchase_request'
                    AND purchase_request_id IS NOT NULL
                    AND letter_id IS NULL
                    AND payload_json IS NOT NULL)
                  OR (reason = 'career_exam_reminder'
                    AND purchase_request_id IS NULL
                    AND letter_id IS NOT NULL
                    AND payload_json IS NOT NULL)
                )
              );

              INSERT INTO bell_wakes_v8 (
                wake_id,
                resident_id,
                reason,
                status,
                created_at,
                ended_at,
                block_reason,
                error_code,
                purchase_request_id,
                letter_id,
                payload_json
              )
              SELECT wake_id,
                     resident_id,
                     reason,
                     status,
                     created_at,
                     ended_at,
                     block_reason,
                     error_code,
                     purchase_request_id,
                     NULL,
                     payload_json
              FROM bell_wakes;

              DROP TABLE bell_wakes;
              ALTER TABLE bell_wakes_v8 RENAME TO bell_wakes;
            `);
          }
          this.#database.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request
              ON bell_wakes (purchase_request_id)
              WHERE purchase_request_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS career_exam_reminders (
              attempt_id TEXT PRIMARY KEY,
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              scheduled_at INTEGER NOT NULL,
              remind_at INTEGER NOT NULL CHECK (remind_at = scheduled_at - 300000),
              status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
              letter_id TEXT UNIQUE REFERENCES mailbox_letters(letter_id) ON DELETE RESTRICT,
              wake_id TEXT UNIQUE REFERENCES bell_wakes(wake_id) ON DELETE RESTRICT,
              created_at INTEGER NOT NULL,
              delivered_at INTEGER,
              cancelled_at INTEGER,
              CHECK (
                (status = 'scheduled'
                  AND letter_id IS NULL
                  AND wake_id IS NULL
                  AND delivered_at IS NULL
                  AND cancelled_at IS NULL)
                OR (status = 'delivered'
                  AND letter_id IS NOT NULL
                  AND wake_id IS NOT NULL
                  AND delivered_at IS NOT NULL
                  AND cancelled_at IS NULL)
                OR (status = 'cancelled'
                  AND letter_id IS NULL
                  AND wake_id IS NULL
                  AND delivered_at IS NULL
                  AND cancelled_at IS NOT NULL)
              )
            );

            CREATE INDEX IF NOT EXISTS career_exam_reminders_due
              ON career_exam_reminders (status, remind_at, attempt_id);
          `);
          this.#database.pragma("user_version = 8");
        })();
      } finally {
        this.#database.pragma("foreign_keys = ON");
      }
      const foreignKeyErrors = this.#database.pragma("foreign_key_check") as unknown[];
      if (foreignKeyErrors.length > 0) {
        throw new Error("Community database schema v8 migration violated foreign keys");
      }
      migratedSchemaVersion = 8;
    }
    if (migratedSchemaVersion < 9) {
      this.#database.transaction(() => {
        const settingsColumns = this.#database.pragma("table_info(human_settings)") as Array<{
          name: string;
        }>;
        if (
          !settingsColumns.some((column) => column.name === "shared_meme_update_signals_enabled")
        ) {
          this.#database.exec(
            "ALTER TABLE human_settings ADD COLUMN shared_meme_update_signals_enabled INTEGER NOT NULL DEFAULT 1 CHECK (shared_meme_update_signals_enabled IN (0, 1))",
          );
        }
        if (!settingsColumns.some((column) => column.name === "browser_notifications_enabled")) {
          this.#database.exec(
            "ALTER TABLE human_settings ADD COLUMN browser_notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (browser_notifications_enabled IN (0, 1))",
          );
        }
        if (!settingsColumns.some((column) => column.name === "activity_reminders_enabled")) {
          this.#database.exec(
            "ALTER TABLE human_settings ADD COLUMN activity_reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK (activity_reminders_enabled IN (0, 1))",
          );
        }
        this.#database.exec(`
          CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
            home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );

          CREATE INDEX IF NOT EXISTS browser_push_subscriptions_resident
            ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);
        `);
        this.#database.pragma("user_version = 9");
      })();
      migratedSchemaVersion = 9;
    }
    if (migratedSchemaVersion < 10) {
      const residentColumns = this.#database.pragma("table_info(residents)") as Array<{
        name: string;
      }>;
      const sessionColumns = this.#database.pragma("table_info(human_sessions)") as Array<{
        name: string;
      }>;
      const hasProfileId = residentColumns.some((column) => column.name === "profile_id");
      const hasActiveProfileId = sessionColumns.some(
        (column) => column.name === "active_profile_id",
      );
      if (!hasProfileId || !hasActiveProfileId) {
        const legacyResidents = this.#database
          .prepare(
            `SELECT resident_id, account_id, resident_name, created_at
             FROM residents
             ORDER BY created_at ASC, resident_id ASC`,
          )
          .all() as Array<{
          resident_id: string;
          account_id: string;
          resident_name: string;
          created_at: number;
        }>;
        const legacySessions = this.#database
          .prepare(
            `SELECT token_hash, account_id, created_at, revoked_at
             FROM human_sessions
             ORDER BY created_at ASC, token_hash ASC`,
          )
          .all() as Array<{
          token_hash: string;
          account_id: string;
          created_at: number;
          revoked_at: number | null;
        }>;
        const legacyFarmCreationRequests = this.#database
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
             ORDER BY requested_at ASC, creation_id ASC`,
          )
          .all() as FarmCreationRequestRow[];
        const profileByAccount = new Map<string, string>();
        this.#database.pragma("foreign_keys = OFF");
        try {
          this.#database.transaction(() => {
            this.#database.exec(`
              CREATE TABLE residents_v10 (
                resident_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL UNIQUE,
                account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
                resident_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE (account_id, profile_id)
              );

              CREATE TABLE human_sessions_v10 (
                token_hash TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES human_accounts(account_id) ON DELETE CASCADE,
                active_profile_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                revoked_at INTEGER,
                FOREIGN KEY (account_id, active_profile_id)
                  REFERENCES residents(account_id, profile_id) ON DELETE CASCADE
              );

              CREATE TABLE farm_creation_requests_v10 (
                creation_id TEXT PRIMARY KEY,
                qq_number TEXT NOT NULL,
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
            `);
            const insertResident = this.#database.prepare(
              `INSERT INTO residents_v10 (
                 resident_id, profile_id, account_id, resident_name, created_at
               ) VALUES (?, ?, ?, ?, ?)`,
            );
            for (const resident of legacyResidents) {
              const profileId = this.#generateProfileId();
              profileByAccount.set(resident.account_id, profileId);
              insertResident.run(
                resident.resident_id,
                profileId,
                resident.account_id,
                resident.resident_name,
                resident.created_at,
              );
            }
            const insertSession = this.#database.prepare(
              `INSERT INTO human_sessions_v10 (
                 token_hash, account_id, active_profile_id, created_at, revoked_at
               ) VALUES (?, ?, ?, ?, ?)`,
            );
            for (const session of legacySessions) {
              const activeProfileId = profileByAccount.get(session.account_id);
              if (!activeProfileId) {
                throw new Error(
                  "Human session has no resident profile during schema v10 migration",
                );
              }
              insertSession.run(
                session.token_hash,
                session.account_id,
                activeProfileId,
                session.created_at,
                session.revoked_at,
              );
            }
            const insertCreation = this.#database.prepare(
              `INSERT INTO farm_creation_requests_v10 (
                 creation_id,
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
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            );
            for (const request of legacyFarmCreationRequests) {
              insertCreation.run(
                request.creation_id,
                request.qq_number,
                request.requested_farm_name,
                request.requested_ai_name,
                request.requested_human_name,
                request.requested_at,
                request.farm_doorplate,
                request.farm_name,
                request.ai_name,
                request.human_name,
                request.farm_human_key,
                request.farm_created_at,
                request.completed_at,
              );
            }
            this.#database.exec(`
              DROP TABLE human_sessions;
              DROP TABLE residents;
              DROP TABLE farm_creation_requests;
              ALTER TABLE residents_v10 RENAME TO residents;
              ALTER TABLE human_sessions_v10 RENAME TO human_sessions;
              ALTER TABLE farm_creation_requests_v10 RENAME TO farm_creation_requests;
              CREATE UNIQUE INDEX farm_creation_requests_one_pending_per_qq
                ON farm_creation_requests (qq_number)
                WHERE completed_at IS NULL;

              CREATE TABLE IF NOT EXISTS activity_reminders (
                resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
                home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
                farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
                source_key TEXT NOT NULL,
                ready_at INTEGER NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
                created_at INTEGER NOT NULL,
                delivered_at INTEGER,
                cancelled_at INTEGER,
                PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
                CHECK (
                  (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
                  OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
                  OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
                )
              );

              CREATE INDEX IF NOT EXISTS activity_reminders_due
                ON activity_reminders (
                  status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
                );
            `);
            this.#database.pragma("user_version = 10");
          })();
        } finally {
          this.#database.pragma("foreign_keys = ON");
        }
        const foreignKeyErrors = this.#database.pragma("foreign_key_check") as unknown[];
        if (foreignKeyErrors.length > 0) {
          throw new Error("Community database schema v10 migration violated foreign keys");
        }
      } else {
        this.#database.transaction(() => {
          this.#database.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS farm_creation_requests_one_pending_per_qq
              ON farm_creation_requests (qq_number)
              WHERE completed_at IS NULL;

            CREATE TABLE IF NOT EXISTS activity_reminders (
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              farm_doorplate TEXT NOT NULL REFERENCES farm_bindings(farm_doorplate) ON DELETE CASCADE,
              kind TEXT NOT NULL CHECK (kind IN ('crop_matured', 'glimmer_capture_ready')),
              source_key TEXT NOT NULL,
              ready_at INTEGER NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled')),
              created_at INTEGER NOT NULL,
              delivered_at INTEGER,
              cancelled_at INTEGER,
              PRIMARY KEY (resident_id, home_id, farm_doorplate, kind, source_key),
              CHECK (
                (status = 'scheduled' AND delivered_at IS NULL AND cancelled_at IS NULL)
                OR (status = 'delivered' AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
                OR (status = 'cancelled' AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
              )
            );

            CREATE INDEX IF NOT EXISTS activity_reminders_due
              ON activity_reminders (
                status, ready_at, resident_id, home_id, farm_doorplate, kind, source_key
              );
          `);
          this.#database.pragma("user_version = 10");
        })();
      }
      migratedSchemaVersion = 10;
    }
    if (migratedSchemaVersion < 11) {
      this.#database.pragma("foreign_keys = OFF");
      try {
        this.#database.transaction(() => {
          this.#database.exec(`
            DROP TABLE IF EXISTS browser_push_subscriptions_v11;
            CREATE TABLE browser_push_subscriptions_v11 (
              endpoint TEXT NOT NULL,
              resident_id TEXT NOT NULL REFERENCES residents(resident_id) ON DELETE CASCADE,
              home_id TEXT NOT NULL REFERENCES homes(home_id) ON DELETE CASCADE,
              p256dh TEXT NOT NULL,
              auth TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              PRIMARY KEY (endpoint, resident_id, home_id)
            );

            INSERT INTO browser_push_subscriptions_v11 (
              endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
            )
            SELECT endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
            FROM browser_push_subscriptions;

            DROP TABLE browser_push_subscriptions;
            ALTER TABLE browser_push_subscriptions_v11 RENAME TO browser_push_subscriptions;
            CREATE INDEX browser_push_subscriptions_resident
              ON browser_push_subscriptions (resident_id, updated_at DESC, endpoint);
          `);
          this.#database.pragma("user_version = 11");
        })();
      } finally {
        this.#database.pragma("foreign_keys = ON");
      }
      const foreignKeyErrors = this.#database.pragma("foreign_key_check") as unknown[];
      if (foreignKeyErrors.length > 0) {
        throw new Error("Community database schema v11 migration violated foreign keys");
      }
      migratedSchemaVersion = 11;
    }
    this.#database.transaction(() => {
      const itemColumns = this.#database.pragma(
        "table_info(farm_purchase_request_items)",
      ) as Array<{
        name: string;
      }>;
      if (!itemColumns.some((column) => column.name === "settled_qty")) {
        this.#database.exec(
          "ALTER TABLE farm_purchase_request_items ADD COLUMN settled_qty INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!itemColumns.some((column) => column.name === "receipt_id")) {
        this.#database.exec("ALTER TABLE farm_purchase_request_items ADD COLUMN receipt_id TEXT");
      }
      if (!itemColumns.some((column) => column.name === "reason_code")) {
        this.#database.exec("ALTER TABLE farm_purchase_request_items ADD COLUMN reason_code TEXT");
      }
    })();
    this.#database.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS bell_wakes_one_purchase_request ON bell_wakes (purchase_request_id) WHERE purchase_request_id IS NOT NULL",
    );
  }

  upsertBrowserPushSubscription(input: {
    residentId: string;
    homeId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    now: number;
  }): BrowserPushSubscriptionRecord {
    const transaction = this.#database.transaction(() => {
      const owner = this.#database
        .prepare(
          `SELECT r.resident_id, r.account_id, h.home_id
           FROM residents AS r
           JOIN homes AS h ON h.resident_id = r.resident_id
           WHERE r.resident_id = ? AND h.home_id = ?`,
        )
        .get(input.residentId, input.homeId) as
        | { resident_id: string; account_id: string; home_id: string }
        | undefined;
      if (!owner) throw new Error("The browser push subscription owner does not exist");
      const endpointAccounts = this.#database
        .prepare(
          `SELECT DISTINCT r.account_id
           FROM browser_push_subscriptions AS subscription
           JOIN residents AS r ON r.resident_id = subscription.resident_id
           WHERE subscription.endpoint = ?`,
        )
        .all(input.endpoint) as Array<{ account_id: string }>;
      if (endpointAccounts.some((row) => row.account_id !== owner.account_id)) {
        throw new Error("The browser push endpoint already belongs to another account");
      }
      const existing = this.#database
        .prepare(
          `SELECT created_at
           FROM browser_push_subscriptions
           WHERE endpoint = ? AND resident_id = ? AND home_id = ?`,
        )
        .get(input.endpoint, input.residentId, input.homeId) as { created_at: number } | undefined;
      this.#database
        .prepare(
          `INSERT INTO browser_push_subscriptions (
             endpoint, resident_id, home_id, p256dh, auth, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint, resident_id, home_id) DO UPDATE SET
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             updated_at = excluded.updated_at`,
        )
        .run(
          input.endpoint,
          input.residentId,
          input.homeId,
          input.p256dh,
          input.auth,
          existing?.created_at ?? input.now,
          input.now,
        );
      return this.#database
        .prepare(
          `SELECT resident_id, home_id, endpoint, p256dh, auth, created_at, updated_at
           FROM browser_push_subscriptions
           WHERE endpoint = ? AND resident_id = ? AND home_id = ?`,
        )
        .get(input.endpoint, input.residentId, input.homeId) as BrowserPushSubscriptionRow;
    });
    const row = transaction.immediate();
    return {
      residentId: row.resident_id,
      homeId: row.home_id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  deleteBrowserPushSubscription(
    residentId: string,
    endpoint: string,
  ): { deleted: boolean; endpointStillUsed: boolean } {
    const transaction = this.#database.transaction(() => {
      const deleted =
        this.#database
          .prepare("DELETE FROM browser_push_subscriptions WHERE resident_id = ? AND endpoint = ?")
          .run(residentId, endpoint).changes === 1;
      const endpointStillUsed =
        this.#database
          .prepare("SELECT 1 FROM browser_push_subscriptions WHERE endpoint = ? LIMIT 1")
          .get(endpoint) !== undefined;
      return { deleted, endpointStillUsed };
    });
    return transaction.immediate();
  }

  listBrowserPushSubscriptions(residentId: string): BrowserPushSubscriptionRecord[] {
    return (
      this.#database
        .prepare(
          `SELECT resident_id, home_id, endpoint, p256dh, auth, created_at, updated_at
           FROM browser_push_subscriptions
           WHERE resident_id = ?
           ORDER BY updated_at DESC, endpoint ASC`,
        )
        .all(residentId) as BrowserPushSubscriptionRow[]
    ).map((row) => ({
      residentId: row.resident_id,
      homeId: row.home_id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  publishLingyeDailyIssue(
    input: LingyeDailyPublishRequest,
    publishedAt: number,
  ): LingyeDailyPublishResult {
    const transaction = this.#database.transaction(() => {
      const existingRow = this.#database
        .prepare(
          `SELECT issue_date,
                  issue_number,
                  revision,
                  revision_note,
                  period_start,
                  period_end,
                  coverage_status,
                  coverage_note,
                  generated_at,
                  published_at,
                  editor_model,
                  screening_model,
                  edition_json
           FROM lingye_daily_issues
           WHERE issue_date = ?`,
        )
        .get(input.issue_date) as LingyeDailyIssueRow | undefined;

      if (existingRow) {
        const existing = mapLingyeDailyIssue(existingRow);
        if (input.revision === existing.revision) {
          if (lingyeDailyComparableIssue(existing) !== lingyeDailyComparableIssue(input)) {
            throw new LingyeDailyIdempotencyConflictError();
          }
          return { issue: existing, status: "duplicate" as const };
        }
        if (
          input.revision !== existing.revision + 1 ||
          input.period_start !== existing.periodStart ||
          input.period_end !== existing.periodEnd
        ) {
          throw new LingyeDailyIdempotencyConflictError();
        }
        this.#database
          .prepare(
            `UPDATE lingye_daily_issues
             SET revision = ?,
                 revision_note = ?,
                 coverage_status = ?,
                 coverage_note = ?,
                 generated_at = ?,
                 published_at = ?,
                 editor_model = ?,
                 screening_model = ?,
                 edition_json = ?
             WHERE issue_date = ?`,
          )
          .run(
            input.revision,
            input.revision_note,
            input.coverage_status,
            input.coverage_note,
            input.generated_at,
            publishedAt,
            input.editor_model,
            input.screening_model,
            JSON.stringify(lingyeDailyEditionFromRequest(input)),
            input.issue_date,
          );
        return {
          issue: {
            issueDate: input.issue_date,
            issueNumber: existing.issueNumber,
            revision: input.revision,
            revisionNote: input.revision_note,
            periodStart: input.period_start,
            periodEnd: input.period_end,
            coverageStatus: input.coverage_status,
            coverageNote: input.coverage_note,
            generatedAt: input.generated_at,
            publishedAt,
            editorModel: input.editor_model,
            screeningModel: input.screening_model,
            edition: lingyeDailyEditionFromRequest(input),
          },
          status: "revised" as const,
        };
      }

      if (input.revision !== 1) {
        throw new LingyeDailyIdempotencyConflictError();
      }
      const issueNumber = (
        this.#database
          .prepare(
            "SELECT COALESCE(MAX(issue_number), 0) + 1 AS issue_number FROM lingye_daily_issues",
          )
          .get() as { issue_number: number }
      ).issue_number;
      this.#database
        .prepare(
          `INSERT INTO lingye_daily_issues (
             issue_date,
             issue_number,
             revision,
             revision_note,
             period_start,
             period_end,
             coverage_status,
             coverage_note,
             generated_at,
             published_at,
             editor_model,
             screening_model,
             edition_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.issue_date,
          issueNumber,
          input.revision,
          input.revision_note,
          input.period_start,
          input.period_end,
          input.coverage_status,
          input.coverage_note,
          input.generated_at,
          publishedAt,
          input.editor_model,
          input.screening_model,
          JSON.stringify(lingyeDailyEditionFromRequest(input)),
        );
      return {
        issue: {
          issueDate: input.issue_date,
          issueNumber,
          revision: input.revision,
          revisionNote: input.revision_note,
          periodStart: input.period_start,
          periodEnd: input.period_end,
          coverageStatus: input.coverage_status,
          coverageNote: input.coverage_note,
          generatedAt: input.generated_at,
          publishedAt,
          editorModel: input.editor_model,
          screeningModel: input.screening_model,
          edition: lingyeDailyEditionFromRequest(input),
        },
        status: "created" as const,
      };
    });
    return transaction.immediate();
  }

  getLatestLingyeDailyIssue(): LingyeDailyIssueRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT issue_date,
                issue_number,
                revision,
                revision_note,
                period_start,
                period_end,
                coverage_status,
                coverage_note,
                generated_at,
                published_at,
                editor_model,
                screening_model,
                edition_json
         FROM lingye_daily_issues
         ORDER BY issue_date DESC
         LIMIT 1`,
      )
      .get() as LingyeDailyIssueRow | undefined;
    return row ? mapLingyeDailyIssue(row) : undefined;
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
           WHERE qq_number = ? AND completed_at IS NULL
           ORDER BY requested_at ASC, creation_id ASC
           LIMIT 1`,
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

      const existingCommunities = account
        ? this.#listCommunitiesByAccountId(account.account_id)
        : [];
      if (existingCommunities.length > 0) {
        throw new HumanAccountAlreadyRegisteredError();
      }

      if (account && !registration) {
        throw new RegistrationProfileRequiredError();
      }

      if (registration) {
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

      if (!registration) {
        throw new RegistrationProfileRequiredError();
      }
      const community = this.#createProfileForAccount(
        account.account_id,
        qqNumber,
        now,
        registration,
      );
      if (community.farmBinding.farmHumanKey === null) {
        throw new RegistrationProfileRequiredError();
      }

      const token = this.#generateSessionToken();
      this.#database
        .prepare(
          `INSERT INTO human_sessions (
             token_hash, account_id, active_profile_id, created_at
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(hashSessionToken(token), account.account_id, community.profileId, now);

      return {
        activeProfileId: community.profileId,
        community,
        accountCreated,
        profiles: this.listHumanProfilesByAccountId(account.account_id),
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

  isHumanLoginLocked(qqNumber: string, now: number): boolean {
    const row = this.#database
      .prepare(
        `SELECT l.locked_until
         FROM human_login_locks AS l
         JOIN human_accounts AS a ON a.account_id = l.account_id
         WHERE a.qq_number = ?`,
      )
      .get(qqNumber) as { locked_until: number } | undefined;
    return row !== undefined && row.locked_until > now;
  }

  recordFailedHumanLogin(qqNumber: string, now: number): boolean {
    const transaction = this.#database.transaction(() => {
      const account = this.#database
        .prepare("SELECT account_id FROM human_accounts WHERE qq_number = ?")
        .get(qqNumber) as { account_id: string } | undefined;
      if (!account) {
        return false;
      }

      const activeLock = this.#database
        .prepare("SELECT locked_until FROM human_login_locks WHERE account_id = ?")
        .get(account.account_id) as { locked_until: number } | undefined;
      if (activeLock && activeLock.locked_until > now) {
        return true;
      }

      this.#database
        .prepare("DELETE FROM human_login_locks WHERE account_id = ?")
        .run(account.account_id);
      this.#database
        .prepare(
          `DELETE FROM human_login_failures
           WHERE account_id = ? AND failed_at <= ?`,
        )
        .run(account.account_id, now - HUMAN_LOGIN_FAILURE_WINDOW_MS);
      this.#database
        .prepare("INSERT INTO human_login_failures (account_id, failed_at) VALUES (?, ?)")
        .run(account.account_id, now);
      const failureCount = this.#database
        .prepare("SELECT COUNT(*) AS count FROM human_login_failures WHERE account_id = ?")
        .get(account.account_id) as { count: number };
      if (failureCount.count < HUMAN_LOGIN_FAILURE_THRESHOLD) {
        return false;
      }

      this.#database
        .prepare(
          `INSERT INTO human_login_locks (account_id, locked_until)
           VALUES (?, ?)
           ON CONFLICT(account_id) DO UPDATE SET locked_until = excluded.locked_until`,
        )
        .run(account.account_id, now + HUMAN_LOGIN_LOCK_DURATION_MS);
      this.#database
        .prepare("DELETE FROM human_login_failures WHERE account_id = ?")
        .run(account.account_id);
      return true;
    });
    return transaction.immediate();
  }

  unlockHumanAccount(qqNumber: string): boolean {
    const transaction = this.#database.transaction(() => {
      const account = this.#database
        .prepare("SELECT account_id FROM human_accounts WHERE qq_number = ?")
        .get(qqNumber) as { account_id: string } | undefined;
      if (!account) {
        return false;
      }
      this.#clearHumanLoginSecurity(account.account_id);
      return true;
    });
    return transaction.immediate();
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
      const loginLock = this.#database
        .prepare("SELECT locked_until FROM human_login_locks WHERE account_id = ?")
        .get(account.account_id) as { locked_until: number } | undefined;
      if (loginLock && loginLock.locked_until > now) {
        throw new HumanLoginLockedError();
      }
      const community = this.#listCommunitiesByAccountId(account.account_id)[0];
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
        .prepare(
          `INSERT INTO human_sessions (
             token_hash, account_id, active_profile_id, created_at
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(hashSessionToken(token), account.account_id, community.profileId, now);
      this.#clearHumanLoginSecurity(account.account_id);
      return {
        activeProfileId: community.profileId,
        community,
        accountCreated: false,
        profiles: this.listHumanProfilesByAccountId(account.account_id),
        token,
      };
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
      this.#clearHumanLoginSecurity(account.account_id);
      return updated.changes === 1;
    });
    return transaction.immediate();
  }

  #clearHumanLoginSecurity(accountId: string): void {
    this.#database.prepare("DELETE FROM human_login_failures WHERE account_id = ?").run(accountId);
    this.#database.prepare("DELETE FROM human_login_locks WHERE account_id = ?").run(accountId);
  }

  findActiveHumanSession(token: string): ActiveHumanSessionRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.account_id,
                a.qq_number,
                a.created_at,
                a.membership_status,
                s.active_profile_id
         FROM human_sessions AS s
         JOIN human_accounts AS a ON a.account_id = s.account_id
         WHERE s.token_hash = ?
           AND s.revoked_at IS NULL
           AND a.membership_status = 'active'`,
      )
      .get(hashSessionToken(token)) as
      | (HumanAccountRow & { active_profile_id: string })
      | undefined;
    if (!row) {
      return undefined;
    }
    const account = mapAccount(row);
    const community = this.#findCommunityByProfileId(row.account_id, row.active_profile_id);
    return community ? { account, community } : { account };
  }

  listHumanProfilesByAccountId(accountId: string): HumanProfileSummaryRecord[] {
    return this.#listCommunitiesByAccountId(accountId).map((community) => ({
      profileId: community.profileId,
      residentName: community.resident.residentName,
      homeName: community.home.homeName,
      farmDoorplate: community.farmBinding.farmDoorplate,
    }));
  }

  switchActiveHumanSessionProfile(token: string, profileId: string): HumanCommunityRecord {
    const transaction = this.#database.transaction(() => {
      const session = this.#database
        .prepare(
          `SELECT account_id
           FROM human_sessions
           WHERE token_hash = ? AND revoked_at IS NULL`,
        )
        .get(hashSessionToken(token)) as { account_id: string } | undefined;
      if (!session) {
        throw new HumanProfileNotAvailableError();
      }
      const community = this.#findCommunityByProfileId(session.account_id, profileId);
      if (!community || community.farmBinding.farmHumanKey === null) {
        throw new HumanProfileNotAvailableError();
      }
      const updated = this.#database
        .prepare(
          `UPDATE human_sessions
           SET active_profile_id = ?
           WHERE token_hash = ? AND account_id = ? AND revoked_at IS NULL`,
        )
        .run(profileId, hashSessionToken(token), session.account_id);
      if (updated.changes !== 1) {
        throw new HumanProfileNotAvailableError();
      }
      return community;
    });
    return transaction.immediate();
  }

  createHumanProfileForSession(
    token: string,
    now: number,
    registration: HumanRegistrationInput,
  ): {
    activeProfileId: string;
    community: HumanCommunityRecord;
    profiles: HumanProfileSummaryRecord[];
  } {
    const transaction = this.#database.transaction(() => {
      const session = this.#database
        .prepare(
          `SELECT s.account_id, a.qq_number
           FROM human_sessions AS s
           JOIN human_accounts AS a ON a.account_id = s.account_id
           WHERE s.token_hash = ?
             AND s.revoked_at IS NULL
             AND a.membership_status = 'active'`,
        )
        .get(hashSessionToken(token)) as { account_id: string; qq_number: string } | undefined;
      if (!session) {
        throw new HumanProfileNotAvailableError();
      }
      const existingFarmBinding = this.#database
        .prepare("SELECT home_id FROM farm_bindings WHERE farm_doorplate = ?")
        .get(registration.farmDoorplate);
      if (existingFarmBinding) {
        throw new FarmAlreadyBoundError();
      }
      const community = this.#createProfileForAccount(
        session.account_id,
        session.qq_number,
        now,
        registration,
      );
      const switched = this.#database
        .prepare(
          `UPDATE human_sessions
           SET active_profile_id = ?
           WHERE token_hash = ? AND account_id = ? AND revoked_at IS NULL`,
        )
        .run(community.profileId, hashSessionToken(token), session.account_id);
      if (switched.changes !== 1) {
        throw new HumanProfileNotAvailableError();
      }
      return {
        activeProfileId: community.profileId,
        community,
        profiles: this.listHumanProfilesByAccountId(session.account_id),
      };
    });
    return transaction.immediate();
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

  listActiveHumanCommunities(): HumanCommunityRecord[] {
    const rows = this.#database
      .prepare(
        `SELECT a.account_id,
                a.qq_number,
                a.created_at,
                a.membership_status,
                r.profile_id,
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
         WHERE a.membership_status = 'active'
           AND f.farm_human_key IS NOT NULL
         ORDER BY r.resident_id ASC`,
      )
      .all() as HumanCommunityRow[];
    return rows.map(mapCommunity);
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

  replaceFirstActiveBellCredential(
    credentialId: string,
    credentialTokenHash: string,
    now: number,
  ): { residentId: string; replacedPrevious: boolean } {
    if (!/^[0-9a-f]{64}$/u.test(credentialTokenHash)) {
      throw new Error("Bell credential hash must be one lowercase SHA-256 digest");
    }
    const transaction = this.#database.transaction(() => {
      const residents = this.#database
        .prepare(
          `SELECT r.resident_id
           FROM residents AS r
           JOIN human_accounts AS a ON a.account_id = r.account_id
           JOIN homes AS h ON h.resident_id = r.resident_id
           WHERE a.membership_status = 'active'
           ORDER BY r.resident_id ASC`,
        )
        .all() as Array<{ resident_id: string }>;
      if (residents.length !== 1) {
        throw new Error("First-household Bell setup requires exactly one active resident");
      }
      const residentId = residents[0]?.resident_id;
      if (!residentId) {
        throw new Error("First-household Bell setup could not resolve the active resident");
      }
      const existing = this.#database
        .prepare(
          `SELECT credential_token_hash, credential_revoked_at
           FROM bell_bindings
           WHERE resident_id = ?`,
        )
        .get(residentId) as
        | { credential_token_hash: string | null; credential_revoked_at: number | null }
        | undefined;
      this.#database
        .prepare(
          `INSERT INTO bell_bindings (
             resident_id,
             credential_id,
             credential_token_hash,
             credential_issued_at,
             credential_revoked_at,
             last_connected_at
           ) VALUES (?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(resident_id) DO UPDATE SET
             credential_id = excluded.credential_id,
             credential_token_hash = excluded.credential_token_hash,
             credential_issued_at = excluded.credential_issued_at,
             credential_revoked_at = NULL,
             last_connected_at = NULL`,
        )
        .run(residentId, credentialId, credentialTokenHash, now);
      return {
        residentId,
        replacedPrevious:
          existing?.credential_token_hash !== null && existing?.credential_revoked_at === null,
      };
    });
    return transaction.immediate();
  }

  replaceBellCredentialForProfile(
    profileId: string,
    credentialId: string,
    credentialTokenHash: string,
    now: number,
  ): { residentId: string; replacedPrevious: boolean } {
    if (!/^[0-9a-f]{64}$/u.test(credentialTokenHash)) {
      throw new Error("Bell credential hash must be one lowercase SHA-256 digest");
    }
    const transaction = this.#database.transaction(() => {
      const resident = this.#database
        .prepare(
          `SELECT r.resident_id
           FROM residents AS r
           JOIN human_accounts AS a ON a.account_id = r.account_id
           JOIN homes AS h ON h.resident_id = r.resident_id
           WHERE r.profile_id = ? AND a.membership_status = 'active'`,
        )
        .get(profileId) as { resident_id: string } | undefined;
      if (!resident) {
        throw new HumanProfileNotAvailableError();
      }
      const existing = this.#database
        .prepare(
          `SELECT credential_token_hash, credential_revoked_at
           FROM bell_bindings
           WHERE resident_id = ?`,
        )
        .get(resident.resident_id) as
        | { credential_token_hash: string | null; credential_revoked_at: number | null }
        | undefined;
      this.#database
        .prepare(
          `INSERT INTO bell_bindings (
             resident_id,
             credential_id,
             credential_token_hash,
             credential_issued_at,
             credential_revoked_at,
             last_connected_at
           ) VALUES (?, ?, ?, ?, NULL, NULL)
           ON CONFLICT(resident_id) DO UPDATE SET
             credential_id = excluded.credential_id,
             credential_token_hash = excluded.credential_token_hash,
             credential_issued_at = excluded.credential_issued_at,
             credential_revoked_at = NULL,
             last_connected_at = NULL`,
        )
        .run(resident.resident_id, credentialId, credentialTokenHash, now);
      return {
        residentId: resident.resident_id,
        replacedPrevious:
          existing?.credential_token_hash !== null && existing?.credential_revoked_at === null,
      };
    });
    return transaction.immediate();
  }

  authenticateBellCredentialHash(
    credentialTokenHash: string,
  ): AuthenticatedBellBinding | undefined {
    const row = this.#database
      .prepare(
        `SELECT resident_id,
                credential_id,
                credential_token_hash,
                credential_revoked_at,
                last_connected_at,
                last_wake_mailbox_revision
         FROM bell_bindings
         WHERE credential_token_hash = ?
           AND credential_revoked_at IS NULL`,
      )
      .get(credentialTokenHash) as BellBindingRow | undefined;
    return row ? { residentId: row.resident_id, credentialId: row.credential_id } : undefined;
  }

  getBellBindingState(residentId: string): BellBindingState {
    const row = this.#database
      .prepare(
        `SELECT resident_id,
                credential_id,
                credential_token_hash,
                credential_revoked_at,
                last_connected_at,
                last_wake_mailbox_revision
         FROM bell_bindings
         WHERE resident_id = ?`,
      )
      .get(residentId) as BellBindingRow | undefined;
    return {
      configured: row?.credential_token_hash !== null && row?.credential_revoked_at === null,
      lastConnectedAt: row?.last_connected_at ?? null,
    };
  }

  markBellConnected(residentId: string, credentialId: string, now: number): boolean {
    const result = this.#database
      .prepare(
        `UPDATE bell_bindings
         SET last_connected_at = ?
         WHERE resident_id = ?
           AND credential_id = ?
           AND credential_token_hash IS NOT NULL
           AND credential_revoked_at IS NULL`,
      )
      .run(now, residentId, credentialId);
    return result.changes === 1;
  }

  cancelPendingBellMailboxWakeForHome(homeId: string, now: number): BellWakeCancellationResult {
    const row = this.#database
      .prepare("SELECT resident_id FROM homes WHERE home_id = ?")
      .get(homeId) as { resident_id: string } | undefined;
    return row
      ? this.cancelPendingBellMailboxWakeForResident(row.resident_id, now)
      : { residentId: null, cancelledWakeId: null, cancelledWakeIds: [] };
  }

  cancelPendingBellMailboxWakeForResident(
    residentId: string,
    now: number,
  ): BellWakeCancellationResult {
    const transaction = this.#database.transaction(() => {
      const pending = this.#database
        .prepare(
          `SELECT wake_id
           FROM bell_wakes
           WHERE resident_id = ? AND reason = 'mailbox_unread' AND status = 'pending'
           ORDER BY created_at ASC, wake_id ASC`,
        )
        .all(residentId) as Array<{ wake_id: string }>;
      if (pending.length > 0) {
        const wakeIds = pending.map((wake) => wake.wake_id);
        this.#database
          .prepare(
            `UPDATE bell_wakes
             SET status = 'cancelled', ended_at = ?
             WHERE resident_id = ? AND reason = 'mailbox_unread' AND status = 'pending'`,
          )
          .run(now, residentId);
        return { residentId, cancelledWakeId: wakeIds[0] ?? null, cancelledWakeIds: wakeIds };
      }
      return { residentId, cancelledWakeId: null, cancelledWakeIds: [] };
    });
    return transaction.immediate();
  }

  scheduleActivityReminder(input: ActivityReminderScheduleInput): ActivityReminderRecord {
    if (
      input.farmDoorplate.length === 0 ||
      input.sourceKey.length === 0 ||
      !Number.isSafeInteger(input.readyAt) ||
      input.readyAt <= 0 ||
      !Number.isSafeInteger(input.createdAt) ||
      input.createdAt < 0
    ) {
      throw new Error("The activity reminder facts are invalid");
    }
    const transaction = this.#database.transaction(() => {
      const profile = this.#database
        .prepare(
          `SELECT h.resident_id, f.farm_doorplate
           FROM homes AS h
           JOIN farm_bindings AS f ON f.home_id = h.home_id
           WHERE h.home_id = ? AND f.farm_doorplate = ?`,
        )
        .get(input.homeId, input.farmDoorplate) as
        | { resident_id: string; farm_doorplate: string }
        | undefined;
      if (!profile || profile.resident_id !== input.residentId) {
        throw new Error("The activity reminder profile does not match the bound farm");
      }
      const existing = this.#database
        .prepare(
          `SELECT resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status,
                  created_at, delivered_at, cancelled_at
           FROM activity_reminders
           WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
             AND kind = ? AND source_key = ?`,
        )
        .get(input.residentId, input.homeId, input.farmDoorplate, input.kind, input.sourceKey) as
        | ActivityReminderRow
        | undefined;
      if (existing) {
        if (existing.ready_at !== input.readyAt) {
          throw new Error("The activity reminder source is already bound to different facts");
        }
        if (existing.status === "cancelled") {
          this.#database
            .prepare(
              `UPDATE activity_reminders
               SET status = 'scheduled', created_at = ?, cancelled_at = NULL
               WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
                 AND kind = ? AND source_key = ? AND status = 'cancelled'`,
            )
            .run(
              input.createdAt,
              input.residentId,
              input.homeId,
              input.farmDoorplate,
              input.kind,
              input.sourceKey,
            );
          return {
            ...mapActivityReminder(existing),
            status: "scheduled" as const,
            createdAt: input.createdAt,
            cancelledAt: null,
          };
        }
        return mapActivityReminder(existing);
      }
      this.#database
        .prepare(
          `INSERT INTO activity_reminders (
             resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        )
        .run(
          input.residentId,
          input.homeId,
          input.farmDoorplate,
          input.kind,
          input.sourceKey,
          input.readyAt,
          input.createdAt,
        );
      return mapActivityReminder(
        this.#database
          .prepare(
            `SELECT resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status,
                    created_at, delivered_at, cancelled_at
             FROM activity_reminders
             WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
               AND kind = ? AND source_key = ?`,
          )
          .get(
            input.residentId,
            input.homeId,
            input.farmDoorplate,
            input.kind,
            input.sourceKey,
          ) as ActivityReminderRow,
      );
    });
    return transaction.immediate();
  }

  listScheduledActivityReminders(profile?: ActivityReminderProfileKey): ActivityReminderRecord[] {
    const rows = profile
      ? (this.#database
          .prepare(
            `SELECT resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status,
                    created_at, delivered_at, cancelled_at
             FROM activity_reminders
             WHERE status = 'scheduled'
               AND resident_id = ? AND home_id = ? AND farm_doorplate = ?
             ORDER BY ready_at ASC, kind ASC, source_key ASC`,
          )
          .all(profile.residentId, profile.homeId, profile.farmDoorplate) as ActivityReminderRow[])
      : (this.#database
          .prepare(
            `SELECT resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status,
                    created_at, delivered_at, cancelled_at
             FROM activity_reminders
             WHERE status = 'scheduled'
             ORDER BY ready_at ASC, resident_id ASC, home_id ASC, farm_doorplate ASC,
                      kind ASC, source_key ASC`,
          )
          .all() as ActivityReminderRow[]);
    return rows.map(mapActivityReminder);
  }

  cancelScheduledActivityRemindersExcept(
    profile: ActivityReminderProfileKey,
    kind: ActivityReminderKind,
    activeSourceKeys: readonly string[],
    now: number,
  ): ActivityReminderRecord[] {
    const active = new Set(activeSourceKeys);
    const transaction = this.#database.transaction(() => {
      const cancelled = this.listScheduledActivityReminders(profile).filter(
        (reminder) => reminder.kind === kind && !active.has(reminder.sourceKey),
      );
      const update = this.#database.prepare(
        `UPDATE activity_reminders
         SET status = 'cancelled', cancelled_at = ?
         WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
           AND kind = ? AND source_key = ? AND status = 'scheduled'`,
      );
      for (const reminder of cancelled) {
        update.run(
          now,
          profile.residentId,
          profile.homeId,
          profile.farmDoorplate,
          kind,
          reminder.sourceKey,
        );
      }
      return cancelled.map((reminder) => ({
        ...reminder,
        status: "cancelled" as const,
        cancelledAt: now,
      }));
    });
    return transaction.immediate();
  }

  cancelAllScheduledActivityReminders(
    profile: ActivityReminderProfileKey,
    now: number,
  ): ActivityReminderRecord[] {
    const transaction = this.#database.transaction(() => {
      const cancelled = this.listScheduledActivityReminders(profile);
      this.#database
        .prepare(
          `UPDATE activity_reminders
           SET status = 'cancelled', cancelled_at = ?
           WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
             AND status = 'scheduled'`,
        )
        .run(now, profile.residentId, profile.homeId, profile.farmDoorplate);
      return cancelled.map((reminder) => ({
        ...reminder,
        status: "cancelled" as const,
        cancelledAt: now,
      }));
    });
    return transaction.immediate();
  }

  deliverActivityReminder(
    profile: ActivityReminderProfileKey,
    kind: ActivityReminderKind,
    sourceKey: string,
    deliveredAt: number,
  ): ActivityReminderRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const update = this.#database
        .prepare(
          `UPDATE activity_reminders
           SET status = 'delivered', delivered_at = ?
           WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
             AND kind = ? AND source_key = ? AND status = 'scheduled'`,
        )
        .run(
          deliveredAt,
          profile.residentId,
          profile.homeId,
          profile.farmDoorplate,
          kind,
          sourceKey,
        );
      if (update.changes !== 1) return undefined;
      const row = this.#database
        .prepare(
          `SELECT resident_id, home_id, farm_doorplate, kind, source_key, ready_at, status,
                  created_at, delivered_at, cancelled_at
           FROM activity_reminders
           WHERE resident_id = ? AND home_id = ? AND farm_doorplate = ?
             AND kind = ? AND source_key = ?`,
        )
        .get(profile.residentId, profile.homeId, profile.farmDoorplate, kind, sourceKey) as
        | ActivityReminderRow
        | undefined;
      return row ? mapActivityReminder(row) : undefined;
    });
    return transaction.immediate();
  }

  scheduleCareerExamReminder(input: CareerExamReminderScheduleInput): CareerExamReminderRecord {
    const transaction = this.#database.transaction(() => {
      const home = this.#database
        .prepare("SELECT resident_id FROM homes WHERE home_id = ?")
        .get(input.homeId) as { resident_id: string } | undefined;
      if (!home || home.resident_id !== input.residentId) {
        throw new Error("The exam reminder home does not belong to the resident");
      }
      const existing = this.#database
        .prepare(
          `SELECT attempt_id,
                  resident_id,
                  home_id,
                  scheduled_at,
                  remind_at,
                  status,
                  letter_id,
                  wake_id,
                  created_at,
                  delivered_at,
                  cancelled_at
           FROM career_exam_reminders
           WHERE attempt_id = ?`,
        )
        .get(input.attemptId) as CareerExamReminderRow | undefined;
      if (existing) {
        if (
          existing.resident_id !== input.residentId ||
          existing.home_id !== input.homeId ||
          existing.scheduled_at !== input.scheduledAt ||
          existing.remind_at !== input.remindAt
        ) {
          throw new Error("The exam reminder attempt is already bound to different facts");
        }
        return mapCareerExamReminder(existing);
      }
      this.#database
        .prepare(
          `INSERT INTO career_exam_reminders (
             attempt_id,
             resident_id,
             home_id,
             scheduled_at,
             remind_at,
             status,
             created_at
           ) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`,
        )
        .run(
          input.attemptId,
          input.residentId,
          input.homeId,
          input.scheduledAt,
          input.remindAt,
          input.createdAt,
        );
      return mapCareerExamReminder(
        this.#database
          .prepare(
            `SELECT attempt_id,
                    resident_id,
                    home_id,
                    scheduled_at,
                    remind_at,
                    status,
                    letter_id,
                    wake_id,
                    created_at,
                    delivered_at,
                    cancelled_at
             FROM career_exam_reminders
             WHERE attempt_id = ?`,
          )
          .get(input.attemptId) as CareerExamReminderRow,
      );
    });
    return transaction.immediate();
  }

  listScheduledCareerExamReminders(residentId?: string): CareerExamReminderRecord[] {
    const rows = this.#database
      .prepare(
        `SELECT attempt_id,
                resident_id,
                home_id,
                scheduled_at,
                remind_at,
                status,
                letter_id,
                wake_id,
                created_at,
                delivered_at,
                cancelled_at
         FROM career_exam_reminders
         WHERE status = 'scheduled'
           AND (? IS NULL OR resident_id = ?)
         ORDER BY remind_at ASC, attempt_id ASC`,
      )
      .all(residentId ?? null, residentId ?? null) as CareerExamReminderRow[];
    return rows.map(mapCareerExamReminder);
  }

  getCareerExamReminder(attemptId: string): CareerExamReminderRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT attempt_id,
                resident_id,
                home_id,
                scheduled_at,
                remind_at,
                status,
                letter_id,
                wake_id,
                created_at,
                delivered_at,
                cancelled_at
         FROM career_exam_reminders
         WHERE attempt_id = ?`,
      )
      .get(attemptId) as CareerExamReminderRow | undefined;
    return row ? mapCareerExamReminder(row) : undefined;
  }

  cancelScheduledCareerExamRemindersExcept(
    residentId: string,
    activeAttemptIds: readonly string[],
    now: number,
  ): CareerExamReminderRecord[] {
    const transaction = this.#database.transaction(() => {
      const current = this.listScheduledCareerExamReminders(residentId);
      const active = new Set(activeAttemptIds);
      const cancelled = current.filter((reminder) => !active.has(reminder.attemptId));
      const update = this.#database.prepare(
        `UPDATE career_exam_reminders
         SET status = 'cancelled', cancelled_at = ?
         WHERE attempt_id = ? AND resident_id = ? AND status = 'scheduled'`,
      );
      for (const reminder of cancelled) {
        update.run(now, reminder.attemptId, residentId);
      }
      return cancelled.map((reminder) => ({
        ...reminder,
        status: "cancelled" as const,
        cancelledAt: now,
      }));
    });
    return transaction.immediate();
  }

  cancelScheduledCareerExamReminder(
    attemptId: string,
    now: number,
  ): CareerExamReminderRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const current = this.getCareerExamReminder(attemptId);
      if (current?.status !== "scheduled") return current;
      this.#database
        .prepare(
          `UPDATE career_exam_reminders
           SET status = 'cancelled', cancelled_at = ?
           WHERE attempt_id = ? AND status = 'scheduled'`,
        )
        .run(now, attemptId);
      return { ...current, status: "cancelled" as const, cancelledAt: now };
    });
    return transaction.immediate();
  }

  deliverCareerExamReminder(
    input: CareerExamReminderDeliveryInput,
  ): CareerExamReminderRecord | undefined {
    const transaction = this.#database.transaction(() => {
      const current = this.#database
        .prepare(
          `SELECT attempt_id,
                  resident_id,
                  home_id,
                  scheduled_at,
                  remind_at,
                  status,
                  letter_id,
                  wake_id,
                  created_at,
                  delivered_at,
                  cancelled_at
           FROM career_exam_reminders
           WHERE attempt_id = ?`,
        )
        .get(input.attemptId) as CareerExamReminderRow | undefined;
      if (!current || current.status === "cancelled") return undefined;
      if (current.status === "delivered") return mapCareerExamReminder(current);
      const letter = this.#database
        .prepare("SELECT home_id FROM mailbox_letters WHERE letter_id = ?")
        .get(input.letterId) as { home_id: string } | undefined;
      if (!letter || letter.home_id !== current.home_id) {
        throw new Error("The exam reminder letter does not belong to the scheduled home");
      }
      this.#database
        .prepare(
          `INSERT INTO bell_wakes (
             wake_id,
             resident_id,
             reason,
             status,
             created_at,
             ended_at,
             block_reason,
             error_code,
             purchase_request_id,
             letter_id,
             payload_json
           ) VALUES (?, ?, 'career_exam_reminder', 'pending', ?, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .run(
          input.wakeId,
          current.resident_id,
          input.deliveredAt,
          input.letterId,
          JSON.stringify(input.payload),
        );
      this.#database
        .prepare(
          `UPDATE career_exam_reminders
           SET status = 'delivered',
               letter_id = ?,
               wake_id = ?,
               delivered_at = ?
           WHERE attempt_id = ? AND status = 'scheduled'`,
        )
        .run(input.letterId, input.wakeId, input.deliveredAt, input.attemptId);
      return mapCareerExamReminder(
        this.#database
          .prepare(
            `SELECT attempt_id,
                    resident_id,
                    home_id,
                    scheduled_at,
                    remind_at,
                    status,
                    letter_id,
                    wake_id,
                    created_at,
                    delivered_at,
                    cancelled_at
             FROM career_exam_reminders
             WHERE attempt_id = ?`,
          )
          .get(input.attemptId) as CareerExamReminderRow,
      );
    });
    return transaction.immediate();
  }

  listPendingBellWakes(residentId: string): BellWakeRecord[] {
    const rows = this.#database
      .prepare(
        `SELECT wake_id,
                resident_id,
                reason,
                status,
                created_at,
                ended_at,
                block_reason,
                error_code,
                purchase_request_id,
                letter_id,
                payload_json
         FROM bell_wakes
         WHERE resident_id = ? AND status = 'pending'
         ORDER BY created_at ASC, wake_id ASC`,
      )
      .all(residentId) as BellWakeRow[];
    return rows.map(mapBellWake);
  }

  getBellWake(residentId: string, wakeId: string): BellWakeRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT wake_id,
                resident_id,
                reason,
                status,
                created_at,
                ended_at,
                block_reason,
                error_code,
                purchase_request_id,
                letter_id,
                payload_json
         FROM bell_wakes
         WHERE resident_id = ? AND wake_id = ?`,
      )
      .get(residentId, wakeId) as BellWakeRow | undefined;
    return row ? mapBellWake(row) : undefined;
  }

  acknowledgeBellWake(
    residentId: string,
    wakeId: string,
    now: number,
  ): "acked" | "duplicate" | "conflict" | "missing" {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT wake_id,
                  resident_id,
                  reason,
                  status,
                  created_at,
                  ended_at,
                  block_reason,
                  error_code,
                  purchase_request_id,
                  letter_id,
                  payload_json
           FROM bell_wakes
           WHERE resident_id = ? AND wake_id = ?`,
        )
        .get(residentId, wakeId) as BellWakeRow | undefined;
      if (!row) return "missing" as const;
      if (row.status === "acked") return "duplicate" as const;
      if (row.status !== "pending") return "conflict" as const;
      this.#database
        .prepare(
          `UPDATE bell_wakes
           SET status = 'acked', ended_at = ?
           WHERE resident_id = ? AND wake_id = ? AND status = 'pending'`,
        )
        .run(now, residentId, wakeId);
      return "acked" as const;
    });
    return transaction.immediate();
  }

  blockBellWake(
    residentId: string,
    wakeId: string,
    now: number,
    blockReason: string,
    errorCode: string,
  ): "blocked" | "duplicate" | "conflict" | "missing" {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT wake_id,
                  resident_id,
                  reason,
                  status,
                  created_at,
                  ended_at,
                  block_reason,
                  error_code,
                  purchase_request_id,
                  letter_id,
                  payload_json
           FROM bell_wakes
           WHERE resident_id = ? AND wake_id = ?`,
        )
        .get(residentId, wakeId) as BellWakeRow | undefined;
      if (!row) return "missing" as const;
      if (row.status === "blocked") {
        return row.block_reason === blockReason && row.error_code === errorCode
          ? ("duplicate" as const)
          : ("conflict" as const);
      }
      if (row.status !== "pending") return "conflict" as const;
      this.#database
        .prepare(
          `UPDATE bell_wakes
           SET status = 'blocked', ended_at = ?, block_reason = ?, error_code = ?
           WHERE resident_id = ? AND wake_id = ? AND status = 'pending'`,
        )
        .run(now, blockReason, errorCode, residentId, wakeId);
      if (row.reason === "farm_purchase_request" && row.purchase_request_id !== null) {
        this.#database
          .prepare(
            `UPDATE farm_purchase_requests
             SET status = 'failed'
             WHERE request_id = ?
               AND resident_id = ?
               AND status = 'requested'`,
          )
          .run(row.purchase_request_id, residentId);
      }
      return "blocked" as const;
    });
    return transaction.immediate();
  }

  cancelBellWake(residentId: string, wakeId: string, now: number): BellWakeCancellationResult {
    const transaction = this.#database.transaction(() => {
      const row = this.#database
        .prepare(
          `SELECT wake_id
           FROM bell_wakes
           WHERE resident_id = ? AND wake_id = ? AND status = 'pending'`,
        )
        .get(residentId, wakeId) as { wake_id: string } | undefined;
      if (!row) {
        return { residentId, cancelledWakeId: null, cancelledWakeIds: [] };
      }
      this.#database
        .prepare(
          `UPDATE bell_wakes
           SET status = 'cancelled', ended_at = ?
           WHERE resident_id = ? AND wake_id = ? AND status = 'pending'`,
        )
        .run(now, residentId, wakeId);
      return { residentId, cancelledWakeId: wakeId, cancelledWakeIds: [wakeId] };
    });
    return transaction.immediate();
  }

  createFarmPurchaseRequest(input: FarmPurchaseRequestInput): FarmPurchaseRequestCreationResult {
    const transaction = this.#database.transaction(() => {
      const home = this.#database
        .prepare("SELECT resident_id FROM homes WHERE home_id = ?")
        .get(input.homeId) as { resident_id: string } | undefined;
      if (!home || home.resident_id !== input.residentId) {
        throw new Error("The purchase request home does not belong to the resident");
      }
      const existing = this.#database
        .prepare(
          `SELECT request_id,
                  wake_id,
                  resident_id,
                  home_id,
                  idempotency_key,
                  shop,
                  shop_revision,
                  human_name,
                  status,
                  created_at,
                  expires_at,
                  payload_hash
           FROM farm_purchase_requests
           WHERE resident_id = ? AND idempotency_key = ?`,
        )
        .get(input.residentId, input.idempotencyKey) as FarmPurchaseRequestRow | undefined;

      if (existing) {
        const existingItems = this.#readFarmPurchaseRequestItems(existing.request_id);
        const sameItems =
          existingItems.length === input.items.length &&
          existingItems.every((item, index) => {
            const requested = input.items[index];
            return (
              requested !== undefined &&
              item.item_id === requested.itemId &&
              item.kind === requested.kind &&
              item.qty === requested.qty &&
              item.display_name === requested.displayName
            );
          });
        if (
          existing.payload_hash !== input.payloadHash ||
          existing.shop !== input.shop ||
          existing.shop_revision !== input.shopRevision ||
          !sameItems
        ) {
          throw new FarmPurchaseRequestIdempotencyConflictError();
        }
        return {
          request: mapFarmPurchaseRequest(existing, existingItems),
          created: false,
        };
      }

      const expiresAt = input.createdAt + FARM_PURCHASE_REQUEST_TTL_MS;
      this.#database
        .prepare(
          `INSERT INTO bell_wakes (
             wake_id,
             resident_id,
             reason,
             status,
             created_at,
             ended_at,
             block_reason,
             error_code,
             purchase_request_id,
             payload_json
           ) VALUES (?, ?, 'farm_purchase_request', 'pending', ?, NULL, NULL, NULL, ?, ?)`,
        )
        .run(
          input.wakeId,
          input.residentId,
          input.createdAt,
          input.requestId,
          JSON.stringify({ text: input.notificationText }),
        );
      this.#database
        .prepare(
          `INSERT INTO farm_purchase_requests (
             request_id,
             wake_id,
             resident_id,
             home_id,
             idempotency_key,
             shop,
             shop_revision,
             human_name,
             status,
             created_at,
             expires_at,
             payload_hash
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?)`,
        )
        .run(
          input.requestId,
          input.wakeId,
          input.residentId,
          input.homeId,
          input.idempotencyKey,
          input.shop,
          input.shopRevision,
          input.humanName,
          input.createdAt,
          expiresAt,
          input.payloadHash,
        );
      const insertItem = this.#database.prepare(
        `INSERT INTO farm_purchase_request_items (
           request_id,
           item_id,
           kind,
           qty,
           display_name,
           status,
           settled_qty,
           receipt_id,
           reason_code
         ) VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL)`,
      );
      for (const item of input.items) {
        insertItem.run(input.requestId, item.itemId, item.kind, item.qty, item.displayName);
      }
      const created = this.#readFarmPurchaseRequest(input.requestId, input.residentId);
      if (!created) {
        throw new Error("The farm purchase request could not be read after creation");
      }
      return { request: created, created: true };
    });
    return transaction.immediate();
  }

  getFarmPurchaseRequest(
    residentId: string,
    requestId: string,
    now?: number,
  ): FarmPurchaseRequestRecord | undefined {
    if (now !== undefined) {
      this.expireFarmPurchaseRequest(residentId, requestId, now);
    }
    return this.#readFarmPurchaseRequest(requestId, residentId);
  }

  getFarmPurchaseRequestByIdempotencyKey(
    residentId: string,
    idempotencyKey: string,
  ): FarmPurchaseRequestRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT request_id,
                wake_id,
                resident_id,
                home_id,
                idempotency_key,
                shop,
                shop_revision,
                human_name,
                status,
                created_at,
                expires_at,
                payload_hash
         FROM farm_purchase_requests
         WHERE resident_id = ? AND idempotency_key = ?`,
      )
      .get(residentId, idempotencyKey) as FarmPurchaseRequestRow | undefined;
    return row
      ? mapFarmPurchaseRequest(row, this.#readFarmPurchaseRequestItems(row.request_id))
      : undefined;
  }

  expirePendingFarmPurchaseRequestsForResident(
    residentId: string,
    now: number,
  ): BellWakeCancellationResult {
    const transaction = this.#database.transaction(() => {
      this.#database
        .prepare(
          `UPDATE farm_purchase_requests
           SET status = 'expired'
           WHERE resident_id = ?
             AND status = 'requested'
             AND expires_at <= ?`,
        )
        .run(residentId, now);
      const pending = this.#database
        .prepare(
          `SELECT wake_id
           FROM bell_wakes
           WHERE resident_id = ?
             AND reason = 'farm_purchase_request'
             AND status = 'pending'
             AND purchase_request_id IN (
               SELECT request_id
               FROM farm_purchase_requests
               WHERE resident_id = ?
                 AND status = 'expired'
                 AND expires_at <= ?
             )
           ORDER BY wake_id ASC`,
        )
        .all(residentId, residentId, now) as Array<{ wake_id: string }>;
      if (pending.length === 0) {
        return { residentId, cancelledWakeId: null, cancelledWakeIds: [] };
      }
      const cancelledWakeIds = pending.map((wake) => wake.wake_id);
      this.#database
        .prepare(
          `UPDATE bell_wakes
           SET status = 'cancelled', ended_at = ?
           WHERE resident_id = ?
             AND reason = 'farm_purchase_request'
             AND status = 'pending'
             AND purchase_request_id IN (
               SELECT request_id
               FROM farm_purchase_requests
               WHERE resident_id = ?
                 AND status = 'expired'
                 AND expires_at <= ?
             )`,
        )
        .run(now, residentId, residentId, now);
      return {
        residentId,
        cancelledWakeId: cancelledWakeIds[0] ?? null,
        cancelledWakeIds,
      };
    });
    return transaction.immediate();
  }

  expireFarmPurchaseRequest(
    residentId: string,
    requestId: string,
    now: number,
  ): FarmPurchaseRequestExpiryResult | undefined {
    const transaction = this.#database.transaction(() => {
      const current = this.#readFarmPurchaseRequestRow(requestId, residentId);
      if (!current) return undefined;
      if (current.expires_at <= now && current.status === "requested") {
        this.#database
          .prepare(
            `UPDATE farm_purchase_requests
             SET status = 'expired'
             WHERE resident_id = ? AND request_id = ? AND status = 'requested'`,
          )
          .run(residentId, requestId);
      }
      const cancelledWakeIds =
        current.expires_at <= now && current.status === "requested"
          ? this.#cancelPendingWakeIdsForRequest(requestId, now)
          : [];
      const request = this.#readFarmPurchaseRequest(requestId, residentId);
      if (!request) throw new Error("The farm purchase request disappeared during expiry");
      return { request, cancelledWakeIds };
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
      this.#database
        .prepare("UPDATE homes SET mailbox_revision = mailbox_revision + 1 WHERE home_id = ?")
        .run(delivery.homeId);

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

  takeResidentMailboxNotifications(homeId: string, now: number): string[] {
    const transaction = this.#database.transaction(() => {
      const unread = this.#database
        .prepare(
          `SELECT l.letter_id, l.body
           FROM mailbox_letters AS l
           LEFT JOIN mailbox_read_states AS r
             ON r.letter_id = l.letter_id AND r.audience = 'resident'
           WHERE l.home_id = ? AND r.letter_id IS NULL
           ORDER BY l.created_at ASC, l.letter_id ASC`,
        )
        .all(homeId) as Array<{ letter_id: string; body: string }>;
      if (unread.length === 0) {
        return [];
      }
      const markRead = this.#database.prepare(
        `INSERT INTO mailbox_read_states (letter_id, audience, read_at)
         VALUES (?, 'resident', ?)
         ON CONFLICT(letter_id, audience) DO NOTHING`,
      );
      for (const letter of unread) {
        markRead.run(letter.letter_id, now);
      }
      return unread.map((letter) => letter.body);
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
        "sharedMemeUpdateSignalsEnabled",
        "browserNotificationsEnabled",
        "activityRemindersEnabled",
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
        const sharedMemeUpdateSignalsEnabled = Object.hasOwn(
          patch,
          "sharedMemeUpdateSignalsEnabled",
        )
          ? storeNullableBoolean(patch.sharedMemeUpdateSignalsEnabled ?? false)
          : (current.shared_meme_update_signals_enabled ?? 1);
        const browserNotificationsEnabled = Object.hasOwn(patch, "browserNotificationsEnabled")
          ? storeNullableBoolean(patch.browserNotificationsEnabled ?? false)
          : (current.browser_notifications_enabled ?? 0);
        const activityRemindersEnabled = Object.hasOwn(patch, "activityRemindersEnabled")
          ? storeNullableBoolean(patch.activityRemindersEnabled ?? false)
          : (current.activity_reminders_enabled ?? 0);
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
               shared_meme_update_signals_enabled,
               browser_notifications_enabled,
               activity_reminders_enabled,
               default_connection_duration_minutes,
               initial_recent_activity_count,
               chat_mode,
               allow_activity_room_warmup,
               updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(home_id) DO UPDATE SET
               environment_description = excluded.environment_description,
               pause_all_wakeups = excluded.pause_all_wakeups,
               visit_requests_and_invitations_enabled = excluded.visit_requests_and_invitations_enabled,
               activity_invitations_enabled = excluded.activity_invitations_enabled,
               important_system_notifications_enabled = excluded.important_system_notifications_enabled,
               shared_meme_update_signals_enabled = excluded.shared_meme_update_signals_enabled,
               browser_notifications_enabled = excluded.browser_notifications_enabled,
               activity_reminders_enabled = excluded.activity_reminders_enabled,
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
            sharedMemeUpdateSignalsEnabled,
            browserNotificationsEnabled,
            activityRemindersEnabled,
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

  #readFarmPurchaseRequestRow(
    requestId: string,
    residentId: string,
  ): FarmPurchaseRequestRow | undefined {
    return this.#database
      .prepare(
        `SELECT request_id,
                wake_id,
                resident_id,
                home_id,
                idempotency_key,
                shop,
                shop_revision,
                human_name,
                status,
                created_at,
                expires_at,
                payload_hash
         FROM farm_purchase_requests
         WHERE request_id = ? AND resident_id = ?`,
      )
      .get(requestId, residentId) as FarmPurchaseRequestRow | undefined;
  }

  #readFarmPurchaseRequestItems(requestId: string): FarmPurchaseItemRow[] {
    return this.#database
      .prepare(
        `SELECT request_id,
                item_id,
                kind,
                qty,
                display_name
         FROM farm_purchase_request_items
         WHERE request_id = ?
         ORDER BY kind ASC, item_id ASC`,
      )
      .all(requestId) as FarmPurchaseItemRow[];
  }

  #readFarmPurchaseRequest(
    requestId: string,
    residentId: string,
  ): FarmPurchaseRequestRecord | undefined {
    const row = this.#readFarmPurchaseRequestRow(requestId, residentId);
    return row
      ? mapFarmPurchaseRequest(row, this.#readFarmPurchaseRequestItems(requestId))
      : undefined;
  }

  #cancelPendingWakeIdsForRequest(requestId: string, now: number): string[] {
    const pending = this.#database
      .prepare(
        `SELECT wake_id
         FROM bell_wakes
         WHERE purchase_request_id = ? AND status = 'pending'
         ORDER BY wake_id ASC`,
      )
      .all(requestId) as Array<{ wake_id: string }>;
    if (pending.length === 0) return [];
    this.#database
      .prepare(
        `UPDATE bell_wakes
         SET status = 'cancelled', ended_at = ?
         WHERE purchase_request_id = ? AND status = 'pending'`,
      )
      .run(now, requestId);
    return pending.map((wake) => wake.wake_id);
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
                s.shared_meme_update_signals_enabled,
                s.browser_notifications_enabled,
                s.activity_reminders_enabled,
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

  #createProfileForAccount(
    accountId: string,
    qqNumber: string,
    now: number,
    registration: HumanRegistrationInput,
  ): HumanCommunityRecord {
    if (registration.farmCreationId) {
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
    const profileId = this.#generateProfileId();
    const residentId = this.#generateResidentId();
    const homeId = this.#generateHomeId();
    this.#database
      .prepare(
        `INSERT INTO residents (
           resident_id, profile_id, account_id, resident_name, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(residentId, profileId, accountId, registration.residentName, now);
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
    const community = this.#findCommunityByProfileId(accountId, profileId);
    if (!community) {
      throw new RegistrationProfileRequiredError();
    }
    return community;
  }

  #listCommunitiesByAccountId(accountId: string): HumanCommunityRecord[] {
    const rows = this.#database
      .prepare(
        `SELECT a.account_id,
                a.qq_number,
                a.created_at,
                a.membership_status,
                r.profile_id,
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
         WHERE a.account_id = ?
         ORDER BY r.created_at ASC, r.resident_id ASC`,
      )
      .all(accountId) as HumanCommunityRow[];
    return rows.map(mapCommunity);
  }

  #findCommunityByProfileId(
    accountId: string,
    profileId: string,
  ): HumanCommunityRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.account_id,
                a.qq_number,
                a.created_at,
                a.membership_status,
                r.profile_id,
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
         WHERE a.account_id = ? AND r.profile_id = ?`,
      )
      .get(accountId, profileId) as HumanCommunityRow | undefined;
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

  revokeHumanAccountMembership(accountId: string, now: number): string[] {
    const transaction = this.#database.transaction(() => {
      const residents = this.#database
        .prepare("SELECT resident_id FROM residents WHERE account_id = ? ORDER BY resident_id ASC")
        .all(accountId) as Array<{ resident_id: string }>;
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
      this.#database
        .prepare(
          `UPDATE bell_bindings
           SET credential_token_hash = NULL,
               credential_revoked_at = ?
           WHERE resident_id IN (
             SELECT resident_id FROM residents WHERE account_id = ?
           )
             AND credential_token_hash IS NOT NULL
             AND credential_revoked_at IS NULL`,
        )
        .run(now, accountId);
      return residents.map((resident) => resident.resident_id);
    });
    return transaction.immediate();
  }

  revokeHumanAccountMembershipByQq(qqNumber: string, now: number): string[] {
    const account = this.#database
      .prepare("SELECT account_id AS accountId FROM human_accounts WHERE qq_number = ?")
      .get(qqNumber) as { accountId: string } | undefined;
    return account ? this.revokeHumanAccountMembership(account.accountId, now) : [];
  }
}
