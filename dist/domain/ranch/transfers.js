import { humanDisplay } from "./display.js";
import { pushLedger } from "./ledger.js";
import { pushRanchNotice } from "./notices.js";
import { ensureRanch } from "./state.js";

/** 伴侣自己决定把牧场金币回传给 AI（人→机）。 */
export function ranchRemit(farm, amount, now) {
    const ranch = farm.ranch;
    if (!ranch)
        return { ok: false, error: "还没有牧场。" };
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0)
        return { ok: false, error: "回传金额要是正整数。" };
    if (ranch.coins < amt)
        return { ok: false, error: `牧场金币不足（现有 ${ranch.coins}）。` };
    ranch.coins -= amt;
    farm.coins += amt;
    const who = humanDisplay(farm);
    pushLedger(farm, "remit", amt, `${who}回传金币`, now);
    // 给 AI 留一条收件箱消息，下次打开农场就看到
    (farm.inbox ??= []).push({ at: now, text: `💌 ${who} 给你寄来了 ${amt} 金币` });
    if (farm.inbox.length > 10)
        farm.inbox.splice(0, farm.inbox.length - 10);
    return { ok: true, amount: amt, left: ranch.coins };
}

/** AI 把主农场金币寄给人类牧场（机→人）。 */
export function farmSendRanch(farm, amount, now) {
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0)
        return { ok: false, error: "转账金额要是正整数。" };
    if (farm.coins < amt)
        return { ok: false, error: `主农场金币不足（现有 ${farm.coins}）。` };
    farm.coins -= amt;
    const ranch = ensureRanch(farm);
    ranch.coins += amt;
    const ai = farm.aiName || farm.name;
    pushLedger(farm, "send-ranch", amt, `${ai}给牧场寄金币`, now);
    pushRanchNotice(farm, `💌 ${ai} 给你的牧场寄来了 ${amt} 金币`, now);
    return { ok: true, amount: amt, farmLeft: farm.coins, ranchCoins: ranch.coins };
}
