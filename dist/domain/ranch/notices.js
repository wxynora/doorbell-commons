import { ensureRanch } from "./state.js";

/** 取走人类未读消息；指定 section 的消息只会在对应页面消费，老消息仍保持任意页一次性弹出。 */
export function takeRanchNotices(farm, section) {
    const notices = farm.ranch?.notices ?? [];
    const taken = notices.filter((notice) => !notice.section || notice.section === section);
    if (farm.ranch)
        farm.ranch.notices = notices.filter((notice) => notice.section && notice.section !== section);
    return taken.map((notice) => notice.text);
}

/** 给人类牧场页留一条下次打开自动弹出的消息。 */
export function pushRanchNotice(farm, text, now, section) {
    const ranch = ensureRanch(farm);
    (ranch.notices ??= []).push(section ? { at: now, text, section } : { at: now, text });
}
