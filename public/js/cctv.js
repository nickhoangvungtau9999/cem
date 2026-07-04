function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusBadgeClass(s) {
  if (s === 'Actioned') return 'approved';
  if (s === 'Reviewed') return 'edit';
  return 'pending';
}

// ── List page ────────────────────────────────────────────────────────────────
(function initList() {
  const table = document.getElementById('cctv-table');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const search = document.getElementById('cctv-search');
  const status = document.getElementById('cctv-status');
  let timer;

  async function load() {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading...</td></tr>';
    const params = new URLSearchParams({ search: search.value, status: status.value });
    try {
      const rows = await api('GET', `/api/cctv?${params}`);
      if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No results</td></tr>'; return; }
      tbody.innerHTML = rows.map((r) => `
        <tr style="cursor:pointer" onclick="window.location.href='/cctv/${r.id}'">
          <td>${r.gaming_date ?? ''}</td>
          <td>${escapeHtml(r.incident_file_number)}</td>
          <td>${escapeHtml(r.employee_name)} (${r.employee_id})</td>
          <td>${escapeHtml(r.pos)}</td>
          <td>${escapeHtml(r.specific)}</td>
          <td><span class="badge ${statusBadgeClass(r.status)}">${r.status}</span></td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(e.message)}</td></tr>`;
    }
  }
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  status.addEventListener('change', load);
  load();
})();

// ── Detail page ──────────────────────────────────────────────────────────────
(function initDetail() {
  const root = document.getElementById('cctv-detail-root');
  if (!root) return;
  const id = root.dataset.incidentId;
  const tier = root.dataset.tier;
  const canEdit = tier === 'edit' || tier === 'approve';
  let matrix = null;

  async function render() {
    let data;
    try {
      data = await api('GET', `/api/cctv/${id}`);
    } catch (e) {
      root.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      return;
    }
    const { incident: c, siblings, linkedCase } = data;

    root.innerHTML = `
      <h1>${escapeHtml(c.incident_file_number)} <span class="badge ${statusBadgeClass(c.status)}">${c.status}</span></h1>
      <p class="subtitle">${c.gaming_date ?? ''} · ${escapeHtml(c.location)} ${c.sublocation ? '/ ' + escapeHtml(c.sublocation) : ''}</p>

      <div class="card">
        <h2 style="margin-top:0">${escapeHtml(c.specific)}</h2>
        <p><a href="/employees/${c.employee_id}">${escapeHtml(c.employee_name)}</a> — POS: ${escapeHtml(c.pos)}</p>
        <p>${escapeHtml(c.narrative)}</p>
        ${c.action_taken ? `<p><strong>Action Taken:</strong> ${escapeHtml(c.action_taken)}</p>` : ''}
        ${c.mgr_remark ? `<p><strong>MGR Remark:</strong> ${escapeHtml(c.mgr_remark)}</p>` : ''}
      </div>

      ${siblings.length ? `
        <div class="card">
          <h2 style="margin-top:0">Other employees involved (same incident number)</h2>
          <table>
            <thead><tr><th>Employee</th><th>POS</th></tr></thead>
            <tbody>${siblings.map((s) => `<tr><td><a href="/cctv/${s.id}">${escapeHtml(s.employee_name)} (${s.employee_id})</a></td><td>${escapeHtml(s.pos)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      <div class="card">
        <h2 style="margin-top:0">Disciplinary case</h2>
        ${linkedCase
          ? `<p>Case #${linkedCase.id} created — level <strong>${escapeHtml(linkedCase.level_code)}</strong>, status <span class="badge ${linkedCase.approval_status === 'Approved' ? 'approved' : linkedCase.approval_status === 'Rejected' ? 'rejected' : 'pending'}">${linkedCase.approval_status}</span></p>`
          : (canEdit ? '<button id="cctv-create-case-btn" class="secondary">Create disciplinary case from this report</button><div id="cctv-case-form-slot"></div>' : '<p class="subtitle">No disciplinary case yet.</p>')}
      </div>
    `;

    if (canEdit && !linkedCase) {
      document.getElementById('cctv-create-case-btn').addEventListener('click', async () => {
        if (!matrix) matrix = await api('GET', '/api/disciplinary/matrix');
        openCaseForm(c);
      });
    }
  }

  function openCaseForm(c) {
    const slot = document.getElementById('cctv-case-form-slot');
    const categories = [...new Set(matrix.violations.map((v) => v.category))];
    slot.innerHTML = `
      <form id="cctv-case-form" style="margin-top:12px; display:flex; flex-direction:column; gap:8px; max-width:480px;">
        <label>Violation
          <select name="violation">
            <option value="">-- Not in catalogue / see notes --</option>
            ${categories.map((cat) => `
              <optgroup label="${escapeHtml(cat)}">
                ${matrix.violations.filter((v) => v.category === cat).map((v) => `<option value="${escapeHtml(v.violation)}" data-category="${escapeHtml(v.category)}">${escapeHtml(v.violation)}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        </label>
        <label>Level to apply
          <select name="level_code" required>
            <option value="">-- Select level --</option>
            ${matrix.levels.map((l) => `<option value="${escapeHtml(l.level_code)}">${escapeHtml(l.level_code)} — ${escapeHtml(l.action_name)}</option>`).join('')}
          </select>
        </label>
        <label>Notes<textarea name="notes" rows="3">${escapeHtml(c.specific)}</textarea></label>
        <div style="display:flex; gap:6px;">
          <button type="submit">Create case</button>
          <button type="button" class="secondary" id="cctv-case-cancel">Cancel</button>
        </div>
        <div class="error" id="cctv-case-error"></div>
      </form>
    `;
    document.getElementById('cctv-case-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    document.getElementById('cctv-case-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const opt = ev.target.violation.selectedOptions[0];
      try {
        await api('POST', `/api/cctv/${id}/create-case`, {
          violation: fd.get('violation'),
          category: opt ? opt.dataset.category : null,
          level_code: fd.get('level_code'),
          notes: fd.get('notes'),
        });
        render();
      } catch (e) {
        document.getElementById('cctv-case-error').textContent = e.message;
      }
    });
  }

  render();
})();
