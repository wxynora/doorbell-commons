export class EconomyError extends Error {
    code;
    details;
    constructor(code, details = {}) {
        super(code);
        this.name = "EconomyError";
        this.code = code;
        this.details = details;
    }
}
