import type { FastifyInstance, FastifyReply } from "fastify";
import {
	boundFarmPurchaseRequestCreateSchema,
	boundFarmPurchaseRequestCreateSuccessSchema,
	boundFarmPurchaseRequestErrorSchema,
	farmPurchaseRequestIdempotencyKeySchema,
} from "@doorbell/protocol";
import { FarmPurchaseRequestIdempotencyConflictError } from "./community-database.js";
import {
	FarmHumanCatalogContractUnavailableError,
	FarmHumanCatalogCredentialInvalidError,
	FarmHumanCatalogNotFoundError,
	FarmHumanCatalogUnavailableError,
} from "./farm-catalog-client.js";
import {
	FarmHumanRanchContractUnavailableError,
	FarmHumanRanchCredentialInvalidError,
	FarmHumanRanchNotFoundError,
	FarmHumanRanchUnavailableError,
} from "./farm-ranch-client.js";
import {
	FarmPurchaseRequestInputError,
	type FarmPurchaseRequestCreateResult,
	type FarmPurchaseRequestService,
} from "./farm-purchase-request-service.js";
import {
	AuthenticationRequiredError,
	QqNotGroupMemberError,
	RegistrationProfileRequiredError,
	type RegistrationAuthService,
} from "./registration-auth.js";
import { OneBotUnavailableError } from "./qq-group-membership.js";
import {
	readHumanSessionToken,
	serializeClearedHumanSessionCookie,
} from "./session-cookie.js";

export interface FarmPurchaseRequestRouteOptions {
	registrationAuth: Pick<
		RegistrationAuthService,
		"getCurrentSession" | "getCurrentFarmCatalog" | "getCurrentFarmRanch"
	>;
	farmPurchaseRequestService?: FarmPurchaseRequestService | undefined;
	secureCookies: boolean;
}

function sendBoundFarmPurchaseRequestError(
	reply: FastifyReply,
	statusCode: 400 | 401 | 403 | 404 | 409 | 502 | 503,
	code:
		| "shop_changed"
		| "idempotency_conflict"
		| "operation_not_allowed"
		| "state_conflict"
		| "invalid_request"
		| "authentication_required"
		| "qq_not_group_member"
		| "onebot_unavailable"
		| "registration_profile_required"
		| "farm_not_found"
		| "farm_credential_invalid"
		| "farm_unavailable"
		| "upstream_contract_unavailable",
	message: string,
	currentShopRevision?: string,
) {
	reply.header("cache-control", "no-store");
	return reply.code(statusCode).send(
		boundFarmPurchaseRequestErrorSchema.parse({
			error: {
				code,
				message,
				...(currentShopRevision
					? { current_shop_revision: currentShopRevision }
					: {}),
			},
		}),
	);
}

function sendBoundFarmPurchaseRequestSuccess(
	reply: FastifyReply,
	result: FarmPurchaseRequestCreateResult,
) {
	reply.header("cache-control", "no-store");
	return boundFarmPurchaseRequestCreateSuccessSchema.parse({
		data: {
			shop: result.request.shop,
			shop_revision: result.request.shopRevision,
			items: result.request.items.map((item) => ({
				kind: item.kind,
				item_id: item.itemId,
				qty: item.qty,
			})),
			status: result.request.status,
			expires_at: new Date(result.request.expiresAt).toISOString(),
		},
		server_time: new Date().toISOString(),
	});
}

