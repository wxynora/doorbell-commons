function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
    return value === undefined ? undefined : structuredClone(value);
}

/**
 * Persist only the stable idempotent action result. Page resources, revision
 * tokens and server timestamps are current-state projections and deliberately
 * never enter the durable receipt.
 */
export function createMinimalHumanActionReceipt(fingerprint, response) {
    if (typeof fingerprint !== "string" || fingerprint.length === 0 ||
        !isRecord(response?.data) || !Object.hasOwn(response.data, "result")) {
        throw new TypeError("A Human action fingerprint and stable data.result are required");
    }
    return {
        fingerprint,
        result: cloneJson(response.data.result),
    };
}

/** Normalize either an old `{ fingerprint, response }` row or an already-small row. */
export function normalizeMinimalHumanActionReceipt(entry) {
    if (!isRecord(entry) || typeof entry.fingerprint !== "string" || entry.fingerprint.length === 0)
        throw new TypeError("A valid Human action receipt is required");
    if (Object.hasOwn(entry, "result")) {
        return {
            fingerprint: entry.fingerprint,
            result: cloneJson(entry.result),
        };
    }
    return createMinimalHumanActionReceipt(entry.fingerprint, entry.response);
}

/** Merge the stable old result into a freshly projected current response. */
export function replayMinimalHumanActionReceipt(entry, fingerprint, currentResponse) {
    const keys = isRecord(entry) ? Object.keys(entry) : [];
    if (keys.length !== 2 || !keys.includes("fingerprint") || !keys.includes("result") ||
        entry.fingerprint !== fingerprint ||
        !isRecord(currentResponse?.data)) {
        return null;
    }
    return {
        ...currentResponse,
        data: {
            ...currentResponse.data,
            result: cloneJson(entry.result),
        },
    };
}
