(function () {
  const root = document.getElementById('att-root');
  if (!root) return;
  const tier = root.dataset.tier;
  const canEdit = tier === 'edit' || tier === 'approve';

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Flags panel ──────────────────────────────────────────────────────────
  const flagsBody = document.getElementById('att-flags-table').querySelector('tbody');
  let matrixLevels = null;

  async function loadFlags() {
    flagsBody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';
    try {
      const flags = await api('GET', '/api/attendance/flags');
      const pending = flags.filter((f) => !f.alreadyCased);
      if (!pending.length) { flagsBody.innerHTML = '<tr><td colspan="5" class="empty-state">No repeat violations need attention</td></tr>'; return; }
      flagsBody.innerHTML = pending.map((f, i) => `
        <tr>
          <td><a href="/employees/${f.employee_id}">${escapeHtml(f.employee_name)}</a></td>
          <td>${escapeHtml(f.att_type)}</td>
          <td>${f.count}</td>
          <td>${escapeHtml(f.violation)}</td>
          <td>${canEdit ? `<button data-idx="${i}" class="flag-case-btn" style="padding:4px 8px;">Create disciplinary case</button>` : ''}</td>
        </tr>
        <tr id="flag-form-row-${i}" style="display:none"><td colspan="5"><div id="flag-form-${i}"></div></td></tr>
      `).join('');

      if (canEdit) {
        flagsBody.querySelectorAll('.flag-case-btn').forEach((btn) => {
          btn.addEventListener('click', () => openFlagForm(pending[btn.dataset.idx], btn.dataset.idx));
        });
      }
    } catch (e) {
      flagsBody.innerHTML = `<tr><td colspan="5" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  async function openFlagForm(flag, idx) {
    const row = document.getElementById(`flag-form-row-${idx}`);
    const slot = document.getElementById(`flag-form-${idx}`);
    if (row.style.display === 'table-row') { row.style.display = 'none'; return; }
    row.style.display = 'table-row';
    if (!matrixLevels) matrixLevels = (await api('GET', '/api/disciplinary/matrix')).levels;

    let suggested = null;
    try { suggested = await api('GET', `/api/disciplinary/suggest?employee_id=${flag.employee_id}&violation=${encodeURIComponent(flag.violation)}`); } catch (e) {}

    slot.innerHTML = `
      <form class="flag-form" style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
        <label>Level
          <select name="level_code" required>
            <option value="">--</option>
            ${matrixLevels.map((l) => `<option value="${l.level_code}" ${suggested && suggested.suggestedLevelCode === l.level_code ? 'selected' : ''}>${l.level_code} — ${escapeHtml(l.action_name)}</option>`).join('')}
          </select>
        </label>
        <label style="flex:1">Notes<input name="notes" value="Repeat violation: ${escapeHtml(flag.att_type)} x${flag.count}" style="width:100%"></label>
        <button type="submit">Confirm create case</button>
      </form>
      <div class="error" style="margin-top:6px"></div>
    `;
    slot.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      try {
        await api('POST', '/api/disciplinary/cases', {
          employee_id: flag.employee_id,
          violation: flag.violation,
          category: flag.category,
          level_code: fd.get('level_code'),
          notes: fd.get('notes'),
          source: 'attendance',
        });
        loadFlags();
      } catch (e) {
        slot.querySelector('.error').textContent = e.message;
      }
    });
  }

  // ── Log table ────────────────────────────────────────────────────────────
  const table = document.getElementById('att-table').querySelector('tbody');
  const search = document.getElementById('att-search');
  const typeSelect = document.getElementById('att-type');
  let timer;

  async function loadLog() {
    table.innerHTML = '<tr><td colspan="8" class="empty-state">Loading...</td></tr>';
    const params = new URLSearchParams({ search: search.value, att_type: typeSelect.value });
    try {
      const rows = await api('GET', `/api/attendance?${params}`);
      if (!rows.length) { table.innerHTML = '<tr><td colspan="8" class="empty-state">No results</td></tr>'; return; }
      table.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.notice_date ?? ''}</td>
          <td><a href="/employees/${r.employee_id}">${escapeHtml(r.employee_name || r.name)}</a></td>
          <td>${escapeHtml(r.shift)}</td>
          <td>${escapeHtml(r.att_type)}</td>
          <td>${r.start_date ?? ''}</td>
          <td>${r.end_date ?? ''}</td>
          <td>${r.days ?? ''}</td>
          <td>${escapeHtml(r.reason)}</td>
        </tr>
      `).join('');
    } catch (e) {
      table.innerHTML = `<tr><td colspan="8" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(loadLog, 250); });
  typeSelect.addEventListener('change', loadLog);

  loadFlags();
  loadLog();
})();
