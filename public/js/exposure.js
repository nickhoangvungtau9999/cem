(function () {
  const summaryTable = document.getElementById('exp-summary-table');
  if (!summaryTable) return;

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadSummary() {
    const tbody = summaryTable.querySelector('tbody');
    try {
      const rows = await api('GET', '/api/exposure/summary');
      tbody.innerHTML = rows.map((r) => `<tr><td>${escapeHtml(r.game)}</td><td>${escapeHtml(r.function)}</td><td>${r.employees}</td><td>${r.sessions}</td></tr>`).join('')
        || '<tr><td colspan="4" class="empty-state">No data yet</td></tr>';
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  document.getElementById('exp-emp-btn').addEventListener('click', async () => {
    const id = document.getElementById('exp-emp-id').value.trim();
    if (!id) return;
    const table = document.getElementById('exp-emp-table');
    const tbody = table.querySelector('tbody');
    table.style.display = 'table';
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading...</td></tr>';
    try {
      const rows = await api('GET', `/api/exposure/summary/${encodeURIComponent(id)}`);
      tbody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td>${escapeHtml(r.game)}</td><td>${escapeHtml(r.function)}</td><td>${r.sessions}</td><td>${r.last_date ?? ''}</td></tr>`).join('')
        : '<tr><td colspan="4" class="empty-state">This employee has no exposure data yet</td></tr>';
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  });

  loadSummary();
})();
