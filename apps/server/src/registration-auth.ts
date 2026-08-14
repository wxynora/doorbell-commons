import type {
  CommunityDatabase,
  CreatedHumanSession,
  HumanCommunityRecord,
  HumanRegistrationInput,
  HumanSettingsPatch,
  HumanSettingsRecord,
} from "./community-database.js";
import {
  FarmCreationStateConflictError,
  HumanAccountAlreadyRegisteredError,
  RegistrationProfileRequiredError,
} from "./community-database.js";
import type { FarmCreator } from "./farm-creation-client.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import { buildFarmHumanUrl, extractFarmHumanKey } from "./farm-human-url.js";
import { createHumanPasswordCredential, verifyHumanPassword } from "./password-auth.js";
import type { QqGroupMembershipReader } from "./qq-group-membership.js";

export {
  FarmAlreadyBoundError,
  FarmCreationStateConflictError,
  HumanAccountAlreadyRegisteredError,
  RegistrationProfileMismatchError,
  RegistrationProfileRequiredError,
} from "./community-database.js";

export class InvalidRegistrationCodeError extends Error {
  constructor() {
    super("The registration code is not current");
    this.name = "InvalidRegistrationCodeError";
  }
}

export class InvalidHumanCredentialsError extends Error {
  constructor() {
    super("The QQ number or password is incorrect");
    this.name = "InvalidHumanCredentialsError";
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

export class FarmHumanKeyMismatchError extends Error {
  constructor() {
    super("The farm human credential belongs to a different farm");
    this.name = "FarmHumanKeyMismatchError";
  }
}

interface FirstRegistrationBaseFields {
  residentName: string;
  homeName: string;
  password: string;
}

export interface ExistingFarmRegistrationFields extends FirstRegistrationBaseFields {
  mode: "bind_existing";
  farmDoorplate: string;
  farmHumanUrl: string;
  confirmedFarmName: string;
}

export interface NewFarmRegistrationFields extends FirstRegistrationBaseFields {
  mode: "create_farm";
  farmName: string;
  aiName: string;
}

export type FirstRegistrationFields = ExistingFarmRegistrationFields | NewFarmRegistrationFields;

export interface CreateSessionInput {
  qqNumber: string;
  registrationCode: string;
  firstRegistration?: FirstRegistrationFields;
}

export interface CreatePasswordSessionInput {
  qqNumber: string;
  password: string;
}

interface RegistrationAuthServiceOptions {
  database: CommunityDatabase;
  groupMembership: QqGroupMembershipReader;
  farmDirectory: FarmDirectoryReader;
  farmCreator?: FarmCreator;
  groupId: string;
  farmHumanUiBaseUrl?: string;
  now?: () => number;
}

export interface CreatedFarmDelivery {
  farmDoorplate: string;
  farmName: string;
  aiName: string;
  farmHumanUrl: string;
}

export type RegistrationSessionResult = CreatedHumanSession & {
  createdFarm?: CreatedFarmDelivery;
};

export class RegistrationAuthService {
  readonly #database: CommunityDatabase;
  readonly #groupMembership: QqGroupMembershipReader;
  readonly #farmDirectory: FarmDirectoryReader;
  readonly #farmCreator: FarmCreator | undefined;
  readonly #groupId: string;
  readonly #farmHumanUiBaseUrl: string | undefined;
  readonly #now: () => number;

  constructor(options: RegistrationAuthServiceOptions) {
    this.#database = options.database;
    this.#groupMembership = options.groupMembership;
    this.#farmDirectory = options.farmDirectory;
    this.#farmCreator = options.farmCreator;
    this.#groupId = options.groupId;
    this.#farmHumanUiBaseUrl = options.farmHumanUiBaseUrl;
    this.#now = options.now ?? Date.now;
  }

  lookupFarm(farmDoorplate: string): Promise<FarmDirectoryEntry> {
    return this.#farmDirectory.lookupFarm(farmDoorplate);
  }

  async createSession(input: CreateSessionInput): Promise<RegistrationSessionResult> {
    const now = this.#now();
    if (!this.#database.isCurrentRegistrationCode(input.registrationCode, now)) {
      throw new InvalidRegistrationCodeError();
    }
    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, input.qqNumber))) {
      this.#database.revokeHumanAccountMembershipByQq(input.qqNumber, now);
      throw new QqNotGroupMemberError();
    }
    if (this.#database.findHumanPasswordCredentialByQq(input.qqNumber) !== undefined) {
      throw new HumanAccountAlreadyRegisteredError();
    }

