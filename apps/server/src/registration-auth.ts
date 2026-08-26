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
  HumanLoginLockedError,
  RegistrationProfileRequiredError,
} from "./community-database.js";
import {
  FarmHumanBulletinContractUnavailableError,
  type FarmHumanBulletinReader,
} from "./farm-bulletin-client.js";
import {
  FarmHumanCatalogContractUnavailableError,
  type FarmHumanCatalogReader,
} from "./farm-catalog-client.js";
import type { FarmCreator } from "./farm-creation-client.js";
import {
  FarmHumanCropCodexActionContractUnavailableError,
  type FarmHumanCropCodexActioner,
} from "./farm-crop-codex-action-client.js";
import type {
  BoundFarmOverview,
  FarmDirectoryEntry,
  FarmDirectoryReader,
  FarmHumanActionRedirect,
  FarmHumanPage,
} from "./farm-directory-client.js";
import {
  FarmHumanExpeditionActionContractUnavailableError,
  type FarmHumanExpeditionActioner,
} from "./farm-expedition-action-client.js";
import {
  FarmHumanFieldContractUnavailableError,
  type FarmHumanFieldReader,
} from "./farm-human-client.js";
import { buildFarmHumanUrl, extractFarmHumanKey } from "./farm-human-url.js";
import {
  FarmHumanKitchenContractUnavailableError,
  type FarmHumanKitchenReader,
} from "./farm-kitchen-client.js";
import {
  FarmHumanKitchenCookContractUnavailableError,
  type FarmHumanKitchenCooker,
  type FarmHumanKitchenCookInput,
} from "./farm-kitchen-cook-client.js";
import {
  FarmHumanKitchenInventoryActionContractUnavailableError,
  type FarmHumanKitchenInventoryActioner,
  type FarmHumanKitchenInventoryActionInput,
} from "./farm-kitchen-inventory-action-client.js";
import {
  FarmHumanKitchenPurchaseContractUnavailableError,
  type FarmHumanKitchenPurchaser,
} from "./farm-kitchen-purchase-client.js";
import {
  FarmHumanKitchenShopRefreshContractUnavailableError,
  type FarmHumanKitchenShopRefresher,
} from "./farm-kitchen-shop-refresh-client.js";
import { FarmLingyeContractUnavailableError, type FarmLingyeReader } from "./farm-lingye-client.js";
import {
  FarmHumanMarketActionContractUnavailableError,
  type FarmHumanMarketActioner,
} from "./farm-market-action-client.js";
import {
  FarmHumanNeighborhoodMessageActionContractUnavailableError,
  type FarmHumanNeighborhoodMessageActioner,
} from "./farm-neighborhood-message-action-client.js";
import {
  FarmHumanOriginalPlantActionContractUnavailableError,
  type FarmHumanOriginalPlantActioner,
} from "./farm-original-plant-action-client.js";
import {
  FarmHumanRanchResidentActionContractUnavailableError,
  type FarmHumanRanchResidentActioner,
} from "./farm-ranch-action-client.js";
import {
  FarmHumanRanchContractUnavailableError,
  type FarmHumanRanchReader,
} from "./farm-ranch-client.js";
import {
  FarmHumanRanchCollectionContractUnavailableError,
  type FarmHumanRanchCollector,
} from "./farm-ranch-collection-client.js";
import {
  FarmHumanRanchDecorationActionContractUnavailableError,
  type FarmHumanRanchDecorationActioner,
} from "./farm-ranch-decoration-action-client.js";
import {
  FarmHumanRanchInteractionActionContractUnavailableError,
  type FarmHumanRanchInteractionActioner,
} from "./farm-ranch-interaction-action-client.js";
import {
  FarmHumanFarmSettingsActionContractUnavailableError,
  type FarmHumanFarmSettingsActioner,
} from "./farm-settings-action-client.js";
import {
  FarmHumanSmeltingActionContractUnavailableError,
  type FarmHumanSmeltingActioner,
} from "./farm-smelting-action-client.js";
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

type WithoutFarmIdentity<T> = T extends {
  farmDoorplate: string;
  farmHumanKey: string;
}
  ? Omit<T, "farmDoorplate" | "farmHumanKey">
  : never;

