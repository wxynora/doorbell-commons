function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Project receipt facts only; command eligibility and public business options stay authoritative upstream. */
export function projectCommissionReceipt(data, residentId, workerQualified) {
    if (!isRecord(data))
        return data;
    const projected = { ...data, workerQualified };
    if (!workerQualified) {
        for (const field of ["jobs", "sources"]) {
            if (Array.isArray(data[field])) {
                projected[field] = data[field].filter((item) => isRecord(item) &&
                    [item.ownerResidentId, item.workerResidentId, item.targetResidentId].includes(residentId));
            }
        }
    }
    if (isRecord(data.current))
        projected.current = projectCommissionReceipt(data.current, residentId, workerQualified);
    return projected;
}
