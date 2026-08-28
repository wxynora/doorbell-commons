import { createRequire } from "node:module";

// The question/fact bank stays outside this repository. Deployments may point
// this loader at a private CommonJS provider; absence intentionally leaves the
// interview unable to enter scoring or public notice.
export function loadConstableInterviewBank() {
    const modulePath = process.env.AIFARM_CONSTABLE_INTERVIEW_BANK_MODULE;
    if (typeof modulePath !== "string" || modulePath.trim().length === 0)
        return undefined;
    try {
        const loaded = createRequire(import.meta.url)(modulePath);
        const provider = loaded?.default ?? loaded;
        if (!provider || typeof provider.getConstableInterviewPaper !== "function")
            throw new Error("invalid_provider");
        return provider;
    }
    catch {
        throw new Error("Constable interview bank configuration is invalid");
    }
}
