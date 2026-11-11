import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

const requestTiming = new AsyncLocalStorage();
function add(context, phase, elapsed) {
    context.phases[phase] = (context.phases[phase] ?? 0) + elapsed;
    context.calls[phase] = (context.calls[phase] ?? 0) + 1;
}
// Phases are inclusive and may nest: do not sum them as exclusive CPU time.
export function measureFarmPhase(phase, operation) {
    const context = requestTiming.getStore();
    if (!context) return operation();
    const start = performance.now();
    try { return operation(); }
    finally { add(context, phase, performance.now() - start); }
}
export async function measureFarmPhaseAsync(phase, operation) {
    const context = requestTiming.getStore();
    if (!context) return operation();
    const start = performance.now();
    try { return await operation(); }
    finally { add(context, phase, performance.now() - start); }
}
export async function withFarmRequestTiming(operation, publish = row => console.info(JSON.stringify(row))) {
    const started = performance.now();
    const context = {phases: {}, calls: {}};
    const details = {};
    const startedAt = new Date().toISOString();
    return requestTiming.run(context, async () => {
        try { return await operation(details); }
        finally {
            // No credentials, identities, arguments, receipts or player content.
            const row = {event: "farm_request_timing", startedAt,
                ...details,
                totalMs: Math.round((performance.now() - started) * 100) / 100,
                phasesMs: Object.fromEntries(Object.entries(context.phases).map(([k,v]) => [k, Math.round(v * 100) / 100])),
                calls: context.calls};
            try { publish(row); } catch { /* Diagnostics must not change the action result. */ }
        }
    });
}
