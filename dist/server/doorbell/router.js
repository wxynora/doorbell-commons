import {
    handleDoorbellHumanBulletinAck,
    handleDoorbellHumanBulletinRead,
    handleDoorbellHumanActionListAuthorityRead,
    handleDoorbellHumanCatalogRead,
    handleDoorbellHumanCropCodexAction,
    handleDoorbellHumanFarmSettingsAction,
    handleDoorbellHumanFarmShopOpen,
    handleDoorbellHumanFieldRead,
    handleDoorbellHumanHarvestAssist,
    handleDoorbellHumanLandUpgrade,
    handleDoorbellHumanOriginalPlantAction,
    handleDoorbellHumanQixiMemorialRead,
    handleDoorbellHumanSmeltingAction,
} from "./human-farm.js";
import {
    handleDoorbellHumanKitchenCook,
    handleDoorbellHumanKitchenInventoryAction,
    handleDoorbellHumanKitchenPurchase,
    handleDoorbellHumanKitchenRead,
    handleDoorbellHumanKitchenShopOpen,
    handleDoorbellHumanKitchenShopRefresh,
} from "./kitchen.js";
import {
    handleDoorbellHumanRanchCollection,
    handleDoorbellHumanRanchDecorationAction,
    handleDoorbellHumanRanchInteractionAction,
    handleDoorbellHumanRanchRead,
    handleDoorbellHumanRanchResidentAction,
} from "./ranch.js";
import {
    handleDoorbellHumanExpeditionAction,
    handleDoorbellHumanGlimmerRead,
    handleDoorbellHumanMarketAction,
    handleDoorbellHumanNeighborhoodMessageAction,
    handleDoorbellHumanTogetherRead,
} from "./world-social.js";
import {
    handleDoorbellFarmCreation,
    handleDoorbellFarmExecution,
    handleDoorbellMcpMigration,
    handleDoorbellWelcomeReward,
} from "./lifecycle.js";
import { handleDoorbellLingyeAction, handleDoorbellLingyeReadiness } from "./lingye.js";
import {
    handleDoorbellConstablePublicNoticeOpen,
    handleDoorbellHumanConstableInterviewAction,
    handleDoorbellHumanConstableInterviewRead,
} from "./constable-interview.js";
import {
    handleDoorbellHumanReporterLike,
    handleDoorbellHumanReporterRead,
} from "./reporter.js";
import {
    handleDoorbellLingyeDailyMaterial,
    handleDoorbellReporterRelayHandoff,
    handleDoorbellReporterRelayPending,
    handleDoorbellReporterRelayPublication,
    handleDoorbellReporterRelayPublished,
    handleDoorbellReporterRelayReviewer,
    handleDoorbellReporterRelayStart,
} from "./daily-material.js";
import { humanFieldError, internalServiceError } from "./contract.js";
import { handleDoorbellDailySubmissionReward } from "./daily-submission.js";
import { handleDoorbellDailyWeather } from "./daily-weather.js";

