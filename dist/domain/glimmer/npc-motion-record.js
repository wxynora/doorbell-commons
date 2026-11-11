export function pendingMotionEntry({ id, name, npcName, options }) {
    return { id, name, npcName, options: structuredClone(options) };
}

export function settledMotionReceipt(motion) {
    return {
        optionKeys: Object.keys(motion.entry.options),
        result: motion.result,
        selected: motion.selected,
        createdAt: motion.createdAt,
        settledAt: motion.settledAt,
    };
}

export function compactNpcMotion(motion) {
    if (!motion.entry?.options) return motion;
    if (motion.result) return settledMotionReceipt(motion);
    return { entry: pendingMotionEntry(motion.entry), createdAt: motion.createdAt };
}
