(function () {
  const summaryTable = document.getElementById('train-summary-table');
  if (!summaryTable) return;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadSummary() {
    const tbody = summaryTable.querySelector('tbody');
    const gameSelect = document.getElementById('train-game');
    try {
      const rows = await api('GET', '/api/training/summary');
      tbody.innerHTML = rows.map((r) => `<tr><td>${escapeHtml(r.game)}</td><td>${r.employees_trained}</td><td>${r.sessions}</td></tr>`).join('')
        || '<tr><td colspan="3" class="empty-state">No data yet</td></tr>';
      gameSelect.innerHTML = '<option value="">All games</option>' + rows.map((r) => `<option value="${escapeHtml(r.game)}">${escapeHtml(r.game)}</option>`).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function loadLog() {
    const tbody = document.getElementById('train-log-table').querySelector('tbody');
    const game = document.getElementById('train-game').value;
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading...</td></tr>';
    try {
      const rows = await api('GET', `/api/training?${new URLSearchParams({ game })}`);
      tbody.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.training_date ?? ''}</td>
          <td><a href="/employees/${r.employee_id}">${escapeHtml(r.employee_name)}</a></td>
          <td>${escapeHtml(r.game)}</td>
          <td>${escapeHtml(r.month)}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-state">No data</td></tr>';
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  document.getElementById('train-game').addEventListener('change', loadLog);

  document.getElementById('train-emp-btn').addEventListener('click', async () => {
    const id = document.getElementById('train-emp-id').value.trim();
    if (!id) return;
    const table = document.getElementById('train-skill-table');
    const tbody = table.querySelector('tbody');
    table.style.display = 'table';
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading...</td></tr>';
    try {
      const rows = await api('GET', `/api/training/skill-matrix/${encodeURIComponent(id)}`);
      tbody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td>${escapeHtml(r.game)}</td><td>${r.sessions}</td><td>${r.last_trained ?? ''}</td></tr>`).join('')
        : '<tr><td colspan="3" class="empty-state">This employee has no training sessions yet</td></tr>';
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  });

  loadSummary().then(loadLog);
})();
