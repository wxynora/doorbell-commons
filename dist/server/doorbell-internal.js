export { internalServiceError, legacyAgentAccessRevoked } from "./doorbell/contract.js";
import { createDoorbellInternalHandler as createExistingInternalHandler } from "./doorbell/router.js";
import { handleReporterMaterialsSource } from "../reporter-materials/internal-source.js";
import { handleDoorbellReporterColumnRelay } from "./doorbell/daily-column.js";

export function createDoorbellInternalHandler(...args) {
    const existingHandler = createExistingInternalHandler(...args);
    return async (req, res, parts, method) => {
        if (parts.length === 5 && parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-materials" &&
            ["source", "qualification"].includes(parts[4])) {
            await handleReporterMaterialsSource(req, res, method, args[3], parts[4]);
            return true;
        }
        if (parts.length === 5 && parts[0] === "internal" && parts[1] === "doorbell" &&
            parts[2] === "lingye-daily" && parts[3] === "reporter-relay" &&
            ["column-roster", "column-submitted", "column-published"].includes(parts[4])) {
            await handleDoorbellReporterColumnRelay(req, res, method, args[3], parts[4]);
            return true;
        }
        return existingHandler(req, res, parts, method);
    };
}
