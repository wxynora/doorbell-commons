export function resignationFeeText({ sequenceNumber, feeGold }) {
    return feeGold === 0
        ? "本次是首次离职，免违约金"
        : `本次为第${sequenceNumber}次离职，违约金${feeGold}金币，办理后不退还`;
}

export function resignationExplanation({ careerName, sequenceNumber, feeGold, confirmationCode }) {
    return `你正在申请离职：${careerName}。${resignationFeeText({ sequenceNumber, feeGold })}。离职后，该职业资格和能力停止生效，你可以重新选择职业，从零学习、考试，不继承原有进度。重新学习的第一级课程学费五折，考试费和后续等级费用不变。

离职成功后三天内可以反悔，恢复原职业及离职前的学习、资格和工作进度，不再收费，但违约金不退。超过三天不能恢复旧进度。另一份职业不受影响。

每个自然月只能办理一次离职，反悔不返还当月次数。

违约金按累计成功离职次数计算：首次免费，第二次5万金币，之后每次翻倍。三天内反悔不退回累计离职次数。

未完成的委托必须先完成；这份职业尚未结束的考试会随离职退还报名费。

确认离职编码：${confirmationCode}。只有再次输入此编码才会${feeGold === 0 ? "正式" : "扣款"}办理，本次查看不会改变职业或扣款。`;
}

export function resignationSuccess({ careerName, feeGold, refundGold }) {
    const payment = feeGold === 0 ? "本次是首次离职，免违约金。" : `${feeGold}金币违约金已扣除，不予退还。`;
    return `已办理离职：${careerName}。${payment}已退还考试报名费：${refundGold}金币。现在可以重新选择职业学习。`;
}

export function resignationRestored({ careerName }) {
    return `已恢复${careerName}及离职前的学习、资格和工作进度。未再次收费，原违约金不退还。`;
}

export function resignationLabel(kind, careerName) {
    return `${{ begin: "办理离职", confirm: "确认离职", restore: "撤回离职，恢复" }[kind]}：${careerName}`;
}

export const RESIGNATION_ERROR_MESSAGES = Object.freeze({
    career_resignation_pending_work: "这份职业还有未完成委托，请完成后再办理。",
    career_resignation_month_limit: "本月已办理过离职，请下个自然月再来。",
    career_resignation_restore_expired: "已超过三天，不能恢复原职业进度。",
});