export function registerFarmPurchaseRequestRoutes(
	app: FastifyInstance,
	options: FarmPurchaseRequestRouteOptions,
) {
	app.post("/api/farm/purchase-requests", async (request, reply) => {
		const parsedBody = boundFarmPurchaseRequestCreateSchema.safeParse(
			request.body,
		);
		const idempotencyHeader = request.headers["idempotency-key"];
		const parsedIdempotencyKey =
			farmPurchaseRequestIdempotencyKeySchema.safeParse(
				typeof idempotencyHeader === "string" ? idempotencyHeader : undefined,
			);
		if (!parsedBody.success || !parsedIdempotencyKey.success) {
			return sendBoundFarmPurchaseRequestError(
				reply,
				400,
				"invalid_request",
				"A valid cart and Idempotency-Key are required",
			);
		}
		if (!options.farmPurchaseRequestService) {
			return sendBoundFarmPurchaseRequestError(
				reply,
				503,
				"farm_unavailable",
				"Farm purchase requests are unavailable",
			);
		}
		const token = readHumanSessionToken(request.headers.cookie);
		if (!token) {
			return sendBoundFarmPurchaseRequestError(
				reply,
				401,
				"authentication_required",
				"An active human session is required",
			);
		}

		try {
			const community = await options.registrationAuth.getCurrentSession(token);
			const replay = options.farmPurchaseRequestService.replay({
				residentId: community.resident.residentId,
				shop: parsedBody.data.shop,
				shopRevision: parsedBody.data.shop_revision,
				idempotencyKey: parsedIdempotencyKey.data,
				items: parsedBody.data.items.map((item) => ({
					itemId: item.item_id,
					kind: item.kind,
					qty: item.qty,
				})),
			});
			if (replay) {
				return sendBoundFarmPurchaseRequestSuccess(reply, replay);
			}
			const catalog =
				await options.registrationAuth.getCurrentFarmCatalog(token);
			const settings = catalog.data.settings;
			if (
				settings.status !== "available" ||
				typeof settings.human_name !== "string" ||
				settings.human_name.trim().length === 0
			) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					409,
					"operation_not_allowed",
					"Set the farm human name before creating a purchase request",
				);
			}

			let currentRevision: string;
			let requestItems: Array<{
				itemId: string;
				kind: string;
				qty: number;
				displayName: string;
			}>;
			if (parsedBody.data.shop === "field") {
				const shop = catalog.data.shop;
				if (shop.status !== "available") {
					return sendBoundFarmPurchaseRequestError(
						reply,
						503,
						"farm_unavailable",
						"The farm shop is unavailable",
					);
				}
				currentRevision = shop.revision;
				if (currentRevision !== parsedBody.data.shop_revision) {
					return sendBoundFarmPurchaseRequestError(
						reply,
						409,
						"shop_changed",
						"The farm shop has changed",
						currentRevision,
					);
				}
				requestItems = parsedBody.data.items.map((requested) => {
					const item = shop.items.find(
						(candidate) =>
							candidate.kind === requested.kind &&
							candidate.item_id === requested.item_id,
					);
					const supported =
						(requested.kind === "potion" &&
							requested.item_id === "speed_potion") ||
						(requested.kind === "seed" && item?.source === "persisted") ||
						(requested.kind === "recipe" && item?.source === "persisted") ||
						(requested.kind === "potion_set" && item?.source === "persisted");
					if (
						!item ||
						!supported ||
						item.identity_state !== "known" ||
						item.name === null ||
						item.available_quantity === null ||
						item.available_quantity < requested.qty ||
						item.condition === "already_owned"
					) {
						throw new FarmPurchaseRequestInputError(
							"The requested field item is unavailable",
						);
					}
					return {
						itemId: requested.item_id,
						kind: requested.kind,
						qty: requested.qty,
						displayName: item.name,
					};
				});
			} else if (parsedBody.data.shop === "mystery-merchant") {
				const market = catalog.data.market;
				const merchant =
					market.status === "available" ? market.mystery_merchant : null;
				currentRevision = catalog.market_revision;
				if (
					currentRevision !== parsedBody.data.shop_revision ||
					merchant?.status !== "present" ||
					Date.parse(merchant.ends_at) <= Date.now()
				) {
					return sendBoundFarmPurchaseRequestError(
						reply,
						409,
						"shop_changed",
						"神秘商人的货架已变化或已经离开，请重新打开集市。",
						currentRevision,
					);
				}
				requestItems = parsedBody.data.items.map((requested) => {
					const offer = merchant.offers.find(
						(item) =>
							item.item_id === requested.item_id &&
							item.kind === requested.kind,
					);
					if (!offer || offer.already_bought || requested.qty !== 1) {
						throw new FarmPurchaseRequestInputError(
							"商品本轮已购买或不在当前货架，请重新确认购物车。",
						);
					}
					return {
						itemId: offer.item_id,
						kind: offer.kind,
						qty: 1,
						displayName: offer.name,
					};
				});
			} else {
				const ranch = await options.registrationAuth.getCurrentFarmRanch(token);
				currentRevision = ranch.revision;
				if (currentRevision !== parsedBody.data.shop_revision) {
					return sendBoundFarmPurchaseRequestError(
						reply,
						409,
						"shop_changed",
						"The ranch shop has changed",
						currentRevision,
					);
				}
				requestItems = parsedBody.data.items.map((requested) => {
					const section =
						requested.kind === "animal"
							? ranch.data.shop.animals
							: requested.kind === "pet"
								? ranch.data.shop.pets
								: requested.kind === "item"
									? ranch.data.shop.skins
									: null;
					const item = section?.items.find((candidate) =>
						"skin_id" in candidate
							? candidate.skin_id === requested.item_id
							: candidate.kind_id === requested.item_id,
					);
					if (
						section?.status !== "available" ||
						!item ||
						item.status !== "known" ||
						item.name === null ||
						item.owned !== false ||
						item.available_quantity === null ||
						item.available_quantity < requested.qty
					) {
						throw new FarmPurchaseRequestInputError(
							"The requested ranch item is unavailable",
						);
					}
					return {
						itemId: requested.item_id,
						kind: requested.kind,
						qty: requested.qty,
						displayName: item.name,
					};
				});
			}

			const created = options.farmPurchaseRequestService.create({
				residentId: community.resident.residentId,
				homeId: community.home.homeId,
				humanName: settings.human_name,
				shop: parsedBody.data.shop,
				shopRevision: currentRevision,
				idempotencyKey: parsedIdempotencyKey.data,
				items: requestItems,
			});
			return sendBoundFarmPurchaseRequestSuccess(reply, created);
		} catch (error) {
			if (error instanceof AuthenticationRequiredError) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					401,
					"authentication_required",
					"An active human session is required",
				);
			}
			if (error instanceof QqNotGroupMemberError) {
				reply.header(
					"set-cookie",
					serializeClearedHumanSessionCookie(options.secureCookies),
				);
				return sendBoundFarmPurchaseRequestError(
					reply,
					403,
					"qq_not_group_member",
					"The session QQ number is no longer a current member of the community group",
				);
			}
			if (error instanceof OneBotUnavailableError) {
				request.log.error(
					{ error_name: error.name },
					"OneBot group-membership lookup is unavailable",
				);
				return sendBoundFarmPurchaseRequestError(
					reply,
					503,
					"onebot_unavailable",
					"QQ group membership could not be verified",
				);
			}
			if (error instanceof RegistrationProfileRequiredError) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					409,
					"registration_profile_required",
					"A resident, home, and farm binding are required",
				);
			}
			if (error instanceof FarmPurchaseRequestIdempotencyConflictError) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					409,
					"idempotency_conflict",
					"This Idempotency-Key was used for another cart",
				);
			}
			if (error instanceof FarmPurchaseRequestInputError) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					409,
					"operation_not_allowed",
					error.message,
				);
			}
			if (
				error instanceof FarmHumanCatalogCredentialInvalidError ||
				error instanceof FarmHumanRanchCredentialInvalidError
			) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					409,
					"farm_credential_invalid",
					"The bound farm human credential is no longer valid",
				);
			}
			if (
				error instanceof FarmHumanCatalogNotFoundError ||
				error instanceof FarmHumanRanchNotFoundError
			) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					404,
					"farm_not_found",
					"The bound farm no longer exists",
				);
			}
			if (
				error instanceof FarmHumanCatalogContractUnavailableError ||
				error instanceof FarmHumanRanchContractUnavailableError
			) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					502,
					"upstream_contract_unavailable",
					"The farm shop response could not be verified",
				);
			}
			if (
				error instanceof FarmHumanCatalogUnavailableError ||
				error instanceof FarmHumanRanchUnavailableError
			) {
				return sendBoundFarmPurchaseRequestError(
					reply,
					503,
					"farm_unavailable",
					"The farm shop is unavailable",
				);
			}
			throw error;
		}
	});
}
