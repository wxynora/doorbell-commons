const BEIJING_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function beijingDateTime(value) {
    const parts = Object.fromEntries(
        BEIJING_DATE_TIME_FORMATTER.formatToParts(new Date(value))
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function detentionBlockedFarmActionText(detention) {
    const releaseAt = beijingDateTime(detention.scheduledReleaseAt);
    return `你目前正在铃野看守所服刑，本次农场操作没有执行。预计北京时间 ${releaseAt} 释放；可以调用 doorbell({"op":"go.security.commission","args":{}}) 查看剩余时间或办理提前释放。`;
}

export function detentionAllowsFarmAction(action) {
    return !action || action === "status" || action === "help";
}
