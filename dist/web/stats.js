import { codexCountByCategory } from "../engine.js";

/** 一座农场已收集官方物种数（普通+奇幻+限定）。 */
export function codexGot(f) {
    return codexCountByCategory(f, "common") + codexCountByCategory(f, "fantasy") + codexCountByCategory(f, "limited");
}
/** 在全服中按某打分函数排第几（1 起）。 */
export function rankOf(farms, me, score) {
    const v = score(me);
    let r = 1;
    for (const o of farms)
        if (score(o) > v)
            r++;
    return r;
}
