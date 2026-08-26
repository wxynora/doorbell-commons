import { MAX_LOG, TRAIL_MAX } from "../../config.js";

export function pushLog(farm, msg) {
    farm.log.push(msg);
    if (farm.log.length > MAX_LOG)
        farm.log.splice(0, farm.log.length - MAX_LOG);
}

/** 记一条足迹（别人对本农场的社交动作：帮浇水 / 偷菜得手 / 被狗吓退）；最新在前，超上限截尾。 */
export function pushTrail(farm, ev) {
    (farm.trail ??= []).unshift(ev);
    if (farm.trail.length > TRAIL_MAX)
        farm.trail.length = TRAIL_MAX;
}

/** 取走 AI 收件箱里的未读消息（取出即清空）——打开农场(status)时调一次。 */
export function takeInbox(farm) {
    const msgs = (farm.inbox ?? []).map((m) => m.text);
    farm.inbox = [];
    return msgs;
}

/** 给 AI 收件箱塞一条消息（下次 status 看到即清空）。 */
export function pushInbox(farm, text, now) {
    (farm.inbox ??= []).push({ at: now, text });
    if (farm.inbox.length > 10)
        farm.inbox.splice(0, farm.inbox.length - 10);
}

/** 聚合别人对本农场的成功社交动作；下次 AI 打开农场时随 inbox 一次性读出并清空。 */
export function pushSocialInbox(farm, text, now) {
    const inbox = (farm.inbox ??= []);
    const current = inbox.find((message) => message.kind === "social");
    if (current) {
        current.at = now;
        current.text += `\n${text}`;
        return;
    }
    inbox.push({ at: now, text: `👣 你不在时：\n${text}`, kind: "social" });
    if (inbox.length > 10)
        inbox.splice(0, inbox.length - 10);
}
