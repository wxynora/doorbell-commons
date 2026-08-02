import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

const REGISTRATION_CODE_WINDOW_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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

export class FarmAlreadyBoundError extends Error {
  constructor() {
    super("The farm doorplate is already bound to another human account");
    this.name = "FarmAlreadyBoundError";
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
}

interface HumanCommunityRow extends HumanAccountRow {
  resident_id: string;
  resident_name: string;
  home_id: string;
  home_name: string;
  farm_doorplate: string;
}

export interface CommunityDatabaseOptions {
  generateRegistrationCode?: () => string;
  generateSessionToken?: () => string;
  generateAccountId?: () => string;
  generateResidentId?: () => string;
  generateHomeId?: () => string;
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
    this.#database.pragma("foreign_keys = ON");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS registration_code (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        code TEXT NOT NULL,
        generated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS human_accounts (
        account_id TEXT PRIMARY KEY,
        qq_number TEXT NOT NULL UNIQUE,
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
        bound_at INTEGER NOT NULL
      );
    `);
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

      if (community && registration) {
        if (
          community.resident.residentName !== registration.residentName ||
          community.home.homeName !== registration.homeName ||
          community.farmBinding.farmDoorplate !== registration.farmDoorplate
        ) {
          throw new RegistrationProfileMismatchError();
        }
      } else if (!community && !registration) {
        throw new RegistrationProfileRequiredError();
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
               created_at,
               membership_status,
               membership_checked_at
             ) VALUES (?, ?, ?, 'active', ?)`,
          )
          .run(account.account_id, account.qq_number, account.created_at, now);
      } else {
        this.#database
          .prepare(
            `UPDATE human_accounts
             SET membership_status = 'active',
                 membership_checked_at = ?,
                 membership_inactive_at = NULL
             WHERE account_id = ?`,
          )
          .run(now, account.account_id);
        account.membership_status = "active";
        if (community) {
          community.account.membershipStatus = "active";
        }
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
            `INSERT INTO farm_bindings (farm_doorplate, home_id, bound_at)
             VALUES (?, ?, ?)`,
          )
          .run(registration.farmDoorplate, homeId, now);
        community = this.#findCommunityByAccountId(account.account_id);
      }

      if (!community) {
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
                f.farm_doorplate
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
