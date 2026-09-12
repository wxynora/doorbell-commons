export function settleEncounterCost(farm, entry, allowPartial = false) {
    if (!entry.cost) return { ok: true, text: entry.text, paid: 0 };
    const { kind, amount } = entry.cost;
    const balance = farm[kind] ?? 0;
    const unit = kind === "coins" ? "金" : "银";
    if (!allowPartial && balance < amount) {
        return { ok: false, text: `${kind === "coins" ? "金币" : "银币"}不足，需要${amount}${unit}；本次未扣款，可以重新选择。`, paid: 0 };
    }
    const paid = Math.min(balance, amount);
    farm[kind] = balance - paid;
    let text = entry.text;
    if (paid < amount) {
        text = text.replaceAll(`${amount}${unit}`, `${paid}${unit}`)
            .replaceAll(`${amount}枚${unit}币`, `${paid}枚${unit}币`);
        text += `\n余额不足，实际扣除${paid}${unit}，余额已归零。`;
    }
    return { ok: true, text, paid };
}
