(function () {
  const root = document.getElementById('vote-root');
  if (!root) return;
  const isAdmin = root.dataset.isAdmin === '1';

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── User: open topics + voting ──────────────────────────────────────────
  const openTopicsBox = document.getElementById('vote-open-topics');

  async function loadOpenTopics() {
    let topics;
    try {
      topics = await api('GET', '/api/voting');
    } catch (e) {
      openTopicsBox.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      return;
    }
    if (!topics.length) { openTopicsBox.innerHTML = '<div class="empty-state">No topics open for you right now</div>'; openTopicsBox.className = 'card empty-state'; return; }
    openTopicsBox.className = '';
    openTopicsBox.innerHTML = topics.map((t) => `
      <div class="card" id="topic-${t.id}">
        <h2 style="margin-top:0">${escapeHtml(t.title)}</h2>
        <p class="subtitle">${escapeHtml(t.description || '')} · ${t.start_date} → ${t.end_date} · <strong>${t.votes_remaining}</strong> votes remaining</p>
        <input type="text" placeholder="Search employees..." class="topic-search" data-topic="${t.id}" style="width:100%; margin-bottom:8px;">
        <table>
          <thead><tr><th>Employee</th><th>Position</th><th></th></tr></thead>
          <tbody id="nominees-${t.id}"><tr><td colspan="3" class="empty-state">Type a name to search...</td></tr></tbody>
        </table>
      </div>
    `).join('');

    topics.forEach((t) => loadNominees(t.id, ''));
    document.querySelectorAll('.topic-search').forEach((input) => {
      let timer;
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => loadNominees(input.dataset.topic, input.value), 250); });
    });
  }

  async function loadNominees(topicId, search) {
    const tbody = document.getElementById(`nominees-${topicId}`);
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading...</td></tr>';
    try {
      const data = await api('GET', `/api/voting/${topicId}/nominees?${new URLSearchParams({ search })}`);
      if (!data.nominees.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No results</td></tr>'; return; }
      tbody.innerHTML = data.nominees.map((n) => `
        <tr>
          <td><a href="/employees/${n.id}">${escapeHtml(n.full_name)}</a></td>
          <td>${escapeHtml(n.position)}</td>
          <td><button data-topic="${topicId}" data-emp="${n.id}" data-voted="${n.i_voted_for_this}" class="vote-btn ${n.i_voted_for_this ? 'secondary' : ''}" style="padding:4px 8px;">${n.i_voted_for_this ? 'Unvote' : 'Vote'}</button></td>
        </tr>
      `).join('');
      tbody.querySelectorAll('.vote-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const voted = btn.dataset.voted === 'true';
          try {
            await api('POST', `/api/voting/${btn.dataset.topic}/vote`, { employee_id: btn.dataset.emp, action: voted ? 'unvote' : 'vote' });
            loadOpenTopics();
          } catch (e) { alert(e.message); }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  loadOpenTopics();

  // ── Admin: manage topics ─────────────────────────────────────────────────
  if (!isAdmin) return;
  document.getElementById('vote-admin-section').style.display = '';
  let options = null;

  async function loadAdminTable() {
    const tbody = document.getElementById('vote-admin-table').querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Loading...</td></tr>';
    try {
      const topics = await api('GET', '/api/voting/admin');
      if (!topics.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No topics yet</td></tr>'; return; }
      tbody.innerHTML = topics.map((t) => `
        <tr>
          <td>${escapeHtml(t.title)}</td>
          <td>${t.start_date} → ${t.end_date}</td>
          <td>${t.voterLevels.join(', ')}</td>
          <td>${t.nomineePositions.map(escapeHtml).join(', ')}</td>
          <td>${t.total_votes}</td>
          <td><span class="badge ${t.status === 'active' ? (t.isActive ? 'approved' : 'view') : 'rejected'}">${t.status}${t.status === 'active' && !t.isActive ? ' (not yet open / expired)' : ''}</span></td>
          <td>
            <button data-results="${t.id}" class="secondary" style="padding:4px 8px;">Results</button>
            ${t.status === 'active' ? `<button data-close="${t.id}" class="secondary" style="padding:4px 8px;">Close</button>` : ''}
            <button data-delete="${t.id}" class="danger" style="padding:4px 8px;">Delete</button>
          </td>
        </tr>
        <tr id="results-row-${t.id}" style="display:none"><td colspan="7"><div id="results-${t.id}"></div></td></tr>
      `).join('');

      tbody.querySelectorAll('[data-results]').forEach((btn) => btn.addEventListener('click', () => toggleResults(btn.dataset.results)));
      tbody.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', async () => {
        await api('PATCH', `/api/voting/admin/${btn.dataset.close}`, { status: 'closed' });
        loadAdminTable();
      }));
      tbody.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!confirm('Delete this topic and all its votes?')) return;
        await api('DELETE', `/api/voting/admin/${btn.dataset.delete}`);
        loadAdminTable();
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function toggleResults(topicId) {
    const row = document.getElementById(`results-row-${topicId}`);
    if (row.style.display === 'table-row') { row.style.display = 'none'; return; }
    row.style.display = 'table-row';
    const slot = document.getElementById(`results-${topicId}`);
    slot.innerHTML = 'Loading...';
    const data = await api('GET', `/api/voting/admin/${topicId}/results`);
    slot.innerHTML = `
      <p>${data.total_voters} people voted</p>
      <table>
        <thead><tr><th>Employee</th><th>Position</th><th>Votes</th></tr></thead>
        <tbody>${data.results.map((r) => `<tr><td><a href="/employees/${r.employee_id}">${escapeHtml(r.name)}</a></td><td>${escapeHtml(r.position)}</td><td>${r.vote_count}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">No votes yet</td></tr>'}</tbody>
      </table>
    `;
  }

  document.getElementById('vote-new-topic-btn').addEventListener('click', async () => {
    const slot = document.getElementById('vote-new-topic-form-slot');
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    if (!options) options = await api('GET', '/api/voting/options');
    slot.innerHTML = `
      <form id="vote-create-form" style="margin-top:12px; display:flex; flex-direction:column; gap:8px; max-width:560px;">
        <label>Title<input name="title" required></label>
        <label>Description<textarea name="description" rows="2"></textarea></label>
        <div style="display:flex; gap:8px;">
          <label style="flex:1">Open date<input type="date" name="start_date" required></label>
          <label style="flex:1">Close date<input type="date" name="end_date" required></label>
          <label style="flex:1">Votes per person<input type="number" name="max_votes_per_voter" value="1" min="1" required></label>
        </div>
        <div>
          <strong>Who can vote (by rank level):</strong>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
            ${options.levels.map((l) => `<label style="border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:12.5px;"><input type="checkbox" name="voter_level" value="${l}" style="width:auto;"> Level ${l}</label>`).join('')}
          </div>
        </div>
        <div>
          <strong>Which positions can be voted for:</strong>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; max-height:140px; overflow:auto;">
            ${options.positions.map((p) => `<label style="border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:12.5px;"><input type="checkbox" name="nominee_position" value="${escapeHtml(p)}" style="width:auto;"> ${escapeHtml(p)}</label>`).join('')}
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="submit">Create topic</button>
        </div>
        <div class="error" id="vote-create-error"></div>
      </form>
    `;
    document.getElementById('vote-create-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const voterLevels = [...ev.target.querySelectorAll('input[name="voter_level"]:checked')].map((c) => Number(c.value));
      const nomineePositions = [...ev.target.querySelectorAll('input[name="nominee_position"]:checked')].map((c) => c.value);
      try {
        await api('POST', '/api/voting/admin', {
          title: fd.get('title'), description: fd.get('description'),
          start_date: fd.get('start_date'), end_date: fd.get('end_date'),
          max_votes_per_voter: fd.get('max_votes_per_voter'),
          eligible_voter_levels: voterLevels,
          eligible_nominee_positions: nomineePositions,
        });
        slot.innerHTML = '';
        loadAdminTable();
        loadOpenTopics();
      } catch (e) {
        document.getElementById('vote-create-error').textContent = e.message;
      }
    });
  });

  loadAdminTable();
})();
