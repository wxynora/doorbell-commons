// Selection remains ordinary text. Only explicit material references select
// facts; other numbers in titles or observations have no special meaning.
export function reporterSelectionWithMaterials(selectionText, materials) {
    const selected = new Set();
    for (const match of selectionText.matchAll(/素材编号[：:]\s*(\d+(?:[ \t]*[、，,][ \t]*\d+)*)/gu)) {
        for (const value of match[1].split(/[、，,]/u)) {
            const index = Number(value.trim());
            if (Number.isSafeInteger(index) && index > 0 && materials[index - 1])
                selected.add(index);
        }
    }
    if (selected.size === 0)
        return selectionText;
    const facts = [...selected].map((index) => {
        const material = materials[index - 1];
        return `素材 ${index}｜${material.title}\n发生时间：${material.occurred_at}\n${material.content}`;
    });
    return `${selectionText}\n\n${facts.join("\n\n")}`;
}
