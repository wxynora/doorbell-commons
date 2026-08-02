import type {
  CommunityDatabase,
  CreatedHumanSession,
  HumanCommunityRecord,
} from "./community-database.js";
import { RegistrationProfileRequiredError } from "./community-database.js";
import type { FarmDirectoryEntry, FarmDirectoryReader } from "./farm-directory-client.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";

export {
  FarmAlreadyBoundError,
  RegistrationProfileMismatchError,
  RegistrationProfileRequiredError,
} from "./community-database.js";

export class InvalidRegistrationCodeError extends Error {
  constructor() {
    super("The registration code is not current");
    this.name = "InvalidRegistrationCodeError";
  }
}

export class QqNotGroupMemberError extends Error {
  constructor() {
    super("The QQ number is not a current member of the community group");
    this.name = "QqNotGroupMemberError";
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("An active human session is required");
    this.name = "AuthenticationRequiredError";
  }
}

export class FarmConfirmationMismatchError extends Error {
  constructor() {
    super("The confirmed farm name no longer matches the farm directory");
    this.name = "FarmConfirmationMismatchError";
  }
}

export interface FirstRegistrationFields {
  residentName: string;
  homeName: string;
  farmDoorplate: string;
  confirmedFarmName: string;
}

export interface CreateSessionInput {
  qqNumber: string;
  registrationCode: string;
  firstRegistration?: FirstRegistrationFields;
}

interface RegistrationAuthServiceOptions {
  database: CommunityDatabase;
  groupMembership: QqGroupMembershipReader;
  farmDirectory: FarmDirectoryReader;
  groupId: string;
  now?: () => number;
}

export class RegistrationAuthService {
  readonly #database: CommunityDatabase;
  readonly #groupMembership: QqGroupMembershipReader;
  readonly #farmDirectory: FarmDirectoryReader;
  readonly #groupId: string;
  readonly #now: () => number;

  constructor(options: RegistrationAuthServiceOptions) {
    this.#database = options.database;
    this.#groupMembership = options.groupMembership;
    this.#farmDirectory = options.farmDirectory;
    this.#groupId = options.groupId;
    this.#now = options.now ?? Date.now;
  }

  lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    return this.#farmDirectory.lookupFarm(farmDoorplate);
  }

  async createSession(input: CreateSessionInput): Promise<CreatedHumanSession> {
    const now = this.#now();
    if (!this.#database.isCurrentRegistrationCode(input.registrationCode, now)) {
      throw new InvalidRegistrationCodeError();
    }
    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, input.qqNumber))) {
      this.#database.revokeHumanAccountMembershipByQq(input.qqNumber, now);
      throw new QqNotGroupMemberError();
    }

    const registration = input.firstRegistration;
    if (registration) {
      const farm = await this.#farmDirectory.lookupFarm(registration.farmDoorplate);
      if (
        farm.farmDoorplate !== registration.farmDoorplate ||
        farm.farmName !== registration.confirmedFarmName
      ) {
        throw new FarmConfirmationMismatchError();
      }
    }

    return this.#database.createHumanSession(
      input.qqNumber,
      now,
      registration
        ? {
            residentName: registration.residentName,
            homeName: registration.homeName,
            farmDoorplate: registration.farmDoorplate,
          }
        : undefined,
    );
  }

  async getCurrentSession(token: string): Promise<HumanCommunityRecord> {
    const session = this.#database.findActiveHumanSession(token);
    if (!session) {
      throw new AuthenticationRequiredError();
    }

    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, session.account.qqNumber))) {
      this.#database.revokeHumanAccountMembership(session.account.accountId, this.#now());
      throw new QqNotGroupMemberError();
    }
    this.#database.confirmHumanAccountMembership(session.account.accountId, this.#now());
    if (!session.community) {
      throw new RegistrationProfileRequiredError();
    }
    return session.community;
  }

  logout(token: string): void {
    if (!this.#database.revokeHumanSession(token, this.#now())) {
      throw new AuthenticationRequiredError();
    }
  }
}
