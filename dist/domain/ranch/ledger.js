import { LEDGER_MAX } from "../../config.js";

/** 往机⇄人流水里记一条（AI 唯一能看到的牧场信息），环形保留最近 LEDGER_MAX 条。 */
export function pushLedger(farm, type, amount, note, now) {
    (farm.ledger ??= []).unshift({ at: now, type, amount, note });
    if (farm.ledger.length > LEDGER_MAX)
        farm.ledger.length = LEDGER_MAX;
}