export function createDoorbellInternalHandler(executeFarmAction, lingyeActionExecutor, careerBenefitsForFarm, constableInterviewRuntime) {
    return async function handleDoorbellInternal(req, res, parts, method) {
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "weather" && parts.length === 4) {
            await handleDoorbellDailyWeather(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "reviewer" && parts.length === 5) {
            if (!constableInterviewRuntime?.database) {
                internalServiceError(res, 503, "service_unavailable", "The reporter reviewer service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayReviewer(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "submission-reward" && parts.length === 4) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The submission reward service is unavailable");
                return true;
            }
            await handleDoorbellDailySubmissionReward(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "start" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The reporter relay service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayStart(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "handoff" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The reporter relay service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayHandoff(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "pending" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The reporter relay service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayPending(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "publication" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The reporter relay service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayPublication(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            parts[4] === "published" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The reporter relay service is unavailable");
                return true;
            }
            await handleDoorbellReporterRelayPublished(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "material" && parts.length === 4) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The Lingye Daily material service is unavailable");
                return true;
            }
            await handleDoorbellLingyeDailyMaterial(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "reporter" && parts[4] === "read" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                humanFieldError(res, 503, "farm_unavailable", "The reporter service is unavailable");
                return true;
            }
            await handleDoorbellHumanReporterRead(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "reporter" && parts[4] === "like" && parts.length === 5) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                humanFieldError(res, 503, "farm_unavailable", "The reporter service is unavailable");
                return true;
            }
            await handleDoorbellHumanReporterLike(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "constable" && parts[4] === "interview" && parts[5] === "read" && parts.length === 6) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                humanFieldError(res, 503, "farm_unavailable", "The constable interview service is unavailable");
                return true;
            }
            await handleDoorbellHumanConstableInterviewRead(req, res, method, constableInterviewRuntime.database, constableInterviewRuntime.backend, constableInterviewRuntime.now?.() ?? Date.now());
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "constable" && parts[4] === "interview" && parts[5] === "action" && parts.length === 6) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                humanFieldError(res, 503, "farm_unavailable", "The constable interview service is unavailable");
                return true;
            }
            await handleDoorbellHumanConstableInterviewAction(req, res, method, constableInterviewRuntime.database, constableInterviewRuntime.backend, constableInterviewRuntime.now?.() ?? Date.now());
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "constable" && parts[3] === "interview" && parts[4] === "public-notice" && parts[5] === "open" && parts.length === 6) {
            if (!constableInterviewRuntime?.database || !constableInterviewRuntime?.backend) {
                internalServiceError(res, 503, "service_unavailable", "The constable interview service is unavailable");
                return true;
            }
            await handleDoorbellConstablePublicNoticeOpen(req, res, method, constableInterviewRuntime.database, constableInterviewRuntime.backend, constableInterviewRuntime.now?.() ?? Date.now());
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "memorial" && parts[4] === "qixi-2026" && parts[5] === "read" && parts.length === 6) {
            await handleDoorbellHumanQixiMemorialRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "action-list" && parts[4] === "authority" && parts[5] === "read" && parts.length === 6) {
            await handleDoorbellHumanActionListAuthorityRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "catalog" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanCatalogRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "catalog" && parts[4] === "shop" && parts[5] === "open" && parts.length === 6) {
            await handleDoorbellHumanFarmShopOpen(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "bulletin" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanBulletinRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "bulletin" && parts[4] === "ack" && parts.length === 5) {
            await handleDoorbellHumanBulletinAck(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanKitchenRead(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "shop" && parts[5] === "open" && parts.length === 6) {
            await handleDoorbellHumanKitchenShopOpen(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "purchase" && parts.length === 5) {
            await handleDoorbellHumanKitchenPurchase(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "cook" && parts.length === 5) {
            await handleDoorbellHumanKitchenCook(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "shop" && parts[5] === "refresh" && parts.length === 6) {
            await handleDoorbellHumanKitchenShopRefresh(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "kitchen" && parts[4] === "inventory" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanKitchenInventoryAction(req, res, method, careerBenefitsForFarm);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "glimmer" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanGlimmerRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "together" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanTogetherRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "field" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanFieldRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "read" && parts.length === 5) {
            await handleDoorbellHumanRanchRead(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "resident-action" && parts.length === 5) {
            await handleDoorbellHumanRanchResidentAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "decoration-action" && parts.length === 5) {
            await handleDoorbellHumanRanchDecorationAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "collect" && parts.length === 5) {
            await handleDoorbellHumanRanchCollection(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "settings" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanFarmSettingsAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "original-plant" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanOriginalPlantAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "codex" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanCropCodexAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "smelting" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanSmeltingAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "expedition" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanExpeditionAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "ranch" && parts[4] === "interaction" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanRanchInteractionAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "market" && parts[4] === "action" && parts.length === 5) {
            await handleDoorbellHumanMarketAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "neighborhood" && parts[4] === "message" && parts[5] === "action" && parts.length === 6) {
            await handleDoorbellHumanNeighborhoodMessageAction(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "field" && parts[4] === "harvest-assist" && parts.length === 5) { await handleDoorbellHumanHarvestAssist(req, res, method, careerBenefitsForFarm); return true; }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "human" && parts[3] === "field" && parts[4] === "upgrade" && parts.length === 5) { await handleDoorbellHumanLandUpgrade(req, res, method); return true; }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "welcome-reward" && parts.length === 3) {
            await handleDoorbellWelcomeReward(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "farm-creation" && parts.length === 3) {
            await handleDoorbellFarmCreation(req, res, method);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "mcp-migrations" && parts[3] === "revoke-farm-access" && parts.length === 4) {
            await handleDoorbellMcpMigration(req, res, method, constableInterviewRuntime);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "farm-actions" && parts[3] === "execute" && parts.length === 4) {
            await handleDoorbellFarmExecution(req, res, method, executeFarmAction);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "lingye-actions" && parts[3] === "execute" && parts.length === 4) {
            await handleDoorbellLingyeAction(req, res, method, lingyeActionExecutor);
            return true;
        }
        if (parts[0] === "internal" && parts[1] === "doorbell" && parts[2] === "lingye-actions" && parts[3] === "readiness" && parts.length === 4) {
            handleDoorbellLingyeReadiness(req, res, method, constableInterviewRuntime);
            return true;
        }
        return false;
    };
}
