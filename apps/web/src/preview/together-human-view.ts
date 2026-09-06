// Shared by the existing embedded Human page and its direct DOM regression.
// Only already-published public facts are rendered; no action is submitted here.
export const TOGETHER_HUMAN_VIEW_SCRIPT = String.raw`
function normalizeLiveTogether(read) {
    const data = read && read.data;
    if (!data) return null;
    const season3 = data.story_id === 'rain_not_yet';
    const currentTask = data.current_task ? {
        contributors: [], name: data.current_task.title, opening: data.current_task.text,
        progress: Math.round(data.current_task.progress / data.current_task.target * 100),
    } : null;
    let currentSummary = currentTask ? currentTask.opening : null;
    if (!currentSummary && data.ending) currentSummary = data.ending.text;
    if (!currentSummary && data.cooldown) {
        currentSummary = [data.cooldown.text, data.cooldown.ready_text].filter(Boolean).join(' · ');
    }
    if (season3) {
        currentSummary = data.history
            .filter((entry) => ['story', 'clue', 'ending'].includes(entry.kind))
            .map((entry) => [entry.title, entry.text].filter(Boolean).join('\n\n')).join('\n\n');
        if (!currentSummary && data.ending) currentSummary = data.ending.text;
    }
    return {
        artFile: data.art_asset_key,
        archives: data.archives.map((archive) => ({
            artFile: archive.art_asset_key,
            history: archive.history.map((entry) => ({
                artFile: entry.art_asset_key, kind: entry.kind,
                ...(entry.kind === 'task' ? { progress: entry.progress, target: entry.target } : {}),
                text: entry.text, title: entry.title,
            })),
            round: archive.round, title: archive.title,
        })),
        currentChoice: data.current_choice ? {
            counts: data.current_choice.counts, index: data.current_choice.index,
            options: Object.fromEntries(data.current_choice.options.map((option) => [option.key, option.label])),
            title: data.current_choice.title,
        } : null,
        currentTask, currentSummary,
        interviews: season3 ? data.clues.map((clue) => ({ id: clue.id, title: clue.title, text: clue.text })) : [],
        stageCount: data.stage.total, stageIndex: data.stage.index, stageName: data.stage.name,
        tasks: data.current_task ? [{
            detail: data.current_task.text, name: data.current_task.title,
            progress: data.current_task.progress + ' / ' + data.current_task.target,
            status: season3 ? '实际交付' : data.phase === 'task' ? '进行中' : data.status,
        }] : [],
        routeName: data.story_id, round: data.round, status: data.status, title: data.title,
    };
}

function renderTogetherPublicFacts(data) {
    const season3 = data && data.routeName === 'rain_not_yet';
    const choice = document.querySelector('.candidate2-together-choice');
    if (choice) choice.hidden = !data || Boolean(season3);
    const story = document.querySelector('.candidate2-together-current-copy');
    if (story) story.style.whiteSpace = 'pre-wrap';
    for (const detail of document.querySelectorAll('.candidate2-together-task-list p')) {
        detail.style.whiteSpace = 'pre-wrap';
    }
    let section = document.querySelector('.candidate2-together-interviews');
    if (!season3) { if (section) section.remove(); return; }
    const rules = document.querySelector('#candidate2-together-rules');
    if (!rules) return;
    if (!section) {
        section = document.createElement('section');
        section.className = 'candidate2-together-section candidate2-together-interviews';
        section.setAttribute('aria-label', '采访记录');
        rules.before(section);
    }
    const heading = document.createElement('div');
    heading.className = 'candidate2-place-section-heading';
    const title = document.createElement('h2');
    title.textContent = '采访记录';
    heading.append(title);
    section.replaceChildren(heading);
    if (!data.interviews.length) {
        const empty = document.createElement('p');
        empty.className = 'candidate2-place-body-copy';
        empty.textContent = '还没有已完成的采访。';
        section.append(empty);
    }
    for (const interview of data.interviews) {
        const article = document.createElement('article');
        const name = document.createElement('h3');
        name.textContent = interview.title;
        const body = document.createElement('p');
        body.className = 'candidate2-place-body-copy';
        body.style.whiteSpace = 'pre-wrap';
        body.textContent = interview.text;
        article.append(name, body);
        section.append(article);
    }
    const taskHeading = document.querySelector('#candidate2-together-task-title');
    if (taskHeading) taskHeading.textContent = '公共料理交付';
    const ruleCopy = document.querySelector('.candidate2-together-rules-copy');
    if (ruleCopy) ruleCopy.textContent = '这里展示已经发生的剧情、公共料理交付和采访记录。故事随实际天气与灾后恢复推进；料理交付数量不是阶段倒计时。';
}
`;