type FarmKitchenInventorySessionInput = WithoutFarmIdentity<FarmHumanKitchenInventoryActionInput>;
type FarmKitchenCookSessionInput = WithoutFarmIdentity<FarmHumanKitchenCookInput>;

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
  farmHumanReader?: FarmHumanFieldReader;
  farmCatalogReader?: FarmHumanCatalogReader;
  farmBulletinReader?: FarmHumanBulletinReader;
  farmKitchenReader?: FarmHumanKitchenReader;
  farmKitchenPurchaser?: FarmHumanKitchenPurchaser;
  farmKitchenCooker?: FarmHumanKitchenCooker;
  farmKitchenInventoryActioner?: FarmHumanKitchenInventoryActioner;
  farmKitchenShopRefresher?: FarmHumanKitchenShopRefresher;
  farmExpeditionActioner?: FarmHumanExpeditionActioner;
  farmCropCodexActioner?: FarmHumanCropCodexActioner;
  farmSmeltingActioner?: FarmHumanSmeltingActioner;
  farmOriginalPlantActioner?: FarmHumanOriginalPlantActioner;
  farmRanchReader?: FarmHumanRanchReader;
  farmRanchResidentActioner?: FarmHumanRanchResidentActioner;
  farmRanchCollector?: FarmHumanRanchCollector;
  farmRanchDecorationActioner?: FarmHumanRanchDecorationActioner;
  farmRanchInteractionActioner?: FarmHumanRanchInteractionActioner;
  farmNeighborhoodMessageActioner?: FarmHumanNeighborhoodMessageActioner;
  farmMarketActioner?: FarmHumanMarketActioner;
  farmSettingsActioner?: FarmHumanFarmSettingsActioner;
  farmLingyeReader?: FarmLingyeReader;
  farmCreator?: FarmCreator;
  groupId: string;
  farmHumanUiBaseUrl?: string;
  now?: () => number;
  onMembershipRevoked?: (residentId: string) => void;
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
  readonly #farmHumanReader: FarmHumanFieldReader | undefined;
  readonly #farmCatalogReader: FarmHumanCatalogReader | undefined;
  readonly #farmBulletinReader: FarmHumanBulletinReader | undefined;
  readonly #farmKitchenReader: FarmHumanKitchenReader | undefined;
  readonly #farmKitchenPurchaser: FarmHumanKitchenPurchaser | undefined;
  readonly #farmKitchenCooker: FarmHumanKitchenCooker | undefined;
  readonly #farmKitchenInventoryActioner: FarmHumanKitchenInventoryActioner | undefined;
  readonly #farmKitchenShopRefresher: FarmHumanKitchenShopRefresher | undefined;
  readonly #farmExpeditionActioner: FarmHumanExpeditionActioner | undefined;
  readonly #farmCropCodexActioner: FarmHumanCropCodexActioner | undefined;
  readonly #farmSmeltingActioner: FarmHumanSmeltingActioner | undefined;
  readonly #farmOriginalPlantActioner: FarmHumanOriginalPlantActioner | undefined;
  readonly #farmRanchReader: FarmHumanRanchReader | undefined;
  readonly #farmRanchResidentActioner: FarmHumanRanchResidentActioner | undefined;
  readonly #farmRanchCollector: FarmHumanRanchCollector | undefined;
  readonly #farmRanchDecorationActioner: FarmHumanRanchDecorationActioner | undefined;
  readonly #farmRanchInteractionActioner: FarmHumanRanchInteractionActioner | undefined;
  readonly #farmNeighborhoodMessageActioner: FarmHumanNeighborhoodMessageActioner | undefined;
  readonly #farmMarketActioner: FarmHumanMarketActioner | undefined;
  readonly #farmSettingsActioner: FarmHumanFarmSettingsActioner | undefined;
  readonly #farmLingyeReader: FarmLingyeReader | undefined;
  readonly #farmCreator: FarmCreator | undefined;
  readonly #groupId: string;
  readonly #farmHumanUiBaseUrl: string | undefined;
  readonly #now: () => number;
  readonly #onMembershipRevoked: (residentId: string) => void;

  constructor(options: RegistrationAuthServiceOptions) {
    this.#database = options.database;
    this.#groupMembership = options.groupMembership;
    this.#farmDirectory = options.farmDirectory;
    this.#farmHumanReader = options.farmHumanReader;
    this.#farmCatalogReader = options.farmCatalogReader;
    this.#farmBulletinReader = options.farmBulletinReader;
    this.#farmKitchenReader = options.farmKitchenReader;
    this.#farmKitchenPurchaser = options.farmKitchenPurchaser;
    this.#farmKitchenCooker = options.farmKitchenCooker;
    this.#farmKitchenInventoryActioner = options.farmKitchenInventoryActioner;
    this.#farmKitchenShopRefresher = options.farmKitchenShopRefresher;
    this.#farmExpeditionActioner = options.farmExpeditionActioner;
    this.#farmCropCodexActioner = options.farmCropCodexActioner;
    this.#farmSmeltingActioner = options.farmSmeltingActioner;
    this.#farmOriginalPlantActioner = options.farmOriginalPlantActioner;
    this.#farmRanchReader = options.farmRanchReader;
    this.#farmRanchResidentActioner = options.farmRanchResidentActioner;
    this.#farmRanchCollector = options.farmRanchCollector;
    this.#farmRanchDecorationActioner = options.farmRanchDecorationActioner;
    this.#farmRanchInteractionActioner = options.farmRanchInteractionActioner;
    this.#farmNeighborhoodMessageActioner = options.farmNeighborhoodMessageActioner;
    this.#farmMarketActioner = options.farmMarketActioner;
    this.#farmSettingsActioner = options.farmSettingsActioner;
    this.#farmLingyeReader = options.farmLingyeReader;
    this.#farmCreator = options.farmCreator;
    this.#groupId = options.groupId;
    this.#farmHumanUiBaseUrl = options.farmHumanUiBaseUrl;
    this.#now = options.now ?? Date.now;
    this.#onMembershipRevoked = options.onMembershipRevoked ?? (() => undefined);
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
      this.#revokeMembershipByQq(input.qqNumber, now);
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
    const now = this.#now();
    const credential = this.#database.findHumanPasswordCredentialByQq(input.qqNumber);
    if (!(await verifyHumanPassword(input.password, credential))) {
      this.#database.recordFailedHumanLogin(input.qqNumber, now);
      throw new InvalidHumanCredentialsError();
    }
    if (this.#database.isHumanLoginLocked(input.qqNumber, now)) {
      throw new InvalidHumanCredentialsError();
    }
    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, input.qqNumber))) {
      this.#revokeMembershipByQq(input.qqNumber, now);
      throw new QqNotGroupMemberError();
    }
    try {
      return this.#database.createExistingHumanSession(input.qqNumber, now);
    } catch (error) {
      if (error instanceof HumanLoginLockedError) {
        throw new InvalidHumanCredentialsError();
      }
      throw error;
    }
  }

  async getCurrentSession(token: string): Promise<HumanCommunityRecord> {
    const session = this.#database.findActiveHumanSession(token);
    if (!session) {
      throw new AuthenticationRequiredError();
    }

    if (!(await this.#groupMembership.isCurrentMember(this.#groupId, session.account.qqNumber))) {
      this.#revokeMembership(session.account.accountId, this.#now());
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
      this.#revokeMembership(account.accountId, this.#now());
      throw new QqNotGroupMemberError();
    }
    this.#database.confirmHumanAccountMembership(account.accountId, this.#now());
  }

  #revokeMembership(accountId: string, now: number): void {
    for (const residentId of this.#database.revokeHumanAccountMembership(accountId, now)) {
      this.#onMembershipRevoked(residentId);
    }
  }

  #revokeMembershipByQq(qqNumber: string, now: number): void {
    for (const residentId of this.#database.revokeHumanAccountMembershipByQq(qqNumber, now)) {
      this.#onMembershipRevoked(residentId);
    }
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

  async getCurrentFarmField(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmHumanReader) {
      throw new FarmHumanFieldContractUnavailableError();
    }
    return this.#farmHumanReader.readField({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async getCurrentFarmCatalog(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmCatalogReader) {
      throw new FarmHumanCatalogContractUnavailableError();
    }
    return this.#farmCatalogReader.readCatalog({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async getCurrentFarmBulletin(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmBulletinReader) {
      throw new FarmHumanBulletinContractUnavailableError();
    }
    return this.#farmBulletinReader.readBulletin({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async getCurrentFarmKitchen(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmKitchenReader) {
      throw new FarmHumanKitchenContractUnavailableError();
    }
    return this.#farmKitchenReader.readKitchen({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async purchaseCurrentFarmKitchen(
    token: string,
    input: {
      expectedShopRevision: string;
      idempotencyKey: string;
      items: Array<{
        kind: "ingredient" | "recipe" | "tool";
        itemId: string;
        quantity: number;
      }>;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmKitchenPurchaser) {
      throw new FarmHumanKitchenPurchaseContractUnavailableError();
    }
    return this.#farmKitchenPurchaser.purchaseKitchen({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async cookCurrentFarmKitchen(token: string, input: FarmKitchenCookSessionInput) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmKitchenCooker) {
      throw new FarmHumanKitchenCookContractUnavailableError();
    }
    return this.#farmKitchenCooker.cookKitchen({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmKitchenInventoryAction(
    token: string,
    input: FarmKitchenInventorySessionInput,
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmKitchenInventoryActioner) {
      throw new FarmHumanKitchenInventoryActionContractUnavailableError();
    }
    return this.#farmKitchenInventoryActioner.executeKitchenInventoryAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async refreshCurrentFarmKitchenShop(
    token: string,
    input: { expectedShopRevision: string; idempotencyKey: string },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmKitchenShopRefresher) {
      throw new FarmHumanKitchenShopRefreshContractUnavailableError();
    }
    return this.#farmKitchenShopRefresher.refreshKitchenShop({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmCropCodexAction(
    token: string,
    input: {
      cropId: string;
      action: "star" | "unstar";
      expectedCodexRevision: string;
      idempotencyKey: string;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmCropCodexActioner) {
      throw new FarmHumanCropCodexActionContractUnavailableError();
    }
    return this.#farmCropCodexActioner.executeCropCodexAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmSmeltingAction(
    token: string,
    input: {
      materialIds: string[];
      expectedSmeltingRevision: string;
      idempotencyKey: string;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmSmeltingActioner) {
      throw new FarmHumanSmeltingActionContractUnavailableError();
    }
    return this.#farmSmeltingActioner.executeSmeltingAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmOriginalPlantAction(
    token: string,
    input: {
      expectedRevision: string;
      idempotencyKey: string;
      name: string;
      latin: string;
      desc: string;
      plant: string;
      harvest: string;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmOriginalPlantActioner) {
      throw new FarmHumanOriginalPlantActionContractUnavailableError();
    }
    return this.#farmOriginalPlantActioner.executeOriginalPlantAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmExpeditionAction(
    token: string,
    input: {
      expectedRevision: string;
      idempotencyKey: string;
      action: "enter" | "explore" | "roll" | "choose" | "charm" | "retreat";
      payload:
        | Record<string, never>
        | { charges: number }
        | { option: string }
        | { kind: "check" | "hp"; blessing: string };
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmExpeditionActioner) {
      throw new FarmHumanExpeditionActionContractUnavailableError();
    }
    return this.#farmExpeditionActioner.executeExpeditionAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async getCurrentFarmRanch(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmRanchReader) {
      throw new FarmHumanRanchContractUnavailableError();
    }
    return this.#farmRanchReader.readRanch({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async executeCurrentFarmRanchResidentAction(
    token: string,
    input: {
      expectedRevision: string;
      idempotencyKey: string;
      action:
        | "feed"
        | "upgrade"
        | "rename"
        | "toggle_pin"
        | "wear_accessory"
        | "takeoff_accessory"
        | "set_variant";
      residentType: "animal" | "pet" | "patrol_goose";
      kindId: string;
      payload:
        | Record<string, never>
        | { name: string }
        | { accessory_id: string }
        | { variant_id: string };
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmRanchResidentActioner) {
      throw new FarmHumanRanchResidentActionContractUnavailableError();
    }
    return this.#farmRanchResidentActioner.executeRanchResidentAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async collectCurrentFarmRanch(
    token: string,
    input: { expectedRevision: string; idempotencyKey: string },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmRanchCollector) {
      throw new FarmHumanRanchCollectionContractUnavailableError();
    }
    return this.#farmRanchCollector.collectRanch({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmRanchDecorationAction(
    token: string,
    input: {
      expectedRevision: string;
      idempotencyKey: string;
      action: "place" | "unplace";
      decorationId: string;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmRanchDecorationActioner) {
      throw new FarmHumanRanchDecorationActionContractUnavailableError();
    }
    return this.#farmRanchDecorationActioner.executeRanchDecorationAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmRanchInteractionAction(
    token: string,
    input:
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "dispatch";
          targetFarmDoorplate: string;
          animalKindId: string;
          durationHours: number;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "catch";
          raidId: string;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "remit" | "send";
          amount: number;
        },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmRanchInteractionActioner) {
      throw new FarmHumanRanchInteractionActionContractUnavailableError();
    }
    return this.#farmRanchInteractionActioner.executeRanchInteractionAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async sendCurrentFarmNeighborhoodMessage(
    token: string,
    input: {
      targetFarmDoorplate: string;
      message: string;
      expectedRevision: string;
      idempotencyKey: string;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmNeighborhoodMessageActioner) {
      throw new FarmHumanNeighborhoodMessageActionContractUnavailableError();
    }
    return this.#farmNeighborhoodMessageActioner.sendNeighborhoodMessage({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async executeCurrentFarmMarketAction(
    token: string,
    input:
      | { expectedRevision: string; idempotencyKey: string; action: "browse" }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "list";
          kind: "seed" | "material" | "ingredient" | "dish";
          itemId: string;
          quantity: number;
          price?: number | undefined;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "buy";
          sellerDoorplate: string;
          kind: "seed" | "material" | "ingredient" | "dish";
          itemId: string;
          quantity: number;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "unlist";
          kind: "seed" | "material" | "ingredient" | "dish";
          itemId: string;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "barter-list";
          giveKind: "seed" | "material" | "ingredient" | "dish";
          giveItemId: string;
          giveQuantity: number;
          wantKind: "seed" | "material" | "ingredient" | "dish";
          wantItemId: string;
          wantQuantity: number;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "barter-accept";
          sellerDoorplate: string;
          listingId: string;
        }
      | {
          expectedRevision: string;
          idempotencyKey: string;
          action: "barter-unlist";
          listingId: string;
        },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmMarketActioner) {
      throw new FarmHumanMarketActionContractUnavailableError();
    }
    return this.#farmMarketActioner.executeMarketAction({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async updateCurrentFarmSettings(
    token: string,
    input: {
      expectedCatalogRevision: string;
      idempotencyKey: string;
      field:
        | "farm_name"
        | "ai_name"
        | "human_name"
        | "welcome_message"
        | "social.visit"
        | "social.steal"
        | "social.water"
        | "social.message"
        | "equip_title";
      value: string | boolean | null;
    },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmSettingsActioner) {
      throw new FarmHumanFarmSettingsActionContractUnavailableError();
    }
    return this.#farmSettingsActioner.updateFarmSettings({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
  }

  async getCurrentFarmGlimmer(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmLingyeReader) {
      throw new FarmLingyeContractUnavailableError();
    }
    return this.#farmLingyeReader.readGlimmer({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async getCurrentFarmTogether(token: string) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    if (!this.#farmLingyeReader) {
      throw new FarmLingyeContractUnavailableError();
    }
    return this.#farmLingyeReader.readTogether({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
    });
  }

  async harvestCurrentFarmField(
    token: string,
    input: { expectedRevision: string; idempotencyKey: string },
  ) {
    const community = await this.getCurrentSession(token);
    const farmHumanKey = community.farmBinding.farmHumanKey;
    if (farmHumanKey === null) {
      throw new RegistrationProfileRequiredError();
    }
    const farmHumanReader = this.#farmHumanReader;
    if (!farmHumanReader?.harvestAssist) {
      throw new FarmHumanFieldContractUnavailableError();
    }
    return farmHumanReader.harvestAssist({
      farmDoorplate: community.farmBinding.farmDoorplate,
      farmHumanKey,
      ...input,
    });
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
