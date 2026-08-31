function nextBeijingDayBoundary(now) {
    const offset = 8 * 60 * 60 * 1_000;
    return (Math.floor((now + offset) / (24 * 60 * 60 * 1_000)) + 1) *
        24 * 60 * 60 * 1_000 - offset;
}

function nextConstableDue(database, current) {
    const interview = database
        .prepare(`SELECT MIN(scheduled_at) AS at FROM career_constable_interviews
          WHERE status = 'signup_open' AND scheduled_at > ?`)
        .get(current)?.at;
    const notice = database
        .prepare(`SELECT MIN(closes_at) AS at FROM career_constable_public_notices
          WHERE status = 'open' AND closes_at > ?`)
        .get(current)?.at;
    return [interview, notice]
        .filter((value) => Number.isSafeInteger(value))
        .sort((left, right) => left - right)[0] ?? nextBeijingDayBoundary(current);
}

export function startConstableInterviewScheduler(database, backend, options = {}) {
    if (!backend?.trustedSystemCommands?.advanceConstableInterviews)
        throw new Error("Constable interview scheduler requires trusted school commands");
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? setTimeout;
    let stopped = false;
    let timer;
    const advance = () => {
        if (stopped)
            return;
        backend.trustedSystemCommands.advanceConstableInterviews(now());
    };
    const schedule = () => {
        if (stopped)
            return;
        const current = now();
        timer = setTimer(() => {
            if (stopped)
                return;
            try {
                advance();
            }
            catch (error) {
                console.error("[lingye-constable] interview advancement failed", error);
            }
            finally {
                schedule();
            }
        }, Math.max(0, nextConstableDue(database, current) - current));
        timer?.unref?.();
    };
    advance();
    schedule();
    return () => {
        stopped = true;
        if (timer)
            clearTimeout(timer);
    };
}
