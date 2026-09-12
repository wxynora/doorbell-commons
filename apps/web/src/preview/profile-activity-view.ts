/** Binds authoritative owner activity to the existing notebook and three-node graph. */
export const PROFILE_ACTIVITY_SCRIPT = `
    let profileRelationshipPage = 0;
    let profileRelationshipRows = [];
    function profileFactTime(value) {
        return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function renderProfileRelationships() {
        const visible = profileRelationshipRows.slice(profileRelationshipPage * 3, profileRelationshipPage * 3 + 3);
        document.querySelectorAll('.candidate2-demo-relation-node').forEach((node, index) => {
            const row = visible[index];
            node.hidden = !row;
            node.style.display = row ? '' : 'none';
            node.querySelector('strong').textContent = row ? row.name : '';
            node.querySelector('small').textContent = row ? row.facts.join(' · ') : '';
            node.title = row ? '最近来往 ' + profileFactTime(row.lastAt) : '';
        });
        document.querySelectorAll('.candidate2-demo-relation-lines line').forEach((line, index) => { line.style.display = visible[index] ? '' : 'none'; });
        document.getElementById('profile-relationship-less').hidden = profileRelationshipPage === 0;
        document.getElementById('profile-relationship-more').hidden = (profileRelationshipPage + 1) * 3 >= profileRelationshipRows.length;
    }
    function applyOwnerProfileActivity(view) {
        const ready = view && view.stage === 'ready';
        const empty = document.querySelector('.candidate2-profile-empty');
        const list = document.querySelector('.candidate2-demo-activity-list');
        const more = document.getElementById('profile-activity-more');
        const loading = view && view.stage === 'loading';
        const unavailable = view && view.stage === 'error';
        const farmUnavailable = ready && view.data.farmUnavailable === true;
        const activities = ready ? [...view.data.activities].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.sequence - a.sequence).slice(0, 50) : [];
        const expanded = ready && more.dataset.expanded === 'true';
        empty.hidden = activities.length > 0 && !farmUnavailable;
        empty.textContent = loading ? '正在读取最近活动…' : unavailable ? '最近活动读取失败，请重新读取。' : farmUnavailable ? '农场活动暂时读不到' : '暂无可读取的活动数据';
        list.hidden = activities.length === 0;
        list.replaceChildren(...activities.map((activity, index) => {
            const row = document.createElement('div');
            row.className = 'candidate2-demo-activity' + (expanded ? '' : ' is-collapsed');
            row.style.setProperty('--activity-tone', ['var(--soft-pink)', 'var(--sky-blue)', 'var(--warm-sand)', '#D5E6DF'][index % 4]);
            const icon = document.createElement('span'); icon.textContent = '·';
            const label = document.createElement('span'); label.textContent = activity.label;
            const time = document.createElement('time'); time.dateTime = activity.at; time.textContent = profileFactTime(activity.at);
            row.append(icon, label, time); return row;
        }));
        more.hidden = activities.length <= 4;
        more.dataset.expanded = String(expanded);
        more.textContent = expanded ? 'Less' : 'More';
        const byResident = new Map();
        for (const relation of ready ? view.data.relationships : []) {
            let row = byResident.get(relation.residentId);
            if (!row) { row = { name: relation.name, lastAt: relation.lastAt, facts: [] }; byResident.set(relation.residentId, row); }
            if (Date.parse(relation.lastAt) > Date.parse(row.lastAt)) row.lastAt = relation.lastAt;
            row.facts.push(relation.kind === 'chat' ? '聊过 ' + relation.count + ' 天' : '同玩 ' + relation.count + ' 局');
        }
        profileRelationshipRows = [...byResident.values()].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
        profileRelationshipPage = Math.min(profileRelationshipPage, Math.max(0, Math.ceil(profileRelationshipRows.length / 3) - 1));
        const graph = document.querySelector('.candidate2-demo-relationship');
        const graphEmpty = document.querySelector('.profile-relationships-empty');
        graph.hidden = profileRelationshipRows.length === 0;
        graphEmpty.hidden = profileRelationshipRows.length > 0;
        graphEmpty.textContent = loading ? '正在读取来往…' : unavailable ? '来往数据读取失败，请重新读取。' : '暂时没有来往记录';
        document.getElementById('profile-relationship-edit').hidden = profileRelationshipRows.length === 0;
        document.getElementById('profile-relationship-editor').hidden = true;
        renderProfileRelationships();
    }
    document.getElementById('profile-relationship-more').addEventListener('click', () => { profileRelationshipPage += 1; renderProfileRelationships(); });
    document.getElementById('profile-relationship-less').addEventListener('click', () => { profileRelationshipPage = Math.max(0, profileRelationshipPage - 1); renderProfileRelationships(); });
`;