    let verifiedRegistration: HumanRegistrationInput | undefined;
    let createdFarm: CreatedFarmDelivery | undefined;
    if (input.firstRegistration?.mode === "bind_existing") {
      if (!this.#farmHumanUiBaseUrl) {
        throw new Error("Farm Human URL parsing requires the configured farm Human UI base URL");
      }
      const farmHumanKey = extractFarmHumanKey(
        input.firstRegistration.farmHumanUrl,
        this.#farmHumanUiBaseUrl,
      );
      const farm = await this.#farmDirectory.lookupFarmByHumanKey(farmHumanKey);
      if (farm.farmDoorplate !== input.firstRegistration.farmDoorplate) {
        throw new FarmHumanKeyMismatchError();
      }
      if (farm.farmName !== input.firstRegistration.confirmedFarmName) {
        throw new FarmConfirmationMismatchError();
      }
      const aiName = farm.aiName ?? farm.farmName;
      verifiedRegistration = {
        residentName: `${input.firstRegistration.residentName} & ${aiName}`,
        homeName: input.firstRegistration.homeName,
        farmDoorplate: input.firstRegistration.farmDoorplate,
        farmHumanKey,
        passwordCredential: await createHumanPasswordCredential(input.firstRegistration.password),
      };
    } else if (input.firstRegistration?.mode === "create_farm") {
      if (!this.#farmCreator || !this.#farmHumanUiBaseUrl) {
        throw new Error("Farm creation requires the configured farm service and Human UI base URL");
      }
      const request = this.#database.getOrCreateFarmCreationRequest(input.qqNumber, now, {
        farmName: input.firstRegistration.farmName,
        aiName: input.firstRegistration.aiName,
        humanName: input.firstRegistration.residentName,
      });
      const receipt = await this.#farmCreator.createFarm({
        creationId: request.creationId,
        farmName: request.farmName,
        aiName: request.aiName,
        humanName: request.humanName,
      });
      const farmCreatedAt = Date.parse(receipt.created_at);
      if (!Number.isFinite(farmCreatedAt)) {
        throw new FarmCreationStateConflictError();
      }
      this.#database.recordFarmCreationReceipt(input.qqNumber, request.creationId, {
        farmDoorplate: receipt.farm_doorplate,
        farmName: receipt.farm_name,
        aiName: receipt.ai_name,
        humanName: receipt.human_name,
        farmHumanKey: receipt.farm_human_key,
        farmCreatedAt,
      });
      verifiedRegistration = {
        residentName: `${input.firstRegistration.residentName} & ${receipt.ai_name}`,
        homeName: input.firstRegistration.homeName,
        farmDoorplate: receipt.farm_doorplate,
        farmHumanKey: receipt.farm_human_key,
        passwordCredential: await createHumanPasswordCredential(input.firstRegistration.password),
        farmCreationId: request.creationId,
      };
      createdFarm = {
        farmDoorplate: receipt.farm_doorplate,
        farmName: receipt.farm_name,
        aiName: receipt.ai_name,
        farmHumanUrl: buildFarmHumanUrl(receipt.farm_human_key, this.#farmHumanUiBaseUrl),
      };
    }

    const session = this.#database.createHumanSession(input.qqNumber, now, verifiedRegistration);
    return createdFarm ? { ...session, createdFarm } : session;
  }

  async createPasswordSession(input: CreatePasswordSessionInput): Promise<CreatedHumanSession> {
    const credential = this.#database.findHumanPasswordCredentialByQq(input.qqNumber);
    if (!(await verifyHumanPassword(input.password, credential))) {
      throw new InvalidHumanCredentialsError();
    }
    const now = this.#now();
    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, input.qqNumber))) {
      this.#database.revokeHumanAccountMembershipByQq(input.qqNumber, now);
      throw new QqNotGroupMemberError();
    }
    return this.#database.createExistingHumanSession(input.qqNumber, now);
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
    if (session.community.farmBinding.farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    return session.community;
  }

  async getCurrentHumanSettings(token: string): Promise<HumanSettingsRecord> {
    const community = await this.getCurrentSession(token);
    return this.#database.getHumanSettings(community.home.homeId);
  }

  async confirmCurrentResidentMembership(residentId: string): Promise<void> {
    const account = this.#database.findActiveHumanAccountByResidentId(residentId);
    if (!account) {
      throw new AuthenticationRequiredError();
    }
    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, account.qqNumber))) {
      this.#database.revokeHumanAccountMembership(account.accountId, this.#now());
      throw new QqNotGroupMemberError();
    }
    this.#database.confirmHumanAccountMembership(account.accountId, this.#now());
  }

  async updateCurrentHumanSettings(
    token: string,
    patch: HumanSettingsPatch,
  ): Promise<HumanSettingsRecord> {
    const community = await this.getCurrentSession(token);
    return this.#database.updateHumanSettings(community.home.homeId, this.#now(), patch);
  }

  async getCurrentFarmOverview(token: string): Promise<BoundFarmOverview> {
    const community = await this.getCurrentSession(token);
    return this.#farmDirectory.readFarmOverview(community.farmBinding.farmDoorplate);
  }

  async getCurrentFarmHumanPage(
    token: string,
    pagePath: string,
    query: URLSearchParams,
  ): Promise<FarmHumanPage> {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    return this.#farmDirectory.readFarmHumanPage(farmHumanKey, pagePath, query);
  }

  async submitCurrentFarmHumanAction(
    token: string,
    actionPath: string,
    form: URLSearchParams,
  ): Promise<FarmHumanActionRedirect> {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    return this.#farmDirectory.submitFarmHumanAction(farmHumanKey, actionPath, form);
  }

  logout(token: string): void {
    if (!this.#database.revokeHumanSession(token, this.#now())) {
      throw new AuthenticationRequiredError();
    }
  }
}
